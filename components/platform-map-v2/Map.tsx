"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PlatformMapGrade, PlatformMapRating, PisStatus } from "../../lib/platform-map-v2/types";

const GRADE_COLORS: Record<PlatformMapGrade, string> = {
  A: "#1f4ed8",
  B: "#16a34a",
  C: "#f59e0b",
  D: "#dc2626",
};

const PIS_STYLES: Record<PisStatus, { stroke: string; dash: string; animate: boolean }> = {
  "기관 선행 구간": { stroke: "#facc15", dash: "4 4", animate: true },
  "관찰 필요": { stroke: "#60a5fa", dash: "3 5", animate: false },
  정체: { stroke: "#94a3b8", dash: "1 6", animate: false },
};

const PRE_MOVE_STYLE = { stroke: "#f97316", dash: "2 3", animate: true };

const walkCoords = (coords: any, onPoint: (lng: number, lat: number) => void) => {
  if (typeof coords[0] === "number") {
    onPoint(coords[0], coords[1]);
    return;
  }
  coords.forEach((child: any) => walkCoords(child, onPoint));
};

const buildBounds = (features: any[]) => {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  features.forEach((feature) => {
    walkCoords(feature.geometry.coordinates, (lng, lat) => {
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
    });
  });
  return { minLng, minLat, maxLng, maxLat };
};

const buildPath = (
  coordinates: number[][][],
  project: (lng: number, lat: number) => [number, number],
) =>
  coordinates
    .map((ring) =>
      ring
        .map(([lng, lat], index) => {
          const [x, y] = project(lng, lat);
          return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(" ") + " Z",
    )
    .join(" ");

const geometryToPath = (geometry: any, project: (lng: number, lat: number) => [number, number]) => {
  if (geometry.type === "Polygon") {
    return buildPath(geometry.coordinates, project);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.map((poly: number[][][]) => buildPath(poly, project)).join(" ");
  }
  return "";
};

type Props = {
  geojson: any;
  ratings: PlatformMapRating[];
  selectedGrades: PlatformMapGrade[];
  minHeight?: number;
  touchAction?: React.CSSProperties["touchAction"];
};

type MapPath = {
  key: string;
  name: string;
  path: string;
};

export default function PlatformMapView({ geojson, ratings, selectedGrades, minHeight = 320, touchAction }: Props) {
  const router = useRouter();
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const ratingByKey = useMemo(() => {
    const map = new globalThis.Map<string, PlatformMapRating>();
    ratings.forEach((rating) => {
      map.set(rating.sigunguKey, rating);
      map.set(rating.name, rating);
    });
    return map;
  }, [ratings]);

  const features: any[] = geojson?.features ?? [];
  const { width, height, paths } = useMemo<{ width: number; height: number; paths: MapPath[] }>(() => {
    if (!features.length) {
      return { width: 0, height: 0, paths: [] };
    }
    const bounds = buildBounds(features);
    const width = 800;
    const height = Math.round(((bounds.maxLat - bounds.minLat) / (bounds.maxLng - bounds.minLng)) * width);
    const project = (lng: number, lat: number): [number, number] => {
      const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * width;
      const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * height;
      return [x, y];
    };
    const paths = features.map((feature: any): MapPath => {
      const code = String(feature.properties?.code || feature.properties?.SIG_CD || "");
      const name = feature.properties?.name || feature.properties?.SIG_KOR_NM || code;
      return {
        key: code || name,
        name,
        path: geometryToPath(feature.geometry, project),
      };
    });
    return { width, height, paths };
  }, [features]);

  const focused = hoveredKey ? ratingByKey.get(hoveredKey) ?? null : null;

  return (
    <div
      style={{
        minHeight,
        borderRadius: 12,
        border: "1px solid #1f2937",
        background: "#0f172a",
        padding: 16,
        color: "#cbd5f5",
        touchAction,
      }}
    >
      <div style={{ fontSize: 13, marginBottom: 8 }}>대한민국 시군구 등급 지도</div>
      {focused && (
        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>
          {focused.name} · 등급 {focused.grade} · 상위 3축:{" "}
          {focused.top3Axes.map((axis) => `${axis.label}(${axis.score})`).join(" / ")}
        </div>
      )}
      <div style={{ width: "100%", minHeight: 320 }}>
        {paths.length === 0 ? (
          <div style={{ fontSize: 12, color: "#94a3b8" }}>지도를 불러오는 중...</div>
        ) : (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ width: "100%", height: "100%" }}
          >
            <style>
              {`@keyframes pmv2Ring { to { stroke-dashoffset: -20; } }`}
            </style>
            {paths.map((item) => {
              const rating = ratingByKey.get(item.key) ?? ratingByKey.get(item.name);
              const grade = rating?.grade;
              const isVisible = grade ? selectedGrades.length === 0 || selectedGrades.includes(grade) : true;
              const fill = grade ? GRADE_COLORS[grade] : "#1f2937";
              const pisStatus = rating?.pisStatus ?? "정체";
              const pisStyle = PIS_STYLES[pisStatus];
              const gradeLabel = rating?.gradeLabel ?? grade;
              const preMove = Boolean(rating?.preInstitutionalMove);
              const showOverlay = rating?.pisStatus && rating.pisStatus !== "정체";
              return (
                <g key={item.key}>
                  <path
                    d={item.path}
                    fill={isVisible ? fill : "#111827"}
                    stroke="#0b1220"
                    strokeWidth={0.6}
                    onMouseEnter={() => setHoveredKey(item.key)}
                    onMouseLeave={() => setHoveredKey((prev) => (prev === item.key ? null : prev))}
                    onClick={() => {
                      const targetName = rating?.name || item.name;
                      router.push(`/platform-map-v2/${encodeURIComponent(targetName)}`);
                    }}
                  >
                    <title>
                      {item.name} {gradeLabel ? `(${gradeLabel})` : ""}{" "}
                      {rating ? `· ${rating.totalScore}` : ""}
                    </title>
                  </path>
                  {showOverlay && (
                    <path
                      d={item.path}
                      fill="none"
                      stroke={pisStyle.stroke}
                      strokeWidth={1}
                      strokeDasharray={pisStyle.dash}
                      opacity={isVisible ? 0.9 : 0}
                      style={{
                        animation: pisStyle.animate ? "pmv2Ring 2s linear infinite" : undefined,
                      }}
                    />
                  )}
                  {preMove && (
                    <path
                      d={item.path}
                      fill="none"
                      stroke={PRE_MOVE_STYLE.stroke}
                      strokeWidth={1.2}
                      strokeDasharray={PRE_MOVE_STYLE.dash}
                      opacity={isVisible ? 0.9 : 0}
                      style={{
                        animation: PRE_MOVE_STYLE.animate ? "pmv2Ring 1.6s linear infinite" : undefined,
                      }}
                    />
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}
