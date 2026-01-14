'use client';

import type { OverviewSection } from '@/lib/h41-parser';

interface OverviewTabProps {
  data: OverviewSection;
}

function formatNumber(value: number | null): string {
  if (value === null) return '데이터 없음';
  return `${(value / 1000).toFixed(1)}B`;
}

function formatValue(value: number | null): string {
  if (value === null) return '데이터 없음';
  // 백만 달러 단위로 표시 (M)
  return `$${value.toLocaleString('en-US')}M`;
}

function formatChange(value: number | null, baseValue: number | null): string {
  if (value === null || baseValue === null || baseValue === 0) return '—';
  const sign = value >= 0 ? '+' : '';
  const percent = ((value / baseValue) * 100).toFixed(2);
  return `${sign}${(value / 1000).toFixed(1)}B (${sign}${percent}%)`;
}

function getChangeColor(value: number | null): string {
  if (value === null) return 'text-gray-400';
  if (value > 0) return 'text-green-400';
  if (value < 0) return 'text-red-400';
  return 'text-gray-400';
}

export function OverviewTab({ data }: OverviewTabProps) {
  // 자산 구성 비율 계산
  const totalAssets = data.totalAssetsForComposition || 0;
  const treasuryRatio = totalAssets > 0 && data.treasurySecurities !== null
    ? ((data.treasurySecurities / totalAssets) * 100).toFixed(1)
    : '0.0';
  const mbsRatio = totalAssets > 0 && data.mortgageBackedSecurities !== null
    ? ((data.mortgageBackedSecurities / totalAssets) * 100).toFixed(1)
    : '0.0';
  const otherRatio = totalAssets > 0 && data.otherAssets !== null
    ? ((data.otherAssets / totalAssets) * 100).toFixed(1)
    : '0.0';
  
  return (
    <div className="space-y-6">
      {/* 6개 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card
          title="총 자산"
          englishLabel="Total Assets"
          description="연준 보유 모든 자산"
          value={data.totalAssets}
          weekly={data.totalAssetsWeekly}
          yearly={data.totalAssetsYearly}
        />
        <Card
          title="보유 증권"
          englishLabel="Securities Held"
          description="국채 + MBS + 기관채"
          value={data.securities}
          weekly={data.securitiesWeekly}
          yearly={data.securitiesYearly}
        />
        <Card
          title="지급준비금"
          englishLabel="Reserve Balances"
          description="은행들의 연준 예치 준비금"
          value={data.reserveBalances}
          weekly={data.reserveBalancesWeekly}
          yearly={data.reserveBalancesYearly}
        />
        <Card
          title="재무부 일반계정"
          englishLabel="TGA"
          description="정부의 당좌예금"
          value={data.tga}
          weekly={data.tgaWeekly}
          yearly={data.tgaYearly}
        />
        <Card
          title="역환매조건부"
          englishLabel="Reverse Repo"
          description="단기 유동성 흡수"
          value={data.reverseRepos}
          weekly={data.reverseReposWeekly}
          yearly={data.reverseReposYearly}
        />
        <Card
          title="유통 통화"
          englishLabel="Currency"
          description="시중 현금"
          value={data.currency}
          weekly={data.currencyWeekly}
          yearly={data.currencyYearly}
        />
      </div>
      
      {/* 자산 구성 차트 */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold mb-2">자산 구성</h3>
        <p className="text-sm text-gray-400 mb-4">총 자산</p>
        <div className="flex h-12 rounded overflow-hidden mb-4">
          <div
            className="bg-blue-500 flex items-center justify-center text-white text-sm font-medium"
            style={{ width: `${treasuryRatio}%` }}
          >
            {parseFloat(treasuryRatio) > 5 && `국채 ${treasuryRatio}%`}
          </div>
          <div
            className="bg-green-500 flex items-center justify-center text-white text-sm font-medium"
            style={{ width: `${mbsRatio}%` }}
          >
            {parseFloat(mbsRatio) > 5 && `MBS ${mbsRatio}%`}
          </div>
          <div
            className="bg-gray-600 flex items-center justify-center text-white text-sm font-medium"
            style={{ width: `${otherRatio}%` }}
          >
            {parseFloat(otherRatio) > 5 && `기타 ${otherRatio}%`}
          </div>
        </div>
        <div className="flex justify-end">
          <div className="text-sm text-gray-400">
            총 자산: {formatNumber(totalAssets)}
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  englishLabel,
  description,
  value,
  weekly,
  yearly,
}: {
  title: string;
  englishLabel: string;
  description: string;
  value: number | null;
  weekly: number | null;
  yearly: number | null;
}) {
  // 주간/연간 변동률 계산
  const weeklyPercent = value !== null && value !== 0 && weekly !== null
    ? ((weekly / value) * 100).toFixed(2)
    : null;
  const yearlyPercent = value !== null && value !== 0 && yearly !== null
    ? ((yearly / value) * 100).toFixed(2)
    : null;
  
  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <div className="text-sm text-gray-400 mb-1">{title}</div>
      <div className="text-xs text-gray-500 mb-2">{englishLabel}</div>
      <div className="text-2xl font-bold mb-2">{formatValue(value)}</div>
      <div className="text-xs text-gray-400 mb-4">{description}</div>
      <div className="space-y-2">
        <div className={`text-sm ${getChangeColor(weekly)}`}>
          주간: {weekly !== null ? `${weekly >= 0 ? '+' : ''}${(weekly / 1000).toFixed(1)}B` : '—'} 
          {weeklyPercent !== null && weekly !== null && ` (${weekly >= 0 ? '+' : ''}${weeklyPercent}%)`}
        </div>
        <div className={`text-sm ${getChangeColor(yearly)}`}>
          연간: {yearly !== null ? `${yearly >= 0 ? '+' : ''}${(yearly / 1000).toFixed(1)}B` : '—'} 
          {yearlyPercent !== null && yearly !== null && ` (${yearly >= 0 ? '+' : ''}${yearlyPercent}%)`}
        </div>
      </div>
    </div>
  );
}
