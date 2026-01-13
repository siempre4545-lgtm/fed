'use client';

import type { H4ReportRegionalFed } from '@/lib/types';
import { formatNumber } from '@/lib/translations';

interface RegionalFedTabProps {
  regionalFed: H4ReportRegionalFed;
}

export function RegionalFedTab({ regionalFed }: RegionalFedTabProps) {
  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-bold mb-4">지역 연준별 데이터</h3>
        {regionalFed.rows.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p>지역 연준 데이터가 없습니다.</p>
            <p className="text-xs mt-2">H.4.1 PDF에서 지역별 데이터를 추출하는 중입니다.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-700">
                  {regionalFed.columns.map((col, idx) => (
                    <th key={idx} className="px-4 py-2 text-left text-sm font-medium text-gray-400">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {regionalFed.rows.map((row, idx) => (
                  <tr key={idx} className="border-b border-gray-800 hover:bg-gray-800/50">
                    {regionalFed.columns.map((col, colIdx) => {
                      const value = row[col] || row[colIdx] || '-';
                      const isNumeric = typeof value === 'number';
                      return (
                        <td key={colIdx} className={`px-4 py-2 text-sm ${isNumeric ? 'text-right' : ''}`}>
                          {isNumeric ? formatNumber(value) : String(value)}
                        </td>
                      );
                    })}
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
