"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./PlatformMap.module.css";
import PlatformMapMap from "./PlatformMapMap";
import PlatformMapList from "./PlatformMapList";
import PlatformMapDetail from "./PlatformMapDetail";
import {
  PLATFORM_AXES,
  PlatformAxis,
  PlatformGrade,
  PlatformMapDataResponse,
  PlatformNewsItem,
} from "../../lib/platform-map/types";

const GRADES: PlatformGrade[] = ["A", "B", "C", "D"];

type Props = {
  initialSigunguCode?: string | null;
};

export default function PlatformMapPage({ initialSigunguCode }: Props) {
  const [data, setData] = useState<PlatformMapDataResponse | null>(null);
  const [selectedGrades, setSelectedGrades] = useState<PlatformGrade[]>(GRADES);
  const [selectedAxis, setSelectedAxis] = useState<PlatformAxis | null>(null);
  const [search, setSearch] = useState("");
  const [selectedCode, setSelectedCode] = useState<string | null>(initialSigunguCode || null);
  const [newsItems, setNewsItems] = useState<PlatformNewsItem[]>([]);
  const [newsWarnings, setNewsWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/platform-map/data");
        const payload = (await response.json()) as PlatformMapDataResponse;
        if (active) {
          setData(payload);
        }
      } catch {
        if (active) {
          setData(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadNews = async () => {
      if (!data) return;
      const regionParam = selectedCode ? `&region=${selectedCode}` : "";
      try {
        const response = await fetch(`/api/platform-map/news?days=7${regionParam}`);
        const payload = await response.json();
        if (active) {
          setNewsItems(payload.items || []);
          setNewsWarnings(payload.meta?.warnings || []);
        }
      } catch {
        if (active) {
          setNewsItems([]);
          setNewsWarnings(["뉴스 수집 실패"]);
        }
      }
    };
    loadNews();
    return () => {
      active = false;
    };
  }, [data, selectedCode]);

  const filteredRatings = useMemo(() => {
    if (!data) return [];
    const gradeSet = new Set(selectedGrades);
    return data.ratings
      .filter((rating) => gradeSet.has(rating.grade))
      .filter((rating) => rating.sigunguName.includes(search))
      .sort((a, b) => b.score - a.score);
  }, [data, selectedGrades, search]);

  const selectedRating = useMemo(() => {
    if (!data || !selectedCode) return null;
    return data.ratings.find((rating) => rating.sigunguCode === selectedCode) || null;
  }, [data, selectedCode]);

  const toggleGrade = (grade: PlatformGrade) => {
    setSelectedGrades((prev) =>
      prev.includes(grade) ? prev.filter((item) => item !== grade) : [...prev, grade]
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>보물지도: 한국 시군구 플랫폼 편입 등급(A~D)</div>
          <div className={styles.subtitle}>
            데이터·네트워크·금융화 관점의 미래 도시 편입 가능성 트래킹
          </div>
          <div className={styles.subtitle}>마지막 업데이트: {data?.meta.updatedAt || "-"}</div>
        </div>
        <a className={styles.backButton} href="/">
          대시보드로 돌아가기
        </a>
      </div>

      <div className={styles.filters}>
        <div className={styles.filterRow}>
          {GRADES.map((grade) => (
            <label key={grade} className={styles.filterLabel}>
              <input
                type="checkbox"
                checked={selectedGrades.includes(grade)}
                onChange={() => toggleGrade(grade)}
              />
              {grade}
            </label>
          ))}
          <label className={styles.filterLabel}>
            축 선택
            <select
              className={styles.filterInput}
              value={selectedAxis || ""}
              onChange={(event) =>
                setSelectedAxis(event.target.value ? (event.target.value as PlatformAxis) : null)
              }
            >
              <option value="">전체</option>
              {PLATFORM_AXES.map((axis) => (
                <option key={axis} value={axis}>
                  {axis}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.filterLabel}>
            검색
            <input
              className={styles.filterInput}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="시군구명 검색"
            />
          </label>
        </div>
      </div>

      {loading && <div className={styles.emptyState}>지도를 불러오는 중...</div>}
      {!loading && data && (
        <div className={styles.layout}>
          <div className={styles.panel}>
            <PlatformMapMap
              geojson={data.geojson}
              ratings={data.ratings}
              selectedGrades={selectedGrades}
              selectedCode={selectedCode}
              selectedAxis={selectedAxis}
              onSelect={setSelectedCode}
            />
          </div>
          <div className={styles.panel}>
            <PlatformMapList
              ratings={filteredRatings}
              selectedCode={selectedCode}
              selectedAxis={selectedAxis}
              onSelect={setSelectedCode}
            />
            <hr />
            <PlatformMapDetail rating={selectedRating} newsItems={newsItems} />
            {newsWarnings.length > 0 && (
              <div className={styles.emptyState}>경고: {newsWarnings.join(", ")}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
