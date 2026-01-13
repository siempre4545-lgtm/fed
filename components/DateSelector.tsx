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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDates = async () => {
      setLoadingDates(true);
      setError(null);
      try {
        const response = await fetch('/api/h41/dates', {
          cache: 'no-store',
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch dates: ${response.status} ${response.statusText}`);
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType?.includes('application/json')) {
          const text = await response.text();
          throw new Error(`Invalid content type: ${contentType}. Response: ${text.substring(0, 200)}`);
        }
        
        const data = await response.json();
        if (data.ok && data.dates && Array.isArray(data.dates)) {
          setAvailableDates(data.dates.map((d: any) => d.date));
        } else {
          throw new Error('Invalid dates response format');
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('Failed to fetch dates:', errorMsg);
        setError(errorMsg);
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
      {error && (
        <span className="text-sm text-red-400" title={error}>
          ⚠️
        </span>
      )}
    </div>
  );
}
