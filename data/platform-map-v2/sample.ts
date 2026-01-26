import { AXIS_DEFINITIONS, type AxisScore, type PlatformMapSample } from "../../lib/platform-map-v2/types";

const makeAxes = (scores: number[]): AxisScore[] =>
  AXIS_DEFINITIONS.map((axis, index) => ({
    key: axis.key,
    label: axis.label,
    score: scores[index] ?? 0,
  }));

export const SAMPLE_REGIONS: PlatformMapSample[] = [
  {
    id: "seoul-jongno",
    name: "서울특별시 종로구",
    axes: makeAxes([9, 8, 7, 8, 6, 7, 9, 8, 7, 6, 8, 9]),
  },
  {
    id: "busan-haeundae",
    name: "부산광역시 해운대구",
    axes: makeAxes([7, 6, 8, 6, 7, 5, 8, 7, 6, 7, 6, 7]),
  },
  {
    id: "gyeonggi-suwon",
    name: "경기도 수원시",
    axes: makeAxes([8, 7, 6, 7, 8, 6, 7, 8, 7, 5, 6, 8]),
  },
];
