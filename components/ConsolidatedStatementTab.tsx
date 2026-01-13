'use client';

import type { H4ReportConsolidatedStatement } from '@/lib/types';
import { formatNumber, formatChange } from '@/lib/translations';

interface ConsolidatedStatementTabProps {
  consolidatedStatement: H4ReportConsolidatedStatement;
}

export function ConsolidatedStatementTab({ consolidatedStatement }: ConsolidatedStatementTabProps) {
  return (
    <div className="space-y-6">
      {/* 자산 */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-bold mb-4">자산 (Assets)</h3>
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
                  <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">잔액</th>
                  <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">변화</th>
                </tr>
              </thead>
              <tbody>
                {consolidatedStatement.assetsRows.map((row, idx) => (
                  <tr key={idx} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="px-4 py-2 text-sm">{row.label || '-'}</td>
                    <td className="px-4 py-2 text-sm text-right">{formatNumber(row.value || 0)}M</td>
                    <td className={`px-4 py-2 text-sm text-right ${
                      (row.change || 0) > 0 ? 'text-red-400' : (row.change || 0) < 0 ? 'text-green-400' : 'text-gray-400'
                    }`}>
                      {row.change ? (row.change > 0 ? '+' : '') + formatNumber(row.change) + 'M' : '0M'}
                    </td>
                  </tr>
                ))}
                {consolidatedStatement.totals.assets > 0 && (
                  <tr className="border-t-2 border-gray-600 font-bold">
                    <td className="px-4 py-2">총 자산</td>
                    <td className="px-4 py-2 text-right">{formatNumber(consolidatedStatement.totals.assets)}M</td>
                    <td className="px-4 py-2"></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 부채 */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-bold mb-4">부채 (Liabilities)</h3>
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
                  <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">잔액</th>
                  <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">변화</th>
                </tr>
              </thead>
              <tbody>
                {consolidatedStatement.liabilitiesRows.map((row, idx) => (
                  <tr key={idx} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="px-4 py-2 text-sm">{row.label || '-'}</td>
                    <td className="px-4 py-2 text-sm text-right">{formatNumber(row.value || 0)}M</td>
                    <td className={`px-4 py-2 text-sm text-right ${
                      (row.change || 0) > 0 ? 'text-red-400' : (row.change || 0) < 0 ? 'text-green-400' : 'text-gray-400'
                    }`}>
                      {row.change ? (row.change > 0 ? '+' : '') + formatNumber(row.change) + 'M' : '0M'}
                    </td>
                  </tr>
                ))}
                {consolidatedStatement.totals.liabilities > 0 && (
                  <tr className="border-t-2 border-gray-600 font-bold">
                    <td className="px-4 py-2">총 부채</td>
                    <td className="px-4 py-2 text-right">{formatNumber(consolidatedStatement.totals.liabilities)}M</td>
                    <td className="px-4 py-2"></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
