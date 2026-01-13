'use client';

import type { H4ReportMaturity } from '@/lib/types';
import { formatNumber } from '@/lib/translations';

interface MaturityTabProps {
  maturity: H4ReportMaturity;
}

export function MaturityTab({ maturity }: MaturityTabProps) {
  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-bold mb-4">만기 분포</h3>
        {maturity.buckets.length === 0 && maturity.tableRows.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p>만기 분포 데이터가 없습니다.</p>
            <p className="text-xs mt-2">H.4.1 PDF에서 만기 분포 정보를 추출하는 중입니다.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {maturity.buckets.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {maturity.buckets.map((bucket, idx) => (
                  <div key={idx} className="bg-gray-700 rounded-lg p-4">
                    <div className="text-sm text-gray-400 mb-1">{bucket.range}</div>
                    <div className="text-xl font-bold">{formatNumber(bucket.value)}M</div>
                    {bucket.percent !== undefined && (
                      <div className="text-xs text-gray-500 mt-1">{bucket.percent.toFixed(1)}%</div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {maturity.tableRows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-400">만기 구간</th>
                      <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">금액</th>
                      <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">비율</th>
                    </tr>
                  </thead>
                  <tbody>
                    {maturity.tableRows.map((row, idx) => (
                      <tr key={idx} className="border-b border-gray-800 hover:bg-gray-800/50">
                        <td className="px-4 py-2 text-sm">{row.range || row.label || '-'}</td>
                        <td className="px-4 py-2 text-sm text-right">{formatNumber(row.value || 0)}M</td>
                        <td className="px-4 py-2 text-sm text-right text-gray-400">
                          {row.percent ? `${row.percent.toFixed(1)}%` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
