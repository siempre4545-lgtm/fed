'use client';

import type { H4ReportLoansAndLending } from '@/lib/types';
import { formatNumber, formatChange } from '@/lib/translations';

interface LoansSecuritiesTabProps {
  loansAndLending: H4ReportLoansAndLending;
}

export function LoansSecuritiesTab({ loansAndLending }: LoansSecuritiesTabProps) {
  return (
    <div className="space-y-6">
      {/* 대출 테이블 */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-bold mb-4">대출</h3>
        {loansAndLending.loansTable.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p>대출 데이터가 없습니다.</p>
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
                {loansAndLending.loansTable.map((row, idx) => (
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
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 증권 대출 테이블 */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-bold mb-4">증권 대출</h3>
        {loansAndLending.securitiesLendingTable.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p>증권 대출 데이터가 없습니다.</p>
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
                {loansAndLending.securitiesLendingTable.map((row, idx) => (
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
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
