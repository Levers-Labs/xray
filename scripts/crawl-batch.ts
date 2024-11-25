#!/usr/bin/env node
import { StorageService } from '../src/services/storage';
import { getDnsInfo } from '../src/services/dns';
import { crawlWebsite } from '../src/services/crawler';

async function processBatch(urlsJson: string): Promise<void> {
  const urls: string[] = JSON.parse(urlsJson);
  const storage = new StorageService();

  for (const url of urls) {
    try {
      console.log(`Processing ${url}...`);
      
      // Get DNS info
      const dnsInfo = await getDnsInfo(url);
      await storage.saveDnsInfo(dnsInfo, url);
      
      try {
        // Crawl website
        const crawlResult = await crawlWebsite(url);
        await storage.saveCrawlContent(crawlResult);
        console.log(`Successfully crawled ${url}`);
      } catch (error: any) {
        await storage.saveCrawlFailure({
          crawl_time: new Date().toISOString(),
          url,
          response_code: error.response?.status || 500
        });
        console.error(`Failed to crawl ${url}: ${error.message}`);
      }
    } catch (error: any) {
      console.error(`Error processing ${url}:`, error.message);
      // Continue with next URL even if one fails
    }
  }
}

if (require.main === module) {
  const urlsArg = process.argv[2];
  if (!urlsArg) {
    console.error('Usage: ts-node crawl-batch.ts \'["url1", "url2", ...]\'');
    process.exit(1);
  }
  processBatch(urlsArg).catch(console.error);
}

export { processBatch };