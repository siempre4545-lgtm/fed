export type RegionAliasMap = Record<string, string[]>;

export type RegionContext = {
  sigunguKey: string;
  name: string;
  sido: string | null;
  coreTokens: string[];
  aliasTokens: string[];
  allTokens: string[];
};

const SIDO_ALIASES: Record<string, string> = {
  "서울특별시": "서울",
  서울: "서울",
  서울시: "서울",
  "부산광역시": "부산",
  부산: "부산",
  부산시: "부산",
  "대구광역시": "대구",
  대구: "대구",
  "인천광역시": "인천",
  인천: "인천",
  "광주광역시": "광주",
  광주: "광주",
  "대전광역시": "대전",
  대전: "대전",
  "울산광역시": "울산",
  울산: "울산",
  "세종특별자치시": "세종",
  세종: "세종",
  "경기도": "경기",
  경기: "경기",
  "강원특별자치도": "강원",
  강원: "강원",
  "충청북도": "충북",
  충북: "충북",
  "충청남도": "충남",
  충남: "충남",
  "전북특별자치도": "전북",
  전북: "전북",
  "전라남도": "전남",
  전남: "전남",
  "경상북도": "경북",
  경북: "경북",
  "경상남도": "경남",
  경남: "경남",
  "제주특별자치도": "제주",
  제주: "제주",
};

const STOP_TOKENS = new Set([
  "특별시",
  "광역시",
  "특별자치시",
  "특별자치도",
  "자치구",
  "도",
  "시",
  "군",
  "구",
  "읍",
  "면",
  "동",
]);

export const normalizeText = (value: string) =>
  value
    .replace(/[()（）]/g, " ")
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

const normalizeToken = (value: string) => normalizeText(value).replace(/\s+/g, "");

const stripSuffix = (value: string) =>
  value.replace(/(특별시|광역시|특별자치시|특별자치도|자치구|도|시|군|구|읍|면|동)$/g, "");

const isStrongToken = (value: string) => value.length >= 2 && !STOP_TOKENS.has(value);

const normalizeSido = (value: string) => {
  const normalized = normalizeToken(value);
  return SIDO_ALIASES[normalized] ?? null;
};

const pushToken = (set: Set<string>, token: string) => {
  const normalized = normalizeToken(token);
  if (!normalized || !isStrongToken(normalized)) return;
  set.add(normalized);
};

const splitTokens = (value: string) =>
  value
    .replace(/[()（）]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

export const buildRegionContexts = (
  ratings: Array<{ sigunguCode: string; sigunguName: string }>,
  aliases: RegionAliasMap,
): RegionContext[] => {
  return ratings.map((rating) => {
    const name = rating.sigunguName;
    const parts = splitTokens(name);
    const first = parts[0] ?? "";
    const sido = normalizeSido(first);
    const coreParts = sido ? parts.slice(1) : parts;

    const coreTokens = new Set<string>();
    coreParts.forEach((part) => {
      pushToken(coreTokens, part);
      const stripped = stripSuffix(part);
      if (stripped !== part) pushToken(coreTokens, stripped);
    });

    const aliasTokens = new Set<string>();
    (aliases[name] ?? []).forEach((alias) => {
      splitTokens(alias).forEach((token) => {
        pushToken(aliasTokens, token);
        const stripped = stripSuffix(token);
        if (stripped !== token) pushToken(aliasTokens, stripped);
      });
    });

    const allTokens = new Set<string>();
    if (sido) pushToken(allTokens, sido);
    coreTokens.forEach((token) => allTokens.add(token));
    aliasTokens.forEach((token) => allTokens.add(token));

    return {
      sigunguKey: rating.sigunguCode,
      name,
      sido,
      coreTokens: Array.from(coreTokens),
      aliasTokens: Array.from(aliasTokens),
      allTokens: Array.from(allTokens),
    };
  });
};

export const buildSingleRegionContext = (name: string, aliases: RegionAliasMap): RegionContext => {
  const context = buildRegionContexts([{ sigunguCode: name, sigunguName: name }], aliases)[0];
  return {
    ...context,
    sigunguKey: name,
  };
};

export const matchRegionNormalized = (normalizedText: string, context: RegionContext) => {
  const hasAlias = context.aliasTokens.some((token) => normalizedText.includes(token));
  if (hasAlias) return true;
  const hasCore = context.coreTokens.some((token) => normalizedText.includes(token));
  if (!hasCore) return false;
  if (context.sido && normalizedText.includes(context.sido)) return true;
  return true;
};

export const matchRegionText = (text: string, context: RegionContext) =>
  matchRegionNormalized(normalizeText(text), context);

export const getContextDebugTokens = (context: RegionContext) =>
  Array.from(new Set([...context.aliasTokens, ...context.coreTokens])).slice(0, 6);
