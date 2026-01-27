import type { AxisKey } from "../types";

export type HistoryEntry = {
  sigungu: string;
  date: string; // YYYY-MM-DD
  totalScore: number;
  axes: Record<AxisKey, number>;
};

export type HistoryResponse = {
  ok: true;
  sigungu: string;
  daily: HistoryEntry[];
  weeklyAverage: Array<{ date: string; totalScore: number }>;
  monthlyAverage: Array<{ date: string; totalScore: number }>;
};
