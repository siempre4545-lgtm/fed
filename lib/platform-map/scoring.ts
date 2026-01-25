import { PLATFORM_AXES, PlatformAxisScores, PlatformGrade } from "./types";

export const GRADE_THRESHOLDS: Array<{ grade: PlatformGrade; min: number }> = [
  { grade: "A", min: 80 },
  { grade: "B", min: 65 },
  { grade: "C", min: 45 },
  { grade: "D", min: -Infinity },
];

export const calculateAverageScore = (axes: PlatformAxisScores): number => {
  const values = PLATFORM_AXES.map((axis) => axes[axis]).filter((v) => Number.isFinite(v));
  if (!values.length) return 0;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return Number((sum / values.length).toFixed(2));
};

export const gradeFromScore = (score: number): PlatformGrade => {
  const found = GRADE_THRESHOLDS.find((entry) => score >= entry.min);
  return found ? found.grade : "D";
};
