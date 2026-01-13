'use client';

import type { H4ReportConsolidatedStatement } from '@/lib/types';
import { formatNumber } from '@/lib/translations';

interface ConsolidatedStatementTabProps {
  consolidatedStatement: H4ReportConsolidatedStatement;
}

export function ConsolidatedStatementTab({ consolidatedStatement }: ConsolidatedStatementTabProps) {
  return (
    <div className="space-y-6">
      <div className="mb-4">
        <h2 className="text-2xl font-bold mb-2">연결 재무상태표</h2>
        <p className="text-sm text-gray-400">단위: 백만 달러</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 자산 */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-bold mb-4">자산 ASSETS</h3>
          {consolidatedStatement.assetsRows.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p>자산 데이터가 없습니다.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-400">항목</th>
                    <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">금액</th>
                    <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">주간</th>
                    <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">연간</th>
                  </tr>
                </thead>
                <tbody>
                  {consolidatedStatement.assetsRows.map((row, idx) => (
                    <tr key={idx} className="border-b border-gray-800 hover:bg-gray-800/50">
                      <td className="px-4 py-2 text-sm">{row.label || '-'}</td>
                      <td className="px-4 py-2 text-sm text-right">{formatNumber(row.value || 0)}</td>
                      <td className={`px-4 py-2 text-sm text-right ${
                        (row.change || 0) > 0 ? 'text-green-400' : (row.change || 0) < 0 ? 'text-red-400' : 'text-gray-400'
                      }`}>
                        {row.change ? (row.change > 0 ? '+' : '') + formatNumber(row.change) : '-'}
                      </td>
                      <td className={`px-4 py-2 text-sm text-right ${
                        (row.yearlyChange || 0) > 0 ? 'text-green-400' : (row.yearlyChange || 0) < 0 ? 'text-red-400' : 'text-gray-400'
                      }`}>
                        {row.yearlyChange ? (row.yearlyChange > 0 ? '+' : '') + formatNumber(row.yearlyChange) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 부채 */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-bold mb-4">부채 LIABILITIES</h3>
          {consolidatedStatement.liabilitiesRows.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p>부채 데이터가 없습니다.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-400">항목</th>
                    <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">금액</th>
                    <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">주간</th>
                    <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">연간</th>
                  </tr>
                </thead>
                <tbody>
                  {consolidatedStatement.liabilitiesRows.map((row, idx) => (
                    <tr key={idx} className="border-b border-gray-800 hover:bg-gray-800/50">
                      <td className="px-4 py-2 text-sm">{row.label || '-'}</td>
                      <td className="px-4 py-2 text-sm text-right">{formatNumber(row.value || 0)}</td>
                      <td className={`px-4 py-2 text-sm text-right ${
                        (row.change || 0) > 0 ? 'text-green-400' : (row.change || 0) < 0 ? 'text-red-400' : 'text-gray-400'
                      }`}>
                        {row.change ? (row.change > 0 ? '+' : '') + formatNumber(row.change) : '-'}
                      </td>
                      <td className={`px-4 py-2 text-sm text-right ${
                        (row.yearlyChange || 0) > 0 ? 'text-green-400' : (row.yearlyChange || 0) < 0 ? 'text-red-400' : 'text-gray-400'
                      }`}>
                        {row.yearlyChange ? (row.yearlyChange > 0 ? '+' : '') + formatNumber(row.yearlyChange) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
