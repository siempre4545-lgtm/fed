'use client';

import type { H4ReportOverview } from '@/lib/types';
import { formatNumber, formatChange } from '@/lib/translations';

interface OverviewTabProps {
  overview: H4ReportOverview;
}

export function OverviewTab({ overview }: OverviewTabProps) {
  const MetricCard = ({ 
    title, 
    description, 
    value, 
    weeklyChange, 
    weeklyChangePercent,
    yearlyChange,
    yearlyChangePercent 
  }: {
    title: string;
    description: string;
    value: number;
    weeklyChange: number;
    weeklyChangePercent: number;
    yearlyChange: number;
    yearlyChangePercent: number;
  }) => {
    const weeklyColor = weeklyChange >= 0 ? 'text-red-400' : 'text-green-400';
    const yearlyColor = yearlyChange >= 0 ? 'text-red-400' : 'text-green-400';
    
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="text-sm text-gray-400 mb-1">{title}</div>
        <div className="text-2xl font-bold mb-2">{formatNumber(value)}M</div>
        <div className="text-xs text-gray-500 mb-4">{description}</div>
        <div className="space-y-2">
          <div className={`text-sm font-medium ${weeklyColor}`}>
            주간: {formatChange(weeklyChange, weeklyChangePercent)}
          </div>
          <div className={`text-sm font-medium ${yearlyColor}`}>
            연간: {formatChange(yearlyChange, yearlyChangePercent)}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* 주요 지표 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <MetricCard
          title="총 자산"
          description="연준 보유 모든 자산"
          value={overview.totalAssets.value}
          weeklyChange={overview.totalAssets.weeklyChange}
          weeklyChangePercent={overview.totalAssets.weeklyChangePercent}
          yearlyChange={overview.totalAssets.yearlyChange}
          yearlyChangePercent={overview.totalAssets.yearlyChangePercent}
        />
        <MetricCard
          title="보유 증권"
          description="국채 + MBS + 기관채"
          value={overview.securitiesHeld.value}
          weeklyChange={overview.securitiesHeld.weeklyChange}
          weeklyChangePercent={overview.securitiesHeld.weeklyChangePercent}
          yearlyChange={overview.securitiesHeld.yearlyChange}
          yearlyChangePercent={overview.securitiesHeld.yearlyChangePercent}
        />
        <MetricCard
          title="지급준비금"
          description="은행들의 연준 예치 준비금"
          value={overview.reserves.value}
          weeklyChange={overview.reserves.weeklyChange}
          weeklyChangePercent={overview.reserves.weeklyChangePercent}
          yearlyChange={overview.reserves.yearlyChange}
          yearlyChangePercent={overview.reserves.yearlyChangePercent}
        />
        <MetricCard
          title="재무부 일반계정 (TGA)"
          description="정부의 당좌예금"
          value={overview.tga.value}
          weeklyChange={overview.tga.weeklyChange}
          weeklyChangePercent={overview.tga.weeklyChangePercent}
          yearlyChange={overview.tga.yearlyChange}
          yearlyChangePercent={overview.tga.yearlyChangePercent}
        />
        <MetricCard
          title="역환매조건부 (Reverse Repo)"
          description="단기 유동성 흡수"
          value={overview.rrp.value}
          weeklyChange={overview.rrp.weeklyChange}
          weeklyChangePercent={overview.rrp.weeklyChangePercent}
          yearlyChange={overview.rrp.yearlyChange}
          yearlyChangePercent={overview.rrp.yearlyChangePercent}
        />
        <MetricCard
          title="유통 통화"
          description="시중 현금"
          value={overview.currency.value}
          weeklyChange={overview.currency.weeklyChange}
          weeklyChangePercent={overview.currency.weeklyChangePercent}
          yearlyChange={overview.currency.yearlyChange}
          yearlyChangePercent={overview.currency.yearlyChangePercent}
        />
      </div>

      {/* 자산 구성 차트 */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-bold mb-2">자산 구성</h3>
        <div className="text-sm text-gray-400 mb-4">총 자산</div>
        
        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 h-8 bg-gray-700 rounded relative overflow-hidden">
            <div 
              className="h-full bg-blue-500 absolute left-0"
              style={{ width: `${overview.assetComposition.treasury.percent}%` }}
            />
            <div 
              className="h-full bg-green-500 absolute"
              style={{ 
                left: `${overview.assetComposition.treasury.percent}%`,
                width: `${overview.assetComposition.mbs.percent}%`
              }}
            />
            <div 
              className="h-full bg-gray-500 absolute"
              style={{ 
                left: `${overview.assetComposition.treasury.percent + overview.assetComposition.mbs.percent}%`,
                width: `${overview.assetComposition.other.percent}%`
              }}
            />
          </div>
          <div className="text-lg font-bold">
            ${(overview.totalAssets.value / 1000000).toFixed(2)}T
          </div>
        </div>
        
        <div className="flex gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-500 rounded"></div>
            <span>국채 {overview.assetComposition.treasury.percent.toFixed(1)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-500 rounded"></div>
            <span>MBS {overview.assetComposition.mbs.percent.toFixed(1)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-500 rounded"></div>
            <span>기타 {overview.assetComposition.other.percent.toFixed(1)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
