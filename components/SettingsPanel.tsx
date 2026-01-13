'use client';

import { useState, useEffect } from 'react';

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [fontFamily, setFontFamily] = useState<'ibm-plex' | 'noto-sans' | 'inter'>('ibm-plex');

  useEffect(() => {
    // SSR/CSR mismatch 방지: 클라이언트에서만 실행
    if (typeof window === 'undefined') return;
    
    // localStorage에서 설정 불러오기
    const savedTheme = localStorage.getItem('theme') as 'dark' | 'light' | null;
    const savedFontSize = localStorage.getItem('fontSize') as 'small' | 'medium' | 'large' | null;
    const savedFontFamily = localStorage.getItem('fontFamily') as 'ibm-plex' | 'noto-sans' | 'inter' | null;

    if (savedTheme) setTheme(savedTheme);
    if (savedFontSize) setFontSize(savedFontSize);
    if (savedFontFamily) setFontFamily(savedFontFamily);
  }, []);

  useEffect(() => {
    // SSR/CSR mismatch 방지: 클라이언트에서만 실행
    if (typeof window === 'undefined') return;
    
    // 설정 적용
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.setProperty('--font-size', 
      fontSize === 'small' ? '12px' : fontSize === 'large' ? '18px' : '14px'
    );
    document.documentElement.style.setProperty('--font-family',
      fontFamily === 'ibm-plex' ? '"IBM Plex Sans KR", sans-serif' :
      fontFamily === 'noto-sans' ? '"Noto Sans KR", sans-serif' :
      '"Inter", sans-serif'
    );

    // localStorage에 저장
    localStorage.setItem('theme', theme);
    localStorage.setItem('fontSize', fontSize);
    localStorage.setItem('fontFamily', fontFamily);
  }, [theme, fontSize, fontFamily]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">설정</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="space-y-6">
          {/* 테마 설정 */}
          <div>
            <label className="block text-sm font-medium mb-2">테마</label>
            <div className="flex gap-2">
              <button
                onClick={() => setTheme('dark')}
                className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                  theme === 'dark'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                나이트
              </button>
              <button
                onClick={() => setTheme('light')}
                className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                  theme === 'light'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                라이트
              </button>
            </div>
          </div>

          {/* 글자 크기 */}
          <div>
            <label className="block text-sm font-medium mb-2">글자 크기</label>
            <div className="flex gap-2">
              {(['small', 'medium', 'large'] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => setFontSize(size)}
                  className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                    fontSize === size
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {size === 'small' ? '작게' : size === 'medium' ? '보통' : '크게'}
                </button>
              ))}
            </div>
          </div>

          {/* 서체 */}
          <div>
            <label className="block text-sm font-medium mb-2">본문 서체</label>
            <select
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value as any)}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
            >
              <option value="ibm-plex">IBM Plex Sans KR</option>
              <option value="noto-sans">Noto Sans KR</option>
              <option value="inter">Inter</option>
            </select>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
