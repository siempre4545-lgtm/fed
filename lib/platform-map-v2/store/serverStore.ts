import { kv } from "@vercel/kv";
import type { ScoreState } from "./types";

const PREFIX = "pmv2:score:";

export const loadKvScoreState = async (sigungu: string): Promise<ScoreState | null> => {
  try {
    return (await kv.get<ScoreState>(`${PREFIX}${sigungu}`)) ?? null;
  } catch (error) {
    return null;
  }
};

export const saveKvScoreState = async (sigungu: string, state: ScoreState): Promise<void> => {
  try {
    await kv.set(`${PREFIX}${sigungu}`, state);
  } catch (error) {
    return;
  }
};
