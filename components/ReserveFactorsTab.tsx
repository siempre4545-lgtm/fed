'use client';

import type { FactorsSection } from '@/lib/h41-parser';

interface ReserveFactorsTabProps {
  data: FactorsSection;
}

function formatValue(value: number | null): string {
  if (value === null) return '데이터 없음';
  return `$${value.toLocaleString('en-US')}M`;
}

function formatChange(value: number | null, baseValue: number | null): string {
  if (value === null || baseValue === null || baseValue === 0) return '—';
  const sign = value >= 0 ? '+' : '';
  const percent = ((value / baseValue) * 100).toFixed(2);
  return `${sign}${(value / 1000).toFixed(1)}B (${sign}${percent}%)`;
}

function formatChangeSimple(value: number | null): string {
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
      <div className="text-sm text-gray-400 mb-4">
        지급준비금 영향 요인 · 단위: 백만 달러
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 공급 요인 */}
        <div>
          <h3 className="text-lg font-semibold mb-4">공급 요인 SUPPLYING</h3>
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-2 text-left text-sm">항목</th>
                  <th className="px-4 py-2 text-right text-sm">금액</th>
                  <th className="px-4 py-2 text-right text-sm">주간 △</th>
                  <th className="px-4 py-2 text-right text-sm">연간 △</th>
                </tr>
              </thead>
              <tbody>
                {data.supplying.map((row, idx) => {
                  const weeklyPercent = row.value !== null && row.value !== 0 && row.weekly !== null
                    ? ((row.weekly / row.value) * 100).toFixed(2)
                    : null;
                  const yearlyPercent = row.value !== null && row.value !== 0 && row.yearly !== null
                    ? ((row.yearly / row.value) * 100).toFixed(2)
                    : null;
                  
                  return (
                    <tr key={idx} className="border-t border-gray-700">
                      <td className="px-4 py-2 text-sm">{row.labelKo}</td>
                      <td className="px-4 py-2 text-right text-sm">{formatValue(row.value)}</td>
                      <td className={`px-4 py-2 text-right text-sm ${getChangeColor(row.weekly)}`}>
                        {row.weekly !== null ? `${row.weekly >= 0 ? '+' : ''}${(row.weekly / 1000).toFixed(1)}B` : '—'}
                        {weeklyPercent !== null && ` (${row.weekly >= 0 ? '+' : ''}${weeklyPercent}%)`}
                      </td>
                      <td className={`px-4 py-2 text-right text-sm ${getChangeColor(row.yearly)}`}>
                        {row.yearly !== null ? `${row.yearly >= 0 ? '+' : ''}${(row.yearly / 1000).toFixed(1)}B` : '—'}
                        {yearlyPercent !== null && ` (${row.yearly >= 0 ? '+' : ''}${yearlyPercent}%)`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* 흡수 요인 */}
        <div>
          <h3 className="text-lg font-semibold mb-4">흡수 요인 ABSORBING</h3>
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-2 text-left text-sm">항목</th>
                  <th className="px-4 py-2 text-right text-sm">금액</th>
                  <th className="px-4 py-2 text-right text-sm">주간 △</th>
                  <th className="px-4 py-2 text-right text-sm">연간 △</th>
                </tr>
              </thead>
              <tbody>
                {data.absorbing.map((row, idx) => {
                  const weeklyPercent = row.value !== null && row.value !== 0 && row.weekly !== null
                    ? ((row.weekly / row.value) * 100).toFixed(2)
                    : null;
                  const yearlyPercent = row.value !== null && row.value !== 0 && row.yearly !== null
                    ? ((row.yearly / row.value) * 100).toFixed(2)
                    : null;
                  
                  return (
                    <tr key={idx} className="border-t border-gray-700">
                      <td className="px-4 py-2 text-sm">{row.labelKo}</td>
                      <td className="px-4 py-2 text-right text-sm">{formatValue(row.value)}</td>
                      <td className={`px-4 py-2 text-right text-sm ${getChangeColor(row.weekly)}`}>
                        {row.weekly !== null ? `${row.weekly >= 0 ? '+' : ''}${(row.weekly / 1000).toFixed(1)}B` : '—'}
                        {weeklyPercent !== null && ` (${row.weekly >= 0 ? '+' : ''}${weeklyPercent}%)`}
                      </td>
                      <td className={`px-4 py-2 text-right text-sm ${getChangeColor(row.yearly)}`}>
                        {row.yearly !== null ? `${row.yearly >= 0 ? '+' : ''}${(row.yearly / 1000).toFixed(1)}B` : '—'}
                        {yearlyPercent !== null && ` (${row.yearly >= 0 ? '+' : ''}${yearlyPercent}%)`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      {/* 하단 합계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card
          title="공급 합계"
          subtitle="준비금 공급 요인 총합"
          value={data.totals.totalSupplying.value}
          weekly={data.totals.totalSupplying.weekly}
          yearly={data.totals.totalSupplying.yearly}
        />
        <Card
          title="흡수 합계"
          subtitle="준비금 흡수 요인 총합"
          value={data.totals.totalAbsorbing.value}
          weekly={data.totals.totalAbsorbing.weekly}
          yearly={data.totals.totalAbsorbing.yearly}
        />
        <Card
          title="지급준비금"
          subtitle="공급 - 흡수 = 준비금"
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
  const weeklyPercent = value !== null && value !== 0 && weekly !== null
    ? ((weekly / value) * 100).toFixed(2)
    : null;
  const yearlyPercent = value !== null && value !== 0 && yearly !== null
    ? ((yearly / value) * 100).toFixed(2)
    : null;
  
  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <div className="text-sm text-gray-400 mb-1">{title}</div>
      {subtitle && <div className="text-xs text-gray-500 mb-2">{subtitle}</div>}
      <div className="text-2xl font-bold mb-4">{formatValue(value)}</div>
      <div className="space-y-2">
        <div className={`text-sm ${getChangeColor(weekly)}`}>
          주간: {weekly !== null ? `${weekly >= 0 ? '+' : ''}${(weekly / 1000).toFixed(1)}B` : '—'} 
          {weeklyPercent !== null && ` (${weekly >= 0 ? '+' : ''}${weeklyPercent}%)`}
        </div>
        <div className={`text-sm ${getChangeColor(yearly)}`}>
          연간: {yearly !== null ? `${yearly >= 0 ? '+' : ''}${(yearly / 1000).toFixed(1)}B` : '—'} 
          {yearlyPercent !== null && ` (${yearly >= 0 ? '+' : ''}${yearlyPercent}%)`}
        </div>
      </div>
    </div>
  );
}
