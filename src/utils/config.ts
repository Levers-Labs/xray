import fs from 'fs/promises';
import yaml from 'js-yaml';
import { parse } from 'csv-parse';
import path from 'path';
import { UrlSet, XrayConfig } from '../types';

export class ConfigManager {
  private configPath: string;

  constructor(configPath: string = 'urls.yml') {
    this.configPath = configPath;
  }

  async loadConfig(): Promise<XrayConfig> {
    try {
      const fileContents = await fs.readFile(this.configPath, 'utf8');
      return yaml.load(fileContents) as XrayConfig;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        const defaultConfig: XrayConfig = { urlSets: [] };
        await this.saveConfig(defaultConfig);
        return defaultConfig;
      }
      throw error;
    }
  }

  async saveConfig(config: XrayConfig): Promise<void> {
    const yamlStr = yaml.dump(config, {
      indent: 2,
      lineWidth: -1
    });
    await fs.writeFile(this.configPath, yamlStr, 'utf8');
  }

  async loadUrlsFromCsv(csvPath: string): Promise<string[]> {
    const fileContent = await fs.readFile(csvPath, 'utf8');
    return new Promise((resolve, reject) => {
      const urls: string[] = [];
      parse(fileContent, {
        columns: true,
        skip_empty_lines: true
      })
        .on('data', (row: { url: string }) => {
          if (row.url) {
            urls.push(row.url.trim());
          }
        })
        .on('end', () => resolve(urls))
        .on('error', reject);
    });
  }

  async getUrlsForSet(setName: string): Promise<string[]> {
    const config = await this.loadConfig();
    const urlSet = config.urlSets.find((set: UrlSet) => set.name === setName && set.enabled);
    
    if (!urlSet) {
      throw new Error(`URL set "${setName}" not found or not enabled`);
    }

    return this.loadUrlsFromCsv(urlSet.csvPath);
  }

  async getAllEnabledUrls(): Promise<Map<string, string[]>> {
    const config = await this.loadConfig();
    const urlMap = new Map<string, string[]>();

    for (const set of config.urlSets) {
      if (set.enabled) {
        const urls = await this.loadUrlsFromCsv(set.csvPath);
        urlMap.set(set.name, urls);
      }
    }

    return urlMap;
  }
}