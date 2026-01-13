'use client';

import { useState } from 'react';
import { TrendTab } from './TrendTab';
import { OverviewTab } from './OverviewTab';
import { ReserveFactorsTab } from './ReserveFactorsTab';
import { FactorsSummaryTab } from './FactorsSummaryTab';
import type { H4Report } from '@/lib/types';

interface TabsProps {
  tabs: Array<{ id: string; label: string }>;
  activeTab: string;
  onTabChange: (tabId: string) => void;
  reportData: H4Report | null;
  selectedDate: string;
}

export function Tabs({ tabs, activeTab, onTabChange, reportData, selectedDate }: TabsProps) {
  const renderTabContent = () => {
    if (!reportData || !reportData.ok) {
      return (
        <div className="text-center py-12 text-gray-400">
          <p>데이터를 불러오는 중이거나 데이터가 없습니다.</p>
        </div>
      );
    }

    if (activeTab === 'trend') {
      return <TrendTab baseDate={selectedDate} />;
    }

    if (activeTab === 'overview') {
      if (!reportData.overview) {
        return (
          <div className="text-center py-12 text-gray-400">
            <p>개요 데이터를 불러올 수 없습니다.</p>
          </div>
        );
      }
      return <OverviewTab overview={reportData.overview} />;
    }

    if (activeTab === 'reserve-factors') {
      if (!reportData.factors) {
        return (
          <div className="text-center py-12 text-gray-400">
            <p>준비금 요인 데이터를 불러올 수 없습니다.</p>
          </div>
        );
      }
      return <ReserveFactorsTab factors={reportData.factors} />;
    }

    if (activeTab === 'factors-summary') {
      if (!reportData.summary) {
        return (
          <div className="text-center py-12 text-gray-400">
            <p>요인 요약 데이터를 불러올 수 없습니다.</p>
          </div>
        );
      }
      return <FactorsSummaryTab summary={reportData.summary} />;
    }

    // 나머지 탭들은 기본 구현 (추후 개선)
    return (
      <div className="text-center py-12 text-gray-400">
        <p>{tabs.find(t => t.id === activeTab)?.label} 탭은 준비 중입니다.</p>
        <p className="text-xs mt-2">데이터 구조는 준비되었으나 UI 구현이 필요합니다.</p>
      </div>
    );
  };

  return (
    <div>
      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-gray-700 mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-b-2 border-blue-500 text-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {renderTabContent()}
      </div>
    </div>
  );
}
