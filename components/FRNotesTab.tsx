'use client';

import type { H4ReportFRNotes } from '@/lib/types';
import { formatNumber } from '@/lib/translations';

interface FRNotesTabProps {
  frNotes: H4ReportFRNotes;
}

const bankNames = ['보스턴', '뉴욕', '필라델피아', '클리블랜드', '리치몬드', '애틀랜타', '시카고', '세인트루이스', '미니애폴리스', '캔자스시티', '댈러스', '샌프란시스코'];
const bankNamesEn = ['Boston', 'New York', 'Philadelphia', 'Cleveland', 'Richmond', 'Atlanta', 'Chicago', 'St. Louis', 'Minneapolis', 'Kansas City', 'Dallas', 'San Francisco'];

export function FRNotesTab({ frNotes }: FRNotesTabProps) {
  // 발행액, 담보, 금증서를 은행별로 그룹화
  const bankData: Record<string, { issueAmount: number; collateral: number; goldCertificate: number }> = {};
  
  for (const row of frNotes.rows) {
    const bankMatch = row.label.match(/^(.+?)\s*-\s*(.+)$/);
    if (bankMatch) {
      const bank = bankMatch[1];
      const type = bankMatch[2];
      
      if (!bankData[bank]) {
        bankData[bank] = { issueAmount: 0, collateral: 0, goldCertificate: 0 };
      }
      
      if (type === '발행액') bankData[bank].issueAmount = row.value;
      if (type === '담보') bankData[bank].collateral = row.value;
      if (type === '금 증서') bankData[bank].goldCertificate = row.value;
    }
  }
  
  return (
    <div className="space-y-6">
      <div className="mb-4">
        <h2 className="text-2xl font-bold mb-2">연방준비권 발행 및 담보</h2>
        <p className="text-sm text-gray-400">Federal Reserve Notes Outstanding and Collateral - 단위: 백만 달러</p>
      </div>
      
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        {Object.keys(bankData).length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p>연방준비권 데이터가 없습니다.</p>
            <p className="text-xs mt-2">H.4.1 PDF에서 연방준비권 정보를 추출하는 중입니다.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">연방준비은행</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-400">발행액</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-400">담보</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-400">금 증서</th>
                </tr>
              </thead>
              <tbody>
                {bankNames.map((bank, idx) => {
                  const data = bankData[bank];
                  if (!data) return null;
                  
                  return (
                    <tr key={bank} className="border-b border-gray-800 hover:bg-gray-800/50">
                      <td className="px-4 py-3 text-sm">
                        <div>{bank}</div>
                        <div className="text-xs text-gray-500">{bankNamesEn[idx]}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-right">{formatNumber(data.issueAmount)}</td>
                      <td className="px-4 py-3 text-sm text-right">{formatNumber(data.collateral)}</td>
                      <td className="px-4 py-3 text-sm text-right">{formatNumber(data.goldCertificate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
