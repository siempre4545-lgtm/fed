import type { ScoreState } from "./types";

const STORAGE_PREFIX = "platform-map-v2:score:";

const getKey = (sigungu: string) => `${STORAGE_PREFIX}${sigungu}`;

export const loadLocalScoreState = (sigungu: string): ScoreState | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(getKey(sigungu));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ScoreState;
    if (parsed?.version !== 1) return null;
    return parsed;
  } catch (error) {
    return null;
  }
};

export const saveLocalScoreState = (sigungu: string, state: ScoreState) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getKey(sigungu), JSON.stringify(state));
};
