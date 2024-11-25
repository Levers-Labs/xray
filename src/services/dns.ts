import dns from 'dns';
import { promisify } from 'util';
import whois from 'whois';
import { DnsInfo } from '../types';

const lookup = promisify(dns.lookup);
const resolveCname = promisify(dns.resolveCname);
const whoisLookup = promisify(whois.lookup) as (hostname: string) => Promise<string>;

type ParsedWhois = Omit<DnsInfo, 'cname' | 'hostname' | 'ipv4' | 'ipv6'>;

async function parseWhoisData(data: string): Promise<ParsedWhois> {
  console.log('\nRaw WHOIS data:', data);
  
  const whoisData: ParsedWhois = {
    registrar: "Unknown",
    creationDate: "Unknown",
    expirationDate: "Unknown",
    lastUpdated: "Unknown",
    nameservers: [],
    status: [],
    registrantOrganization: "Unknown",
    registrantCountry: "Unknown",
    whoisServer: "Unknown"
  };

  try {
    // Extract registrar
    const registrarMatch = data.match(/Registrar:\s*([^\n]+)/);
    if (registrarMatch && registrarMatch[1]) {
      whoisData.registrar = registrarMatch[1].trim();
      console.log('Found registrar:', whoisData.registrar);
    }

    // Extract dates
    const creationMatch = data.match(/Creation Date:\s*([^\n]+)/);
    if (creationMatch && creationMatch[1]) {
      whoisData.creationDate = creationMatch[1].trim();
      console.log('Found creation date:', whoisData.creationDate);
    }

    const expirationMatch = data.match(/Registrar Registration Expiration Date:\s*([^\n]+)/);
    if (expirationMatch && expirationMatch[1]) {
      whoisData.expirationDate = expirationMatch[1].trim();
      console.log('Found expiration date:', whoisData.expirationDate);
    }

    const updateMatch = data.match(/Updated Date:\s*([^\n]+)/);
    if (updateMatch && updateMatch[1]) {
      whoisData.lastUpdated = updateMatch[1].trim();
      console.log('Found last updated:', whoisData.lastUpdated);
    }

    // Extract nameservers
    const nameserverMatches = data.matchAll(/Name Server:\s*([^\n]+)/g);
    whoisData.nameservers = Array.from(nameserverMatches, match => match[1].trim());
    console.log('Found nameservers:', whoisData.nameservers);

    // Extract status
    const statusMatches = data.matchAll(/Domain Status:\s*([^\s]+)\s+[^\n]+/g);
    whoisData.status = Array.from(statusMatches, match => match[1].trim());
    console.log('Found status entries:', whoisData.status);

    // Extract organization and country
    const orgMatch = data.match(/Registrant Organization:\s*([^\n]+)/);
    if (orgMatch && orgMatch[1]) {
      whoisData.registrantOrganization = orgMatch[1].trim();
      console.log('Found registrant organization:', whoisData.registrantOrganization);
    }

    const countryMatch = data.match(/Registrant Country:\s*([^\n]+)/);
    if (countryMatch && countryMatch[1]) {
      whoisData.registrantCountry = countryMatch[1].trim();
      console.log('Found registrant country:', whoisData.registrantCountry);
    }

    // Extract WHOIS server
    const whoisServerMatch = data.match(/Registrar WHOIS Server:\s*([^\n]+)/);
    if (whoisServerMatch && whoisServerMatch[1]) {
      whoisData.whoisServer = whoisServerMatch[1].trim();
      console.log('Found WHOIS server:', whoisData.whoisServer);
    }

  } catch (error) {
    console.error('Error parsing WHOIS data:', error);
  }

  return whoisData;
}

export async function getDnsInfo(url: string): Promise<DnsInfo> {
  try {
    const hostname = new URL(url).hostname;
    console.log('\nLooking up DNS info for:', hostname);
    
    // Get IPv4
    console.log('Getting IPv4...');
    const ipv4Result = await lookup(hostname, { family: 4 });
    console.log('IPv4 result:', ipv4Result);
    
    // Get IPv6
    let ipv6 = '';
    try {
      console.log('Getting IPv6...');
      const ipv6Result = await lookup(hostname, { family: 6 });
      ipv6 = ipv6Result.address;
      console.log('IPv6 result:', ipv6Result);
    } catch (error) {
      console.log('IPv6 not available:', error);
    }

    // Get CNAME
    let cname = '';
    try {
      console.log('Getting CNAME...');
      const cnameResults = await resolveCname(hostname);
      console.log('CNAME results:', cnameResults);
      cname = cnameResults[0] || '';
    } catch (error) {
      console.log('CNAME lookup error:', error);
    }

    // WHOIS lookup with retries
    let whoisData = '';
    let retries = 3;
    let delay = 2000;
    
    while (retries > 0) {
      try {
        console.log(`\nAttempting WHOIS lookup (${retries} retries left)...`);
        whoisData = await whoisLookup(hostname);
        console.log('WHOIS lookup successful');
        break;
      } catch (error) {
        console.log(`WHOIS lookup attempt failed:`, error);
        retries--;
        if (retries > 0) {
          console.log(`Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2;
        }
      }
    }

    const parsedWhois = await parseWhoisData(whoisData);

    // Combine all the data into DnsInfo
    const result: DnsInfo = {
      ...parsedWhois,
      cname,
      hostname,
      ipv4: ipv4Result.address,
      ipv6
    };

    console.log('\nFinal DNS result:', result);
    return result;
  } catch (error: any) {
    console.error(`\nDNS lookup error:`, error);
    return {
      registrar: "Unknown",
      creationDate: "Unknown",
      cname: "",
      hostname: new URL(url).hostname,
      ipv4: "",
      ipv6: "",
      expirationDate: "Unknown",
      lastUpdated: "Unknown",
      nameservers: [],
      status: [],
      registrantOrganization: "Unknown",
      registrantCountry: "Unknown",
      whoisServer: "Unknown"
    };
  }
}