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

const assignByDistribution = (
  sorted: Array<{ key: string; score: number }>,
  counts: { A: number; B: number; C: number },
) => {
  const grades: Record<string, PlatformMapGrade> = {};
  const nonDefault = sorted.filter((item) => item.score > 0);
  const zeros = sorted.filter((item) => item.score <= 0);
  nonDefault.slice(0, counts.A).forEach((item) => {
    grades[item.key] = "A";
  });
  nonDefault.slice(counts.A, counts.A + counts.B).forEach((item) => {
    grades[item.key] = "B";
  });
  nonDefault.slice(counts.A + counts.B, counts.A + counts.B + counts.C).forEach((item) => {
    grades[item.key] = "C";
  });
  zeros.forEach((item) => {
    grades[item.key] = "D";
  });
  const summary = { A: 0, B: 0, C: 0, D: 0 };
  Object.values(grades).forEach((grade) => {
    summary[grade] += 1;
  });
  return { grades, counts: summary };
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
  const nonDefaultCount = sorted.filter((item) => item.score > 0).length;
  if (!allowRelative || sorted.length < minRelativeCount || nonDefaultCount === 0) {
    return { grades: base.grades, counts: base.counts, relativeApplied: false };
  }

  const minA = nonDefaultCount >= 30 ? 3 : nonDefaultCount >= 10 ? 2 : 1;
  const maxA = Math.max(minA, Math.round(nonDefaultCount * 0.15));
  const targetA = Math.round(nonDefaultCount * 0.1);
  const countA = Math.max(minA, Math.min(maxA, Math.min(nonDefaultCount, targetA)));
  const targetB = Math.round(nonDefaultCount * 0.2);
  const minB = nonDefaultCount >= 20 ? 4 : nonDefaultCount >= 10 ? 2 : 1;
  const maxB = Math.max(minB, Math.round(nonDefaultCount * 0.35));
  const countB = Math.max(0, Math.min(nonDefaultCount - countA, Math.max(minB, Math.min(maxB, targetB))));
  const countC = Math.max(0, nonDefaultCount - countA - countB);

  const needsDistribution = gradeVariety <= 1 || base.counts.A < minA || base.counts.A > maxA;
  if (!needsDistribution) {
    return { grades: base.grades, counts: base.counts, relativeApplied: false };
  }

  const distributed = assignByDistribution(sorted, { A: countA, B: countB, C: countC });
  return { grades: distributed.grades, counts: distributed.counts, relativeApplied: true };
};
