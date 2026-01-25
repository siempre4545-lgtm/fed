import { useMemo } from "react";
import styles from "./PlatformMap.module.css";
import { PlatformAxis, PlatformGrade, SigunguRating } from "../../lib/platform-map/types";

const GRADE_COLORS: Record<PlatformGrade, string> = {
  A: "#22d3ee",
  B: "#38bdf8",
  C: "#94a3b8",
  D: "#475569",
};

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
  project: (lng: number, lat: number) => [number, number]
) => {
  return coordinates
    .map((ring) => {
      return ring
        .map(([lng, lat], index) => {
          const [x, y] = project(lng, lat);
          return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(" ") + " Z";
    })
    .join(" ");
};

const geometryToPath = (
  geometry: any,
  project: (lng: number, lat: number) => [number, number]
) => {
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
  ratings: SigunguRating[];
  selectedGrades: PlatformGrade[];
  selectedCode?: string | null;
  selectedAxis?: PlatformAxis | null;
  onSelect: (code: string) => void;
};

type MapPath = {
  code: string;
  name: string;
  path: string;
};

export default function PlatformMapMap({
  geojson,
  ratings,
  selectedGrades,
  selectedCode,
  selectedAxis,
  onSelect,
}: Props) {
  const ratingByCode = useMemo(() => {
    return new Map(ratings.map((rating) => [rating.sigunguCode, rating]));
  }, [ratings]);

  const features = geojson?.features || [];
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
    const paths = features.map((feature: any) => {
      const code = String(feature.properties?.code || "");
      return {
        code,
        name: feature.properties?.name || code,
        path: geometryToPath(feature.geometry, project),
      };
    });
    return { width, height, paths };
  }, [features]);

  return (
    <div className={styles.mapContainer}>
      <svg className={styles.mapSvg} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        {paths.map((item) => {
          const rating = ratingByCode.get(item.code);
          const grade = rating?.grade;
          const isActive = grade ? selectedGrades.includes(grade) : true;
          const fill = grade ? GRADE_COLORS[grade] : "#1f2937";
          const axisValue =
            selectedAxis && rating?.axes[selectedAxis] !== undefined
              ? ` · ${selectedAxis}: ${rating.axes[selectedAxis]}`
              : "";
          return (
            <path
              key={item.code}
              d={item.path}
              fill={isActive ? fill : "#1f2937"}
              stroke={item.code === selectedCode ? "#38bdf8" : "#0b1220"}
              strokeWidth={item.code === selectedCode ? 1.5 : 0.5}
              onClick={() => onSelect(item.code)}
            >
              <title>
                {item.name} {grade ? `(${grade})` : ""} {rating ? `· ${rating.score}` : ""}
                {axisValue}
              </title>
            </path>
          );
        })}
      </svg>
    </div>
  );
}
