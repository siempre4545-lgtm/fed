"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AXIS_DEFINITIONS, type AxisEvidencePack, type AxisKey } from "../../../lib/platform-map-v2/types";

type AxisUserState = {
  approvedEvidenceIds: string[];
  memo: string;
  applyToScore: boolean;
};

type EvidenceStorage = {
  version: 1;
  axes: Record<AxisKey, AxisUserState>;
};

const STORAGE_VERSION = 1;

const buildDefaultState = (): Record<AxisKey, AxisUserState> =>
  AXIS_DEFINITIONS.reduce(
    (acc, axis) => ({
      ...acc,
      [axis.key]: { approvedEvidenceIds: [], memo: "", applyToScore: false },
    }),
    {} as Record<AxisKey, AxisUserState>,
  );

const formatDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 10);
};

const scoreHintLabel = (value: number) => {
  if (value > 0) return `+${value}`;
  return `${value}`;
};

export default function Page({ params }: { params: { sigungu: string } }) {
  const sigungu = decodeURIComponent(params.sigungu ?? "").trim() || "선택 지역";
  const storageKey = useMemo(() => `platform-map-v2:evidence:${sigungu}`, [sigungu]);
  const [packs, setPacks] = useState<AxisEvidencePack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [fetches, setFetches] = useState<Array<Record<string, unknown>>>([]);
  const [showFetches, setShowFetches] = useState(false);
  const [userState, setUserState] = useState<Record<AxisKey, AxisUserState>>(buildDefaultState);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) {
      setUserState(buildDefaultState());
      return;
    }
    try {
      const parsed = JSON.parse(saved) as EvidenceStorage;
      if (parsed.version !== STORAGE_VERSION) {
        setUserState(buildDefaultState());
        return;
      }
      setUserState({ ...buildDefaultState(), ...parsed.axes });
    } catch (parseError) {
      setUserState(buildDefaultState());
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const timeout = window.setTimeout(() => {
      const payload: EvidenceStorage = {
        version: STORAGE_VERSION,
        axes: userState,
      };
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [storageKey, userState]);

  const loadEvidence = async (withDebug = false) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/platform-map-v2/rss?sigungu=${encodeURIComponent(sigungu)}&days=30${
          withDebug ? "&debug=1" : ""
        }`,
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as {
        ok: boolean;
        packs?: AxisEvidencePack[];
        warnings?: string[];
        fetches?: Array<Record<string, unknown>>;
      };
      setPacks(data.packs ?? []);
      setWarnings(data.warnings ?? []);
      setFetches(data.fetches ?? []);
      setUpdatedAt(new Date().toISOString());
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "unknown");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sigungu) {
      void loadEvidence();
    }
  }, [sigungu]);

  const packMap = useMemo(() => {
    const map = new Map<AxisKey, AxisEvidencePack>();
    packs.forEach((pack) => map.set(pack.axis, pack));
    return map;
  }, [packs]);

  const totalItems = useMemo(
    () => packs.reduce((sum, pack) => sum + (pack.items?.length ?? 0), 0),
    [packs],
  );

  const updateAxisState = (axis: AxisKey, updater: (prev: AxisUserState) => AxisUserState) => {
    setUserState((prev) => ({ ...prev, [axis]: updater(prev[axis] ?? buildDefaultState()[axis]) }));
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0b0f14", color: "#e5e7eb", padding: 24 }}>
      <header style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{sigungu} · 근거 자동 제안</div>
        <div style={{ fontSize: 12, color: "#9ca3af" }}>
          자동 근거는 RSS 기반 제안이며, 최종 채택/점수 반영은 사용자가 결정합니다.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            onClick={() => {
              void loadEvidence();
            }}
            style={{
              borderRadius: 999,
              border: "1px solid #1f2937",
              background: "#111827",
              color: "#e5e7eb",
              padding: "6px 12px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            자동 근거 가져오기
          </button>
          <Link
            href="/platform-map-v2"
            style={{
              borderRadius: 999,
              border: "1px solid #1f2937",
              background: "#0b1f3a",
              color: "#e5e7eb",
              padding: "6px 12px",
              fontSize: 12,
              textDecoration: "none",
            }}
          >
            목록으로 돌아가기
          </Link>
          <span style={{ fontSize: 11, color: "#94a3b8", alignSelf: "center" }}>
            {loading ? "불러오는 중..." : updatedAt ? `업데이트 ${formatDate(updatedAt)}` : "자동 저장"}
          </span>
          {error && <span style={{ fontSize: 11, color: "#fca5a5" }}>오류: {error}</span>}
        </div>
        {totalItems === 0 && !loading && !error && (
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            최근 30일 내 매칭 근거가 없습니다(소스/키워드 조건).
          </div>
        )}
        {warnings.length > 0 && (
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "#fca5a5" }}>
              일부 소스 수집 실패 ({warnings.length})
            </div>
            <button
              type="button"
              onClick={() => {
                const next = !showFetches;
                setShowFetches(next);
                if (next && fetches.length === 0) {
                  void loadEvidence(true);
                }
              }}
              style={{
                borderRadius: 999,
                border: "1px solid #1f2937",
                background: "#111827",
                color: "#e5e7eb",
                padding: "4px 10px",
                fontSize: 11,
                cursor: "pointer",
                width: "fit-content",
              }}
            >
              자세히 보기 {showFetches ? "닫기" : "열기"}
            </button>
            {showFetches && fetches.length > 0 && (
              <div style={{ display: "grid", gap: 4, fontSize: 11, color: "#94a3b8" }}>
                {fetches.map((item, index) => (
                  <div key={`${item.sourceId ?? "source"}-${index}`}>
                    {String(item.sourceTitle ?? item.sourceId ?? "source")} ·{" "}
                    {String(item.status ?? "unknown")} · {String(item.elapsedMs ?? "-")}ms ·{" "}
                    {String(item.items ?? "-")}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </header>

      <section style={{ display: "grid", gap: 12 }}>
        {AXIS_DEFINITIONS.map((axis) => {
          const pack = packMap.get(axis.key);
          const items = pack?.items ?? [];
          const axisState = userState[axis.key] ?? buildDefaultState()[axis.key];

          return (
            <div
              key={axis.key}
              style={{
                borderRadius: 12,
                border: "1px solid #1f2937",
                background: "#0f172a",
                padding: 16,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{axis.label}</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  자동 scoreHint: {scoreHintLabel(pack?.scoreHint ?? 0)}
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                {pack?.reason ?? "키워드 매칭 없음"}
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                {items.length === 0 && (
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>해당 축 근거 없음</div>
                )}
                {items.map((item) => {
                  const approved = axisState.approvedEvidenceIds.includes(item.id);
                  return (
                    <label
                      key={item.id}
                      style={{
                        display: "grid",
                        gap: 6,
                        borderRadius: 10,
                        border: approved ? "1px solid #38bdf8" : "1px solid #1f2937",
                        background: approved ? "#0b1f3a" : "#111827",
                        padding: 10,
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={approved}
                          onChange={() =>
                            updateAxisState(axis.key, (prev) => ({
                              ...prev,
                              approvedEvidenceIds: approved
                                ? prev.approvedEvidenceIds.filter((id) => id !== item.id)
                                : [...prev.approvedEvidenceIds, item.id],
                            }))
                          }
                        />
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: 12, color: "#e5e7eb", textDecoration: "none" }}
                        >
                          {item.title}
                        </a>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 11 }}>
                        <span style={{ color: "#94a3b8" }}>{item.source}</span>
                        <span style={{ color: "#94a3b8" }}>{formatDate(item.publishedAt)}</span>
                        <span
                          style={{
                            borderRadius: 999,
                            border: "1px solid #1f2937",
                            padding: "2px 8px",
                            fontSize: 10,
                            color: "#e5e7eb",
                          }}
                        >
                          신뢰도 {item.reliability}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "#cbd5f5" }}>{item.snippet}</div>
                    </label>
                  );
                })}
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                <textarea
                  value={axisState.memo}
                  onChange={(event) =>
                    updateAxisState(axis.key, (prev) => ({ ...prev, memo: event.target.value }))
                  }
                  placeholder="이슈 메모 / 최종 판단"
                  rows={2}
                  style={{
                    width: "100%",
                    borderRadius: 10,
                    border: "1px solid #1f2937",
                    padding: "8px 10px",
                    background: "#0b1220",
                    color: "#e5e7eb",
                    fontSize: 12,
                  }}
                />
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={axisState.applyToScore}
                    onChange={(event) =>
                      updateAxisState(axis.key, (prev) => ({
                        ...prev,
                        applyToScore: event.target.checked,
                      }))
                    }
                  />
                  이 축 점수에 반영 (기본 OFF)
                </label>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
