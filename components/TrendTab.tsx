'use client';

import { useState } from 'react';
import type { H4Report } from '@/lib/types';
import { formatNumber, formatChange } from '@/lib/translations';

interface TrendTabProps {
  baseDate?: string;
}

export function TrendTab({ baseDate }: TrendTabProps) {
  const [fromDate, setFromDate] = useState(baseDate || '');
  const [toDate, setToDate] = useState('');
  const [fromReport, setFromReport] = useState<H4Report | null>(null);
  const [toReport, setToReport] = useState<H4Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCompare = async () => {
    if (!fromDate || !toDate) {
      setError('두 날짜를 모두 선택해주세요.');
      return;
    }

    if (fromDate >= toDate) {
      setError('시작 날짜는 종료 날짜보다 이전이어야 합니다.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [fromRes, toRes] = await Promise.all([
        fetch(`/api/h41/report?date=${fromDate}`),
        fetch(`/api/h41/report?date=${toDate}`),
      ]);

      const fromData: H4Report = await fromRes.json();
      const toData: H4Report = await toRes.json();

      if (!fromData.ok || !toData.ok) {
        throw new Error('Failed to fetch one or both reports');
      }

      setFromReport(fromData);
      setToReport(toData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setFromReport(null);
      setToReport(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Date Selectors */}
      <div className="flex gap-4 items-end">
        <div>
          <label className="block text-sm font-medium mb-2">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">To</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
          />
        </div>
        <button
          onClick={handleCompare}
          disabled={loading || !fromDate || !toDate}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
        >
          비교
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg">
          <p className="text-red-200">{error}</p>
        </div>
      )}

      {loading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
          <p className="mt-4 text-gray-400">비교 중...</p>
        </div>
      )}

      {fromReport && toReport && fromReport.meta && toReport.meta && fromReport.overview && toReport.overview && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-gray-800 rounded-lg">
              <h3 className="text-sm font-medium text-gray-400 mb-1">기준일</h3>
              <p className="text-lg font-bold">{fromDate}</p>
              <p className="text-sm text-gray-400">{fromReport.meta.weekEnded}</p>
            </div>
            <div className="p-4 bg-gray-800 rounded-lg">
              <h3 className="text-sm font-medium text-gray-400 mb-1">비교일</h3>
              <p className="text-lg font-bold">{toDate}</p>
              <p className="text-sm text-gray-400">{toReport.meta.weekEnded}</p>
            </div>
          </div>

          {/* 주요 지표 비교 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { key: 'totalAssets', label: '총 자산', from: fromReport.overview.totalAssets, to: toReport.overview.totalAssets },
              { key: 'securitiesHeld', label: '보유 증권', from: fromReport.overview.securitiesHeld, to: toReport.overview.securitiesHeld },
              { key: 'reserves', label: '지급준비금', from: fromReport.overview.reserves, to: toReport.overview.reserves },
              { key: 'tga', label: 'TGA', from: fromReport.overview.tga, to: toReport.overview.tga },
              { key: 'rrp', label: '역레포', from: fromReport.overview.rrp, to: toReport.overview.rrp },
              { key: 'currency', label: '유통 통화', from: fromReport.overview.currency, to: toReport.overview.currency },
            ].map(({ key, label, from, to }) => {
              const delta = to.value - from.value;
              const deltaPercent = from.value ? ((delta / from.value) * 100) : 0;
              const color = delta > 0 ? 'text-red-400' : delta < 0 ? 'text-green-400' : 'text-gray-400';
              
              return (
                <div key={key} className="p-4 bg-gray-800 rounded-lg border border-gray-700">
                  <div className="text-sm text-gray-400 mb-2">{label}</div>
                  <div className="text-xl font-bold mb-2">{formatNumber(to.value)}M</div>
                  <div className={`text-sm font-medium ${color}`}>
                    Δ: {formatChange(delta, deltaPercent)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!fromReport && !loading && !error && (
        <div className="text-center py-12 text-gray-400">
          <p>두 날짜를 선택하여 비교하세요.</p>
        </div>
      )}
    </div>
  );
}
