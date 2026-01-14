'use client';

import type { OverviewSection } from '@/lib/h41-parser';

interface OverviewTabProps {
  data: OverviewSection;
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
          value={data.totalAssets}
          weekly={data.totalAssetsWeekly}
          yearly={data.totalAssetsYearly}
        />
        <Card
          title="보유 증권"
          value={data.securities}
          weekly={data.securitiesWeekly}
          yearly={data.securitiesYearly}
        />
        <Card
          title="지급준비금"
          value={data.reserveBalances}
          weekly={data.reserveBalancesWeekly}
          yearly={data.reserveBalancesYearly}
        />
        <Card
          title="재무부 일반계정(TGA)"
          value={data.tga}
          weekly={data.tgaWeekly}
          yearly={data.tgaYearly}
        />
        <Card
          title="역환매조건부(역레포)"
          value={data.reverseRepos}
          weekly={data.reverseReposWeekly}
          yearly={data.reverseReposYearly}
        />
        <Card
          title="유통 통화"
          value={data.currency}
          weekly={data.currencyWeekly}
          yearly={data.currencyYearly}
        />
      </div>
      
      {/* 자산 구성 바 */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold mb-4">자산 구성</h3>
        <div className="flex h-8 rounded overflow-hidden">
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
        <div className="mt-4 flex gap-4 text-sm">
          <div>국채: {treasuryRatio}%</div>
          <div>MBS: {mbsRatio}%</div>
          <div>기타: {otherRatio}%</div>
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  value,
  weekly,
  yearly,
}: {
  title: string;
  value: number | null;
  weekly: number | null;
  yearly: number | null;
}) {
  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <div className="text-sm text-gray-400 mb-2">{title}</div>
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
