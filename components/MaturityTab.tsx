'use client';

import type { H4ReportMaturity } from '@/lib/types';
import { formatNumber, formatMillions } from '@/lib/translations';

interface MaturityTabProps {
  maturity: H4ReportMaturity;
}

export function MaturityTab({ maturity }: MaturityTabProps) {
  const maturityRanges = ['15일↓', '16-90일', '91일-1년', '1-5년', '5-10년', '10년↑'];
  
  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-xl font-bold mb-2">만기별 증권 분포</h3>
        <p className="text-sm text-gray-400 mb-6">Maturity Distribution · 단위: 백만 달러</p>
        
        {maturity.tableRows.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p>만기 분포 데이터가 없습니다.</p>
            <p className="text-xs mt-2">H.4.1 PDF에서 만기 분포 정보를 추출하는 중입니다.</p>
          </div>
        ) : (
          <>
            {/* 테이블 */}
            <div className="overflow-x-auto mb-6">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">잔존만기</th>
                    {maturityRanges.map((range) => (
                      <th key={range} className="px-4 py-3 text-right text-sm font-medium text-gray-400">
                        {range}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-400">합계</th>
                  </tr>
                </thead>
                <tbody>
                  {maturity.tableRows.map((row, idx) => (
                    <tr key={idx} className="border-b border-gray-800 hover:bg-gray-800/50">
                      <td className="px-4 py-3 text-sm">
                        <div>{row.label}</div>
                        {row.label === '미 국채' && (
                          <div className="text-xs text-gray-500">Treasury</div>
                        )}
                        {row.label === 'MBS' && (
                          <div className="text-xs text-gray-500">Mortgage-Backed</div>
                        )}
                      </td>
                      {maturityRanges.map((range) => (
                        <td key={range} className="px-4 py-3 text-sm text-right">
                          {formatNumber(row.buckets[range] || 0)}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-sm text-right font-medium">
                        {formatNumber(row.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* 바 차트 */}
            <div className="mt-8">
              <h4 className="text-sm font-medium text-gray-400 mb-4">만기 구간별 합계</h4>
              <div className="flex items-end gap-2 h-64">
                {maturityRanges.map((range) => {
                  const total = maturity.tableRows.reduce((sum, row) => sum + (row.buckets[range] || 0), 0);
                  const maxValue = Math.max(...maturityRanges.map(r => 
                    maturity.tableRows.reduce((sum, row) => sum + (row.buckets[r] || 0), 0)
                  ));
                  const height = maxValue > 0 ? (total / maxValue) * 100 : 0;
                  
                  return (
                    <div key={range} className="flex-1 flex flex-col items-center">
                      <div className="w-full flex flex-col items-center justify-end" style={{ height: '240px' }}>
                        <div
                          className="w-full rounded-t"
                          style={{
                            height: `${height}%`,
                            background: 'linear-gradient(180deg, #4ade80 0%, #22c55e 50%, #16a34a 100%)',
                            minHeight: total > 0 ? '4px' : '0',
                          }}
                        />
                      </div>
                      <div className="mt-2 text-center">
                        <div className="text-xs text-gray-400 mb-1">{range}</div>
                        <div className="text-sm font-medium">
                          ${formatMillions(total).replace('M', 'B').replace('T', 'T')}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
