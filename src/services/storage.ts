import fs from 'fs/promises';
import path from 'path';
import { DnsInfo, CrawlResult, CrawlFailure } from '../types';

export class StorageService {
  private getFilename(url: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sanitizedUrl = url.replace(/[^a-zA-Z0-9]/g, '_');
    return `${timestamp}_${sanitizedUrl}.json`;
  }

  async saveDnsInfo(dnsInfo: DnsInfo, url: string): Promise<void> {
    try {
      const filename = this.getFilename(url);
      const dirPath = 'raw_crawl_dns';
      
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(
        path.join(dirPath, filename),
        JSON.stringify(dnsInfo, null, 2),
        'utf8'
      );

      console.log(`DNS info saved to ${dirPath}/${filename}`);
    } catch (error: any) {
      console.error(`Error saving DNS info: ${error.message}`);
      throw error;
    }
  }

  async saveCrawlContent(crawlResult: CrawlResult): Promise<void> {
    try {
      const filename = this.getFilename(crawlResult.url);
      const dirPath = 'raw_crawl_content';
      
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(
        path.join(dirPath, filename),
        JSON.stringify(crawlResult, null, 2),
        'utf8'
      );

      console.log(`Crawl content saved to ${dirPath}/${filename}`);
    } catch (error: any) {
      console.error(`Error saving crawl content: ${error.message}`);
      throw error;
    }
  }

  async saveCrawlFailure(failure: CrawlFailure): Promise<void> {
    try {
      const filename = this.getFilename(failure.url);
      const dirPath = 'crawl_failures';
      
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(
        path.join(dirPath, filename),
        JSON.stringify(failure, null, 2),
        'utf8'
      );

      console.log(`Crawl failure saved to ${dirPath}/${filename}`);
    } catch (error: any) {
      console.error(`Error saving crawl failure: ${error.message}`);
      throw error;
    }
  }
}