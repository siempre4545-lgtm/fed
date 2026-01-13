'use client';

import { useState } from 'react';
import { TrendTab } from './TrendTab';

interface TabsProps {
  tabs: Array<{ id: string; label: string }>;
  activeTab: string;
  onTabChange: (tabId: string) => void;
  reportData: any;
  selectedDate: string;
}

export function Tabs({ tabs, activeTab, onTabChange, reportData, selectedDate }: TabsProps) {
  const renderTabContent = () => {
    if (activeTab === 'trend') {
      return <TrendTab />;
    }

    // 다른 탭들은 간단한 구현
    const table = reportData?.tables?.find((t: any) => {
      const tableMap: Record<string, string> = {
        'overview': 'Factors Affecting Reserve Balances',
        'reserve-factors': 'Factors Affecting Reserve Balances',
        'factors-summary': 'Factors Affecting Reserve Balances',
        'maturity': 'Maturity Distribution',
        'loans-securities': 'Consolidated Statement',
        'statement': 'Consolidated Statement',
        'regional': 'Each Federal Reserve Bank',
        'federal-reserve': 'Consolidated Statement',
      };
      return t.name === tableMap[activeTab];
    });

    if (!table || !table.rows || table.rows.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400">
          <p>데이터가 없습니다.</p>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-700">
              {Object.keys(table.rows[0]).map((key) => (
                <th key={key} className="px-4 py-2 text-left text-sm font-medium text-gray-400">
                  {key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row: any, idx: number) => (
              <tr key={idx} className="border-b border-gray-800 hover:bg-gray-800/50">
                {Object.entries(row).map(([key, value]) => (
                  <td key={key} className="px-4 py-2 text-sm">
                    {typeof value === 'number' ? value.toLocaleString() : String(value)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
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
