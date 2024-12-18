import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { Rule, RuleConfig, EvaluatedRule } from '../types';
import { StorageService } from './storage';

const storage = new StorageService();

export class RuleManager {
  private configPath: string;
  private outputDir: string;

  constructor(configPath: string = 'rules.yml', outputDir: string = 'evaluated_rules') {
    this.configPath = configPath;
    this.outputDir = outputDir;
    console.log('RuleManager initialized with:', { configPath, outputDir });
  }

  async loadRules(): Promise<RuleConfig> {
    try {
      const resolvedPath = path.resolve(this.configPath);
      console.log('Attempting to load rules from absolute path:', resolvedPath);
      
      const fileContents = await fs.readFile(resolvedPath, 'utf8');
      
      const config = yaml.load(fileContents) as RuleConfig;
      return config;
    } catch (error) {
      console.error('Error loading rules:', error);
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log('Rules file not found, creating default config');
        const defaultConfig: RuleConfig = {
          rules: [
            {
              name: 'sample-rule',
              categories: ['sample'],
              rule: "headers['content-type'] && window.next?.version"
            }
          ]
        };
        await this.saveRules(defaultConfig);
        return defaultConfig;
      }
      throw error;
    }
  }

  async saveRules(config: RuleConfig): Promise<void> {
    const yamlStr = yaml.dump(config, {
      indent: 2,
      lineWidth: -1
    });
    await fs.writeFile(this.configPath, yamlStr, 'utf8');
  }

  private evaluateRuleExpression(ruleExpression: string, context: { 
    window: any; 
    html: string; 
    headers: Record<string, any>; 
    $: CheerioAPI 
  }): any {
    try {
      const { window, html, headers, $ } = context;
      return eval(`(() => { 
        try {
          return ${ruleExpression};
        } catch (e) {
          console.error('Rule evaluation error:', e);
          return null;
        }
      })()`);
    } catch (error) {
      console.error(`Error evaluating rule "${ruleExpression}":`, error);
      return null;
    }
  }

  private getOutputFilename(url: string, crawlTime: string, ruleName: string): string {
    const sanitizedUrl = url.replace(/[^a-zA-Z0-9]/g, '_');
    const sanitizedTime = crawlTime.replace(/[:.]/g, '-');
    const sanitizedRule = ruleName.replace(/[^a-zA-Z0-9]/g, '_');
    return `${sanitizedTime}_${sanitizedUrl}_${sanitizedRule}.json`;
  }

  async evaluateRule(
    rule: Rule,
    url: string,
    crawlTime: string,
    headers: Record<string, any>,
    windowObj: any,
    htmlContent: string,
    loadToS3: boolean = false,
    saveToLocal: boolean = true
  ): Promise<void> {
    console.log(`Evaluating rule: ${rule.name} for URL: ${url}`);
    
    try {
      const $ = cheerio.load(htmlContent);
      const value = this.evaluateRuleExpression(rule.rule, { 
        window: windowObj, 
        html: htmlContent, 
        headers, 
        $ 
      });

      const evaluatedRule: EvaluatedRule = {
        crawl_time: crawlTime,
        rule: rule.rule,
        categories: rule.categories,
        value
      };

      console.log(`Creating output directory: ${this.outputDir}`);
      await fs.mkdir(this.outputDir, { recursive: true });

      const filename = this.getOutputFilename(url, crawlTime, rule.name);
      const filePath = path.join(this.outputDir, filename);
      console.log(`Writing rule evaluation to: ${filePath}`);
      
      if (saveToLocal) {
        await fs.writeFile(
          filePath,
          JSON.stringify(evaluatedRule)
        );
      }
      if (loadToS3) {
        await storage.uploadToS3(
          JSON.stringify(evaluatedRule),
          'evaluated_rules',
          filename
        );
      };

      console.log(`Successfully evaluated rule: ${rule.name}`);
    } catch (error) {
      console.error(`Error evaluating rule ${rule.name}:`, error);
    }
  }

  async evaluateAllRules(
    url: string,
    crawlTime: string,
    headers: Record<string, any>,
    windowObj: any,
    htmlContent: string,
    loadToS3: boolean = false,
    saveToLocal: boolean = true
  ): Promise<void> {
    console.log('Starting evaluation of all rules');
    const config = await this.loadRules();
    
    for (const rule of config.rules) {
      await this.evaluateRule(
        rule,
        url,
        crawlTime,
        headers,
        windowObj,
        htmlContent,
        loadToS3,
        saveToLocal
      );
    }
    console.log('Completed evaluation of all rules');
  }
}

export default RuleManager;