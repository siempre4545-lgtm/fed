export type NewsItem = {
  title: string;
  snippet?: string;
  publishedAt?: string;
  source?: string;
};

export type DedupeResult<T> = {
  unique: T[];
  duplicates: T[];
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

const isDuplicate = (a: NewsItem, b: NewsItem) => {
  const titleA = normalizeText(a.title);
  const titleB = normalizeText(b.title);
  if (titleA && titleA === titleB) return true;

  const titleSim = similarity(a.title, b.title);
  const snippetSim = similarity(a.snippet ?? "", b.snippet ?? "");
  if (titleSim >= 0.85 && snippetSim >= 0.8) return true;

  const sameSource = a.source && b.source && a.source === b.source;
  const sameDate = toDateKey(a.publishedAt) === toDateKey(b.publishedAt);
  const overlap = keywordOverlap(a.title, b.title);
  if (sameSource && sameDate && overlap >= 3) return true;

  return false;
};

export const dedupeNewsItems = <T extends NewsItem>(items: T[]): DedupeResult<T> => {
  const sorted = [...items].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  const unique: T[] = [];
  const duplicates: T[] = [];

  sorted.forEach((item) => {
    const existing = unique.find((candidate) => isDuplicate(candidate, item));
    if (existing) {
      duplicates.push(item);
      return;
    }
    unique.push(item);
  });

  return { unique, duplicates };
};
