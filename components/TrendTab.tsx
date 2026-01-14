'use client';

import { useState } from 'react';
import type { H41ParsedData } from '@/lib/h41-parser';

function formatValue(value: number | null): string {
  if (value === null) return '데이터 없음';
  return `$${value.toLocaleString('en-US')}M`;
}

function formatNumber(value: number | null): string {
  if (value === null) return '—';
  return `${(value / 1000).toFixed(1)}B`;
}

export function TrendTab() {
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [data, setData] = useState<H41ParsedData[]>([]);
  const [loading, setLoading] = useState(false);
  const [newDate, setNewDate] = useState('');
  
  const handleDateAdd = async (date: string) => {
    if (!date || selectedDates.includes(date)) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/h41/release?date=${date}`);
      const result = await res.json();
      if (result.ok) {
        setSelectedDates([...selectedDates, date]);
        setData([...data, result]);
        setNewDate('');
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };
  
  const handleDateRemove = (date: string) => {
    const idx = selectedDates.indexOf(date);
    if (idx >= 0) {
      setSelectedDates(selectedDates.filter(d => d !== date));
      setData(data.filter((_, i) => i !== idx));
    }
  };
  
  // 자산 구성 비율 계산
  const calculateComposition = (d: H41ParsedData) => {
    const total = d.sections.overview.totalAssetsForComposition || 0;
    const treasury = d.sections.overview.treasurySecurities || 0;
    const mbs = d.sections.overview.mortgageBackedSecurities || 0;
    const other = d.sections.overview.otherAssets || 0;
    
    return {
      treasuryRatio: total > 0 ? ((treasury / total) * 100).toFixed(1) : '0.0',
      mbsRatio: total > 0 ? ((mbs / total) * 100).toFixed(1) : '0.0',
      otherRatio: total > 0 ? ((other / total) * 100).toFixed(1) : '0.0',
      total,
    };
  };
  
  if (data.length < 2) {
    return (
      <div className="space-y-6">
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold mb-4">날짜 선택</h3>
          <div className="flex gap-2 flex-wrap items-center mb-4">
            {selectedDates.map(date => (
              <div key={date} className="flex items-center gap-2 px-3 py-1 bg-gray-700 rounded">
                <span>{date}</span>
                <button
                  onClick={() => handleDateRemove(date)}
                  className="text-red-400 hover:text-red-300"
                >
                  ×
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newDate) {
                    handleDateAdd(newDate);
                  }
                }}
                className="px-3 py-1 bg-gray-700 border border-gray-600 rounded text-white"
              />
              <button
                onClick={() => newDate && handleDateAdd(newDate)}
                disabled={loading || !newDate}
                className="px-4 py-1 bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
              >
                추가
              </button>
            </div>
          </div>
          {loading && <div className="text-gray-400">데이터를 불러오는 중...</div>}
        </div>
        
        {data.length === 1 && (
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4">
            <div className="text-yellow-400 font-semibold mb-2">⚠️ 데이터 부족</div>
            <div className="text-yellow-300">
              추이 차트를 보려면 최소 2개 이상의 데이터가 필요합니다.
            </div>
            <div className="text-sm text-gray-400 mt-2">
              현재 저장된 데이터: {data.length}개
            </div>
          </div>
        )}
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold mb-4">날짜 선택</h3>
        <div className="flex gap-2 flex-wrap items-center mb-4">
          {selectedDates.map(date => (
            <div key={date} className="flex items-center gap-2 px-3 py-1 bg-gray-700 rounded">
              <span>{date}</span>
              <button
                onClick={() => handleDateRemove(date)}
                className="text-red-400 hover:text-red-300"
              >
                ×
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newDate) {
                  handleDateAdd(newDate);
                }
              }}
              className="px-3 py-1 bg-gray-700 border border-gray-600 rounded text-white"
            />
            <button
              onClick={() => newDate && handleDateAdd(newDate)}
              disabled={loading || !newDate}
              className="px-4 py-1 bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
            >
              추가
            </button>
          </div>
        </div>
        {loading && <div className="text-gray-400">데이터를 불러오는 중...</div>}
      </div>
      
      {/* 추이 비교 */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold mb-4">추이 비교</h3>
        <div className="space-y-6">
          {data.map((d, idx) => {
            const composition = calculateComposition(d);
            return (
              <div key={idx} className="border-t border-gray-700 pt-6 first:border-t-0 first:pt-0">
                <div className="font-semibold mb-4 text-lg">{d.date}</div>
                
                {/* 6개 카드 */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
                  <div className="bg-gray-700 rounded p-3">
                    <div className="text-xs text-gray-400 mb-1">총 자산</div>
                    <div className="text-sm font-semibold">{formatValue(d.sections.overview.totalAssets)}</div>
                  </div>
                  <div className="bg-gray-700 rounded p-3">
                    <div className="text-xs text-gray-400 mb-1">보유 증권</div>
                    <div className="text-sm font-semibold">{formatValue(d.sections.overview.securities)}</div>
                  </div>
                  <div className="bg-gray-700 rounded p-3">
                    <div className="text-xs text-gray-400 mb-1">지급준비금</div>
                    <div className="text-sm font-semibold">{formatValue(d.sections.overview.reserveBalances)}</div>
                  </div>
                  <div className="bg-gray-700 rounded p-3">
                    <div className="text-xs text-gray-400 mb-1">TGA</div>
                    <div className="text-sm font-semibold">{formatValue(d.sections.overview.tga)}</div>
                  </div>
                  <div className="bg-gray-700 rounded p-3">
                    <div className="text-xs text-gray-400 mb-1">역레포</div>
                    <div className="text-sm font-semibold">{formatValue(d.sections.overview.reverseRepos)}</div>
                  </div>
                  <div className="bg-gray-700 rounded p-3">
                    <div className="text-xs text-gray-400 mb-1">유통 통화</div>
                    <div className="text-sm font-semibold">{formatValue(d.sections.overview.currency)}</div>
                  </div>
                </div>
                
                {/* 자산 구성 */}
                <div className="bg-gray-700 rounded p-4">
                  <div className="text-sm font-semibold mb-2">자산 구성</div>
                  <div className="flex h-8 rounded overflow-hidden mb-2">
                    <div
                      className="bg-blue-500 flex items-center justify-center text-white text-xs font-medium"
                      style={{ width: `${composition.treasuryRatio}%` }}
                    >
                      {parseFloat(composition.treasuryRatio) > 5 && `국채 ${composition.treasuryRatio}%`}
                    </div>
                    <div
                      className="bg-green-500 flex items-center justify-center text-white text-xs font-medium"
                      style={{ width: `${composition.mbsRatio}%` }}
                    >
                      {parseFloat(composition.mbsRatio) > 5 && `MBS ${composition.mbsRatio}%`}
                    </div>
                    <div
                      className="bg-gray-600 flex items-center justify-center text-white text-xs font-medium"
                      style={{ width: `${composition.otherRatio}%` }}
                    >
                      {parseFloat(composition.otherRatio) > 5 && `기타 ${composition.otherRatio}%`}
                    </div>
                  </div>
                  <div className="text-xs text-gray-400">
                    총 자산: {formatNumber(composition.total)}
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
