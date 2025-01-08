#!/usr/bin/env node
import { Command, program as pprogram } from 'commander';
import { getDnsInfo } from './services/dns';
import { crawlWebsite } from './services/crawler';
import { StorageService } from './services/storage';
import { ConfigManager } from './utils/config';
import { RuleManager } from './services/ruleManager';
import type { UrlSet } from './types';
import downloadCruxDomains from './services/pullCruxDomains';
import { v4 as uuidv4 } from 'uuid';
import pLimit from 'p-limit';

import { request } from 'undici';


const rateLimit = pLimit(50); // Adjust based on your needs and target server limitations

async function fetchWithRetry(url: string, retries = 3, delay = 300): Promise<{ headers: Record<string, string>, body: string, statusCode: number }> {
  try {
    const { statusCode, headers, body } = await request(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Connection': 'keep-alive'
      }
    });


    const bodyContent = await body.text();
    return { headers: headers as Record<string, string>, body: bodyContent, statusCode: statusCode };
  } catch (error) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(url, retries - 1, delay * 2);
    }
    throw error;
  }
}

async function processUrl(url: string): Promise<void> {
  try {
    const { headers, body, statusCode } = await rateLimit(() => fetchWithRetry(url));
    storage.saveHeadersAndBody({
      url,
      headers,
      body,
      statusCode,
      timestamp: new Date().toISOString()
    }).catch(err => console.error(`Error saving data for ${url}:`, err));
  } catch (error: any) {
    console.error(`Failed to process ${url}: ${error.message}`);
  }
}

const storage = new StorageService();
const configManager = new ConfigManager();
const ruleManager = new RuleManager();

async function crawlUrl(
  url: string,
  loadToS3: boolean = false,
  saveToLocal: boolean = true
): Promise<void> {
  try {
    // Get DNS info
    const dnsInfo = await getDnsInfo(url);
    if (saveToLocal) {
      await storage.saveDnsInfo(dnsInfo, url);
    }
    if (loadToS3) {
      await storage.uploadToS3(
        JSON.stringify(dnsInfo),
        'raw_crawl_dns',
        url.replace(/^(https?:\/\/)/, '')
      );
    }
    try {
      // Crawl website
      const crawlResult = await crawlWebsite(
        url,
        3,
        loadToS3,
        saveToLocal
      );
      if (saveToLocal) {
        if (crawlResult) {
          await storage.saveCrawlContent(crawlResult);
        }
      }
      if (loadToS3) {
        await storage.uploadToS3(
          JSON.stringify(crawlResult),
          'raw_crawl_content',
          url.replace(/^(https?:\/\/)/, '')
        );
      }
      console.log(`Successfully crawled ${url}`);
    } catch (error: any) {
      if (saveToLocal) {
        await storage.saveCrawlFailure({
          crawl_time: new Date().toISOString(),
          url,
          response_code: error.response?.status || 500
        });
      }
      if (loadToS3) {
        await storage.uploadToS3(
          JSON.stringify({ url, response_code: error.response?.status || 500 }),
          'crawl_failures',
          url.replace(/^(https?:\/\/)/, '')
        );
      }
      console.error(`Failed to crawl ${url}: ${error.message}`);
    }
  } catch (error: any) {
    console.error(`Error analyzing ${url}: ${error.message}`);
  }
}
async function batchSaveToS3(
  urls: string[],
  loadToS3: boolean = false
): Promise<void> {
  const dnsInfos = [];
  const crawlResults = [];
  const crawlFailures = [];

  console.log(`Processing ${urls.length} URLs...`);
  console.log(urls);

  for (const url of urls) {
    const dnsInfo = await getDnsInfo(url);
    dnsInfos.push(dnsInfo);
    try {
      const crawlResult = await crawlWebsite(url, 1, loadToS3, false);
      crawlResults.push(crawlResult);
    } catch (error: any) {
      crawlFailures.push({
        crawl_time: new Date().toISOString(),
        url,
        response_code: error.response?.status || 500
      });
    }
  }

  const uploadTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileId = uuidv4();

  // convert arrays to ndjson strings
  const dnsInfosNdjson = dnsInfos.map(dnsInfo => JSON.stringify(dnsInfo)).join('\n');
  const crawlResultsNdjson = crawlResults.map(crawlResult => JSON.stringify(crawlResult)).join('\n');
  const crawlFailuresNdjson = crawlFailures.map(crawlFailure => JSON.stringify(crawlFailure)).join('\n');
  try {
    if (loadToS3) {
      await storage.uploadToS3(
        dnsInfosNdjson,
        'raw_crawl_dns',
        `${uploadTimestamp}_${fileId}.ndjson`
      );
      await storage.uploadToS3(
        crawlResultsNdjson,
        'raw_crawl_content',
        `${uploadTimestamp}_${fileId}.ndjson`
      );
      await storage.uploadToS3(
        crawlFailuresNdjson,
        'crawl_failures',
        `${uploadTimestamp}_${fileId}.ndjson`
      );
    }
  }
  catch (error: any) {
    console.error(`Error uploading to S3: ${error.message}`);
  }  
}

const program = new Command();

program
  .name('xray')
  .description('Domain analysis utility')
  .version('1.0.0');

program
  .command('crawl')
  .description('Crawl a single URL')
  .argument('<url>', 'URL to analyze')
  .action(async (url: string) => {
    try {
      await crawlUrl(url);
    } catch (error: any) {
      console.error(`Error crawling ${url}: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('list-rules')
  .description('List all configured rules')
  .action(async () => {
    try {
      const config = await ruleManager.loadRules();
      console.log('\nConfigured Rules:');
      config.rules.forEach(rule => {
        console.log(`\n${rule.name}:`);
        console.log(`  Categories: ${rule.categories.join(', ')}`);
        console.log(`  Rule: ${rule.rule}`);
      });
    } catch (error: any) {
      console.error(`Error listing rules: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('test-rule')
  .description('Test a specific rule against a URL')
  .argument('<ruleName>', 'Name of the rule to test')
  .argument('<url>', 'URL to test against')
  .action(async (ruleName: string, url: string) => {
    try {
      const config = await ruleManager.loadRules();
      const rule = config.rules.find(r => r.name === ruleName);
      
      if (!rule) {
        console.error(`Rule "${ruleName}" not found`);
        process.exit(1);
      }

      console.log(`Testing rule "${ruleName}" against ${url}...`);
      await crawlUrl(url);
      console.log('Check the evaluated_rules directory for results');
    } catch (error: any) {
      console.error(`Error testing rule: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('crawl-set')
  .description('Crawl all URLs in a specified set')
  .argument('<setName>', 'Name of the URL set to crawl')
  .option('--s3', 'Save crawl results to S3')
  .option('--no-local', 'Do not save crawl results locally')
  .option('--is-crux', 'Crawl CrUX URLs')
  .option('-b, --batch-size <number>', 'Number of concurrent crawls', '25')
  .action(async (setName: string, options: { 
    s3?: boolean, 
    local: boolean, 
    isCrux: boolean,
    batchSize: string 
  }) => {
    try {
      const loadToS3 = options.s3;
      const saveToLocal = options.local;
      const isCrux = options.isCrux;
      const concurrency = parseInt(options.batchSize, 10);

      let urls;
      if (isCrux) {
        await downloadCruxDomains();
        urls = await configManager.getUrlsForCompressedSet(setName);
      } else {
        urls = await configManager.getUrlsForSet(setName);
      }

      console.log(`Found ${urls.length} URLs in set "${setName}"`);
      
      // Process URLs in chunks of 1000
      const chunkSize = 1000;
      for (let i = 0; i < urls.length; i += chunkSize) {
        const chunk = urls.slice(i, i + chunkSize);
        console.log(`Processing chunk ${Math.floor(i/chunkSize) + 1}/${Math.ceil(urls.length/chunkSize)}`);
        
        const limit = pLimit(concurrency);
        const tasks = chunk.map(url => limit(async () => {
          console.log(`Processing ${url}...`);
          await crawlUrl(url, loadToS3, saveToLocal);
        }));

        await Promise.all(tasks);
      }

      console.log('\nCompleted processing all URLs');
    } catch (error: any) {
      console.error(`Error processing URL set: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('crawl-crux-domains')
  .description('Crawl URLs concurrently')
  .argument('<setName>', 'Name of the URL set to crawl')
  .option('-b, --batch-size <number>', 'Number of concurrent crawls', '25')
  .option('--s3', 'Save crawl results to S3')
  .option('--no-local', 'Do not save crawl results locally')
  .action(async (
    setName: string,
    options: {
      batchSize: string,
      s3?: boolean,
      local: boolean
    }) => {
    try {
      const loadToS3 = options.s3;
      const saveToLocal = options.local;
      await downloadCruxDomains();
      const urls = await configManager.getUrlsForCompressedSet(setName);
      console.log(`Found ${urls.length} URLs in set "${setName}"`);

      // Only the first 250 urls for testing
      const testUrls = urls.slice(0, 500);
      
      const concurrency = parseInt(options.batchSize, 25);
      const chunks = testUrls.reduce((acc, _, i) => {
        if (i % concurrency === 0) acc.push(testUrls.slice(i, i + concurrency));

        return acc;
      }, [] as string[][]);

      await Promise.all(chunks.map(async (chunk) => {
        await batchSaveToS3(chunk, loadToS3);
      }));
    } catch (error: any) {
      console.error(`Error processing URL set: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('crawl-all')
  .description('Crawl all URLs from enabled sets')
  .action(async () => {
    try {
      const urlMap = await configManager.getAllEnabledUrls();
      
      for (const [setName, urls] of urlMap.entries()) {
        console.log(`\nProcessing set "${setName}" (${urls.length} URLs):`);
        
        for (const url of urls) {
          console.log(`\nProcessing ${url}...`);
          await crawlUrl(url);
        }
      }
    } catch (error: any) {
      console.error(`Error processing URLs: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('list-sets')
  .description('List all configured URL sets')
  .action(async () => {
    try {
      const config = await configManager.loadConfig();
      console.log('\nConfigured URL sets:');
      config.urlSets.forEach((set: UrlSet) => {
        console.log(`\n${set.name}:`);
        console.log(`  Status: ${set.enabled ? 'Enabled' : 'Disabled'}`);
        console.log(`  CSV Path: ${set.csvPath}`);
        if (set.description) {
          console.log(`  Description: ${set.description}`);
        }
      });
    } catch (error: any) {
      console.error(`Error listing URL sets: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('get-headers-and-bodies')
  .description('Get headers and bodies for all URLs in enabled sets')
  .argument('<setName>', 'Name of the URL set to crawl')
  .option('-b, --batch-size <number>', 'Number of concurrent requests', '1000')
  .option('--start-percentage <number>', 'Start percentage of URLs to process', '0')
  .option('--end-percentage <number>', 'End percentage of URLs to process', '10')
  .action(async (setName: string, options: { batchSize: string; startPercentage: string; endPercentage: string }) => {
    try {
      const urls = await configManager.getUrlsForCompressedSet(setName);
      console.log(`Found ${urls.length} URLs in set "${setName}"`);

      const totalUrls = urls.length;
      const startPercentage = parseFloat(options.startPercentage);
      const endPercentage = parseFloat(options.endPercentage);

      if (startPercentage >= endPercentage || startPercentage < 0 || endPercentage > 100) {
        throw new Error('Invalid percentage range. Ensure 0 <= startPercentage < endPercentage <= 100.');
      }

      const startIndex = Math.floor((startPercentage / 100) * totalUrls);
      const endIndex = Math.ceil((endPercentage / 100) * totalUrls);
      const subsetUrls = urls.slice(startIndex, endIndex);

      const concurrency = parseInt(options.batchSize);
      const batchSize = 250;
      let batch: Array<{ url: string; headers: Record<string, string>; body: string; statusCode: number; timestamp: string }> = [];

      const processUrlWithBatch = async (url: string) => {
        try {
          const { headers, body, statusCode } = await rateLimit(() => fetchWithRetry(url));
          batch.push({
            url,
            headers,
            body,
            statusCode,
            timestamp: new Date().toISOString()
          });

          if (batch.length >= batchSize) {
            await storage.saveHeadersAndBodyBatch(batch);
            batch = [];
          }
        } catch (error: any) {
          console.error(`Failed to process ${url}: ${error.message}`);
        }
      };

      const limit = pLimit(concurrency);
      const tasks = subsetUrls.map(url => limit(() => processUrlWithBatch(url)));

      let processedUrls = 0;
      await Promise.all(tasks.map(task => task.then(() => {
        processedUrls++;
        if (processedUrls % 100 === 0) {
          console.log(`Progress: ${processedUrls}/${subsetUrls.length} URLs processed`);
        }
      })));

      // Write any remaining items in the batch
      if (batch.length > 0) {
        await storage.saveHeadersAndBodyBatch(batch);
      }

      console.log('Completed processing all URLs');
    } catch (error: any) {
      console.error(`Error processing URLs: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('get-windows')
  .description('Get window properties for all URLs in enabled sets')
  .argument('<setName>', 'Name of the URL set to crawl')
  .option('-b, --batch-size <number>', 'Number of concurrent requests', '10')
  .option('--start-percentage <number>', 'Start percentage of URLs to process', '0')
  .option('--end-percentage <number>', 'End percentage of URLs to process', '10')
  .action(async (setName: string, options: { batchSize: string; startPercentage: string; endPercentage: string }) => {
    try {
      const urls = await configManager.getUrlsForCompressedSet(setName);
      console.log(`Found ${urls.length} URLs in set "${setName}"`);

      const totalUrls = urls.length;
      const startPercentage = parseFloat(options.startPercentage);
      const endPercentage = parseFloat(options.endPercentage);

      if (startPercentage >= endPercentage || startPercentage < 0 || endPercentage > 100) {
      throw new Error('Invalid percentage range. Ensure 0 <= startPercentage < endPercentage <= 100.');
      }

      const startIndex = Math.floor((startPercentage / 100) * totalUrls);
      const endIndex = Math.ceil((endPercentage / 100) * totalUrls);
      const subsetUrls = urls.slice(startIndex, endIndex);

      const concurrency = parseInt(options.batchSize);
      const chunkSize = 100; // Process in smaller chunks for better memory management

      let processedUrls = 0;
      const limit = pLimit(concurrency);

      // Process URLs in smaller chunks to prevent memory issues
      for (let i = 0; i < subsetUrls.length; i += chunkSize) {
      const chunk = subsetUrls.slice(i, i + chunkSize);
      const tasks = chunk.map(url => limit(async () => {
        try {
        const crawlResult = await crawlWebsite(url, 1, false, false);
        if (crawlResult) {
          await storage.saveCrawlContent(crawlResult);
        }

        processedUrls++;
        if (processedUrls % 10 === 0) {
          console.log(`Progress: ${processedUrls}/${subsetUrls.length} URLs processed`);
        }
        } catch (error: any) {
        console.error(`Failed to process ${url}: ${error.message}`);
        }
      }));

      await Promise.all(tasks);
      // Add small delay between chunks to prevent rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
      }

      console.log('Completed processing all URLs');
    } catch (error: any) {
      console.error(`Error processing URLs: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('get-dns-whois-ssl')
  .description('Get DNS, WHOIS, and SSL info for all URLs in enabled sets')
  .argument('<setName>', 'Name of the URL set to crawl')
  .option('-b, --batch-size <number>', 'Number of concurrent requests', '25')
  .option('--start-percentage <number>', 'Start percentage of URLs to process', '0')
  .option('--end-percentage <number>', 'End percentage of URLs to process', '10')
  .action(async (setName: string, options: { batchSize: string; startPercentage: string; endPercentage: string }) => {
    try {
      const urls = await configManager.getUrlsForCompressedSet(setName);
      console.log(`Found ${urls.length} URLs in set "${setName}"`);

      const totalUrls = urls.length;
      const startPercentage = parseFloat(options.startPercentage);
      const endPercentage = parseFloat(options.endPercentage);

      if (startPercentage >= endPercentage || startPercentage < 0 || endPercentage > 100) {
      throw new Error('Invalid percentage range. Ensure 0 <= startPercentage < endPercentage <= 100.');
      }

      const startIndex = Math.floor((startPercentage / 100) * totalUrls);
      const endIndex = Math.ceil((endPercentage / 100) * totalUrls);
      const subsetUrls = urls.slice(startIndex, endIndex);

      const concurrency = parseInt(options.batchSize);
      const chunkSize = 100; // Process in smaller chunks for better memory management

      let processedUrls = 0;
      const limit = pLimit(concurrency);

      // Process URLs in smaller chunks to prevent memory issues
      for (let i = 0; i < subsetUrls.length; i += chunkSize) {
      const chunk = subsetUrls.slice(i, i + chunkSize);
      const tasks = chunk.map(url => limit(async () => {
        try {
        await crawlUrl(url, false, true);
        processedUrls++;
        if (processedUrls % 10 === 0) {
          console.log(`Progress: ${processedUrls}/${subsetUrls.length} URLs processed`);
        }
        } catch (error: any) {
        console.error(`Failed to process ${url}: ${error.message}`);
        }
      }));

      await Promise.all(tasks);
      // Add small delay between chunks to prevent rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
      }

      console.log('Completed processing all URLs');
    } catch (error: any) {
      console.error(`Error processing URLs: ${error.message}`);
      process.exit(1);
    }
  });

program.parse();