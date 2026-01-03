// 토글 바인딩 스크립트 (클라이언트 사이드 전용)
(function() {
  'use strict';
  
  // 중복 실행 방지
  if (window._toggleBinderLoaded) {
    return;
  }
  window._toggleBinderLoaded = true;
  
  console.log('TOGGLE_BIND_INIT', window.location.pathname);
  
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
                const parts = data.interpretation.split("\\n");
                if (parts.length > 0) {
                  const headline = parts[0].trim();
                  const body = parts.slice(1).filter(p => p.trim()).join("<br/>");
                  interpretationText.innerHTML = '<div class="interpretation-headline"><strong>' + 
                    headline.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") + 
                    '</strong></div><div class="interpretation-body">' + 
                    body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") + 
                    '</div>';
                } else {
                  interpretationText.innerHTML = data.interpretation.replace(/\\n/g, "<br/>")
                    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
                }
              } else {
                interpretationText.innerHTML = '<div style="color: #ef4444;">해석을 불러올 수 없습니다.</div>';
              }
            } catch (e) {
              console.error('Failed to load interpretation:', e);
              interpretationText.innerHTML = '<div style="color: #ef4444;">해석을 불러올 수 없습니다.</div>';
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
      reportContent.innerHTML = '<div style="color: #808080; font-style: italic; padding: 20px; text-align: center;">로딩 중...</div>';
      
      const response = await fetch('/api/h41/weekly-summary');
      if (response.ok) {
        const data = await response.json();
        const summary = data.summary || '';
        
        const summaryLines = summary.split("\\n");
        const mainPhrase = summaryLines.find((line) => line.startsWith("**") && line.endsWith("**")) || "";
        const mainPhraseClean = mainPhrase.replace(/\\*\\*/g, "");
        const restOfSummary = summaryLines.filter((line) => !line.startsWith("**") || !line.endsWith("**")).join("\\n");
        
        let html = '';
        if (mainPhraseClean) {
          html += '<div class="report-main-phrase">' + mainPhraseClean.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") + '</div>';
        }
        html += '<div class="report-text">';
        restOfSummary.split("\\n").forEach((line) => {
          if (line.trim() === "") {
            html += "<br/>";
          } else if (line.startsWith("[") && line.endsWith("]")) {
            html += '<div class="report-section-title">' + line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") + '</div>';
          } else if (line.startsWith("•")) {
            const processed = line.replace(/\\*\\*(.*?)\\*\\*/g, '<strong style="color:#ffffff;font-weight:700">$1</strong>');
            html += '<div class="report-bullet">' + processed.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") + '</div>';
          } else if (line.startsWith("  →")) {
            html += '<div class="report-sub-bullet">' + line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") + '</div>';
          } else {
            const processed = line.replace(/\\*\\*(.*?)\\*\\*/g, '<strong style="color:#ffffff;font-weight:700">$1</strong>');
            html += '<div class="report-paragraph">' + processed.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") + '</div>';
          }
        });
        html += '</div>';
        
        reportContent.innerHTML = html;
        reportContent.dataset.loaded = 'true';
      } else {
        reportContent.innerHTML = '<div style="color: #ef4444; padding: 20px; text-align: center;">리포트를 불러올 수 없습니다.</div>';
      }
    } catch (e) {
      console.error('Failed to load weekly report:', e);
      reportContent.innerHTML = '<div style="color: #ef4444; padding: 20px; text-align: center;">리포트를 불러올 수 없습니다.</div>';
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

