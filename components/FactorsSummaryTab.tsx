'use client';

import type { H4ReportSummary } from '@/lib/types';
import { formatNumber, formatChange } from '@/lib/translations';

interface FactorsSummaryTabProps {
  summary: H4ReportSummary;
}

export function FactorsSummaryTab({ summary }: FactorsSummaryTabProps) {
  return (
    <div className="space-y-6">
      {/* 주요 공급 요인 */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-bold mb-4">주요 공급 요인</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-400">항목</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">잔액</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">변화</th>
              </tr>
            </thead>
            <tbody>
              {summary.keySupply.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                summary.keySupply.map((row, idx) => (
                  <tr key={idx} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="px-4 py-2 text-sm">{row.label}</td>
                    <td className="px-4 py-2 text-sm text-right">{formatNumber(row.value)}M</td>
                    <td className={`px-4 py-2 text-sm text-right ${
                      row.change > 0 ? 'text-red-400' : row.change < 0 ? 'text-green-400' : 'text-gray-400'
                    }`}>
                      {row.change > 0 ? '+' : ''}{formatNumber(row.change)}M
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 주요 흡수 요인 */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-bold mb-4">주요 흡수 요인</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-400">항목</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">잔액</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">변화</th>
              </tr>
            </thead>
            <tbody>
              {summary.keyAbsorb.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                summary.keyAbsorb.map((row, idx) => (
                  <tr key={idx} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="px-4 py-2 text-sm">{row.label}</td>
                    <td className="px-4 py-2 text-sm text-right">{formatNumber(row.value)}M</td>
                    <td className={`px-4 py-2 text-sm text-right ${
                      row.change > 0 ? 'text-red-400' : row.change < 0 ? 'text-green-400' : 'text-gray-400'
                    }`}>
                      {row.change > 0 ? '+' : ''}{formatNumber(row.change)}M
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
