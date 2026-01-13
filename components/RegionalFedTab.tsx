'use client';

import type { H4ReportRegionalFed } from '@/lib/types';
import { formatNumber, formatMillions } from '@/lib/translations';
import { useState } from 'react';

interface RegionalFedTabProps {
  regionalFed: H4ReportRegionalFed;
}

const bankNames = ['보스턴', '뉴욕', '필라델피아', '클리블랜드', '리치몬드', '애틀랜타', '시카고', '세인트루이스', '미니애폴리스', '캔자스시티', '댈러스', '샌프란시스코'];
const bankNamesEn = ['Boston', 'New York', 'Philadelphia', 'Cleveland', 'Richmond', 'Atlanta', 'Chicago', 'St. Louis', 'Minneapolis', 'Kansas City', 'Dallas', 'San Francisco'];

export function RegionalFedTab({ regionalFed }: RegionalFedTabProps) {
  const [selectedBank, setSelectedBank] = useState<string | null>(null);
  
  const selectedRow = selectedBank ? regionalFed.rows.find(r => r.label === selectedBank) : null;
  
  return (
    <div className="space-y-6">
      <div className="mb-4">
        <h2 className="text-2xl font-bold mb-2">각 연방준비은행</h2>
        <p className="text-sm text-gray-400">Statement of Each Federal Reserve Bank - 단위: 백만 달러</p>
      </div>
      
      {/* 은행별 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
        {bankNames.map((bank, idx) => {
          const row = regionalFed.rows.find(r => r.label === bank);
          const total = row?.total || 0;
          const isSelected = selectedBank === bank;
          
          return (
            <button
              key={bank}
              onClick={() => setSelectedBank(isSelected ? null : bank)}
              className={`bg-gray-800 rounded-lg p-4 border transition-colors ${
                isSelected ? 'border-blue-500 bg-gray-750' : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="text-sm text-gray-400 mb-1">{bank}</div>
              <div className="text-lg font-bold">{formatMillions(total)}</div>
              {total > 0 && (
                <div className="text-xs text-gray-500 mt-1">
                  {((total / regionalFed.rows.reduce((sum, r) => sum + (r.total || 0), 0)) * 100).toFixed(1)}%
                </div>
              )}
            </button>
          );
        })}
      </div>
      
      {/* 선택된 은행 상세 정보 */}
      {selectedRow && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h3 className="text-lg font-bold mb-4">자산 ASSETS</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-400">항목</th>
                    <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">금액</th>
                    <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">증감</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(selectedRow.values).filter(([k]) => 
                    k.includes('Gold') || k.includes('SDR') || k.includes('Securities') || k.includes('Treasury') || k.includes('MBS') || k.includes('Repurchase') || k.includes('Loans')
                  ).map(([key, value]) => (
                    <tr key={key} className="border-b border-gray-800">
                      <td className="px-4 py-2 text-sm">{translateAssetLabel(key)}</td>
                      <td className="px-4 py-2 text-sm text-right">{formatNumber(value)}</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-400">-</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-600 font-bold">
                    <td className="px-4 py-2">총 자산</td>
                    <td className="px-4 py-2 text-right">{formatNumber(selectedRow.total)}</td>
                    <td className="px-4 py-2"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h3 className="text-lg font-bold mb-4">부채 LIABILITIES</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-400">항목</th>
                    <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">금액</th>
                    <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">증감</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(selectedRow.values).filter(([k]) => 
                    k.includes('Notes') || k.includes('Reverse') || k.includes('Deposits') || k.includes('Capital') || k.includes('Surplus')
                  ).map(([key, value]) => (
                    <tr key={key} className="border-b border-gray-800">
                      <td className="px-4 py-2 text-sm">{translateLiabilityLabel(key)}</td>
                      <td className="px-4 py-2 text-sm text-right">{formatNumber(value)}</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-400">-</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function translateAssetLabel(label: string): string {
  if (label.includes('Gold')) return '금 증서';
  if (label.includes('SDR')) return 'SDR 증서';
  if (label.includes('Securities Held')) return '보유 증권';
  if (label.includes('Treasury Securities')) return '미 국채';
  if (label.includes('MBS')) return 'MBS';
  if (label.includes('Repurchase')) return '레포';
  if (label.includes('Loans')) return '대출';
  return label;
}

function translateLiabilityLabel(label: string): string {
  if (label.includes('Notes Outstanding')) return '연방준비권';
  if (label.includes('Reverse Repurchase')) return '역레포';
  if (label.includes('Deposits')) return '예치금';
  if (label.includes('Capital Paid In')) return '납입 자본';
  if (label.includes('Surplus')) return '잉여금';
  return label;
}
