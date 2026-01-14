'use client';

import type { SummarySection } from '@/lib/h41-parser';

interface FactorsSummaryTabProps {
  data: SummarySection;
}

function formatNumber(value: number | null): string {
  if (value === null) return '데이터 없음';
  return `${(value / 1000).toFixed(1)}B`;
}

function formatChange(value: number | null): string {
  if (value === null) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value / 1000).toFixed(1)}B`;
}

function getChangeColor(value: number | null): string {
  if (value === null) return 'text-gray-400';
  if (value > 0) return 'text-green-400';
  if (value < 0) return 'text-red-400';
  return 'text-gray-400';
}

export function FactorsSummaryTab({ data }: FactorsSummaryTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 주요 공급 요인 */}
      <div>
        <h3 className="text-lg font-semibold mb-4">주요 공급 요인</h3>
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-4 py-2 text-left text-sm">항목</th>
                <th className="px-4 py-2 text-right text-sm">금액</th>
                <th className="px-4 py-2 text-right text-sm">주간 Δ</th>
                <th className="px-4 py-2 text-right text-sm">연간 Δ</th>
              </tr>
            </thead>
            <tbody>
              {data.supplyingTop.map((row, idx) => (
                <tr key={idx} className="border-t border-gray-700">
                  <td className="px-4 py-2 text-sm">{row.labelKo}</td>
                  <td className="px-4 py-2 text-right text-sm">{formatNumber(row.value)}</td>
                  <td className={`px-4 py-2 text-right text-sm ${getChangeColor(row.weekly)}`}>
                    {formatChange(row.weekly)}
                  </td>
                  <td className={`px-4 py-2 text-right text-sm ${getChangeColor(row.yearly)}`}>
                    {formatChange(row.yearly)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* 주요 흡수 요인 */}
      <div>
        <h3 className="text-lg font-semibold mb-4">주요 흡수 요인</h3>
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-4 py-2 text-left text-sm">항목</th>
                <th className="px-4 py-2 text-right text-sm">금액</th>
                <th className="px-4 py-2 text-right text-sm">주간 Δ</th>
                <th className="px-4 py-2 text-right text-sm">연간 Δ</th>
              </tr>
            </thead>
            <tbody>
              {data.absorbingTop.map((row, idx) => (
                <tr key={idx} className="border-t border-gray-700">
                  <td className="px-4 py-2 text-sm">{row.labelKo}</td>
                  <td className="px-4 py-2 text-right text-sm">{formatNumber(row.value)}</td>
                  <td className={`px-4 py-2 text-right text-sm ${getChangeColor(row.weekly)}`}>
                    {formatChange(row.weekly)}
                  </td>
                  <td className={`px-4 py-2 text-right text-sm ${getChangeColor(row.yearly)}`}>
                    {formatChange(row.yearly)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
