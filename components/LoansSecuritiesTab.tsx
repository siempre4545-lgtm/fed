'use client';

import type { H4ReportLoansAndLending } from '@/lib/types';
import { formatNumber } from '@/lib/translations';

interface LoansSecuritiesTabProps {
  loansAndLending: H4ReportLoansAndLending;
}

export function LoansSecuritiesTab({ loansAndLending }: LoansSecuritiesTabProps) {
  return (
    <div className="space-y-6">
      <div className="mb-4">
        <h2 className="text-2xl font-bold mb-2">대출 및 증권 대출</h2>
        <p className="text-sm text-gray-400">Loans & Securities Lending · 단위: 백만 달러</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 대출 테이블 */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-bold mb-4">대출 Loans</h3>
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
                  <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">금액</th>
                  <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">주간 Δ</th>
                </tr>
              </thead>
              <tbody>
                {loansAndLending.loansTable.map((row, idx) => (
                  <tr key={idx} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="px-4 py-2 text-sm">
                      {row.label}
                      {row.label === '1차 신용' && (
                        <div className="text-xs text-gray-500 mt-1">Primary Credit</div>
                      )}
                      {row.label === '은행기간대출' && (
                        <div className="text-xs text-gray-500 mt-1">BTFP</div>
                      )}
                      {row.label === '대출 합계' && (
                        <div className="text-xs text-gray-500 mt-1">Total Loans</div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm text-right">{formatNumber(row.value || 0)}</td>
                    <td className={`px-4 py-2 text-sm text-right ${
                      (row.change || 0) > 0 ? 'text-red-400' : (row.change || 0) < 0 ? 'text-green-400' : 'text-gray-400'
                    }`}>
                      {row.change ? (row.change > 0 ? '+' : '') + formatNumber(row.change) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loansAndLending.loansTable.length > 0 && (
              <div className="mt-4 text-xs text-gray-500 space-y-1">
                <p>1차 신용: 재정 건전한 예금기관에 할인율로 제공</p>
                <p>BTFP: 2023년 은행위기 대응, 2024년 종료</p>
              </div>
            )}
          </div>
        )}
      </div>

        {/* 증권 대출 테이블 */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-bold mb-4">증권 대출 Securities Lending</h3>
        {loansAndLending.securitiesLendingTable.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p>증권 대출 데이터가 없습니다.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-400">유형</th>
                  <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">금액</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-400">설명</th>
                </tr>
              </thead>
              <tbody>
                {loansAndLending.securitiesLendingTable.map((row, idx) => (
                  <tr key={idx} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="px-4 py-2 text-sm">
                      {row.label}
                      {row.label === '익일물' && (
                        <div className="text-xs text-gray-500 mt-1">Overnight</div>
                      )}
                      {row.label === '기간물' && (
                        <div className="text-xs text-gray-500 mt-1">Term</div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm text-right">{formatNumber(row.value || 0)}</td>
                    <td className="px-4 py-2 text-sm text-gray-400">
                      {row.label === '익일물' ? '다음 영업일 만기' : row.label === '기간물' ? '특정 기간 지정' : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loansAndLending.securitiesLendingTable.length > 0 && (
              <div className="mt-4 text-xs text-gray-500">
                <p>SOMA 포트폴리오의 국채를 1차 딜러에게 대출하여 국채 시장 유동성 지원</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
