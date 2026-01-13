'use client';

import { useState, useEffect } from 'react';
import { SettingsPanel } from '@/components/SettingsPanel';
import { DateSelector } from '@/components/DateSelector';
import { Tabs } from '@/components/Tabs';
import { DebugPanel } from '@/components/DebugPanel';

export default function FedDashboardPage() {
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [showSettings, setShowSettings] = useState(false);
  const [debugMode, setDebugMode] = useState(false);

  // URL에서 debug 파라미터 확인
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('debugUI') === '1') {
      setDebugMode(true);
    }
  }, []);

  const handleDateSelect = async (date: string) => {
    if (!date) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/h41/report?date=${date}`);
      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to fetch report');
      }

      setReportData(data);
      setSelectedDate(date);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setReportData(null);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'overview', label: '개요' },
    { id: 'reserve-factors', label: '준비금요인' },
    { id: 'factors-summary', label: '요인요약' },
    { id: 'maturity', label: '만기분포' },
    { id: 'loans-securities', label: '대출·증권' },
    { id: 'statement', label: '재무제표' },
    { id: 'regional', label: '지역연준' },
    { id: 'federal-reserve', label: '연방준비권' },
    { id: 'trend', label: '추이' },
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">FED H.4.1 Dashboard</h1>
            <p className="text-sm text-gray-400 mt-1">
              {reportData?.releaseDate && `Release: ${reportData.releaseDate}`}
              {reportData?.weekEnded && ` · Week ended: ${reportData.weekEnded}`}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <DateSelector
              onDateSelect={handleDateSelect}
              selectedDate={selectedDate}
              loading={loading}
            />
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              설정
            </button>
          </div>
        </div>
      </header>

      {/* Settings Panel */}
      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} />
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-lg">
            <p className="text-red-200">{error}</p>
          </div>
        )}

        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
            <p className="mt-4 text-gray-400">데이터를 불러오는 중...</p>
          </div>
        )}

        {!loading && !error && reportData && (
          <>
            <Tabs
              tabs={tabs}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              reportData={reportData}
              selectedDate={selectedDate}
            />
          </>
        )}

        {!loading && !error && !reportData && (
          <div className="text-center py-12">
            <p className="text-gray-400">날짜를 선택하여 리포트를 불러오세요.</p>
          </div>
        )}

        {/* Debug Panel */}
        {debugMode && (
          <DebugPanel
            reportData={reportData}
            selectedDate={selectedDate}
            loading={loading}
            error={error}
          />
        )}
      </main>
    </div>
  );
}
