"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getBasketById, getBasketIds } from "@/lib/macro-trace/baskets";
import styles from "./BasketDetail.module.css";

type PriceEntry =
  | {
      ok: true;
      price: number;
      prevClose: number | null;
      changePct: number | null;
      source?: string;
      ts?: string;
      usedLastGood?: boolean;
    }
  | { ok: false; error: string; source?: string };

type FxEntry =
  | { ok: true; rate: number; source?: string; ts?: string }
  | { ok: false; error: string; source?: string };

type ApiResponse = {
  ok: boolean;
  asOf?: string;
  prices: Record<string, PriceEntry>;
  fx?: Record<string, FxEntry>;
  meta?: { warnings?: string[] };
  error?: string;
};

const toYmd = (d: Date) => d.toISOString().slice(0, 10);

export default function BasketDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const basketId = typeof params?.basketId === "string" ? params.basketId : "";
  const dateParam = searchParams.get("date") || "";
  const [date, setDate] = useState(() =>
    /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : toYmd(new Date())
  );
  const [data, setData] = useState<ApiResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const basket = getBasketById(basketId);
  const validIds = getBasketIds();

  const loadPrices = useCallback(async () => {
    if (!basket) return;
    setStatus("loading");
    setError(null);
    const keys = basket.items.map((i) => i.symbol);
    const qs = new URLSearchParams();
    qs.set("keys", keys.join(","));
    qs.set("date", date);
    try {
      const res = await fetch(`/api/market/prices?${qs.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as ApiResponse;
      if (!res.ok || !json.ok) {
        setError(json.error || "데이터를 불러오지 못했습니다.");
        setStatus("error");
        return;
      }
      setData(json);
      setStatus("idle");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
      setStatus("error");
    }
  }, [basket, date]);

  useEffect(() => {
    if (basket) loadPrices();
  }, [basket, loadPrices]);

  const getItemPrice = (symbol: string): PriceEntry | FxEntry | null => {
    if (!data) return null;
    if (symbol === "USDKRW" && data.fx?.USDKRW) return data.fx.USDKRW;
    return data.prices[symbol] ?? null;
  };

  const asOfDisplay = (entry: PriceEntry | FxEntry | null): string => {
    if (!entry || !("ok" in entry) || !entry.ok) return "—";
    const ts = "ts" in entry ? entry.ts : undefined;
    if (!ts) return "—";
    try {
      const d = new Date(ts);
      return d.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
    } catch {
      return ts;
    }
  };

  /** 변동률 셀 클래스: 양수 초록, 음수 빨강 */
  const changeCellClass = (changePct: number | null): string => {
    if (changePct == null) return styles.changeNeutral;
    if (changePct > 0) return styles.changePositive;
    if (changePct < 0) return styles.changeNegative;
    return styles.changeNeutral;
  };

  /** 위험자산: 섹터별 그룹 (순서 유지, 연속된 동일 섹터를 하나로) */
  const riskSectorGroups =
    basketId === "risk" && basket
      ? (() => {
          const groups: { sector: string; items: typeof basket.items }[] = [];
          for (const item of basket.items) {
            const sector = item.sector || "기타";
            if (groups.length > 0 && groups[groups.length - 1].sector === sector) {
              groups[groups.length - 1].items.push(item);
            } else {
              groups.push({ sector, items: [item] });
            }
          }
          return groups;
        })()
      : null;

  if (!validIds.includes(basketId)) {
    return (
      <div className={styles.page}>
        <div className={styles.sticky}>
          <Link href="/macro-trace" className={styles.backLink}>
            ← /macro-trace로 돌아가기
          </Link>
        </div>
        <div className={styles.content}>
          <p>잘못된 바스켓입니다. safe, risk, hedge 중 하나를 선택해 주세요.</p>
          <Link href="/macro-trace">목금월 루틴으로 돌아가기</Link>
        </div>
      </div>
    );
  }

  if (!basket) {
    return null;
  }

  return (
    <div className={styles.page}>
      <div className={styles.sticky}>
        <Link href="/macro-trace" className={styles.backLink}>
          ← /macro-trace로 돌아가기
        </Link>
        <div className={styles.dateRow}>
          <label>
            날짜
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <button type="button" onClick={loadPrices} className={styles.btnRefresh}>
            조회
          </button>
        </div>
      </div>

      <div className={styles.content}>
        <h1 className={styles.title}>{basket.label} 바스켓 상세</h1>
        {data?.meta?.warnings?.length ? (
          <div className={styles.warnings}>경고: {data.meta.warnings.join(", ")}</div>
        ) : null}
        {error && <div className={styles.errMsg}>{error}</div>}
        {status === "loading" && <p>데이터 로딩 중...</p>}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {riskSectorGroups ? <th className={styles.sectorCell}>섹터</th> : null}
                <th>이름</th>
                <th>티커</th>
                <th>가격</th>
                <th>전일종가</th>
                <th>변동률</th>
                <th>데이터 날짜(asOf)</th>
              </tr>
            </thead>
            <tbody>
              {riskSectorGroups
                ? riskSectorGroups.flatMap((group) =>
                    group.items.map((item, idx) => {
                      const entry = getItemPrice(item.symbol);
                      const price =
                        entry && "ok" in entry && entry.ok
                          ? "rate" in entry
                            ? entry.rate
                            : entry.price
                          : null;
                      const prevClose =
                        entry && "ok" in entry && entry.ok && "prevClose" in entry
                          ? entry.prevClose
                          : null;
                      const changePct =
                        entry && "ok" in entry && entry.ok && "changePct" in entry
                          ? entry.changePct
                          : null;
                      const err = entry && "ok" in entry && !entry.ok ? entry.error : null;
                      return (
                        <tr key={item.symbol}>
                          {idx === 0 ? (
                            <td
                              rowSpan={group.items.length}
                              className={styles.sectorCell}
                            >
                              {group.sector}
                            </td>
                          ) : null}
                          <td>{item.name}</td>
                          <td>{item.symbol}</td>
                          <td>
                            {price != null
                              ? typeof price === "number" && price >= 1000
                                ? price.toLocaleString("en-US", { maximumFractionDigits: 2 })
                                : String(price)
                              : "N/A"}
                            {err ? (
                              <span className={styles.tooltip} title={err}>
                                (데이터 없음)
                              </span>
                            ) : null}
                          </td>
                          <td>
                            {prevClose != null
                              ? prevClose.toLocaleString("en-US", { maximumFractionDigits: 2 })
                              : "—"}
                          </td>
                          <td className={changeCellClass(changePct)}>
                            {changePct != null
                              ? `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`
                              : "—"}
                          </td>
                          <td>{asOfDisplay(entry)}</td>
                        </tr>
                      );
                    })
                  )
                : basket.items.map((item) => {
                    const entry = getItemPrice(item.symbol);
                    const price =
                      entry && "ok" in entry && entry.ok
                        ? "rate" in entry
                          ? entry.rate
                          : entry.price
                        : null;
                    const prevClose =
                      entry && "ok" in entry && entry.ok && "prevClose" in entry
                        ? entry.prevClose
                        : null;
                    const changePct =
                      entry && "ok" in entry && entry.ok && "changePct" in entry
                        ? entry.changePct
                        : null;
                    const err = entry && "ok" in entry && !entry.ok ? entry.error : null;
                    return (
                      <tr key={item.symbol}>
                        <td>{item.name}</td>
                        <td>{item.symbol}</td>
                        <td>
                          {price != null
                            ? typeof price === "number" && price >= 1000
                              ? price.toLocaleString("en-US", { maximumFractionDigits: 2 })
                              : String(price)
                            : "N/A"}
                          {err ? (
                            <span className={styles.tooltip} title={err}>
                              (데이터 없음)
                            </span>
                          ) : null}
                        </td>
                        <td>
                          {prevClose != null
                            ? prevClose.toLocaleString("en-US", { maximumFractionDigits: 2 })
                            : "—"}
                        </td>
                        <td className={changeCellClass(changePct)}>
                          {changePct != null
                            ? `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`
                            : "—"}
                        </td>
                        <td>{asOfDisplay(entry)}</td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
