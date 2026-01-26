export type RegionAliasMap = Record<string, string[]>;

export type RegionContext = {
  sigungu: string;
  sido: string | null;
  aliases: string[];
  tokens: string[];
};

const normalizeText = (value: string) =>
  value
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const stripSuffix = (value: string) =>
  value.replace(/(특별시|광역시|특별자치시|특별자치도|자치구|시|군|구)$/g, "");

export const buildRegionContext = (sigungu: string, aliases: RegionAliasMap): RegionContext => {
  const trimmed = sigungu.trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const firstPart = parts[0] ?? "";
  const sido = firstPart && /(?:시|도|특별시|광역시|특별자치시|특별자치도)$/g.test(firstPart) ? firstPart : null;

  const tokens = new Set<string>();
  if (trimmed) tokens.add(trimmed);
  parts.forEach((part) => {
    tokens.add(part);
    const shortened = stripSuffix(part);
    if (shortened && shortened !== part) tokens.add(shortened);
  });

  const aliasList = aliases[trimmed] ?? [];
  aliasList.forEach((alias) => tokens.add(alias));

  return {
    sigungu: trimmed,
    sido,
    aliases: aliasList,
    tokens: Array.from(tokens).filter((token) => token.length > 1),
  };
};

export const matchRegionHints = (text: string, context: RegionContext) => {
  const normalized = normalizeText(text);
  const hits: string[] = [];

  const aliasHits = context.aliases.filter((alias) => normalized.includes(normalizeText(alias)));
  aliasHits.forEach((alias) => hits.push(`keyword:${alias}`));
  if (aliasHits.length > 0 && context.sigungu) {
    hits.push(`sigungu:${context.sigungu}`);
  }

  if (aliasHits.length === 0) {
    const sigunguHits = context.tokens.filter((token) => normalized.includes(normalizeText(token)));
    sigunguHits.slice(0, 2).forEach((token) => hits.push(`sigungu:${token}`));
  }

  if (hits.length === 0 && context.sido && normalized.includes(normalizeText(context.sido))) {
    hits.push(`sido:${context.sido}`);
  }

  return hits;
};
