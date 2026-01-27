import type { PlatformMapGrade } from "../types";

export type GradeAssignmentInput = Array<{ key: string; score: number }>;

export type GradeAssignmentResult = {
  grades: Record<string, PlatformMapGrade>;
  counts: Record<PlatformMapGrade, number>;
  relativeApplied: boolean;
};

const clampCounts = (counts: number[], total: number) => {
  const sum = counts.reduce((acc, item) => acc + item, 0);
  if (sum === total) return counts;
  const diff = total - sum;
  const updated = [...counts];
  updated[updated.length - 1] += diff;
  return updated;
};

const assignByDistribution = (
  sorted: Array<{ key: string; score: number }>,
  distribution: [number, number, number, number],
) => {
  const total = sorted.length;
  const counts = clampCounts(
    distribution.map((ratio) => Math.max(1, Math.round(total * ratio))),
    total,
  );
  const grades: Record<string, PlatformMapGrade> = {};
  const labels: PlatformMapGrade[] = ["A", "B", "C", "D"];
  let offset = 0;
  counts.forEach((count, index) => {
    const grade = labels[index];
    sorted.slice(offset, offset + count).forEach((item) => {
      grades[item.key] = grade;
    });
    offset += count;
  });
  const gradeCounts = labels.reduce(
    (acc, grade) => ({ ...acc, [grade]: Object.values(grades).filter((g) => g === grade).length }),
    {} as Record<PlatformMapGrade, number>,
  );
  return { grades, gradeCounts };
};

export const assignGrades = (
  values: GradeAssignmentInput,
  options?: { minRelativeCount?: number; allowRelative?: boolean },
): GradeAssignmentResult => {
  const allowRelative = options?.allowRelative ?? true;
  const minRelativeCount = options?.minRelativeCount ?? 10;
  const sorted = [...values].sort((a, b) => b.score - a.score);
  if (sorted.length === 0) {
    return { grades: {}, counts: { A: 0, B: 0, C: 0, D: 0 }, relativeApplied: false };
  }

  const base = assignByDistribution(sorted, [0.15, 0.25, 0.3, 0.3]);
  const maxCount = Math.max(...Object.values(base.gradeCounts));
  const relativeCondition =
    allowRelative && sorted.length >= minRelativeCount && (maxCount / sorted.length >= 0.6);

  if (!relativeCondition) {
    return { grades: base.grades, counts: base.gradeCounts, relativeApplied: false };
  }

  const adjusted = assignByDistribution(sorted, [0.1, 0.25, 0.35, 0.3]);
  return { grades: adjusted.grades, counts: adjusted.gradeCounts, relativeApplied: true };
};
