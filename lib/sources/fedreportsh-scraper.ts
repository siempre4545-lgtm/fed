import * as cheerio from "cheerio";

export const extractNumericByLabels = (
  html: string,
  labelCandidates: string[]
): number | null => {
  const $ = cheerio.load(html);
  const text = $.text();
  const lower = text.toLowerCase();
  for (const label of labelCandidates) {
    const index = lower.indexOf(label.toLowerCase());
    if (index === -1) continue;
    const snippet = text.slice(Math.max(0, index - 40), index + 200);
    const match = snippet.match(/([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)/);
    if (match) {
      const normalized = Number(match[1].replace(/,/g, ""));
      return Number.isFinite(normalized) ? normalized : null;
    }
  }
  return null;
};
