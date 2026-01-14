'use client';

import { useState, useEffect } from 'react';

export function SettingsPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark';
    }
    return 'dark';
  });
  const [fontSize, setFontSize] = useState<'small' | 'normal' | 'large'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('fontSize') as 'small' | 'normal' | 'large') || 'normal';
    }
    return 'normal';
  });
  const [fontFamily, setFontFamily] = useState<'ibm' | 'noto' | 'inter'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('fontFamily') as 'ibm' | 'noto' | 'inter') || 'inter';
    }
    return 'inter';
  });
  
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    localStorage.setItem('theme', theme);
    localStorage.setItem('fontSize', fontSize);
    localStorage.setItem('fontFamily', fontFamily);
    
    // Apply theme
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');
    
    // Apply font size
    document.body.className = document.body.className.replace(/text-(sm|base|lg)/g, '');
    if (fontSize === 'small') document.body.classList.add('text-sm');
    if (fontSize === 'large') document.body.classList.add('text-lg');
    
    // Apply font family
    const fontMap = {
      ibm: 'IBM Plex Sans KR',
      noto: 'Noto Sans KR',
      inter: 'Inter',
    };
    document.body.style.fontFamily = fontMap[fontFamily];
  }, [theme, fontSize, fontFamily]);
  
  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2 bg-gray-800 border border-gray-700 rounded hover:bg-gray-700"
      >
        FED Dashboard⚙️ 설정
      </button>
      
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-lg p-4 z-50">
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">테마</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setTheme('dark')}
                  className={`px-3 py-1 rounded ${theme === 'dark' ? 'bg-blue-600' : 'bg-gray-700'}`}
                >
                  다크
                </button>
                <button
                  onClick={() => setTheme('light')}
                  className={`px-3 py-1 rounded ${theme === 'light' ? 'bg-blue-600' : 'bg-gray-700'}`}
                >
                  라이트
                </button>
              </div>
            </div>
            
            <div>
              <label className="block text-sm text-gray-400 mb-2">글자 크기</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setFontSize('small')}
                  className={`px-3 py-1 rounded ${fontSize === 'small' ? 'bg-blue-600' : 'bg-gray-700'}`}
                >
                  작게
                </button>
                <button
                  onClick={() => setFontSize('normal')}
                  className={`px-3 py-1 rounded ${fontSize === 'normal' ? 'bg-blue-600' : 'bg-gray-700'}`}
                >
                  보통
                </button>
                <button
                  onClick={() => setFontSize('large')}
                  className={`px-3 py-1 rounded ${fontSize === 'large' ? 'bg-blue-600' : 'bg-gray-700'}`}
                >
                  크게
                </button>
              </div>
            </div>
            
            <div>
              <label className="block text-sm text-gray-400 mb-2">서체</label>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setFontFamily('ibm')}
                  className={`px-3 py-1 rounded ${fontFamily === 'ibm' ? 'bg-blue-600' : 'bg-gray-700'}`}
                >
                  IBM Plex Sans KR
                </button>
                <button
                  onClick={() => setFontFamily('noto')}
                  className={`px-3 py-1 rounded ${fontFamily === 'noto' ? 'bg-blue-600' : 'bg-gray-700'}`}
                >
                  Noto Sans KR
                </button>
                <button
                  onClick={() => setFontFamily('inter')}
                  className={`px-3 py-1 rounded ${fontFamily === 'inter' ? 'bg-blue-600' : 'bg-gray-700'}`}
                >
                  Inter
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
