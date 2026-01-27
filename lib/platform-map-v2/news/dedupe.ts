export type NewsItem = {
  title: string;
  snippet?: string;
  publishedAt?: string;
  source?: string;
  url?: string;
};

export type DedupeResult<T> = {
  unique: Array<T & { dedupKey: string }>;
  duplicates: Array<T & { dedupKey: string; reason: string }>;
};

const normalizeText = (value: string) =>
  value
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const tokenize = (value: string) =>
  normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 1);

const toDateKey = (value?: string) => (value ? value.slice(0, 10) : "unknown");

export const normalizeUrl = (url?: string) => {
  if (!url) return "";
  try {
    const target = new URL(url);
    [...target.searchParams.keys()].forEach((key) => {
      if (key.toLowerCase().startsWith("utm_")) {
        target.searchParams.delete(key);
      }
    });
    target.hash = "";
    const normalized = target.toString().replace(/\/$/, "");
    return normalized;
  } catch (error) {
    return url;
  }
};

const toDomain = (url?: string) => {
  if (!url) return "unknown";
  try {
    return new URL(normalizeUrl(url)).host.replace(/^www\./, "");
  } catch (error) {
    return "unknown";
  }
};

export const buildDedupKey = (item: NewsItem) => {
  const title = normalizeText(item.title);
  const domain = toDomain(item.url);
  const dateKey = toDateKey(item.publishedAt);
  return `${title}::${domain}::${dateKey}`;
};

const similarity = (a: string, b: string) => {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
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

const keywordOverlap = (a: string, b: string) => {
  const aTokens = new Set(tokenize(a));
  const bTokens = new Set(tokenize(b));
  let overlap = 0;
  aTokens.forEach((token) => {
    if (bTokens.has(token)) overlap += 1;
  });
  return overlap;
};

const shingle = (value: string, size = 3) => {
  const tokens = tokenize(value);
  if (tokens.length < size) return tokens;
  const shingles: string[] = [];
  for (let i = 0; i <= tokens.length - size; i += 1) {
    shingles.push(tokens.slice(i, i + size).join(" "));
  }
  return shingles;
};

const shingleSimilarity = (a: string, b: string) => {
  const aSet = new Set(shingle(a));
  const bSet = new Set(shingle(b));
  if (aSet.size === 0 || bSet.size === 0) return 0;
  let intersection = 0;
  aSet.forEach((token) => {
    if (bSet.has(token)) intersection += 1;
  });
  const union = aSet.size + bSet.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

const isDuplicate = (a: NewsItem, b: NewsItem) => {
  const titleA = normalizeText(a.title);
  const titleB = normalizeText(b.title);
  if (titleA && titleA === titleB) return { dup: true, reason: "title_exact" };

  const titleSim = similarity(a.title, b.title);
  const snippetSim = similarity(a.snippet ?? "", b.snippet ?? "");
  if (titleSim >= 0.85 && snippetSim >= 0.8) return { dup: true, reason: "title_snippet_similar" };

  const sameSource = a.source && b.source && a.source === b.source;
  const sameDate = toDateKey(a.publishedAt) === toDateKey(b.publishedAt);
  const overlap = keywordOverlap(a.title, b.title);
  if (sameSource && sameDate && overlap >= 3) return { dup: true, reason: "source_date_overlap" };

  const shingleSim = shingleSimilarity(`${a.title} ${a.snippet ?? ""}`, `${b.title} ${b.snippet ?? ""}`);
  if (shingleSim >= 0.82) return { dup: true, reason: "shingle_similar" };

  return { dup: false, reason: "unique" };
};

export const dedupeNewsItems = <T extends NewsItem>(items: T[]): DedupeResult<T> => {
  const sorted = [...items].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  const unique: Array<T & { dedupKey: string }> = [];
  const duplicates: Array<T & { dedupKey: string; reason: string }> = [];
  const keyMap = new Map<string, T & { dedupKey: string }>();

  sorted.forEach((item) => {
    const dedupKey = buildDedupKey(item);
    const existing = keyMap.get(dedupKey);
    if (existing) {
      duplicates.push({ ...item, dedupKey, reason: "dedup_key" });
      return;
    }
    const similar = unique.find((candidate) => {
      const result = isDuplicate(candidate, item);
      return result.dup;
    });
    if (similar) {
      const result = isDuplicate(similar, item);
      duplicates.push({ ...item, dedupKey, reason: result.reason });
      return;
    }
    const enriched = { ...item, dedupKey };
    keyMap.set(dedupKey, enriched);
    unique.push(enriched);
  });

  return { unique, duplicates };
};
