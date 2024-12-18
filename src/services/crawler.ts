import { CrawlResult } from '../types';
import RuleManager from './ruleManager';
import dotenv from 'dotenv';
dotenv.config();
import puppeteer, { Browser as PuppeteerBrowser } from 'puppeteer';

export const ruleManager = new RuleManager();

export async function crawlWebsite(
  url: string,
  maxRetries: number = 1,
  loadToS3: boolean = false,
  saveToLocal: boolean = true
): Promise<CrawlResult | undefined> {
  let browser: PuppeteerBrowser | undefined;
  let lastError: any;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const sessionRequest = await fetch("https://api.browserbase.com/v1/sessions", {
        method: "POST",
        headers: {
            "X-BB-API-KEY": process.env.BROWSERBASE_API_KEY,
            "Content-Type": "application/json",
          } as any,
          body: JSON.stringify({
          projectId: process.env.BROWSERBASE_PROJECT_ID,
          browserSettings: {
            advancedStealth: true, // Needed for the best anti-bot bypassing.
          },
          proxies: true, // You can disable these if you don't need them. I'd recommend disabling for the first request.
        }),
      });

      const session = await sessionRequest.json();

      browser = await puppeteer.connect({
        browserWSEndpoint: session.connectUrl
      });

      const pages = await browser.pages();
      const page = pages[0];

      // Get response and window object
      const response = await page.goto(url, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      if (!response) {
        throw new Error('No response received from page');
      }

      // Get headers
      const headers = response.headers();
      const html = await page.content();
      const js_urls = await page.evaluate(() =>
        Array.from(document.querySelectorAll('script[src]'))
          .map((el) => el.getAttribute('src'))
          .filter(Boolean) as string[]
      );
      const css_urls = await page.evaluate(() =>
        Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
          .map((el) => el.getAttribute('href'))
          .filter(Boolean) as string[]
      );

      const windowProps = await page.evaluate(() => {
        const seen = new WeakSet();
        const getCircularReplacer = () => (key: string, value: any) =>
          typeof value === 'object' && value !== null
            ? seen.has(value)
              ? '[Circular]'
              : (seen.add(value), value)
            : value;

        const windowCopy: any = {};
        for (const prop in window) {
          try {
            if (typeof window[prop] !== 'function') windowCopy[prop] = window[prop];
          } catch {
            windowCopy[prop] = '[Unable to serialize]';
          }
        }
        return JSON.stringify(windowCopy, getCircularReplacer());
      });

      const crawlResult: CrawlResult = {
        crawl_time: new Date().toISOString(),
        url,
        headers,
        window: JSON.parse(windowProps),
        html,
        js_urls,
        css_urls,
      };

      await ruleManager.evaluateAllRules(
        url,
        crawlResult.crawl_time,
        crawlResult.headers,
        crawlResult.window,
        crawlResult.html,
        loadToS3,
        saveToLocal
      );

      return crawlResult;
    } catch (error) {
      console.error(`Attempt ${attempt + 1} failed with Puppeteer:`, error);
    } finally {
      if (browser) await browser.close();
    }

    // Exponential backoff
    if (attempt < maxRetries - 1) await new Promise((res) => setTimeout(res, 1000 * 2 ** attempt));
  }

  throw lastError;
}
