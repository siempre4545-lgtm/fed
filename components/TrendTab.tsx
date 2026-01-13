'use client';

import { useState } from 'react';

export function TrendTab() {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [compareData, setCompareData] = useState<any>(null);
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
      const response = await fetch(`/api/h41/compare?from=${fromDate}&to=${toDate}`);
      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to compare');
      }

      setCompareData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setCompareData(null);
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

      {compareData && compareData.comparisons && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-gray-800 rounded-lg">
              <h3 className="text-sm font-medium text-gray-400 mb-1">From</h3>
              <p className="text-lg font-bold">{compareData.from.date}</p>
              <p className="text-sm text-gray-400">{compareData.from.weekEnded}</p>
            </div>
            <div className="p-4 bg-gray-800 rounded-lg">
              <h3 className="text-sm font-medium text-gray-400 mb-1">To</h3>
              <p className="text-lg font-bold">{compareData.to.date}</p>
              <p className="text-sm text-gray-400">{compareData.to.weekEnded}</p>
            </div>
          </div>

          {compareData.comparisons.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p>비교할 데이터가 없습니다.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-400">지표</th>
                    <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">From</th>
                    <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">To</th>
                    <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">Δ</th>
                    <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">%</th>
                    <th className="px-4 py-2 text-center text-sm font-medium text-gray-400">방향</th>
                  </tr>
                </thead>
                <tbody>
                  {compareData.comparisons.map((comp: any, idx: number) => (
                    <tr key={idx} className="border-b border-gray-800 hover:bg-gray-800/50">
                      <td className="px-4 py-2 text-sm">{comp.label}</td>
                      <td className="px-4 py-2 text-sm text-right">{comp.from.toLocaleString()}</td>
                      <td className="px-4 py-2 text-sm text-right">{comp.to.toLocaleString()}</td>
                      <td className={`px-4 py-2 text-sm text-right ${
                        comp.delta > 0 ? 'text-red-400' : comp.delta < 0 ? 'text-green-400' : 'text-gray-400'
                      }`}>
                        {comp.delta > 0 ? '+' : ''}{comp.delta.toLocaleString()}
                      </td>
                      <td className={`px-4 py-2 text-sm text-right ${
                        comp.deltaPercent > 0 ? 'text-red-400' : comp.deltaPercent < 0 ? 'text-green-400' : 'text-gray-400'
                      }`}>
                        {comp.deltaPercent > 0 ? '+' : ''}{comp.deltaPercent.toFixed(2)}%
                      </td>
                      <td className="px-4 py-2 text-sm text-center">
                        {comp.direction === 'up' ? '↑' : comp.direction === 'down' ? '↓' : '→'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!compareData && !loading && !error && (
        <div className="text-center py-12 text-gray-400">
          <p>두 날짜를 선택하여 비교하세요.</p>
        </div>
      )}
    </div>
  );
}
