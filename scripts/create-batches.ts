#!/usr/bin/env node
import { ConfigManager } from '../src/utils/config';

async function createBatches(urlset: string, batchSize: number): Promise<void> {
  try {
    const config = new ConfigManager();
    const urls = await config.getUrlsForSet(urlset);
    
    // Split URLs into batches
    const batches: string[][] = [];
    for (let i = 0; i < urls.length; i += parseInt(batchSize.toString())) {
      batches.push(urls.slice(i, i + parseInt(batchSize.toString())));
    }
    
    // Output JSON-encoded batches for GitHub Actions
    console.log(JSON.stringify(batches));
  } catch (error) {
    console.error('Error creating batches:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  // Get command line arguments
  const [urlset, batchSize] = process.argv.slice(2);
  if (!urlset || !batchSize) {
    console.error('Usage: ts-node create-batches.ts <urlset> <batchSize>');
    process.exit(1);
  }
  createBatches(urlset, parseInt(batchSize)).catch(console.error);
}

export { createBatches };