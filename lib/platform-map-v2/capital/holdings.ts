import { readFile, writeFile } from "fs/promises";
import path from "path";
import type { PlatformMapRating, CapitalHoldingEntity, CapitalHoldingMatch } from "../types";

const HOLDINGS_PATH = path.join(process.cwd(), "data/platform-map-v2/capital-holdings.json");

const normalize = (value: string) =>
  value
    .replace(/[()（）]/g, " ")
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();

export const loadCapitalHoldings = async (): Promise<CapitalHoldingEntity[]> => {
  try {
    const raw = await readFile(HOLDINGS_PATH, "utf-8");
    const parsed = JSON.parse(raw) as CapitalHoldingEntity[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

export const saveCapitalHoldings = async (items: CapitalHoldingEntity[]) => {
  try {
    await writeFile(HOLDINGS_PATH, JSON.stringify(items, null, 2), "utf-8");
    return true;
  } catch (error) {
    return false;
  }
};

const matchSigunguKey = (sigungu: string, ratings: PlatformMapRating[]) => {
  const normalized = normalize(sigungu);
  if (!normalized) return null;
  const candidates = ratings.map((item) => ({
    key: item.sigunguKey,
    name: item.name,
    normalized: normalize(item.name),
  }));
  const exact = candidates.find((item) => item.normalized === normalized);
  if (exact) return exact.key;
  const matches = candidates.filter(
    (item) => item.normalized.includes(normalized) || normalized.includes(item.normalized),
  );
  if (matches.length === 0) return null;
  const sorted = matches.sort((a, b) => b.normalized.length - a.normalized.length);
  return sorted[0]?.key ?? null;
};

export const buildHoldingsIndex = (
  holdings: CapitalHoldingEntity[],
  ratings: PlatformMapRating[],
) => {
  const bySigunguKey: Record<string, CapitalHoldingMatch[]> = {};
  const unmatched: string[] = [];

  holdings.forEach((entity) => {
    entity.regions.forEach((region) => {
      const sigunguKey = matchSigunguKey(region.sigungu, ratings);
      if (!sigunguKey) {
        unmatched.push(region.sigungu);
        return;
      }
      if (!bySigunguKey[sigunguKey]) {
        bySigunguKey[sigunguKey] = [];
      }
      bySigunguKey[sigunguKey].push({
        entity: entity.entity,
        type: entity.type,
        sigungu: region.sigungu,
        confidence: region.confidence,
        source: entity.source,
        note: region.note,
      });
    });
  });

  return { bySigunguKey, unmatched };
};
