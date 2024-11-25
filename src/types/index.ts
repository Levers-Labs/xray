// DNS related types
export interface DnsInfo {
  registrar: string;
  creationDate: string;
  cname: string;
  hostname: string;
  ipv4: string;
  ipv6: string;
  expirationDate: string;
  lastUpdated: string;
  nameservers: string[];
  status: string[];
  registrantOrganization: string;
  registrantCountry: string;
  whoisServer: string;
}

// Crawler related types
export interface CrawlResult {
  crawl_time: string;
  url: string;
  headers: Record<string, string>;
  window: any;
  html: string;
  js_urls: string[];
  css_urls: string[];
}

export interface CrawlFailure {
  crawl_time: string;
  url: string;
  response_code: number;
}

// Rule related types
export interface Rule {
  name: string;
  categories: string[];
  rule: string;
}

export interface RuleConfig {
  rules: Rule[];
}

export interface EvaluatedRule {
  crawl_time: string;
  rule: string;
  categories: string[];
  value: any;
}

// URL Set related types
export interface UrlSet {
  name: string;
  csvPath: string;
  description?: string;
  enabled: boolean;
}

export interface XrayConfig {
  urlSets: UrlSet[];
}