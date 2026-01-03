/**
 * Site Performance Audit Script
 * Crawls internal links and measures performance metrics
 */

import { chromium, Browser, Page } from 'playwright';
import { writeFileSync } from 'fs';
import { join } from 'path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const MAX_PAGES = 300;
const TIMEOUT = 30000; // 30 seconds

interface PageResult {
  url: string;
  status: number;
  ttfbMs: number | null;
  dclMs: number | null;
  loadMs: number | null;
  htmlSize: number;
  requestCount: number;
  externalRequests: number;
  apiRequests: number;
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: Array<{ url: string; reason: string }>;
  requestDetails: Array<{ url: string; domain: string; duration: number; type: string }>;
}

interface AuditResults {
  timestamp: string;
  baseUrl: string;
  pages: PageResult[];
  slowPages: Array<{ url: string; ttfbMs: number; loadMs: number }>;
  brokenLinks: Array<{ url: string; status: number }>;
  consoleErrors: Array<{ url: string; errors: string[] }>;
  failedRequests: Array<{ url: string; requests: Array<{ url: string; reason: string }> }>;
  externalDomains: Record<string, { count: number; totalDuration: number }>;
}

function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return 'unknown';
  }
}

function isInternalLink(href: string, baseUrl: string): boolean {
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
    return false;
  }
  
  try {
    const url = new URL(href, baseUrl);
    const baseDomain = new URL(baseUrl).hostname;
    return url.hostname === baseDomain || url.hostname === '';
  } catch {
    return href.startsWith('/');
  }
}

function normalizeUrl(url: string, baseUrl: string): string {
  try {
    const urlObj = new URL(url, baseUrl);
    return urlObj.pathname + urlObj.search;
  } catch {
    return url;
  }
}

async function crawlPage(
  browser: Browser,
  url: string,
  baseUrl: string,
  visited: Set<string>
): Promise<PageResult | null> {
  const normalized = normalizeUrl(url, baseUrl);
  
  if (visited.has(normalized)) {
    return null;
  }
  
  visited.add(normalized);
  
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
  console.log(`[Crawling] ${fullUrl}`);
  
  const page = await browser.newPage();
  const result: PageResult = {
    url: normalized,
    status: 0,
    ttfbMs: null,
    dclMs: null,
    loadMs: null,
    htmlSize: 0,
    requestCount: 0,
    externalRequests: 0,
    apiRequests: 0,
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    requestDetails: [],
  };
  
  const requestDetails: Array<{ url: string; domain: string; duration: number; type: string; startTime: number }> = [];
  const baseDomain = new URL(baseUrl).hostname;
  
  // Track requests
  page.on('request', (request) => {
    const requestUrl = request.url();
    const domain = extractDomain(requestUrl);
    const isExternal = domain !== baseDomain && !domain.includes('localhost');
    const isApi = requestUrl.includes('/api/');
    
    if (isExternal) {
      result.externalRequests++;
    }
    if (isApi) {
      result.apiRequests++;
    }
    
    requestDetails.push({
      url: requestUrl,
      domain,
      duration: 0,
      type: request.resourceType(),
      startTime: Date.now(),
    });
  });
  
  page.on('response', (response) => {
    const requestUrl = response.url();
    const detail = requestDetails.find(r => r.url === requestUrl);
    if (detail) {
      detail.duration = Date.now() - detail.startTime;
    }
  });
  
  // Track console errors
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      result.consoleErrors.push(msg.text());
    }
  });
  
  // Track page errors
  page.on('pageerror', (error) => {
    result.pageErrors.push(error.message);
  });
  
  // Track failed requests
  page.on('requestfailed', (request) => {
    result.failedRequests.push({
      url: request.url(),
      reason: request.failure()?.errorText || 'Unknown',
    });
  });
  
  try {
    const startTime = Date.now();
    const response = await page.goto(fullUrl, {
      waitUntil: 'networkidle',
      timeout: TIMEOUT,
    });
    
    result.status = response?.status() || 0;
    
    // Get performance metrics
    const perfMetrics = await page.evaluate(() => {
      const perf = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (perf) {
        return {
          ttfb: perf.responseStart - perf.requestStart,
          dcl: perf.domContentLoadedEventEnd,
          load: perf.loadEventEnd,
        };
      }
      return null;
    });
    
    if (perfMetrics) {
      result.ttfbMs = Math.round(perfMetrics.ttfb);
      result.dclMs = Math.round(perfMetrics.dcl);
      result.loadMs = Math.round(perfMetrics.load);
    }
    
    // Get HTML size
    const content = await page.content();
    result.htmlSize = new Blob([content]).size;
    
    // Finalize request details
    result.requestCount = requestDetails.length;
    result.requestDetails = requestDetails
      .filter(r => r.duration > 0)
      .map(r => ({
        url: r.url,
        domain: r.domain,
        duration: r.duration,
        type: r.type,
      }));
    
  } catch (error: any) {
    console.error(`[Error] Failed to crawl ${fullUrl}:`, error.message);
    result.status = 500;
    result.pageErrors.push(error.message);
  } finally {
    await page.close();
  }
  
  return result;
}

async function extractLinks(page: Page, baseUrl: string): Promise<string[]> {
  const links = await page.evaluate((base) => {
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    return anchors
      .map(a => (a as HTMLAnchorElement).href)
      .filter(href => href && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:'));
  }, baseUrl);
  
  const internalLinks: string[] = [];
  for (const link of links) {
    if (isInternalLink(link, baseUrl)) {
      const normalized = normalizeUrl(link, baseUrl);
      if (normalized && !normalized.includes('.jpg') && !normalized.includes('.png') && !normalized.includes('.gif')) {
        internalLinks.push(normalized);
      }
    }
  }
  
  return [...new Set(internalLinks)];
}

async function main() {
  console.log(`[Audit] Starting crawl from ${BASE_URL}`);
  
  const browser = await chromium.launch({ headless: true });
  const visited = new Set<string>();
  const queue: string[] = ['/'];
  const results: PageResult[] = [];
  
  try {
    while (queue.length > 0 && visited.size < MAX_PAGES) {
      const url = queue.shift()!;
      
      if (visited.has(url)) {
        continue;
      }
      
      const result = await crawlPage(browser, url, BASE_URL, visited);
      
      if (result) {
        results.push(result);
        
        // Extract links for BFS crawling
        if (result.status === 200 && result.url === url) {
          const page = await browser.newPage();
          try {
            const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
            await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
            const links = await extractLinks(page, BASE_URL);
            
            for (const link of links) {
              if (!visited.has(link) && !queue.includes(link)) {
                queue.push(link);
              }
            }
          } catch (error) {
            // Ignore errors during link extraction
          } finally {
            await page.close();
          }
        }
      }
    }
  } finally {
    await browser.close();
  }
  
  // Analyze results
  const slowPages = results
    .filter(r => r.loadMs !== null && r.loadMs > 2000)
    .sort((a, b) => (b.loadMs || 0) - (a.loadMs || 0))
    .slice(0, 15)
    .map(r => ({ url: r.url, ttfbMs: r.ttfbMs || 0, loadMs: r.loadMs || 0 }));
  
  const brokenLinks = results
    .filter(r => r.status >= 400)
    .map(r => ({ url: r.url, status: r.status }));
  
  const consoleErrors = results
    .filter(r => r.consoleErrors.length > 0)
    .map(r => ({ url: r.url, errors: r.consoleErrors }));
  
  const failedRequests = results
    .filter(r => r.failedRequests.length > 0)
    .map(r => ({ url: r.url, requests: r.failedRequests }));
  
  // Aggregate external domains
  const externalDomains: Record<string, { count: number; totalDuration: number }> = {};
  for (const result of results) {
    for (const detail of result.requestDetails) {
      const baseDomain = new URL(BASE_URL).hostname;
      if (detail.domain !== baseDomain && !detail.domain.includes('localhost')) {
        if (!externalDomains[detail.domain]) {
          externalDomains[detail.domain] = { count: 0, totalDuration: 0 };
        }
        externalDomains[detail.domain].count++;
        externalDomains[detail.domain].totalDuration += detail.duration;
      }
    }
  }
  
  const auditResults: AuditResults = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    pages: results,
    slowPages,
    brokenLinks,
    consoleErrors,
    failedRequests,
    externalDomains,
  };
  
  // Save JSON
  const jsonPath = join(process.cwd(), 'audit-results.json');
  writeFileSync(jsonPath, JSON.stringify(auditResults, null, 2), 'utf-8');
  console.log(`[Audit] Results saved to ${jsonPath}`);
  
  // Generate markdown report
  const reportPath = join(process.cwd(), 'AUDIT_REPORT.md');
  const report = generateMarkdownReport(auditResults);
  writeFileSync(reportPath, report, 'utf-8');
  console.log(`[Audit] Report saved to ${reportPath}`);
  
  console.log(`[Audit] Completed. Crawled ${results.length} pages.`);
  console.log(`[Audit] Slow pages: ${slowPages.length}`);
  console.log(`[Audit] Broken links: ${brokenLinks.length}`);
  console.log(`[Audit] Pages with console errors: ${consoleErrors.length}`);
}

function generateMarkdownReport(results: AuditResults): string {
  const { pages, slowPages, brokenLinks, consoleErrors, failedRequests, externalDomains } = results;
  
  const topExternalDomains = Object.entries(externalDomains)
    .sort((a, b) => b[1].totalDuration - a[1].totalDuration)
    .slice(0, 10);
  
  let report = `# Site Performance Audit Report\n\n`;
  report += `**Generated:** ${new Date(results.timestamp).toLocaleString()}\n`;
  report += `**Base URL:** ${results.baseUrl}\n`;
  report += `**Total Pages Crawled:** ${pages.length}\n\n`;
  
  report += `## 🐌 Slow Pages (TOP 15)\n\n`;
  report += `| Rank | URL | TTFB (ms) | Load (ms) |\n`;
  report += `|------|-----|-----------|----------|\n`;
  slowPages.slice(0, 15).forEach((page, idx) => {
    report += `| ${idx + 1} | ${page.url} | ${page.ttfbMs} | ${page.loadMs} |\n`;
  });
  report += `\n`;
  
  if (brokenLinks.length > 0) {
    report += `## ❌ Broken Links (4xx/5xx)\n\n`;
    report += `| URL | Status |\n`;
    report += `|-----|--------|\n`;
    brokenLinks.forEach(link => {
      report += `| ${link.url} | ${link.status} |\n`;
    });
    report += `\n`;
  }
  
  if (consoleErrors.length > 0) {
    report += `## ⚠️ Console Errors\n\n`;
    consoleErrors.slice(0, 20).forEach(item => {
      report += `### ${item.url}\n`;
      item.errors.forEach(error => {
        report += `- ${error}\n`;
      });
      report += `\n`;
    });
  }
  
  if (failedRequests.length > 0) {
    report += `## 🔴 Failed Network Requests\n\n`;
    failedRequests.slice(0, 10).forEach(item => {
      report += `### ${item.url}\n`;
      item.requests.forEach(req => {
        report += `- ${req.url}: ${req.reason}\n`;
      });
      report += `\n`;
    });
  }
  
  if (topExternalDomains.length > 0) {
    report += `## 🌐 External Domain Calls (TOP 10 by Duration)\n\n`;
    report += `| Domain | Request Count | Total Duration (ms) | Avg Duration (ms) |\n`;
    report += `|--------|---------------|---------------------|------------------|\n`;
    topExternalDomains.forEach(([domain, stats]) => {
      const avg = stats.totalDuration / stats.count;
      report += `| ${domain} | ${stats.count} | ${Math.round(stats.totalDuration)} | ${Math.round(avg)} |\n`;
    });
    report += `\n`;
  }
  
  // Performance analysis
  report += `## 📊 Performance Analysis\n\n`;
  
  const highTTFB = pages.filter(p => p.ttfbMs !== null && p.ttfbMs > 1500);
  const highLoad = pages.filter(p => p.loadMs !== null && p.loadMs > 4000 && (p.ttfbMs || 0) < 1500);
  const manyRequests = pages.filter(p => p.requestCount > 50);
  const largeHTML = pages.filter(p => p.htmlSize > 200000); // > 200KB
  
  report += `### High TTFB (>1500ms) - Server/API/Cache Issues\n`;
  report += `**Count:** ${highTTFB.length}\n\n`;
  highTTFB.slice(0, 5).forEach(p => {
    report += `- ${p.url}: TTFB ${p.ttfbMs}ms, Load ${p.loadMs}ms, Requests ${p.requestCount}\n`;
  });
  report += `\n`;
  
  report += `### High Load Time (>4000ms) with Normal TTFB - JS/Render Issues\n`;
  report += `**Count:** ${highLoad.length}\n\n`;
  highLoad.slice(0, 5).forEach(p => {
    report += `- ${p.url}: TTFB ${p.ttfbMs}ms, Load ${p.loadMs}ms, HTML ${Math.round(p.htmlSize / 1024)}KB\n`;
  });
  report += `\n`;
  
  report += `### Many Requests (>50) - Multiple Fetch/Serial Calls\n`;
  report += `**Count:** ${manyRequests.length}\n\n`;
  manyRequests.slice(0, 5).forEach(p => {
    report += `- ${p.url}: ${p.requestCount} requests, External ${p.externalRequests}, API ${p.apiRequests}\n`;
  });
  report += `\n`;
  
  report += `### Large HTML (>200KB) - Heavy SSR Payload\n`;
  report += `**Count:** ${largeHTML.length}\n\n`;
  largeHTML.slice(0, 5).forEach(p => {
    report += `- ${p.url}: ${Math.round(p.htmlSize / 1024)}KB\n`;
  });
  report += `\n`;
  
  return report;
}

main().catch(console.error);

