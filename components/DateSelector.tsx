'use client';

import { useState, useEffect } from 'react';

interface DateSelectorProps {
  onDateSelect: (date: string) => void;
  selectedDate: string;
  loading: boolean;
}

export function DateSelector({ onDateSelect, selectedDate, loading }: DateSelectorProps) {
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [loadingDates, setLoadingDates] = useState(false);

  useEffect(() => {
    const fetchDates = async () => {
      setLoadingDates(true);
      try {
        const response = await fetch('/api/h41/dates');
        const data = await response.json();
        if (data.ok && data.dates) {
          setAvailableDates(data.dates.map((d: any) => d.date));
        }
      } catch (error) {
        console.error('Failed to fetch dates:', error);
      } finally {
        setLoadingDates(false);
      }
    };

    fetchDates();
  }, []);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = e.target.value;
    if (date) {
      onDateSelect(date);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="date-input" className="text-sm text-gray-400">
        발표일:
      </label>
      <input
        id="date-input"
        type="date"
        value={selectedDate}
        onChange={handleDateChange}
        disabled={loading || loadingDates}
        className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white disabled:opacity-50"
        max={new Date().toISOString().split('T')[0]}
      />
      {loading && (
        <span className="text-sm text-gray-400">로딩 중...</span>
      )}
    </div>
  );
}
