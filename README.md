# xray

Crawl stuff.

## Features

- DNS information gathering (registrar, CNAME, IP addresses, etc.)
- Full webpage content crawling
- JavaScript and CSS resource detection
- Custom rule evaluation against crawled content
- Parallel crawling using GitHub Actions
- Optional AWS integration for storage
- URL set management for batch processing

## Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Install globally
npm install -g .
```

## Configuration

### URL Sets
Create a `urls.yml` file in the project root:

```yaml
urlSets:
  - name: tech-companies
    csvPath: ./urls/tech-companies.csv
    enabled: true
    description: "Major tech company websites"
```

Create corresponding CSV files in a `urls` directory:
```csv
url
https://vercel.com
https://netlify.com
```

### Rules
Create a `rules.yml` file to define analysis rules:

```yaml
rules:
  - name: next-version
    categories: ['framework']
    rule: window.next?.version

  - name: security-headers
    categories: ['security']
    rule: |
      {
        xframe: headers['x-frame-options'],
        hsts: headers['strict-transport-security'],
        csp: headers['content-security-policy']
      }

  - name: meta-tags
    categories: ['seo']
    rule: |
      {
        description: $('meta[name="description"]').attr('content'),
        keywords: $('meta[name="keywords"]').attr('content')
      }
```

### AWS Configuration (Optional)
To enable AWS S3 storage, set these environment variables:
```bash
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
export AWS_SESSION_TOKEN=your_session_token
export AWS_REGION=your_region
export AWS_BUCKET_NAME=your_bucket_name
```

## Usage

### CLI Commands

```bash
# Single URL analysis
xray crawl https://example.com

# Process a URL set
xray crawl-set tech-companies

# Process a URL set and save to S3, and not locally
xray crawl-set tech-companies --s3 true --no-local false

# Process all enabled URL sets
xray crawl-all

# List available URL sets
xray list-sets

# List configured rules
xray list-rules

# Test a specific rule
xray test-rule next-version https://example.com
```

## Output

The tool creates several directories for results:

- `raw_crawl_dns/`: DNS analysis results
- `raw_crawl_content/`: Full webpage content and analysis
- `evaluated_rules/`: Results of rule evaluations
- `crawl_failures/`: Records of failed crawl attempts

Each file is named using the pattern: `{timestamp}_{url}_{type}.json`

## Development

### Project Structure
```
src/
├── types/          # TypeScript interfaces
├── services/       # Core functionality
│   ├── dns.ts      # DNS lookups
│   ├── crawler.ts  # Web crawling
│   └── storage.ts  # Result storage
├── utils/          # Helper functions
└── index.ts       # CLI implementation

scripts/            # GitHub Actions scripts
├── create-batches.ts
└── crawl-batch.ts
```

# Test batch processing
npx ts-node scripts/create-batches.ts test-set 10
npx ts-node scripts/crawl-batch.ts '["https://example.com"]'
```
