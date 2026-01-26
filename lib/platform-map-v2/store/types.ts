import type { AxisKey } from "../types";

export type AxisScoreState = {
  appliedDelta: number;
  weight: number;
  reason?: string;
  updatedAt?: string;
};

export type ScoreSnapshot = {
  axes: Record<AxisKey, AxisScoreState>;
  totalDelta: number;
  updatedAt: string;
};

export type ScoreState = {
  version: 1;
  sigungu: string;
  axes: Record<AxisKey, AxisScoreState>;
  lastSnapshot?: ScoreSnapshot;
};
