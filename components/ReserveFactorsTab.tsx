'use client';

import { useEffect } from 'react';
import type { H4ReportFactors } from '@/lib/types';
import { formatNumber, formatChange } from '@/lib/translations';

interface ReserveFactorsTabProps {
  factors: H4ReportFactors;
}

export function ReserveFactorsTab({ factors }: ReserveFactorsTabProps) {
  // 항목 수 검증 (개발 모드에서만)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const expectedSupplying = 13;
      const expectedAbsorbing = 4;
      
      if (factors.supplying.length !== expectedSupplying) {
        console.warn(`[ReserveFactorsTab] Supplying items count mismatch: expected ${expectedSupplying}, got ${factors.supplying.length}`);
      }
      
      if (factors.absorbing.length !== expectedAbsorbing) {
        console.warn(`[ReserveFactorsTab] Absorbing items count mismatch: expected ${expectedAbsorbing}, got ${factors.absorbing.length}`);
      }
      
      // totals가 0인지 확인
      if (factors.totals.supplying === 0 && factors.supplying.length > 0) {
        console.warn('[ReserveFactorsTab] Total supplying is 0 but supplying items exist');
      }
      
      if (factors.totals.absorbing === 0 && factors.absorbing.length > 0) {
        console.warn('[ReserveFactorsTab] Total absorbing is 0 but absorbing items exist');
      }
      
      if (factors.totals.net === 0 && (factors.totals.supplying !== 0 || factors.totals.absorbing !== 0)) {
        console.warn('[ReserveFactorsTab] Reserve balances (net) is 0 but totals are non-zero');
      }
    }
  }, [factors]);
  
  // 디버그 배지 (개발 모드에서만 표시)
  const showDebugBadge = process.env.NODE_ENV === 'development' && 
    (factors.supplying.length !== 13 || factors.absorbing.length !== 4);
  
  return (
    <div className="space-y-6">
      <div className="mb-4">
        <h2 className="text-2xl font-bold mb-2">준비금 요인</h2>
        <p className="text-sm text-gray-400">Factors Affecting Reserve Balances · 단위: 백만 달러</p>
        {showDebugBadge && (
          <div className="mt-2 px-3 py-1 bg-yellow-500/20 border border-yellow-500/50 rounded text-xs text-yellow-400">
            ⚠️ 항목 수 불일치: 공급 {factors.supplying.length}/13, 흡수 {factors.absorbing.length}/4
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 공급 요인 */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-bold mb-4">공급 요인 SUPPLYING</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-400">항목</th>
                  <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">잔액</th>
                  <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">주간 Δ</th>
                  <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">연간 Δ</th>
                </tr>
              </thead>
              <tbody>
                {factors.supplying.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                      데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  factors.supplying.map((row, idx) => (
                    <tr key={idx} className="border-b border-gray-800 hover:bg-gray-800/50">
                      <td className="px-4 py-2 text-sm">{row.label}</td>
                      <td className="px-4 py-2 text-sm text-right">{formatNumber(row.value)}</td>
                      <td className={`px-4 py-2 text-sm text-right ${
                        row.change > 0 ? 'text-green-400' : row.change < 0 ? 'text-red-400' : 'text-gray-400'
                      }`}>
                        {formatChange(row.change, row.changePercent)}
                      </td>
                      <td className={`px-4 py-2 text-sm text-right ${
                        row.yearlyChange > 0 ? 'text-green-400' : row.yearlyChange < 0 ? 'text-red-400' : 'text-gray-400'
                      }`}>
                        {formatChange(row.yearlyChange, row.yearlyChangePercent)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 흡수 요인 */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-bold mb-4">흡수 요인 ABSORBING</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-400">항목</th>
                  <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">잔액</th>
                  <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">주간 Δ</th>
                  <th className="px-4 py-2 text-right text-sm font-medium text-gray-400">연간 Δ</th>
                </tr>
              </thead>
              <tbody>
                {factors.absorbing.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                      데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  factors.absorbing.map((row, idx) => (
                    <tr key={idx} className="border-b border-gray-800 hover:bg-gray-800/50">
                      <td className="px-4 py-2 text-sm">{row.label}</td>
                      <td className="px-4 py-2 text-sm text-right">{formatNumber(row.value)}</td>
                      <td className={`px-4 py-2 text-sm text-right ${
                        row.change > 0 ? 'text-green-400' : row.change < 0 ? 'text-red-400' : 'text-gray-400'
                      }`}>
                        {formatChange(row.change, row.changePercent)}
                      </td>
                      <td className={`px-4 py-2 text-sm text-right ${
                        row.yearlyChange > 0 ? 'text-green-400' : row.yearlyChange < 0 ? 'text-red-400' : 'text-gray-400'
                      }`}>
                        {formatChange(row.yearlyChange, row.yearlyChangePercent)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 합계 카드 - API totals를 그대로 사용 (FE에서 재계산 금지, 원문 공식 합계값만 표시) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="text-sm text-gray-400 mb-1">공급 총합</div>
          <div className="text-xs text-gray-500 mb-1">Total factors supplying reserve funds</div>
          {factors.totals.supplying === 0 && factors.supplying.length > 0 && factors.supplying.some(r => r.value !== 0) ? (
            <div className="text-sm text-red-400">⚠️ 공식 합계 파싱 실패</div>
          ) : (
            <>
              <div className="text-2xl font-bold mb-2">{formatNumber(factors.totals.supplying)}</div>
              <div className="space-y-1">
                <div className={`text-sm ${
                  factors.totals.supplyingWeeklyChange > 0 ? 'text-green-400' : factors.totals.supplyingWeeklyChange < 0 ? 'text-red-400' : 'text-gray-400'
                }`}>
                  주간: {formatChange(factors.totals.supplyingWeeklyChange, factors.totals.supplying ? (factors.totals.supplyingWeeklyChange / factors.totals.supplying) * 100 : 0)}
                </div>
                <div className={`text-sm ${
                  factors.totals.supplyingYearlyChange > 0 ? 'text-green-400' : factors.totals.supplyingYearlyChange < 0 ? 'text-red-400' : 'text-gray-400'
                }`}>
                  연간: {formatChange(factors.totals.supplyingYearlyChange, factors.totals.supplying ? (factors.totals.supplyingYearlyChange / factors.totals.supplying) * 100 : 0)}
                </div>
              </div>
            </>
          )}
        </div>
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="text-sm text-gray-400 mb-1">흡수 총합</div>
          <div className="text-xs text-gray-500 mb-1">Total factors, other than reserve balances, absorbing reserve funds</div>
          {factors.totals.absorbing === 0 && factors.absorbing.length > 0 && factors.absorbing.some(r => r.value !== 0) ? (
            <div className="text-sm text-red-400">⚠️ 공식 합계 파싱 실패</div>
          ) : (
            <>
              <div className="text-2xl font-bold mb-2">{formatNumber(factors.totals.absorbing)}</div>
              <div className="space-y-1">
                <div className={`text-sm ${
                  factors.totals.absorbingWeeklyChange > 0 ? 'text-green-400' : factors.totals.absorbingWeeklyChange < 0 ? 'text-red-400' : 'text-gray-400'
                }`}>
                  주간: {formatChange(factors.totals.absorbingWeeklyChange, factors.totals.absorbing ? (factors.totals.absorbingWeeklyChange / factors.totals.absorbing) * 100 : 0)}
                </div>
                <div className={`text-sm ${
                  factors.totals.absorbingYearlyChange > 0 ? 'text-green-400' : factors.totals.absorbingYearlyChange < 0 ? 'text-red-400' : 'text-gray-400'
                }`}>
                  연간: {formatChange(factors.totals.absorbingYearlyChange, factors.totals.absorbing ? (factors.totals.absorbingYearlyChange / factors.totals.absorbing) * 100 : 0)}
                </div>
              </div>
            </>
          )}
        </div>
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="text-sm text-gray-400 mb-1">지급준비금</div>
          <div className="text-xs text-gray-500 mb-1">Reserve balances with Federal Reserve Banks</div>
          {factors.totals.net === 0 && (factors.totals.supplying !== 0 || factors.totals.absorbing !== 0) ? (
            <div className="text-sm text-red-400">⚠️ 공식 합계 파싱 실패</div>
          ) : (
            <>
              <div className={`text-2xl font-bold mb-2 ${
                factors.totals.net > 0 ? 'text-green-400' : factors.totals.net < 0 ? 'text-red-400' : 'text-gray-400'
              }`}>
                {formatNumber(factors.totals.net)}
              </div>
              <div className="space-y-1">
                <div className={`text-sm ${
                  factors.totals.netWeeklyChange > 0 ? 'text-green-400' : factors.totals.netWeeklyChange < 0 ? 'text-red-400' : 'text-gray-400'
                }`}>
                  주간: {formatChange(factors.totals.netWeeklyChange, factors.totals.net ? (factors.totals.netWeeklyChange / factors.totals.net) * 100 : 0)}
                </div>
                <div className={`text-sm ${
                  factors.totals.netYearlyChange > 0 ? 'text-green-400' : factors.totals.netYearlyChange < 0 ? 'text-red-400' : 'text-gray-400'
                }`}>
                  연간: {formatChange(factors.totals.netYearlyChange, factors.totals.net ? (factors.totals.netYearlyChange / factors.totals.net) * 100 : 0)}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
