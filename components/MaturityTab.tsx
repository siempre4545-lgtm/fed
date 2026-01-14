'use client';

import type { MaturitySection } from '@/lib/h41-parser';

interface MaturityTabProps {
  data: MaturitySection;
}

function formatValue(value: number | null): string {
  if (value === null) return '—';
  return `$${value.toLocaleString('en-US')}M`;
}

function formatValueB(value: number | null): string {
  if (value === null) return '$0B';
  return `$${(value / 1000).toFixed(0)}B`;
}

export function MaturityTab({ data }: MaturityTabProps) {
  // 차트 데이터 준비
  const treasuryValues = [
    data.treasury.within15Days || 0,
    data.treasury.days16to90 || 0,
    data.treasury.days91to1Year || 0,
    data.treasury.years1to5 || 0,
    data.treasury.years5to10 || 0,
    data.treasury.years10AndOver || 0,
  ];
  
  const mbsValues = [
    data.mbs.within15Days || 0,
    data.mbs.days16to90 || 0,
    data.mbs.days91to1Year || 0,
    data.mbs.years1to5 || 0,
    data.mbs.years5to10 || 0,
    data.mbs.years10AndOver || 0,
  ];
  
  const categories = ['15일↓', '16-90일', '91일-1년', '1-5년', '5-10년', '10년↑'];
  const maxValue = Math.max(...treasuryValues, ...mbsValues, 1);
  
  return (
    <div className="space-y-6">
      <div className="text-sm text-gray-400 mb-4">
        만기별 증권 분포 · 단위: 백만 달러
      </div>
      
      {/* 테이블 */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-700">
            <tr>
              <th className="px-4 py-2 text-left text-sm">잔존만기</th>
              <th className="px-4 py-2 text-center text-sm">15일↓</th>
              <th className="px-4 py-2 text-center text-sm">16-90일</th>
              <th className="px-4 py-2 text-center text-sm">91일-1년</th>
              <th className="px-4 py-2 text-center text-sm">1-5년</th>
              <th className="px-4 py-2 text-center text-sm">5-10년</th>
              <th className="px-4 py-2 text-center text-sm">10년↑</th>
              <th className="px-4 py-2 text-right text-sm">합계</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-gray-700">
              <td className="px-4 py-2 text-sm">
                <div>미 국채</div>
                <div className="text-xs text-gray-500">Treasury</div>
              </td>
              <td className="px-4 py-2 text-center text-sm">{formatValue(data.treasury.within15Days)}</td>
              <td className="px-4 py-2 text-center text-sm">{formatValue(data.treasury.days16to90)}</td>
              <td className="px-4 py-2 text-center text-sm">{formatValue(data.treasury.days91to1Year)}</td>
              <td className="px-4 py-2 text-center text-sm">{formatValue(data.treasury.years1to5)}</td>
              <td className="px-4 py-2 text-center text-sm">{formatValue(data.treasury.years5to10)}</td>
              <td className="px-4 py-2 text-center text-sm">{formatValue(data.treasury.years10AndOver)}</td>
              <td className="px-4 py-2 text-right text-sm font-semibold">{formatValue(data.treasury.total)}</td>
            </tr>
            <tr className="border-t border-gray-700">
              <td className="px-4 py-2 text-sm">
                <div>MBS</div>
                <div className="text-xs text-gray-500">Mortgage-Backed</div>
              </td>
              <td className="px-4 py-2 text-center text-sm">{formatValue(data.mbs.within15Days)}</td>
              <td className="px-4 py-2 text-center text-sm">{formatValue(data.mbs.days16to90)}</td>
              <td className="px-4 py-2 text-center text-sm">{formatValue(data.mbs.days91to1Year)}</td>
              <td className="px-4 py-2 text-center text-sm">{formatValue(data.mbs.years1to5)}</td>
              <td className="px-4 py-2 text-center text-sm">{formatValue(data.mbs.years5to10)}</td>
              <td className="px-4 py-2 text-center text-sm">{formatValue(data.mbs.years10AndOver)}</td>
              <td className="px-4 py-2 text-right text-sm font-semibold">{formatValue(data.mbs.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      
      {/* 차트 */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold mb-4">만기별 분포</h3>
        <div className="space-y-4">
          {categories.map((cat, idx) => {
            const treasuryVal = treasuryValues[idx];
            const mbsVal = mbsValues[idx];
            const totalVal = treasuryVal + mbsVal;
            const treasuryWidth = maxValue > 0 ? (treasuryVal / maxValue) * 100 : 0;
            const mbsWidth = maxValue > 0 ? (mbsVal / maxValue) * 100 : 0;
            
            return (
              <div key={idx} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">{cat}</span>
                  <span className="text-gray-300">{formatValueB(totalVal)}</span>
                </div>
                <div className="flex h-8 rounded overflow-hidden">
                  <div
                    className="bg-blue-500 flex items-center justify-center text-white text-xs font-medium"
                    style={{ width: `${treasuryWidth}%` }}
                  >
                    {treasuryWidth > 5 && formatValueB(treasuryVal)}
                  </div>
                  <div
                    className="bg-green-500 flex items-center justify-center text-white text-xs font-medium"
                    style={{ width: `${mbsWidth}%` }}
                  >
                    {mbsWidth > 5 && formatValueB(mbsVal)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
