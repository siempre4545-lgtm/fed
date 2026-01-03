// 토글 바인딩 스크립트 (클라이언트 사이드 전용)
(function() {
  'use strict';
  
  // 중복 실행 방지
  if (window._toggleBinderLoaded) {
    return;
  }
  window._toggleBinderLoaded = true;
  
  console.log('TOGGLE_BIND_INIT', window.location.pathname);
  
  // 텍스트 정규화 함수: HTML 태그 제거, markdown bold 제거, 안전한 텍스트 추출
  function normalizeText(rawText) {
    if (!rawText || typeof rawText !== 'string') {
      return { title: '', lines: [] };
    }
    
    // HTML 태그 제거 (단, <br>는 줄바꿈으로 치환)
    let text = rawText
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?div[^>]*>/gi, '\n')
      .replace(/<\/?p[^>]*>/gi, '\n')
      .replace(/<\/?strong[^>]*>/gi, '')
      .replace(/<\/?b[^>]*>/gi, '')
      .replace(/<\/?em[^>]*>/gi, '')
      .replace(/<\/?i[^>]*>/gi, '')
      .replace(/<[^>]+>/g, ''); // 나머지 모든 HTML 태그 제거
    
    // HTML 엔티티 디코딩
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    
    // Markdown bold 제거 (**텍스트** -> 텍스트)
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    
    // 연속 공백/줄바꿈 정리
    text = text
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
    
    // 줄 단위로 분리
    const lines = text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    if (lines.length === 0) {
      return { title: '', lines: [] };
    }
    
    // 첫 번째 의미있는 줄을 title로, 나머지를 lines로
    const title = lines[0];
    const bodyLines = lines.slice(1);
    
    return { title, lines: bodyLines };
  }
  
  // 안전한 DOM 렌더링: innerHTML 대신 createElement 사용
  function renderTextSafely(container, normalized) {
    // 기존 내용 제거
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    
    // Title 렌더링 (bold)
    if (normalized.title) {
      const titleEl = document.createElement('div');
      titleEl.className = 'interpretation-headline';
      titleEl.style.fontWeight = '700';
      titleEl.style.marginBottom = '12px';
      titleEl.style.color = '#ffffff';
      titleEl.textContent = normalized.title;
      container.appendChild(titleEl);
    }
    
    // Body 렌더링 (normal weight)
    if (normalized.lines.length > 0) {
      const bodyEl = document.createElement('div');
      bodyEl.className = 'interpretation-body';
      bodyEl.style.fontWeight = '400';
      bodyEl.style.lineHeight = '1.8';
      bodyEl.style.color = '#c0c0c0';
      
      normalized.lines.forEach((line) => {
        const lineEl = document.createElement('div');
        lineEl.style.marginBottom = '8px';
        
        // 불릿 패턴 감지
        if (/^[•\-\*▶✅]/.test(line)) {
          lineEl.style.paddingLeft = '16px';
          lineEl.style.position = 'relative';
          lineEl.textContent = line;
        } else {
          lineEl.textContent = line;
        }
        
        bodyEl.appendChild(lineEl);
      });
      
      container.appendChild(bodyEl);
    }
  }
  
  // 주간 리포트 안전 렌더링
  function renderWeeklyReportSafely(container, rawSummary) {
    // 기존 내용 제거
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    
    // 디버깅: raw string 로그 (1회만)
    if (!window._weeklyReportLogged) {
      console.log('WEEKLY_REPORT_RAW', {
        length: rawSummary.length,
        preview: rawSummary.substring(0, 200)
      });
      window._weeklyReportLogged = true;
    }
    
    const normalized = normalizeText(rawSummary);
    
    // 디버깅: normalize 결과
    console.log('WEEKLY_REPORT_NORMALIZED', {
      titleLength: normalized.title.length,
      linesCount: normalized.lines.length
    });
    
    // Title 렌더링
    if (normalized.title) {
      const titleEl = document.createElement('div');
      titleEl.className = 'report-main-phrase';
      titleEl.style.fontWeight = '700';
      titleEl.style.fontSize = '18px';
      titleEl.style.marginBottom = '16px';
      titleEl.style.color = '#ffffff';
      titleEl.textContent = normalized.title;
      container.appendChild(titleEl);
    }
    
    // Body 렌더링
    const bodyEl = document.createElement('div');
    bodyEl.className = 'report-text';
    bodyEl.style.fontWeight = '400';
    bodyEl.style.lineHeight = '1.8';
    bodyEl.style.color = '#c0c0c0';
    
    normalized.lines.forEach((line) => {
      const lineEl = document.createElement('div');
      lineEl.style.marginBottom = '12px';
      
      // 섹션 타이틀 ([...])
      if (line.startsWith('[') && line.endsWith(']')) {
        lineEl.className = 'report-section-title';
        lineEl.style.fontWeight = '600';
        lineEl.style.fontSize = '16px';
        lineEl.style.marginTop = '20px';
        lineEl.style.marginBottom = '12px';
        lineEl.style.color = '#ffffff';
        lineEl.textContent = line;
      }
      // 불릿 (•, -, *, ▶, ✅)
      else if (/^[•\-\*▶✅]/.test(line)) {
        lineEl.className = 'report-bullet';
        lineEl.style.paddingLeft = '20px';
        lineEl.style.position = 'relative';
        lineEl.textContent = line;
      }
      // 서브 불릿 (  →)
      else if (/^\s+→/.test(line)) {
        lineEl.className = 'report-sub-bullet';
        lineEl.style.paddingLeft = '32px';
        lineEl.style.fontSize = '14px';
        lineEl.textContent = line.trim();
      }
      // 일반 문단
      else {
        lineEl.className = 'report-paragraph';
        lineEl.textContent = line;
      }
      
      bodyEl.appendChild(lineEl);
    });
    
    container.appendChild(bodyEl);
  }
  
  // 카드 토글 함수
  async function toggleCard(idx) {
    try {
      const card = document.querySelector('[data-card-id="' + idx + '"]');
      if (!card) {
        console.warn('TOGGLE_TARGET_NOT_FOUND: card', idx, {
          selector: '[data-card-id="' + idx + '"]',
          availableCards: Array.from(document.querySelectorAll('[data-card-id]')).map(el => el.getAttribute('data-card-id'))
        });
        return;
      }
      
      const isExpanded = card.classList.contains('expanded');
      card.classList.toggle('expanded');
      
      const expandIcon = document.getElementById('expand-icon-' + idx);
      if (expandIcon) {
        expandIcon.textContent = !isExpanded ? '▲' : '▼';
      }
      
      // 해석 lazy load
      if (!isExpanded) {
        const interpretationText = document.getElementById('interpretation-text-' + idx);
        if (interpretationText && interpretationText.textContent.includes('로딩 중')) {
          const cardKey = card.getAttribute('data-card-key');
          if (cardKey) {
            try {
              const response = await fetch('/api/h41/detail?key=' + encodeURIComponent(cardKey));
              if (response.ok) {
                const data = await response.json();
                // 텍스트 정규화 및 안전한 렌더링
                const normalized = normalizeText(data.interpretation);
                renderTextSafely(interpretationText, normalized);
              } else {
                // 에러 메시지도 안전하게 렌더링
                const errorEl = document.createElement('div');
                errorEl.style.color = '#ef4444';
                errorEl.textContent = '해석을 불러올 수 없습니다.';
                interpretationText.textContent = '';
                interpretationText.appendChild(errorEl);
              }
            } catch (e) {
              console.error('Failed to load interpretation:', e);
              const errorEl = document.createElement('div');
              errorEl.style.color = '#ef4444';
              errorEl.textContent = '해석을 불러올 수 없습니다.';
              interpretationText.textContent = '';
              interpretationText.appendChild(errorEl);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error in toggleCard:', error, 'idx:', idx);
    }
  }
  
  async function loadWeeklyReport() {
    const reportContent = document.getElementById('report-content');
    if (!reportContent) return;
    
    // 이미 로드되었으면 다시 로드하지 않음
    if (reportContent.dataset.loaded === 'true') return;
    
    try {
      // 로딩 메시지 안전하게 렌더링
      const loadingEl = document.createElement('div');
      loadingEl.style.color = '#808080';
      loadingEl.style.fontStyle = 'italic';
      loadingEl.style.padding = '20px';
      loadingEl.style.textAlign = 'center';
      loadingEl.textContent = '로딩 중...';
      reportContent.textContent = '';
      reportContent.appendChild(loadingEl);
      
      const response = await fetch('/api/h41/weekly-summary');
      if (response.ok) {
        const data = await response.json();
        const summary = data.summary || '';
        
        // 텍스트 정규화 및 안전한 렌더링
        renderWeeklyReportSafely(reportContent, summary);
        reportContent.dataset.loaded = 'true';
      } else {
        const errorEl = document.createElement('div');
        errorEl.style.color = '#ef4444';
        errorEl.style.padding = '20px';
        errorEl.style.textAlign = 'center';
        errorEl.textContent = '리포트를 불러올 수 없습니다.';
        reportContent.textContent = '';
        reportContent.appendChild(errorEl);
      }
    } catch (e) {
      console.error('Failed to load weekly report:', e);
      const errorEl = document.createElement('div');
      errorEl.style.color = '#ef4444';
      errorEl.style.padding = '20px';
      errorEl.style.textAlign = 'center';
      errorEl.textContent = '리포트를 불러올 수 없습니다.';
      reportContent.textContent = '';
      reportContent.appendChild(errorEl);
    }
  }
  
  function toggleReport() {
    const report = document.querySelector('.weekly-report');
    if (!report) {
      console.warn('TOGGLE_TARGET_NOT_FOUND: weekly-report', {
        selector: '.weekly-report',
        availableReports: Array.from(document.querySelectorAll('[class*="report"]')).map(el => el.className)
      });
      return;
    }
    const isExpanded = report.classList.contains('expanded');
    report.classList.toggle('expanded');
    const expandIcon = document.getElementById('report-icon');
    if (expandIcon) {
      expandIcon.textContent = !isExpanded ? '▲' : '▼';
    }
    
    // 펼칠 때만 리포트 로드
    if (!isExpanded) {
      loadWeeklyReport();
    }
  }
  
  function toggleInfo() {
    const info = document.querySelector('.info-section');
    if (!info) {
      console.warn('TOGGLE_TARGET_NOT_FOUND: info-section', {
        selector: '.info-section',
        availableInfo: Array.from(document.querySelectorAll('[class*="info"]')).map(el => el.className)
      });
      return;
    }
    info.classList.toggle('expanded');
  }
  
  // 전역에 등록 (인라인 onclick 호환성 유지)
  window.toggleCard = toggleCard;
  window.toggleReport = toggleReport;
  window.toggleInfo = toggleInfo;
  
  console.log('TOGGLE_GLOBAL_SET', {
    toggleCard: typeof window.toggleCard,
    toggleReport: typeof window.toggleReport,
    toggleInfo: typeof window.toggleInfo
  });
  
  // 이벤트 위임 패턴: document에 한 번만 리스너 등록
  function initToggleListeners() {
    // 기존 리스너 제거 (중복 방지)
    if (window._toggleListenerInitialized) {
      return;
    }
    window._toggleListenerInitialized = true;
    
    document.addEventListener('click', function(e) {
      const target = e.target;
      if (!target || !(target instanceof HTMLElement)) return;
      
      // 가장 가까운 토글 요소 찾기
      const toggleEl = target.closest('[data-card-toggle], [data-report-toggle], [data-info-toggle]');
      if (!toggleEl) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      // 카드 토글
      if (toggleEl.hasAttribute('data-card-toggle')) {
        const idx = parseInt(toggleEl.getAttribute('data-card-toggle') || '0', 10);
        console.log('TOGGLE_CARD_CLICK', idx);
        toggleCard(idx);
        return;
      }
      
      // 리포트 토글
      if (toggleEl.hasAttribute('data-report-toggle')) {
        console.log('TOGGLE_REPORT_CLICK');
        toggleReport();
        return;
      }
      
      // 정보 섹션 토글
      if (toggleEl.hasAttribute('data-info-toggle')) {
        console.log('TOGGLE_INFO_CLICK');
        toggleInfo();
        return;
      }
    }, true); // capture phase에서 실행하여 더 빠르게 처리
  }
  
  // 즉시 실행 (DOMContentLoaded를 기다리지 않음)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initToggleListeners);
  } else {
    // 이미 로드되었으면 즉시 실행
    initToggleListeners();
  }
})();

