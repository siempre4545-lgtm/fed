"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AXIS_DEFINITIONS,
  type AxisEvidencePack,
  type AxisKey,
  type PlatformMapRating,
} from "../../../lib/platform-map-v2/types";
import { canonicalKey } from "../../../lib/platform-map-v2/rss/dedupe";
import {
  createDefaultScoreState,
  loadScoreState,
  saveScoreState,
  type AxisScoreState,
  type ScoreState,
} from "../../../lib/platform-map-v2/store";

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
const POLL_INTERVAL_MS = 12 * 60 * 1000;

const SCORE_MIN = 0;
const SCORE_MAX = 10;

const RELIABILITY_WEIGHT = {
  A: 1,
  B: 0.7,
  C: 0.4,
} as const;

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

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ko-KR", { hour12: false });
};

const scoreHintLabel = (value: number) => {
  if (value > 0) return `+${value}`;
  return `${value}`;
};

const clampScore = (value: number) => Math.min(SCORE_MAX, Math.max(SCORE_MIN, value));

const parseKeywordCount = (reason?: string) => {
  if (!reason || !reason.startsWith("키워드:")) return 0;
  return reason.replace("키워드:", "").split(",").map((token) => token.trim()).filter(Boolean).length;
};

const computeAutoDelta = (pack?: AxisEvidencePack) => {
  if (!pack || pack.items.length === 0) return 0;
  const keywordCount = parseKeywordCount(pack.reason);
  const volumeStrength = Math.min(pack.items.length, 8) / 8;
  const sentimentBalance = pack.items.reduce((sum, item) => {
    const weight = RELIABILITY_WEIGHT[item.reliability] ?? 0.4;
    if (item.sentiment === "pos") return sum + weight;
    if (item.sentiment === "neg") return sum - weight;
    return sum;
  }, 0);

  if (sentimentBalance === 0) return 0;

  const reliabilityStrength = Math.min(Math.abs(sentimentBalance) / pack.items.length, 1);
  const keywordStrength = Math.min(keywordCount, 6) / 6;
  const magnitude = 0.4 * volumeStrength + 0.4 * reliabilityStrength + 0.2 * keywordStrength;
  const raw = magnitude * Math.sign(sentimentBalance);

  if (raw >= 0.6) return 1;
  if (raw <= -0.6) return -1;
  return 0;
};

const applyWeight = (autoDelta: number, weight: number) => {
  const weighted = Math.max(-1, Math.min(1, autoDelta * weight));
  if (weighted === 0) return 0;
  return Math.sign(weighted) * Math.floor(Math.abs(weighted));
};

const cloneAxisScores = (axes: Record<AxisKey, AxisScoreState>) =>
  AXIS_DEFINITIONS.reduce(
    (acc, axis) => ({
      ...acc,
      [axis.key]: { ...axes[axis.key] },
    }),
    {} as Record<AxisKey, AxisScoreState>,
  );

export default function Page({ params }: { params: { sigungu: string } }) {
  const sigungu = decodeURIComponent(params.sigungu ?? "").trim() || "선택 지역";
  const storageKey = useMemo(() => `platform-map-v2:evidence:${sigungu}`, [sigungu]);
  const previousKeysRef = useRef<Set<string> | null>(null);
  const [packs, setPacks] = useState<AxisEvidencePack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [fetches, setFetches] = useState<Array<Record<string, unknown>>>([]);
  const [showFetches, setShowFetches] = useState(false);
  const [userState, setUserState] = useState<Record<AxisKey, AxisUserState>>(buildDefaultState);
  const [scoreState, setScoreState] = useState<ScoreState | null>(null);
  const [scoreReady, setScoreReady] = useState(false);
  const [newKeys, setNewKeys] = useState<string[]>([]);
  const [showNewOnly, setShowNewOnly] = useState(false);
  const [highlightNew, setHighlightNew] = useState(false);
  const [rating, setRating] = useState<PlatformMapRating | null>(null);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [newsSources, setNewsSources] = useState<
    Array<{
      source: string;
      ok: boolean;
      status?: number;
      elapsedMs: number;
      titleCount: number;
      errorReason?: string;
    }>
  >([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [showNewsFailures, setShowNewsFailures] = useState(false);

  const baseScores = useMemo(() => {
    return AXIS_DEFINITIONS.reduce(
      (acc, axis) => ({
        ...acc,
        [axis.key]: rating?.axisScores.find((item) => item.key === axis.key)?.score ?? 0,
      }),
      {} as Record<AxisKey, number>,
    );
  }, [rating]);

  const hasBaseScore = useMemo(() => Boolean(rating), [rating]);

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

  useEffect(() => {
    previousKeysRef.current = null;
    setNewKeys([]);
    setShowNewOnly(false);
    setHighlightNew(false);
  }, [sigungu]);

  const loadRating = async () => {
    setRatingLoading(true);
    setRatingError(null);
    try {
      const response = await fetch(
        `/api/platform-map-v2/data?sigungu=${encodeURIComponent(sigungu)}`,
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as { ok: boolean; rating?: PlatformMapRating | null };
      setRating(data.rating ?? null);
    } catch (fetchError) {
      setRatingError(fetchError instanceof Error ? fetchError.message : "unknown");
      setRating(null);
    } finally {
      setRatingLoading(false);
    }
  };

  const loadNewsStatus = async (key?: string | null) => {
    setNewsLoading(true);
    setNewsError(null);
    try {
      const response = await fetch(
        `/api/platform-map-v2/news?sigungu=${encodeURIComponent(sigungu)}${
          key ? `&sigunguKey=${encodeURIComponent(key)}` : ""
        }`,
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as {
        ok: boolean;
        sources?: Array<{
          source: string;
          ok: boolean;
          status?: number;
          elapsedMs: number;
          titleCount: number;
          errorReason?: string;
        }>;
      };
      setNewsSources(data.sources ?? []);
    } catch (fetchError) {
      setNewsError(fetchError instanceof Error ? fetchError.message : "unknown");
      setNewsSources([]);
    } finally {
      setNewsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      const loaded = await loadScoreState(sigungu);
      if (!active) return;
      setScoreState(loaded ?? createDefaultScoreState(sigungu));
      setScoreReady(true);
    };
    void load();
    return () => {
      active = false;
    };
  }, [sigungu]);

  useEffect(() => {
    if (sigungu) {
      void loadRating();
      void loadNewsStatus();
    }
  }, [sigungu]);

  useEffect(() => {
    if (rating?.sigunguKey) {
      void loadNewsStatus(rating.sigunguKey);
    }
  }, [rating?.sigunguKey]);

  useEffect(() => {
    if (!scoreReady || !scoreState) return;
    const timeout = window.setTimeout(() => {
      void saveScoreState(sigungu, scoreState);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [scoreReady, scoreState, sigungu]);

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
      const nextPacks = data.packs ?? [];
      const nextKeys = new Set(
        nextPacks
          .flatMap((pack) => pack.items ?? [])
          .map((item) =>
            canonicalKey({ title: item.title, url: item.url, publishedAt: item.publishedAt }),
          ),
      );
      const prevKeys = previousKeysRef.current;
      const diffKeys = prevKeys ? [...nextKeys].filter((key) => !prevKeys.has(key)) : [];
      previousKeysRef.current = nextKeys;

      setPacks(nextPacks);
      setWarnings(data.warnings ?? []);
      setFetches(data.fetches ?? []);
      setUpdatedAt(new Date().toISOString());
      setNewKeys(diffKeys);
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

  useEffect(() => {
    if (typeof document === "undefined") return;
    let intervalId: number | null = null;

    const startPolling = () => {
      if (intervalId) window.clearInterval(intervalId);
      intervalId = window.setInterval(() => {
        if (document.visibilityState === "visible") {
          void loadEvidence();
        }
      }, POLL_INTERVAL_MS);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadEvidence();
        startPolling();
      } else if (intervalId) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    if (document.visibilityState === "visible") {
      startPolling();
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (intervalId) window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
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
  const newItemCount = newKeys.length;
  const newKeySet = useMemo(() => new Set(newKeys), [newKeys]);

  const successCount = useMemo(
    () => newsSources.filter((item) => item.ok).length,
    [newsSources],
  );
  const failureCount = useMemo(
    () => newsSources.filter((item) => !item.ok).length,
    [newsSources],
  );

  const updateAxisState = (axis: AxisKey, updater: (prev: AxisUserState) => AxisUserState) => {
    setUserState((prev) => ({ ...prev, [axis]: updater(prev[axis] ?? buildDefaultState()[axis]) }));
  };

  const updateAxisScore = (axis: AxisKey, updater: (prev: AxisScoreState) => AxisScoreState) => {
    setScoreState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        axes: {
          ...prev.axes,
          [axis]: updater(prev.axes[axis]),
        },
      };
    });
  };

  const applyAxisDelta = (axis: AxisKey, delta: number, reason: string) => {
    setScoreState((prev) => {
      if (!prev) return prev;
      const snapshot = {
        axes: cloneAxisScores(prev.axes),
        totalDelta: Object.values(prev.axes).reduce((sum, item) => sum + item.appliedDelta, 0),
        updatedAt: new Date().toISOString(),
      };
      return {
        ...prev,
        axes: {
          ...prev.axes,
          [axis]: {
            ...prev.axes[axis],
            appliedDelta: delta,
            reason,
            updatedAt: new Date().toISOString(),
          },
        },
        lastSnapshot: snapshot,
      };
    });
  };

  const undoLast = () => {
    setScoreState((prev) => {
      if (!prev?.lastSnapshot) return prev;
      return {
        ...prev,
        axes: prev.lastSnapshot.axes,
        lastSnapshot: undefined,
      };
    });
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0b0f14", color: "#e5e7eb", padding: 24 }}>
      <header style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{sigungu} · 근거 자동 제안</div>
        <div style={{ fontSize: 12, color: "#9ca3af" }}>
          자동 근거는 RSS 기반 제안이며, 최종 채택/점수 반영은 사용자가 결정합니다.
        </div>
        {!hasBaseScore && (
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            기준 점수가 없으므로 현재 점수는 0 기준으로 계산됩니다.
          </div>
        )}
        {ratingLoading && <div style={{ fontSize: 11, color: "#94a3b8" }}>점수 데이터 불러오는 중...</div>}
        {ratingError && <div style={{ fontSize: 11, color: "#fca5a5" }}>점수 데이터 오류: {ratingError}</div>}
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            마지막 갱신: {formatDateTime(updatedAt)}
          </span>
          {newItemCount > 0 && (
            <button
              type="button"
              onClick={() => setHighlightNew((prev) => !prev)}
              style={{
                borderRadius: 999,
                border: "1px solid #fbbf24",
                background: highlightNew ? "#3f2f06" : "#1f2937",
                color: "#fcd34d",
                padding: "4px 10px",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              새 기사 {newItemCount}건 발견
            </button>
          )}
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11 }}>
            <input
              type="checkbox"
              checked={showNewOnly}
              onChange={(event) => setShowNewOnly(event.target.checked)}
            />
            새 기사만 보기
          </label>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            소스 성공 {successCount} / 실패 {failureCount}
          </span>
          <button
            type="button"
            onClick={() => setShowNewsFailures((prev) => !prev)}
            style={{
              borderRadius: 999,
              border: "1px solid #1f2937",
              background: "#111827",
              color: "#e5e7eb",
              padding: "4px 10px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            실패 상세 {showNewsFailures ? "닫기" : "보기"}
          </button>
        </div>
        {scoreState?.lastSnapshot && (
          <button
            type="button"
            onClick={undoLast}
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
            마지막 적용 되돌리기
          </button>
        )}
        {totalItems === 0 && !loading && !error && (
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            최근 30일 내 매칭 근거가 없습니다(소스/키워드 조건).
          </div>
        )}
        {newsLoading && <div style={{ fontSize: 11, color: "#94a3b8" }}>뉴스 상태 확인 중...</div>}
        {newsError && <div style={{ fontSize: 11, color: "#fca5a5" }}>뉴스 상태 오류: {newsError}</div>}
        {showNewsFailures && failureCount > 0 && (
          <div style={{ display: "grid", gap: 4, fontSize: 11, color: "#94a3b8" }}>
            {newsSources
              .filter((item) => !item.ok)
              .map((item) => (
                <div key={item.source}>
                  {item.source} · {item.status ?? "-"} · {item.elapsedMs}ms ·{" "}
                  {item.errorReason ?? "unknown"}
                </div>
              ))}
          </div>
        )}
        {(newsError || (failureCount === newsSources.length && newsSources.length > 0)) && (
          <button
            type="button"
            onClick={() => loadNewsStatus(rating?.sigunguKey)}
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
            뉴스 다시 시도
          </button>
        )}
      </header>

      <section style={{ display: "grid", gap: 12 }}>
        {AXIS_DEFINITIONS.map((axis) => {
          const pack = packMap.get(axis.key);
          const items = pack?.items ?? [];
          const visibleItems = showNewOnly
            ? items.filter((item) =>
                newKeySet.has(
                  canonicalKey({ title: item.title, url: item.url, publishedAt: item.publishedAt }),
                ),
              )
            : items;
          const axisState = userState[axis.key] ?? buildDefaultState()[axis.key];
          const axisScore = scoreState?.axes[axis.key] ?? { appliedDelta: 0, weight: 1 };
          const approvedCount = axisState.approvedEvidenceIds.length;
          const autoDelta = computeAutoDelta(pack);
          const weight = axisScore.weight ?? 1;
          const finalDelta = applyWeight(autoDelta, weight);
          const canApply = axisState.applyToScore && approvedCount >= 1;
          const currentScore = clampScore(baseScores[axis.key] + axisScore.appliedDelta);
          const nextScore = clampScore(baseScores[axis.key] + (canApply ? finalDelta : axisScore.appliedDelta));
          const deltaLabel = nextScore - currentScore;
          const reasonText = `승인 ${approvedCount}건 · auto ${scoreHintLabel(autoDelta)} · weight ${weight.toFixed(
            1,
          )}`;

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
              <div style={{ display: "grid", gap: 4, marginTop: 8, fontSize: 11, color: "#94a3b8" }}>
                <div>
                  현재 점수 {currentScore}/{SCORE_MAX} → 변경 점수 {nextScore}/{SCORE_MAX} (
                  {deltaLabel >= 0 ? `+${deltaLabel}` : deltaLabel})
                </div>
                <div>변경 사유: {reasonText}</div>
                {!canApply && (
                  <div style={{ color: "#fca5a5" }}>
                    승인 1건 이상 + “이 축 점수에 반영”이 필요합니다.
                  </div>
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11 }}>
                  가중치
                  <input
                    type="range"
                    min={0.5}
                    max={1.5}
                    step={0.1}
                    value={weight}
                    onChange={(event) =>
                      updateAxisScore(axis.key, (prev) => ({
                        ...prev,
                        weight: Number(event.target.value),
                      }))
                    }
                    style={{ accentColor: "#38bdf8" }}
                  />
                  {weight.toFixed(1)}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (!canApply || finalDelta === 0) return;
                    applyAxisDelta(axis.key, finalDelta, reasonText);
                  }}
                  disabled={!canApply || finalDelta === 0 || !scoreReady}
                  style={{
                    borderRadius: 999,
                    border: "1px solid #1f2937",
                    background: !canApply || finalDelta === 0 ? "#0f172a" : "#0b1f3a",
                    color: "#e5e7eb",
                    padding: "4px 10px",
                    fontSize: 11,
                    cursor: !canApply || finalDelta === 0 ? "not-allowed" : "pointer",
                  }}
                >
                  점수 반영
                </button>
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                {visibleItems.length === 0 && (
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>
                    {showNewOnly ? "새 기사 없음" : "해당 축 근거 없음"}
                  </div>
                )}
                {visibleItems.length > 0 &&
                  (() => {
                  const renderItem = (item: (typeof visibleItems)[number], approved: boolean) => {
                    const isNew = newKeySet.has(
                      canonicalKey({
                        title: item.title,
                        url: item.url,
                        publishedAt: item.publishedAt,
                      }),
                    );
                    return (
                      <label
                        key={item.id}
                        style={{
                          display: "grid",
                          gap: 6,
                          borderRadius: 10,
                          border:
                            highlightNew && isNew
                              ? "1px solid #fbbf24"
                              : approved
                                ? "1px solid #38bdf8"
                                : "1px solid #1f2937",
                          background:
                            highlightNew && isNew ? "#3f2f06" : approved ? "#0b1f3a" : "#111827",
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
                          {isNew && (
                            <span
                              style={{
                                borderRadius: 999,
                                border: "1px solid #fbbf24",
                                padding: "2px 6px",
                                fontSize: 10,
                                color: "#fcd34d",
                              }}
                            >
                              NEW
                            </span>
                          )}
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
                  };

                  const approvedItems = visibleItems.filter((item) =>
                    axisState.approvedEvidenceIds.includes(item.id),
                  );
                  const pendingItems = visibleItems.filter(
                    (item) => !axisState.approvedEvidenceIds.includes(item.id),
                  );

                    return (
                      <>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>승인 근거</div>
                        {approvedItems.length === 0 && (
                          <div style={{ fontSize: 12, color: "#94a3b8" }}>승인 근거 없음</div>
                        )}
                        {approvedItems.map((item) => renderItem(item, true))}
                        {pendingItems.length > 0 && (
                          <details>
                            <summary
                              style={{
                                cursor: "pointer",
                                fontSize: 11,
                                color: "#94a3b8",
                                marginBottom: 6,
                              }}
                            >
                              제안 {pendingItems.length}건
                            </summary>
                            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                              {pendingItems.map((item) => renderItem(item, false))}
                            </div>
                          </details>
                        )}
                      </>
                    );
                  })()}
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
