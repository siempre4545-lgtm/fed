import { readFile, writeFile } from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const GEOJSON_PATH = path.join(ROOT, "data/platform-map/korea_sigungu.geojson");
const OUTPUT_PATH = path.join(ROOT, "data/platform-map/ratings.json");

const AXES = [
  "data_infra",
  "residency_mobility",
  "institutional_demand",
  "financialization",
  "city_services",
  "subscription_housing",
  "jobs_future",
  "cbdc_payments",
  "network_infra",
  "governance",
  "talent_inflow",
  "future_blueprint",
] as const;

type AxisKey = (typeof AXES)[number];

const provinceByCode: Record<string, string> = {
  "11": "서울특별시",
  "26": "부산광역시",
  "27": "대구광역시",
  "28": "인천광역시",
  "29": "광주광역시",
  "30": "대전광역시",
  "31": "울산광역시",
  "36": "세종특별자치시",
  "41": "경기도",
  "42": "강원도",
  "43": "충청북도",
  "44": "충청남도",
  "45": "전라북도",
  "46": "전라남도",
  "47": "경상북도",
  "48": "경상남도",
  "50": "제주특별자치도",
};

const hasProvincePrefix = (name: string) =>
  name.includes("특별시") ||
  name.includes("광역시") ||
  name.includes("특별자치시") ||
  name.includes("도");

const buildSigunguName = (name: string, code: string) => {
  if (!name) return name;
  if (hasProvincePrefix(name)) return name;
  const prefix = provinceByCode[code.slice(0, 2)];
  return prefix ? `${prefix} ${name}` : name;
};

const buildDefaultAxes = () =>
  AXES.reduce<Record<AxisKey, number>>((acc, key) => {
    acc[key] = 50;
    return acc;
  }, {} as Record<AxisKey, number>);

const main = async () => {
  const raw = await readFile(GEOJSON_PATH, "utf-8");
  const geojson = JSON.parse(raw);
  const now = new Date().toISOString();

  const ratings = (geojson.features || []).map((feature: any) => {
    const props = feature?.properties || {};
    const code = String(props.code || "");
    const name = String(props.name || "");
    return {
      sigunguCode: code,
      sigunguName: buildSigunguName(name, code),
      grade: "C",
      score: 50,
      axes: buildDefaultAxes(),
      evidence: {
        notes: "초기 기본값",
        links: [],
        signals: [],
      },
      updatedAt: now,
    };
  });

  await writeFile(OUTPUT_PATH, JSON.stringify(ratings, null, 2), "utf-8");
  console.log(`ratings saved: ${ratings.length}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
