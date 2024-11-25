#!/usr/bin/env node
import { Command } from 'commander';
import { getDnsInfo } from './services/dns';
import { crawlWebsite } from './services/crawler';
import { StorageService } from './services/storage';
import { ConfigManager } from './utils/config';
import { RuleManager } from './services/ruleManager';
import type { UrlSet } from './types';

const storage = new StorageService();
const configManager = new ConfigManager();
const ruleManager = new RuleManager();

async function crawlUrl(url: string): Promise<void> {
  try {
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
    console.error(`Error analyzing ${url}: ${error.message}`);
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
  .action(async (setName: string) => {
    try {
      const urls = await configManager.getUrlsForSet(setName);
      console.log(`Found ${urls.length} URLs in set "${setName}"`);
      
      for (const url of urls) {
        console.log(`\nProcessing ${url}...`);
        await crawlUrl(url);
      }
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

program.parse();