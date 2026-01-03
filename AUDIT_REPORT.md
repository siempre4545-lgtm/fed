# Site Performance Audit Report

**Generated:** Initial audit pending
**Base URL:** https://fedreportsh.vercel.app/
**Total Pages Crawled:** 0

## 📊 Performance Optimization Summary

### Applied Optimizations

1. **Lazy Loading**
   - Card interpretations: Loaded on card click via `/api/h41/detail`
   - Weekly report: Loaded on expand via `/api/h41/weekly-summary`
   - History table: Limited initial display with "Load More" button

2. **Parallel Fetching**
   - Home page: `releaseDates`, `indicators`, `news`, `usdKrwRate` fetched in parallel
   - History data: Batch parallel processing (batch size: 5)
   - Economic indicators: Already using `Promise.all` for multiple fetches

3. **Caching Strategy**
   - H.4.1 data: `Cache-Control: public, s-maxage=600, stale-while-revalidate=3600` (10 minutes)
   - Economic indicators: `Cache-Control: public, s-maxage=300, stale-while-revalidate=600` (5 minutes)
   - All HTML pages: Appropriate cache headers applied

4. **Payload Reduction**
   - Summary API: Numbers only (no interpretation text)
   - Detail API: Interpretation text only (loaded on demand)
   - Weekly report: Removed from initial HTML

### Expected Improvements

- **Initial HTML Size**: Reduced by ~30-40% (removed long text content)
- **TTFB**: Improved by 50-95% (caching + parallel fetch)
- **Load Time**: Improved by 30-70% (reduced payload + parallelization)

## 🐌 Slow Pages (TOP 15)

*To be populated after audit execution*

## ❌ Broken Links (4xx/5xx)

*To be populated after audit execution*

## ⚠️ Console Errors

*To be populated after audit execution*

## 🔴 Failed Network Requests

*To be populated after audit execution*

## 🌐 External Domain Calls (TOP 10 by Duration)

*To be populated after audit execution*

---

**Note:** Run `npm run audit:prod` to generate full audit report.

