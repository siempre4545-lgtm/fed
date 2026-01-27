import { readFile } from "fs/promises";
import path from "path";
import type { AxisKey, PlatformMapRating } from "../types";

export type FactLayerEntry = {
  sigungu: string;
  sigunguKey?: string;
  axisFloors: Partial<Record<AxisKey, number>>;
  tags?: string[];
  sources?: string[];
  note?: string;
};

export type FactLayer = {
  updatedAt?: string;
  entries: FactLayerEntry[];
};

const FACT_LAYER_PATH = path.join(process.cwd(), "data/platform-map-v2/fact-layer.json");

const normalize = (value: string) =>
  value
    .replace(/[()（）]/g, " ")
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();

const buildEntryMap = (entries: FactLayerEntry[]) => {
  const map = new Map<string, FactLayerEntry>();
  entries.forEach((entry) => {
    map.set(normalize(entry.sigungu), entry);
    if (entry.sigunguKey) {
      map.set(`key:${entry.sigunguKey}`, entry);
    }
  });
  return map;
};

const mergeTags = (base: string[] | undefined, next: string[] | undefined) => {
  const set = new Set<string>();
  (base ?? []).forEach((tag) => set.add(tag));
  (next ?? []).forEach((tag) => set.add(tag));
  return Array.from(set);
};

export const loadFactLayer = async (): Promise<FactLayer> => {
  try {
    const raw = await readFile(FACT_LAYER_PATH, "utf-8");
    const parsed = JSON.parse(raw) as FactLayer;
    if (!parsed || !Array.isArray(parsed.entries)) {
      return { entries: [] };
    }
    return parsed;
  } catch (error) {
    return { entries: [] };
  }
};

export const applyFactLayer = (
  ratings: PlatformMapRating[],
  entries: FactLayerEntry[],
): PlatformMapRating[] => {
  if (entries.length === 0) return ratings;
  const entryMap = buildEntryMap(entries);
  return ratings.map((rating) => {
    const keyMatch = entryMap.get(`key:${rating.sigunguKey}`);
    const nameMatch = entryMap.get(normalize(rating.name));
    const entry = keyMatch ?? nameMatch;
    if (!entry) return rating;

    const updatedAxes = rating.axisScores.map((axis) => {
      const floor = entry.axisFloors[axis.key];
      if (!Number.isFinite(floor)) return axis;
      const nextScore = Math.max(axis.score, floor as number);
      if (nextScore === axis.score) return axis;
      return { ...axis, score: Math.round(nextScore * 10) / 10 };
    });

    const totalScore = Math.round(updatedAxes.reduce((sum, axis) => sum + axis.score, 0) * 10) / 10;
    const top3Axes = [...updatedAxes].sort((a, b) => b.score - a.score).slice(0, 3);

    return {
      ...rating,
      axisScores: updatedAxes,
      top3Axes,
      totalScore,
      tags: mergeTags(rating.tags, entry.tags),
    };
  });
};
