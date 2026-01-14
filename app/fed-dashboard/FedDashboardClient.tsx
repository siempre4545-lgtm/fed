'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { H41ParsedData } from '@/lib/h41-parser';
import { OverviewTab } from '@/components/OverviewTab';
import { ReserveFactorsTab } from '@/components/ReserveFactorsTab';
import { FactorsSummaryTab } from '@/components/FactorsSummaryTab';
import { MaturityTab } from '@/components/MaturityTab';
import { LendingTab } from '@/components/LendingTab';
import { StatementTab } from '@/components/StatementTab';
import { TrendTab } from '@/components/TrendTab';
import { DateSelector } from '@/components/DateSelector';
import { SettingsPanel } from '@/components/SettingsPanel';

const TABS = [
  { id: 'overview', label: '개요' },
  { id: 'factors', label: '준비금 요인' },
  { id: 'summary', label: '요인 요약' },
  { id: 'maturity', label: '만기 분포' },
  { id: 'lending', label: '대출/증권' },
  { id: 'statement', label: '재무제표' },
  { id: 'trend', label: '추이' },
] as const;

type TabId = typeof TABS[number]['id'];

export default function FedDashboardClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [date, setDate] = useState<string>(() => {
    const paramDate = searchParams.get('date');
    if (paramDate) return paramDate;
    // 기본값: 오늘 날짜
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });
  
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const paramTab = searchParams.get('tab') as TabId;
    return paramTab && TABS.some(t => t.id === paramTab) ? paramTab : 'overview';
  });
  
  const [data, setData] = useState<H41ParsedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiUrl, setApiUrl] = useState<string>('');
  const [apiResponse, setApiResponse] = useState<{ ok: boolean; warnings?: string[]; error?: string } | null>(null);
  
  // 최신 날짜 가져오기
  useEffect(() => {
    const fetchLatest = async () => {
      try {
        const res = await fetch('/api/h41/latest');
        const result = await res.json();
        if (result.ok && result.date) {
          setDate(result.date);
          updateURL(result.date, activeTab);
        }
      } catch (err) {
        console.error('Failed to fetch latest date:', err);
      }
    };
    
    fetchLatest();
  }, []);
  
  // 데이터 로드
  useEffect(() => {
    if (!date) return;
    
    setLoading(true);
    setError(null);
    const url = `/api/h41/release?date=${date}`;
    setApiUrl(url);
    
    fetch(url)
      .then(res => res.json())
      .then((result: H41ParsedData) => {
        setData(result);
        setApiResponse({
          ok: result.ok,
          warnings: result.warnings,
          error: result.ok ? undefined : result.warnings.join(', ') || 'Failed to parse data',
        });
        if (!result.ok) {
          setError(result.warnings.join(', ') || 'Failed to parse data');
        }
      })
      .catch(err => {
        const errorMsg = err.message || 'Failed to load data';
        setError(errorMsg);
        setApiResponse({
          ok: false,
          error: errorMsg,
        });
        setData(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [date]);
  
  const updateURL = (newDate: string, newTab: TabId) => {
    const params = new URLSearchParams();
    params.set('date', newDate);
    params.set('tab', newTab);
    router.push(`/fed-dashboard?${params.toString()}`);
  };
  
  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    updateURL(newDate, activeTab);
  };
  
  const handleTabChange = (newTab: TabId) => {
    setActiveTab(newTab);
    updateURL(date, newTab);
  };
  
  // 날짜가 선택되지 않았을 때만 날짜 선택 UI 표시
  if (!date) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-3xl font-bold">Fed Dashboard 연준 대차대조표</h1>
              <div className="flex items-center gap-4">
                <Link 
                  href="https://fedreportsh.vercel.app/"
                  className="px-4 py-2 bg-gray-800 border border-gray-700 rounded hover:bg-gray-700 text-sm"
                >
                  돌아가기
                </Link>
                <SettingsPanel />
              </div>
            </div>
          </div>
          
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="bg-gray-800 rounded-lg p-8 border border-gray-700 max-w-md w-full">
              <h2 className="text-2xl font-semibold mb-4 text-center">날짜 선택</h2>
              <p className="text-gray-400 mb-6 text-center">
                데이터를 보려면 날짜를 선택하세요
              </p>
              <DateSelector value={date} onChange={handleDateChange} />
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold">Fed Dashboard 연준 대차대조표</h1>
            <div className="flex items-center gap-4">
              <Link 
                href="https://fedreportsh.vercel.app/"
                className="px-4 py-2 bg-gray-800 border border-gray-700 rounded hover:bg-gray-700 text-sm"
              >
                돌아가기
              </Link>
              <SettingsPanel />
            </div>
          </div>
          
          <div className="flex items-center gap-4 mb-4">
            <div>
              <span className="text-gray-400">발표일: </span>
              <span className="font-semibold">{data?.releaseDate || '—'}</span>
            </div>
            <div>
              <span className="text-gray-400">기준일: </span>
              <span className="font-semibold">{data?.weekEnded || '—'}</span>
            </div>
          </div>
          
          <DateSelector value={date} onChange={handleDateChange} />
        </div>
        
        {/* Tabs */}
        <div className="mb-6 border-b border-gray-700">
          <div className="flex gap-4">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'border-b-2 border-blue-500 text-blue-400'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        
        {/* 디버그 패널 (개발 모드만) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="bg-gray-800 rounded-lg p-4 mb-6 border border-gray-700 text-xs">
            <div className="font-semibold mb-2 text-yellow-400">🔍 디버그 정보 (개발 모드)</div>
            <div className="space-y-1 text-gray-300">
              <div>선택 날짜: {date}</div>
              <div>API URL: {apiUrl || '—'}</div>
              <div>로딩 중: {loading ? 'true' : 'false'}</div>
              <div>데이터 있음: {data ? 'true' : 'false'}</div>
              <div>응답 OK: {apiResponse?.ok !== undefined ? String(apiResponse.ok) : '—'}</div>
              {apiResponse?.warnings && apiResponse.warnings.length > 0 && (
                <div>
                  경고 ({apiResponse.warnings.length}개): {apiResponse.warnings.slice(0, 3).join('; ')}
                  {apiResponse.warnings.length > 3 && ` ... (+${apiResponse.warnings.length - 3}개)`}
                </div>
              )}
              {apiResponse?.error && (
                <div className="text-red-400">오류: {apiResponse.error}</div>
              )}
            </div>
          </div>
        )}
        
        {/* Content */}
        {loading && (
          <div className="text-center py-12">
            <div className="text-gray-400 text-lg">데이터를 불러오는 중...</div>
            <div className="text-gray-500 text-sm mt-2">잠시만 기다려주세요</div>
          </div>
        )}
        
        {!loading && error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6">
            <div className="text-red-400 font-semibold mb-2">⚠️ 오류 발생</div>
            <div className="text-red-300">{error}</div>
            <div className="mt-4 text-sm text-gray-400">
              날짜를 다시 선택하거나 다른 날짜를 시도해보세요.
            </div>
          </div>
        )}
        
        {!loading && !error && !data && (
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 mb-6">
            <div className="text-yellow-400 font-semibold mb-2">⚠️ 데이터 없음</div>
            <div className="text-yellow-300">
              선택한 날짜({date})에 대한 데이터를 찾을 수 없습니다.
            </div>
            <div className="mt-4 text-sm text-gray-400">
              다른 날짜를 선택해보세요.
            </div>
          </div>
        )}
        
        {data && !loading && (
          <>
            {data.warnings.length > 0 && (
              <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 mb-6">
                <div className="text-yellow-400">⚠️ 경고: {data.warnings.join('; ')}</div>
              </div>
            )}
            
            {activeTab === 'overview' && <OverviewTab data={data.sections.overview} />}
            {activeTab === 'factors' && <ReserveFactorsTab data={data.sections.factors} />}
            {activeTab === 'summary' && <FactorsSummaryTab data={data.sections.summary} />}
            {activeTab === 'maturity' && <MaturityTab data={data.sections.maturity} />}
            {activeTab === 'lending' && <LendingTab data={data.sections.lending} />}
            {activeTab === 'statement' && <StatementTab data={data.sections.statement} />}
            {activeTab === 'trend' && <TrendTab />}
          </>
        )}
      </div>
    </div>
  );
}
