import type { PlatformMapGrade } from "../types";

export type GradeAssignmentInput = Array<{ key: string; score: number }>;

export type GradeAssignmentResult = {
  grades: Record<string, PlatformMapGrade>;
  counts: Record<PlatformMapGrade, number>;
  relativeApplied: boolean;
};

const DEFAULT_CUTOFFS = {
  A: 90,
  B: 75,
  C: 55,
};

const assignByCutoffs = (values: GradeAssignmentInput, cutoffs = DEFAULT_CUTOFFS) => {
  const grades: Record<string, PlatformMapGrade> = {};
  values.forEach((item) => {
    if (item.score >= cutoffs.A) grades[item.key] = "A";
    else if (item.score >= cutoffs.B) grades[item.key] = "B";
    else if (item.score >= cutoffs.C) grades[item.key] = "C";
    else grades[item.key] = "D";
  });
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  Object.values(grades).forEach((grade) => {
    counts[grade] += 1;
  });
  return { grades, counts };
};

const percentileCutoff = (sorted: Array<{ key: string; score: number }>, percentile: number) => {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * percentile)));
  return sorted[index]?.score ?? 0;
};

export const assignGrades = (
  values: GradeAssignmentInput,
  options?: { minRelativeCount?: number; allowRelative?: boolean },
): GradeAssignmentResult => {
  const allowRelative = options?.allowRelative ?? true;
  const minRelativeCount = options?.minRelativeCount ?? 150;
  const sorted = [...values].sort((a, b) => b.score - a.score);
  if (sorted.length === 0) {
    return { grades: {}, counts: { A: 0, B: 0, C: 0, D: 0 }, relativeApplied: false };
  }

  const base = assignByCutoffs(sorted);
  const gradeVariety = Object.values(base.counts).filter((count) => count > 0).length;
  const scoreRange = sorted[0].score - sorted[sorted.length - 1].score;
  const nonDefaultCount = sorted.filter((item) => item.score > 0).length;
  const minNonDefault = Math.max(30, Math.round(sorted.length * 0.3));
  if (
    !allowRelative ||
    sorted.length < minRelativeCount ||
    gradeVariety > 1 ||
    scoreRange <= 0.1 ||
    nonDefaultCount < minNonDefault
  ) {
    return { grades: base.grades, counts: base.counts, relativeApplied: false };
  }

  const cutoffs = {
    A: percentileCutoff(sorted, 0.1),
    B: percentileCutoff(sorted, 0.25),
    C: percentileCutoff(sorted, 0.45),
  };
  const adjusted = assignByCutoffs(sorted, cutoffs);
  return { grades: adjusted.grades, counts: adjusted.counts, relativeApplied: true };
};
