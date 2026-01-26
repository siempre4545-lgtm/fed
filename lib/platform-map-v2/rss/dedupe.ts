import type { EvidenceItem } from "../types";

const RELIABILITY_WEIGHT: Record<string, number> = { A: 3, B: 2, C: 1 };

const normalizeTitle = (value: string) =>
  value
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const tokenize = (value: string) => normalizeTitle(value).split(" ").filter((token) => token.length > 1);

export const normalizeUrl = (raw: string) => {
  try {
    const url = new URL(raw);
    const params = new URLSearchParams(url.search);
    [...params.keys()].forEach((key) => {
      if (key.toLowerCase().startsWith("utm_") || key.toLowerCase() === "gclid" || key.toLowerCase() === "fbclid") {
        params.delete(key);
      }
    });
    const search = params.toString();
    const normalizedPath = url.pathname.endsWith("/") && url.pathname.length > 1 ? url.pathname.slice(0, -1) : url.pathname;
    return `${url.origin}${normalizedPath}${search ? `?${search}` : ""}`;
  } catch (error) {
    return raw.trim();
  }
};

export const canonicalKey = (item: { title: string; url: string; publishedAt?: string }) => {
  const normalizedUrl = normalizeUrl(item.url);
  if (normalizedUrl) return normalizedUrl;
  const day = item.publishedAt ? item.publishedAt.slice(0, 10) : "";
  const title = normalizeTitle(item.title);
  const domain = (() => {
    try {
      return new URL(item.url).host;
    } catch (error) {
      return "unknown";
    }
  })();
  return `${title}:${day}:${domain}`;
};

const similarity = (aTokens: string[], bTokens: string[]) => {
  if (aTokens.length === 0 || bTokens.length === 0) return 0;
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  let intersection = 0;
  aSet.forEach((token) => {
    if (bSet.has(token)) intersection += 1;
  });
  const union = aSet.size + bSet.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

const preferItem = (current: EvidenceItem, candidate: EvidenceItem) => {
  const currentWeight = RELIABILITY_WEIGHT[current.reliability] ?? 0;
  const nextWeight = RELIABILITY_WEIGHT[candidate.reliability] ?? 0;
  if (nextWeight !== currentWeight) return nextWeight > currentWeight ? candidate : current;
  if (candidate.publishedAt && current.publishedAt && candidate.publishedAt !== current.publishedAt) {
    return candidate.publishedAt > current.publishedAt ? candidate : current;
  }
  if ((candidate.snippet ?? "").length !== (current.snippet ?? "").length) {
    return (candidate.snippet ?? "").length > (current.snippet ?? "").length ? candidate : current;
  }
  return current;
};

export const dedupe = (items: EvidenceItem[]) => {
  const byKey = new Map<string, EvidenceItem>();

  items.forEach((item) => {
    const key = canonicalKey(item);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
    } else {
      byKey.set(key, preferItem(existing, item));
    }
  });

  const deduped = Array.from(byKey.values());
  const buckets = new Map<string, EvidenceItem[]>();
  const result: EvidenceItem[] = [];

  deduped.forEach((item) => {
    const day = item.publishedAt ? item.publishedAt.slice(0, 10) : "unknown";
    const tokens = tokenize(item.title);
    const bucketKey = `${day}:${tokens[0] ?? ""}`;
    const bucket = buckets.get(bucketKey) ?? [];
    const matchedIndex = bucket.findIndex((existing) => {
      const score = similarity(tokens, tokenize(existing.title));
      return score >= 0.9;
    });

    if (matchedIndex === -1) {
      bucket.push(item);
      buckets.set(bucketKey, bucket);
      result.push(item);
      return;
    }

    const existingItem = bucket[matchedIndex];
    const preferred = preferItem(existingItem, item);
    bucket[matchedIndex] = preferred;
    const resultIndex = result.findIndex((entry) => entry.id === existingItem.id);
    if (resultIndex >= 0) result[resultIndex] = preferred;
    buckets.set(bucketKey, bucket);
  });

  return result;
};
