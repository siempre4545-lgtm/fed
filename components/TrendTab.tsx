'use client';

import { useState } from 'react';
import type { H41ParsedData } from '@/lib/h41-parser';

export function TrendTab() {
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [data, setData] = useState<H41ParsedData[]>([]);
  const [loading, setLoading] = useState(false);
  
  const handleDateAdd = async (date: string) => {
    if (selectedDates.includes(date)) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/h41/release?date=${date}`);
      const result = await res.json();
      if (result.ok) {
        setSelectedDates([...selectedDates, date]);
        setData([...data, result]);
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
  
  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold mb-4">날짜 선택</h3>
        <div className="flex gap-2 flex-wrap">
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
          <input
            type="date"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleDateAdd((e.target as HTMLInputElement).value);
              }
            }}
            className="px-3 py-1 bg-gray-700 border border-gray-600 rounded text-white"
          />
        </div>
      </div>
      
      {data.length >= 2 && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold mb-4">추이 비교</h3>
          <div className="space-y-4">
            {data.map((d, idx) => (
              <div key={idx} className="border-t border-gray-700 pt-4">
                <div className="font-semibold mb-2">{d.date}</div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-gray-400">총 자산</div>
                    <div className="font-semibold">
                      {d.sections.overview.totalAssets !== null
                        ? `${(d.sections.overview.totalAssets / 1000).toFixed(1)}B`
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-400">지급준비금</div>
                    <div className="font-semibold">
                      {d.sections.overview.reserveBalances !== null
                        ? `${(d.sections.overview.reserveBalances / 1000).toFixed(1)}B`
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-400">TGA</div>
                    <div className="font-semibold">
                      {d.sections.overview.tga !== null
                        ? `${(d.sections.overview.tga / 1000).toFixed(1)}B`
                        : '—'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
