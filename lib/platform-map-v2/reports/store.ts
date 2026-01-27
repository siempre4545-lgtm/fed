import { readFile, writeFile } from "fs/promises";
import path from "path";
import { createCacheStore } from "../cache";
import type { PlatformMapReport } from "../types";

const REPORTS_PREFIX = "pmv2:reports:";
const INDEX_KEY = `${REPORTS_PREFIX}index`;
const store = createCacheStore();
const REPORTS_INDEX_PATH = path.join(process.cwd(), "data/platform-map-v2/reports/index.json");

const readIndexFile = async () => {
  try {
    const raw = await readFile(REPORTS_INDEX_PATH, "utf-8");
    const parsed = JSON.parse(raw) as PlatformMapReport[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

const writeIndexFile = async (reports: PlatformMapReport[]) => {
  try {
    await writeFile(REPORTS_INDEX_PATH, JSON.stringify(reports, null, 2), "utf-8");
    return true;
  } catch (error) {
    return false;
  }
};

export const loadReports = async () => {
  const cached = await store.get<PlatformMapReport[]>(INDEX_KEY);
  if (cached && cached.length > 0) return cached;
  return await readIndexFile();
};

export const loadReportById = async (id: string) => {
  const cached = await store.get<PlatformMapReport>(`${REPORTS_PREFIX}${id}`);
  if (cached) return cached;
  const list = await loadReports();
  return list.find((item) => item.id === id) ?? null;
};

export const saveReport = async (report: PlatformMapReport) => {
  const warnings: string[] = [];
  const reports = await loadReports();
  const nextList = [report, ...reports.filter((item) => item.id !== report.id)].slice(0, 30);

  try {
    await store.set(INDEX_KEY, nextList, 60 * 60 * 24 * 30);
    await store.set(`${REPORTS_PREFIX}${report.id}`, report, 60 * 60 * 24 * 30);
  } catch (error) {
    warnings.push("캐시 저장에 실패했습니다.");
  }

  const fileSaved = await writeIndexFile(nextList);
  if (!fileSaved) {
    warnings.push("리포트 파일 저장이 제한되었습니다.");
  }

  return { reports: nextList, warnings };
};
