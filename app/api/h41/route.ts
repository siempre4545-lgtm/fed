import { NextResponse } from "next/server";

import { fetchH41Report } from "@/src/h41";
import { fetchH41CalendarDates, ymdToIso, yyyymmddFromISO } from "@/src/h41-calendar";

export const runtime = "nodejs";

export const GET = async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const requestedDate = searchParams.get("date")?.trim() || "";
  let resolvedDate: string | undefined;

  if (requestedDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      return NextResponse.json({ error: "invalid_date" }, { status: 400 });
    }
    try {
      const calendarDates = await fetchH41CalendarDates();
      const targetYmd = yyyymmddFromISO(requestedDate);
      const sorted = [...calendarDates].sort((a, b) => b.localeCompare(a));
      const matched = sorted.find((ymd) => ymd <= targetYmd) || sorted[0];
      if (!matched) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      resolvedDate = ymdToIso(matched);
    } catch (calendarError) {
      console.error("[H41] 캘린더 조회 실패", calendarError);
      return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
    }
  }

  try {
    const report = await fetchH41Report(resolvedDate);
    return NextResponse.json(
      {
        ...report,
        requestedDate: requestedDate || null,
        resolvedDate: resolvedDate ?? null,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600",
        },
      }
    );
  } catch (error: any) {
    const message = error?.message ?? String(error);
    const isInvalid = message.includes("Invalid date format");
    const isNotFound = message.includes("Failed to fetch H.4.1 archive");
    const err = isInvalid ? "invalid_date" : isNotFound ? "not_found" : "fetch_failed";
    const status = isInvalid ? 400 : isNotFound ? 404 : 500;
    return NextResponse.json({ error: err }, { status });
  }
};
