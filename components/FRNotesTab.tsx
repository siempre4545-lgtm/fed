'use client';

import type { H4ReportFRNotes } from '@/lib/types';
import { formatNumber } from '@/lib/translations';

interface FRNotesTabProps {
  frNotes: H4ReportFRNotes;
}

export function FRNotesTab({ frNotes }: FRNotesTabProps) {
  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-bold mb-4">연방준비권 (FR Notes)</h3>
        {frNotes.rows.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p>연방준비권 데이터가 없습니다.</p>
            <p className="text-xs mt-2">H.4.1 PDF에서 연방준비권 정보를 추출하는 중입니다.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-400">항목</th>
                  <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">금액</th>
                </tr>
              </thead>
              <tbody>
                {frNotes.rows.map((row, idx) => (
                  <tr key={idx} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="px-4 py-2 text-sm">{row.label || '-'}</td>
                    <td className="px-4 py-2 text-sm text-right">{formatNumber(row.value || 0)}M</td>
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
