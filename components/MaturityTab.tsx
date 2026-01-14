'use client';

import type { MaturitySection } from '@/lib/h41-parser';

interface MaturityTabProps {
  data: MaturitySection;
}

function formatNumber(value: number | null): string {
  if (value === null) return '—';
  return `${(value / 1000).toFixed(1)}B`;
}

export function MaturityTab({ data }: MaturityTabProps) {
  return (
    <div className="space-y-6">
      {/* Treasury Securities */}
      <div>
        <h3 className="text-lg font-semibold mb-4">미 국채 (Treasury Securities)</h3>
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-4 py-2 text-left text-sm">구간</th>
                <th className="px-4 py-2 text-right text-sm">금액</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-gray-700">
                <td className="px-4 py-2 text-sm">15일 이하</td>
                <td className="px-4 py-2 text-right text-sm">{formatNumber(data.treasury.within15Days)}</td>
              </tr>
              <tr className="border-t border-gray-700">
                <td className="px-4 py-2 text-sm">16-90일</td>
                <td className="px-4 py-2 text-right text-sm">{formatNumber(data.treasury.days16to90)}</td>
              </tr>
              <tr className="border-t border-gray-700">
                <td className="px-4 py-2 text-sm">91일-1년</td>
                <td className="px-4 py-2 text-right text-sm">{formatNumber(data.treasury.days91to1Year)}</td>
              </tr>
              <tr className="border-t border-gray-700">
                <td className="px-4 py-2 text-sm">1-5년</td>
                <td className="px-4 py-2 text-right text-sm">{formatNumber(data.treasury.years1to5)}</td>
              </tr>
              <tr className="border-t border-gray-700">
                <td className="px-4 py-2 text-sm">5-10년</td>
                <td className="px-4 py-2 text-right text-sm">{formatNumber(data.treasury.years5to10)}</td>
              </tr>
              <tr className="border-t border-gray-700">
                <td className="px-4 py-2 text-sm">10년 이상</td>
                <td className="px-4 py-2 text-right text-sm">{formatNumber(data.treasury.years10AndOver)}</td>
              </tr>
              <tr className="border-t-2 border-gray-600 font-semibold">
                <td className="px-4 py-2 text-sm">합계</td>
                <td className="px-4 py-2 text-right text-sm">{formatNumber(data.treasury.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      
      {/* MBS */}
      <div>
        <h3 className="text-lg font-semibold mb-4">주택저당증권 (MBS)</h3>
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-4 py-2 text-left text-sm">구간</th>
                <th className="px-4 py-2 text-right text-sm">금액</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-gray-700">
                <td className="px-4 py-2 text-sm">15일 이하</td>
                <td className="px-4 py-2 text-right text-sm">{formatNumber(data.mbs.within15Days)}</td>
              </tr>
              <tr className="border-t border-gray-700">
                <td className="px-4 py-2 text-sm">16-90일</td>
                <td className="px-4 py-2 text-right text-sm">{formatNumber(data.mbs.days16to90)}</td>
              </tr>
              <tr className="border-t border-gray-700">
                <td className="px-4 py-2 text-sm">91일-1년</td>
                <td className="px-4 py-2 text-right text-sm">{formatNumber(data.mbs.days91to1Year)}</td>
              </tr>
              <tr className="border-t border-gray-700">
                <td className="px-4 py-2 text-sm">1-5년</td>
                <td className="px-4 py-2 text-right text-sm">{formatNumber(data.mbs.years1to5)}</td>
              </tr>
              <tr className="border-t border-gray-700">
                <td className="px-4 py-2 text-sm">5-10년</td>
                <td className="px-4 py-2 text-right text-sm">{formatNumber(data.mbs.years5to10)}</td>
              </tr>
              <tr className="border-t border-gray-700">
                <td className="px-4 py-2 text-sm">10년 이상</td>
                <td className="px-4 py-2 text-right text-sm">{formatNumber(data.mbs.years10AndOver)}</td>
              </tr>
              <tr className="border-t-2 border-gray-600 font-semibold">
                <td className="px-4 py-2 text-sm">합계</td>
                <td className="px-4 py-2 text-right text-sm">{formatNumber(data.mbs.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
