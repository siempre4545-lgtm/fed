'use client';

import type { H4ReportFactors } from '@/lib/types';
import { formatNumber, formatChange } from '@/lib/translations';

interface ReserveFactorsTabProps {
  factors: H4ReportFactors;
}

export function ReserveFactorsTab({ factors }: ReserveFactorsTabProps) {
  return (
    <div className="space-y-6">
      {/* 공급 요인 */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-bold mb-4">공급 요인</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-400">항목</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">잔액</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">변화</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">변화율</th>
              </tr>
            </thead>
            <tbody>
              {factors.supplying.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                factors.supplying.map((row, idx) => (
                  <tr key={idx} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="px-4 py-2 text-sm">{row.label}</td>
                    <td className="px-4 py-2 text-sm text-right">{formatNumber(row.value)}M</td>
                    <td className={`px-4 py-2 text-sm text-right ${
                      row.change > 0 ? 'text-red-400' : row.change < 0 ? 'text-green-400' : 'text-gray-400'
                    }`}>
                      {formatChange(row.change, row.changePercent)}
                    </td>
                    <td className={`px-4 py-2 text-sm text-right ${
                      row.changePercent > 0 ? 'text-red-400' : row.changePercent < 0 ? 'text-green-400' : 'text-gray-400'
                    }`}>
                      {row.changePercent.toFixed(2)}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 흡수 요인 */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-bold mb-4">흡수 요인</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-400">항목</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">잔액</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">변화</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">변화율</th>
              </tr>
            </thead>
            <tbody>
              {factors.absorbing.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                factors.absorbing.map((row, idx) => (
                  <tr key={idx} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="px-4 py-2 text-sm">{row.label}</td>
                    <td className="px-4 py-2 text-sm text-right">{formatNumber(row.value)}M</td>
                    <td className={`px-4 py-2 text-sm text-right ${
                      row.change > 0 ? 'text-red-400' : row.change < 0 ? 'text-green-400' : 'text-gray-400'
                    }`}>
                      {formatChange(row.change, row.changePercent)}
                    </td>
                    <td className={`px-4 py-2 text-sm text-right ${
                      row.changePercent > 0 ? 'text-red-400' : row.changePercent < 0 ? 'text-green-400' : 'text-gray-400'
                    }`}>
                      {row.changePercent.toFixed(2)}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 합계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-sm text-gray-400 mb-1">공급 총합</div>
          <div className="text-xl font-bold">{formatNumber(factors.totals.supplying)}M</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-sm text-gray-400 mb-1">흡수 총합</div>
          <div className="text-xl font-bold">{formatNumber(factors.totals.absorbing)}M</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-sm text-gray-400 mb-1">순 공급</div>
          <div className={`text-xl font-bold ${
            factors.totals.net > 0 ? 'text-red-400' : factors.totals.net < 0 ? 'text-green-400' : 'text-gray-400'
          }`}>
            {formatNumber(factors.totals.net)}M
          </div>
        </div>
      </div>
    </div>
  );
}
