'use client';

import type { LendingSection } from '@/lib/h41-parser';

interface LendingTabProps {
  data: LendingSection;
}

function formatNumber(value: number | null): string {
  if (value === null) return '데이터 없음';
  return `${(value / 1000).toFixed(1)}B`;
}

export function LendingTab({ data }: LendingTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 대출 */}
      <div>
        <h3 className="text-lg font-semibold mb-4">대출</h3>
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-4 py-2 text-left text-sm">항목</th>
                <th className="px-4 py-2 text-right text-sm">금액</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-gray-700">
                <td className="px-4 py-2 text-sm">1차 신용</td>
                <td className="px-4 py-2 text-right text-sm">{formatNumber(data.loans.primaryCredit)}</td>
              </tr>
              <tr className="border-t border-gray-700">
                <td className="px-4 py-2 text-sm">은행기간대출 (BTFP)</td>
                <td className="px-4 py-2 text-right text-sm">{formatNumber(data.loans.btfp)}</td>
              </tr>
              <tr className="border-t-2 border-gray-600 font-semibold">
                <td className="px-4 py-2 text-sm">대출 합계</td>
                <td className="px-4 py-2 text-right text-sm">{formatNumber(data.loans.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      
      {/* 증권 대출 */}
      <div>
        <h3 className="text-lg font-semibold mb-4">증권 대출</h3>
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-4 py-2 text-left text-sm">항목</th>
                <th className="px-4 py-2 text-right text-sm">금액</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-gray-700">
                <td className="px-4 py-2 text-sm">익일물</td>
                <td className="px-4 py-2 text-right text-sm">{formatNumber(data.securitiesLending.overnight)}</td>
              </tr>
              <tr className="border-t border-gray-700">
                <td className="px-4 py-2 text-sm">기간물</td>
                <td className="px-4 py-2 text-right text-sm">{formatNumber(data.securitiesLending.term)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
