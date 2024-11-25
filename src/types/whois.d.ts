declare module 'whois' {
    function lookup(domain: string, options?: any): Promise<string>;
    export = { lookup };
  }