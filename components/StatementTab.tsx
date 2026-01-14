'use client';

import type { StatementSection } from '@/lib/h41-parser';

interface StatementTabProps {
  data: StatementSection;
}

function formatValue(value: number | null): string {
  if (value === null) return '데이터 없음';
  return `$${value.toLocaleString('en-US')}M`;
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

export function StatementTab({ data }: StatementTabProps) {
  return (
    <div className="space-y-6">
      <div className="text-sm text-gray-400 mb-4">
        연결 재무상태표 · 단위: 백만 달러
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 자산 ASSETS */}
        <div>
          <h3 className="text-lg font-semibold mb-4">자산 ASSETS</h3>
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-2 text-left text-sm">항목</th>
                  <th className="px-4 py-2 text-right text-sm">금액</th>
                  <th className="px-4 py-2 text-right text-sm">주간</th>
                  <th className="px-4 py-2 text-right text-sm">연간</th>
                </tr>
              </thead>
              <tbody>
                <Row
                  label="금"
                  englishLabel="Gold"
                  value={data.assets.gold}
                  weekly={data.assets.goldWeekly}
                  yearly={data.assets.goldYearly}
                />
                <Row
                  label="SDR"
                  englishLabel="SDR"
                  value={data.assets.sdr}
                  weekly={data.assets.sdrWeekly}
                  yearly={data.assets.sdrYearly}
                />
                <Row
                  label="보유 증권"
                  englishLabel="Securities"
                  value={data.assets.securities}
                  weekly={data.assets.securitiesWeekly}
                  yearly={data.assets.securitiesYearly}
                />
                <Row
                  label="레포"
                  englishLabel="Repos"
                  value={data.assets.repos}
                  weekly={data.assets.reposWeekly}
                  yearly={data.assets.reposYearly}
                />
                <Row
                  label="대출"
                  englishLabel="Loans"
                  value={data.assets.loans}
                  weekly={data.assets.loansWeekly}
                  yearly={data.assets.loansYearly}
                />
                <Row
                  label="통화스왑"
                  englishLabel="Swaps"
                  value={data.assets.swaps}
                  weekly={data.assets.swapsWeekly}
                  yearly={data.assets.swapsYearly}
                />
                <Row
                  label="총 자산"
                  englishLabel="Total Assets"
                  value={data.assets.total}
                  weekly={data.assets.totalWeekly}
                  yearly={data.assets.totalYearly}
                  isTotal
                />
              </tbody>
            </table>
          </div>
        </div>
        
        {/* 부채 LIABILITIES */}
        <div>
          <h3 className="text-lg font-semibold mb-4">부채 LIABILITIES</h3>
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-2 text-left text-sm">항목</th>
                  <th className="px-4 py-2 text-right text-sm">금액</th>
                  <th className="px-4 py-2 text-right text-sm">주간</th>
                  <th className="px-4 py-2 text-right text-sm">연간</th>
                </tr>
              </thead>
              <tbody>
                <Row
                  label="연방준비권"
                  englishLabel="F.R. Notes"
                  value={data.liabilities.currency}
                  weekly={data.liabilities.currencyWeekly}
                  yearly={data.liabilities.currencyYearly}
                />
                <Row
                  label="역레포"
                  englishLabel="Reverse Repos"
                  value={data.liabilities.reverseRepos}
                  weekly={data.liabilities.reverseReposWeekly}
                  yearly={data.liabilities.reverseReposYearly}
                />
                <Row
                  label="예금"
                  englishLabel="Deposits"
                  value={data.liabilities.deposits}
                  weekly={data.liabilities.depositsWeekly}
                  yearly={data.liabilities.depositsYearly}
                />
                <Row
                  label="지급준비금"
                  englishLabel="Reserves"
                  value={data.liabilities.reserveBalances}
                  weekly={data.liabilities.reserveBalancesWeekly}
                  yearly={data.liabilities.reserveBalancesYearly}
                />
                <Row
                  label="TGA"
                  englishLabel="Treasury"
                  value={data.liabilities.tga}
                  weekly={data.liabilities.tgaWeekly}
                  yearly={data.liabilities.tgaYearly}
                />
                <Row
                  label="총 부채"
                  englishLabel="Total Liabilities"
                  value={data.liabilities.total}
                  weekly={data.liabilities.totalWeekly}
                  yearly={data.liabilities.totalYearly}
                  isTotal
                />
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  englishLabel,
  value,
  weekly,
  yearly,
  isTotal = false,
}: {
  label: string;
  englishLabel: string;
  value: number | null;
  weekly: number | null;
  yearly: number | null;
  isTotal?: boolean;
}) {
  return (
    <tr className={`border-t ${isTotal ? 'border-t-2 border-gray-600' : 'border-gray-700'} ${isTotal ? 'font-semibold' : ''}`}>
      <td className="px-4 py-2 text-sm">
        <div>{label}</div>
        <div className="text-xs text-gray-500">{englishLabel}</div>
      </td>
      <td className="px-4 py-2 text-right text-sm">{formatValue(value)}</td>
      <td className={`px-4 py-2 text-right text-sm ${getChangeColor(weekly)}`}>
        {formatChange(weekly)}
      </td>
      <td className={`px-4 py-2 text-right text-sm ${getChangeColor(yearly)}`}>
        {formatChange(yearly)}
      </td>
    </tr>
  );
}
