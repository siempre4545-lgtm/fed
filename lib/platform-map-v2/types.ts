export type AxisDefinition = {
  key: string;
  label: string;
};

export const AXIS_DEFINITIONS = [
  { key: "axis1", label: "축 1" },
  { key: "axis2", label: "축 2" },
  { key: "axis3", label: "축 3" },
  { key: "axis4", label: "축 4" },
  { key: "axis5", label: "축 5" },
  { key: "axis6", label: "축 6" },
  { key: "axis7", label: "축 7" },
  { key: "axis8", label: "축 8" },
  { key: "axis9", label: "축 9" },
  { key: "axis10", label: "축 10" },
  { key: "axis11", label: "축 11" },
  { key: "axis12", label: "축 12" },
] as const satisfies AxisDefinition[];

export type AxisKey = (typeof AXIS_DEFINITIONS)[number]["key"];

export type AxisScore = {
  key: AxisKey;
  label: string;
  score: number;
};

export type PlatformMapSample = {
  id: string;
  name: string;
  axes: AxisScore[];
};
