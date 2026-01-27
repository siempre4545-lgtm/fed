import { AXIS_DEFINITIONS, type AxisScore } from "./types";

export const AXIS_MIN_SCORE = 0;
export const AXIS_MAX_SCORE = 10;
export const TOTAL_MIN_SCORE = AXIS_DEFINITIONS.length * AXIS_MIN_SCORE;
export const TOTAL_MAX_SCORE = AXIS_DEFINITIONS.length * AXIS_MAX_SCORE;

export const GRADE_THRESHOLDS = {
  A: 90,
  B: 75,
  C: 55,
  D: 0,
} as const;

export type Grade = keyof typeof GRADE_THRESHOLDS;

const clampScore = (value: number) => Math.min(AXIS_MAX_SCORE, Math.max(AXIS_MIN_SCORE, value));

export const getTotalScore = (axes: AxisScore[]) =>
  axes.reduce((sum, axis) => sum + clampScore(axis.score), 0);

export const getGrade = (totalScore: number): Grade => {
  if (totalScore >= GRADE_THRESHOLDS.A) return "A";
  if (totalScore >= GRADE_THRESHOLDS.B) return "B";
  if (totalScore >= GRADE_THRESHOLDS.C) return "C";
  return "D";
};

export const getScoreSummary = (axes: AxisScore[]) => {
  const total = getTotalScore(axes);
  return { total, grade: getGrade(total) };
};
