import { AXIS_DEFINITIONS, type AxisKey } from "../types";
import { loadLocalScoreState, saveLocalScoreState } from "./clientStore";
import type { AxisScoreState, ScoreState } from "./types";

export const createDefaultScoreState = (sigungu: string): ScoreState => ({
  version: 1,
  sigungu,
  axes: AXIS_DEFINITIONS.reduce(
    (acc, axis) => ({
      ...acc,
      [axis.key]: { appliedDelta: 0, weight: 1 },
    }),
    {} as Record<AxisKey, AxisScoreState>,
  ),
});

export const loadScoreState = async (sigungu: string): Promise<ScoreState | null> => {
  if (typeof window === "undefined") return null;
  try {
    const response = await fetch(`/api/platform-map-v2/score?sigungu=${encodeURIComponent(sigungu)}`);
    if (response.ok) {
      const data = (await response.json()) as { ok: boolean; state?: ScoreState };
      if (data.ok && data.state) return data.state;
    }
  } catch (error) {
    // ignore and fallback to local storage
  }
  return loadLocalScoreState(sigungu);
};

export const saveScoreState = async (sigungu: string, state: ScoreState) => {
  if (typeof window !== "undefined") {
    saveLocalScoreState(sigungu, state);
    try {
      await fetch("/api/platform-map-v2/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sigungu, state }),
      });
    } catch (error) {
      // ignore server save failures
    }
  }
};

export type { AxisScoreState, ScoreState };
