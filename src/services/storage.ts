import fs from 'fs/promises';
import path from 'path';
import { DnsInfo, CrawlResult, CrawlFailure } from '../types';
import { v4 as uuidv4 } from 'uuid';

const AWS = require('aws-sdk');

export class StorageService {
  private getFilename(url: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sanitizedUrl = url.replace(/[^a-zA-Z0-9]/g, '_');
    return `${timestamp}_${sanitizedUrl}.json`;
  }

  async saveHeadersAndBodyBatch(data: {
    url: string;
    headers: Record<string, any>;
    body: string;
    statusCode: number;
    timestamp: string;
  }[]): Promise<void> {
    try {
      const dirPath = 'headers_and_bodies';
      
      await fs.mkdir(dirPath, { recursive: true });

      for (const item of data) {
        const filename = this.getFilename(item.url);
        await fs.writeFile(
          path.join(dirPath, filename),
          JSON.stringify(item, null, 2),
          'utf8'
        );
      }
    } catch (error: any) {
      console.error(`Error saving headers and body: ${error.message}`);
      throw error;
    }
  }

  async saveHeadersAndBody(data: {
    url: string;
    headers: Record<string, any>;
    body: string;
    statusCode: number;
    timestamp: string;
  }): Promise<void> {
    try {
      const filename = this.getFilename(data.url);
      const dirPath = 'headers_and_bodies';
      
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(
        path.join(dirPath, filename),
        JSON.stringify(data, null, 2),
        'utf8'
      );
    } catch (error: any) {
      console.error(`Error saving headers and body: ${error.message}`);
      throw error;
    }
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
        JSON.stringify(crawlResult),
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
  async uploadToS3(data: string, dirPath: string, filename: string): Promise<void> {
    
    const s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN
    });

    const saveFilenameWithTimestamp = `${filename}_${uuidv4()}.ndjson`;

    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: `${dirPath}/${saveFilenameWithTimestamp}`,
      Body: data,
      ContentType: 'application/x-ndjson'
    };

    try {
      console.log(`Uploading to S3...`);
      await s3.putObject(params).promise();
      console.log(`Successfully uploaded to S3.`);
    } catch (error: any) {
      console.error(`Error uploading to S3: ${error.message}`);
      throw error;
    }
  }
}