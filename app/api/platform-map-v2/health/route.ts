import { NextResponse } from "next/server";
import aliases from "../../../../data/platform-map-v2/aliases.json";
import { SAMPLE_REGIONS } from "../../../../data/platform-map-v2/sample";
import { RSS_SOURCES } from "../../../../lib/platform-map-v2/rss/sources";

export const runtime = "nodejs";
const LOG_PREFIX = "[PMV2]";

const hasKv = () => Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

export async function GET() {
  const status = {
    ok: true,
    timestamp: new Date().toISOString(),
    rss: {
      sources: RSS_SOURCES.length,
      ids: RSS_SOURCES.map((source) => source.id),
    },
    kv: {
      available: hasKv(),
    },
    data: {
      sampleRegions: SAMPLE_REGIONS.length,
      aliases: Object.keys(aliases).length,
    },
  };

  console.info(LOG_PREFIX, "health", status);
  return NextResponse.json(status);
}
