'use client';

import type { LendingSection } from '@/lib/h41-parser';

interface LendingTabProps {
  data: LendingSection;
}

function formatValue(value: number | null): string {
  if (value === null) return '데이터 없음';
  return `$${value.toLocaleString('en-US')}M`;
}

function formatChange(value: number | null): string {
  if (value === null) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value / 1000).toFixed(1)}B`;
}

function getChangeColor(value: number | null): string {
  if (value === null) return 'text-gray-400';
  if (value > 0) return 'text-green-400';
  if (value < 0) return 'text-red-400';
  return 'text-gray-400';
}

export function LendingTab({ data }: LendingTabProps) {
  return (
    <div className="space-y-6">
      <div className="text-sm text-gray-400 mb-4">
        대출 및 증권 대출 · 단위: 백만 달러
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 대출 Loans */}
        <div>
          <h3 className="text-lg font-semibold mb-4">대출 Loans</h3>
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-2 text-left text-sm">항목</th>
                  <th className="px-4 py-2 text-right text-sm">금액</th>
                  <th className="px-4 py-2 text-right text-sm">주간 △</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-700">
                  <td className="px-4 py-2 text-sm">1차 신용</td>
                  <td className="px-4 py-2 text-right text-sm">{formatValue(data.loans.primaryCredit)}</td>
                  <td className={`px-4 py-2 text-right text-sm ${getChangeColor(null)}`}>—</td>
                </tr>
                <tr className="border-t border-gray-700">
                  <td className="px-4 py-2 text-sm">은행기간대출</td>
                  <td className="px-4 py-2 text-right text-sm">{formatValue(data.loans.btfp)}</td>
                  <td className={`px-4 py-2 text-right text-sm ${getChangeColor(null)}`}>—</td>
                </tr>
                <tr className="border-t-2 border-gray-600 font-semibold">
                  <td className="px-4 py-2 text-sm">대출 합계</td>
                  <td className="px-4 py-2 text-right text-sm">{formatValue(data.loans.total)}</td>
                  <td className={`px-4 py-2 text-right text-sm ${getChangeColor(null)}`}>—</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-4 text-xs text-gray-400 space-y-1">
            <div>1차 신용: 재정 건전한 예금기관에 할인율로 제공</div>
            <div>BTFP: 2023년 은행위기 대응, 2024년 종료</div>
          </div>
        </div>
        
        {/* 증권 대출 Securities Lending */}
        <div>
          <h3 className="text-lg font-semibold mb-4">증권 대출 Securities Lending</h3>
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-2 text-left text-sm">유형</th>
                  <th className="px-4 py-2 text-right text-sm">금액</th>
                  <th className="px-4 py-2 text-left text-sm">설명</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-700">
                  <td className="px-4 py-2 text-sm">익일물</td>
                  <td className="px-4 py-2 text-right text-sm">{formatValue(data.securitiesLending.overnight)}</td>
                  <td className="px-4 py-2 text-sm text-gray-400">다음 영업일 만기</td>
                </tr>
                <tr className="border-t border-gray-700">
                  <td className="px-4 py-2 text-sm">기간물</td>
                  <td className="px-4 py-2 text-right text-sm">{formatValue(data.securitiesLending.term)}</td>
                  <td className="px-4 py-2 text-sm text-gray-400">특정 기간 지정</td>
                </tr>
                <tr className="border-t-2 border-gray-600 font-semibold">
                  <td className="px-4 py-2 text-sm">합계</td>
                  <td className="px-4 py-2 text-right text-sm">
                    {formatValue(
                      (data.securitiesLending.overnight || 0) + (data.securitiesLending.term || 0)
                    )}
                  </td>
                  <td className="px-4 py-2 text-sm"></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-4 text-xs text-gray-400">
            SOMA 포트폴리오의 국채를 1차 딜러에게 대출하여 국채 시장 유동성 지원
          </div>
        </div>
      </div>
    </div>
  );
}
