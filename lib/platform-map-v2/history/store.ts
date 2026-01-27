import { createCacheStore } from "../cache";
import type { HistoryEntry } from "./types";

const HISTORY_PREFIX = "pmv2:history:";
const store = createCacheStore();

const toDateKey = (value: Date) => value.toISOString().slice(0, 10);

const getDateList = (days: number) => {
  const list: string[] = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    list.push(toDateKey(date));
  }
  return list;
};

export const loadHistoryByDate = async (dateKey: string) => {
  return (await store.get<HistoryEntry[]>(`${HISTORY_PREFIX}${dateKey}`)) ?? null;
};

export const saveHistoryByDate = async (dateKey: string, entries: HistoryEntry[]) => {
  await store.set(`${HISTORY_PREFIX}${dateKey}`, entries, 60 * 60 * 24 * 60);
};

export const ensureHistorySnapshot = async (dateKey: string, entries: HistoryEntry[]) => {
  const existing = await loadHistoryByDate(dateKey);
  if (existing && existing.length > 0) return false;
  await saveHistoryByDate(dateKey, entries);
  return true;
};

export const loadHistoryForSigungu = async (sigungu: string, days: number) => {
  const dates = getDateList(days);
  const daily: HistoryEntry[] = [];
  for (const dateKey of dates) {
    const entries = await loadHistoryByDate(dateKey);
    if (!entries) continue;
    const match = entries.find((entry) => entry.sigungu === sigungu);
    if (match) daily.push(match);
  }
  return daily.sort((a, b) => a.date.localeCompare(b.date));
};

export const loadHistoryWindow = async (days: number) => {
  const dates = getDateList(days);
  const window: Record<string, HistoryEntry[]> = {};
  for (const dateKey of dates) {
    const entries = await loadHistoryByDate(dateKey);
    if (!entries) continue;
    entries.forEach((entry) => {
      if (!window[entry.sigungu]) {
        window[entry.sigungu] = [];
      }
      window[entry.sigungu].push(entry);
    });
  }
  Object.values(window).forEach((entries) => entries.sort((a, b) => a.date.localeCompare(b.date)));
  return window;
};
