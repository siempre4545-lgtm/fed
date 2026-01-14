'use client';

import type { FactorsSection } from '@/lib/h41-parser';

interface ReserveFactorsTabProps {
  data: FactorsSection;
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

export function ReserveFactorsTab({ data }: ReserveFactorsTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 공급 요인 */}
        <div>
          <h3 className="text-lg font-semibold mb-4">공급 요인</h3>
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
                {data.supplying.map((row, idx) => (
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
        
        {/* 흡수 요인 */}
        <div>
          <h3 className="text-lg font-semibold mb-4">흡수 요인</h3>
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
                {data.absorbing.map((row, idx) => (
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
      
      {/* 하단 합계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card
          title="공급 합계"
          subtitle="Total factors supplying reserve funds"
          value={data.totals.totalSupplying.value}
          weekly={data.totals.totalSupplying.weekly}
          yearly={data.totals.totalSupplying.yearly}
        />
        <Card
          title="흡수 합계"
          subtitle="Total factors, other than reserve balances, absorbing reserve funds"
          value={data.totals.totalAbsorbing.value}
          weekly={data.totals.totalAbsorbing.weekly}
          yearly={data.totals.totalAbsorbing.yearly}
        />
        <Card
          title="지급준비금"
          subtitle="Reserve balances with Federal Reserve Banks"
          value={data.totals.reserveBalances.value}
          weekly={data.totals.reserveBalances.weekly}
          yearly={data.totals.reserveBalances.yearly}
        />
      </div>
    </div>
  );
}

function Card({
  title,
  subtitle,
  value,
  weekly,
  yearly,
}: {
  title: string;
  subtitle?: string;
  value: number | null;
  weekly: number | null;
  yearly: number | null;
}) {
  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <div className="text-sm text-gray-400 mb-1">{title}</div>
      {subtitle && <div className="text-xs text-gray-500 mb-2">{subtitle}</div>}
      <div className="text-2xl font-bold mb-4">{formatNumber(value)}</div>
      <div className="space-y-1">
        <div className={`text-sm ${getChangeColor(weekly)}`}>
          주간: {formatChange(weekly)}
        </div>
        <div className={`text-sm ${getChangeColor(yearly)}`}>
          연간: {formatChange(yearly)}
        </div>
      </div>
    </div>
  );
}
