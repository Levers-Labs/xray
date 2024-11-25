import puppeteer from 'puppeteer';
import { CrawlResult } from '../types';
import RuleManager from './ruleManager';

export const ruleManager = new RuleManager();

export async function crawlWebsite(url: string, maxRetries = 3): Promise<CrawlResult> {
  let browser;
  let lastError: any;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();
      
      // Set a reasonable viewport
      await page.setViewport({ width: 1280, height: 800 });

      // Set user agent
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

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

      // Get HTML content
      const html = await page.content();

      // Extract JS and CSS URLs
      const js_urls = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('script[src]'))
          .map(el => el.getAttribute('src'))
          .filter(Boolean) as string[];
      });

      const css_urls = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
          .map(el => el.getAttribute('href'))
          .filter(Boolean) as string[];
      });

      // Get window object properties
      const windowProps = await page.evaluate(() => {
        const getCircularReplacer = () => {
          const seen = new WeakSet();
          return (key: string, value: any) => {
            if (typeof value === "object" && value !== null) {
              if (seen.has(value)) {
                return '[Circular]';
              }
              seen.add(value);
            }
            return value;
          };
        };

        // Capture the window object, handling circular references
        const windowCopy: any = {};
        for (const prop in window) {
          try {
            if (typeof window[prop] !== 'function') {
              windowCopy[prop] = window[prop];
            }
          } catch (e) {
            windowCopy[prop] = '[Unable to serialize]';
          }
        }

        // Special handling for Next.js properties
        if ('next' in window) {
          try {
            windowCopy.next = {
              version: (window as any).next?.version,
              // Add other Next.js specific properties you're interested in
              isServer: (window as any).next?.isServer,
              isFallback: (window as any).next?.isFallback,
              isPreview: (window as any).next?.isPreview
            };
          } catch (e) {
            windowCopy.next = '[Error capturing Next.js data]';
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
        css_urls
      };

      // Evaluate rules
      console.log('Starting rule evaluation for URL:', url);
      try {
        await ruleManager.evaluateAllRules(
          url,
          crawlResult.crawl_time,
          crawlResult.headers,
          crawlResult.window,
          crawlResult.html
        );
        console.log('Rule evaluation completed successfully');
      } catch (ruleError) {
        console.error('Error evaluating rules:', ruleError);
      }

      await browser.close();
      return crawlResult;
    } catch (error) {
      if (browser) {
        await browser.close();
      }
      console.log(`Attempt ${attempt + 1} failed:`, error);
      lastError = error;
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError;
}