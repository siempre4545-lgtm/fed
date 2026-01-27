export type NewsItem = {
  title: string;
  publishedAt?: string;
};

const normalizeTitle = (value: string) =>
  value
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const toDateKey = (value?: string) => (value ? value.slice(0, 10) : "unknown");

export const dedupeByTitleDate = <T extends NewsItem>(items: T[]) => {
  const seen = new Set<string>();
  const result: T[] = [];
  items.forEach((item) => {
    const key = `${normalizeTitle(item.title)}:${toDateKey(item.publishedAt)}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(item);
  });
  return result;
};
