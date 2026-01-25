import express from "express";
import path from "path";
import { fetchH41Report, toKoreanDigest, ITEM_DEFS, getConcept, getFedReleaseDates } from "./h41.js";
import { fetchAllEconomicIndicators, diagnoseEconomicStatus, getIndicatorDetail } from "./economic-indicators.js";
import { fetchEconomicNews } from "./news.js";
import { fetchAllSecretIndicators } from "./secret-indicators.js";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// 정적 파일: fed_report_sh (로컬 개발용)
app.use(
  "/fed_report_sh",
  express.static(path.join(process.cwd(), "public", "fed_report_sh"))
);
app.get("/fed_report_sh", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "fed_report_sh", "index.html"));
});

// API: JSON
app.get("/api/h41", async (req, res) => {
  try {
    // 날짜 파라미터 확인 (YYYY-MM-DD 형식)
    const targetDate = req.query.date as string | undefined;
    const report = await fetchH41Report(targetDate);
    
    // 캐싱 방지 헤더 추가
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.json(report);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

// API: 최근 10회분 히스토리 데이터 (디버깅용)
app.get("/api/h41/history", async (req, res) => {
  try {
    const releaseDates = await getFedReleaseDates();
    const datesToFetch = releaseDates.slice(0, Math.min(10, releaseDates.length));
    
    const historicalData: Array<{
      date: string;
      assets: { treasury: number; mbs: number; repo: number; loans: number };
      liabilities: { currency: number; rrp: number; tga: number; reserves: number };
      error?: string;
    }> = [];
    
    for (const dateStr of datesToFetch) {
      try {
        const histReport = await fetchH41Report(dateStr, releaseDates);
        
        if (!histReport || !histReport.cards || histReport.cards.length === 0) {
          historicalData.push({
            date: dateStr,
            assets: { treasury: 0, mbs: 0, repo: 0, loans: 0 },
            liabilities: { currency: 0, rrp: 0, tga: 0, reserves: 0 },
            error: "No cards found"
          });
          continue;
        }
        
        const histAssets = {
          treasury: histReport.cards.find(c => c.fedLabel === "U.S. Treasury securities")?.balance_musd || 0,
          mbs: histReport.cards.find(c => c.fedLabel === "Mortgage-backed securities")?.balance_musd || 0,
          repo: histReport.cards.find(c => c.fedLabel === "Repurchase agreements")?.balance_musd || 0,
          loans: histReport.cards.find(c => c.fedLabel === "Primary credit")?.balance_musd || 0,
        };
        const histLiabilities = {
          currency: histReport.cards.find(c => c.fedLabel === "Currency in circulation")?.balance_musd || 0,
          rrp: histReport.cards.find(c => c.fedLabel === "Reverse repurchase agreements")?.balance_musd || 0,
          tga: histReport.cards.find(c => c.fedLabel === "U.S. Treasury, General Account")?.balance_musd || 0,
          reserves: histReport.cards.find(c => c.fedLabel === "Reserve balances with Federal Reserve Banks")?.balance_musd || 0,
        };
        
        const totalAssets = histAssets.treasury + histAssets.mbs + histAssets.repo + histAssets.loans;
        const totalLiabilities = histLiabilities.currency + histLiabilities.rrp + histLiabilities.tga + histLiabilities.reserves;
        
        if (totalAssets === 0 && totalLiabilities === 0) {
          historicalData.push({
            date: dateStr,
            assets: histAssets,
            liabilities: histLiabilities,
            error: "All values are zero"
          });
          continue;
        }
        
        historicalData.push({
          date: dateStr,
          assets: histAssets,
          liabilities: histLiabilities,
        });
      } catch (e) {
        historicalData.push({
          date: dateStr,
          assets: { treasury: 0, mbs: 0, repo: 0, loans: 0 },
          liabilities: { currency: 0, rrp: 0, tga: 0, reserves: 0 },
          error: e instanceof Error ? e.message : String(e)
        });
      }
    }
    
    historicalData.sort((a, b) => b.date.localeCompare(a.date));
    
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.json({
      releaseDatesCount: releaseDates.length,
      datesToFetch: datesToFetch,
      fetchedCount: historicalData.filter(d => !d.error).length,
      totalAttempts: datesToFetch.length,
      data: historicalData
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

// API: 텍스트(알림용)
app.get("/api/h41.txt", async (_req, res) => {
  try {
    const report = await fetchH41Report();
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.send(toKoreanDigest(report));
  } catch (e: any) {
    res.status(500).send(e?.message ?? String(e));
  }
});

// UI: 개선된 대시보드
app.get("/", async (req, res) => {
  try {
    // 날짜 파라미터 확인 (YYYY-MM-DD 형식)
    const targetDate = req.query.date as string | undefined;
    
    // FED 발표 날짜 목록 가져오기 (가장 가까운 날짜 찾기용)
    const releaseDates = await getFedReleaseDates();
    
    let report: Awaited<ReturnType<typeof fetchH41Report>>;
    try {
      // availableDates를 전달하여 가장 가까운 날짜를 찾을 수 있도록 함
      report = await fetchH41Report(targetDate, releaseDates);
    } catch (error: any) {
      // 아카이브 데이터 가져오기 실패 시 에러 메시지 표시
      const errorMessage = error?.message || String(error);
      console.error(`[Dashboard] Failed to fetch H.41 report for date ${targetDate}:`, errorMessage);
      
      // 에러 페이지 렌더링
      return res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>FED H.4.1 대시보드 - 오류</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; background: #1a1a1a; color: #fff; }
            .error-container { max-width: 600px; margin: 0 auto; }
            .error-title { font-size: 24px; margin-bottom: 20px; color: #ff6b6b; }
            .error-message { background: #2d2d2d; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
            .back-link { color: #4dabf7; text-decoration: none; }
            .back-link:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <div class="error-container">
            <h1 class="error-title">데이터를 불러올 수 없습니다</h1>
            <div class="error-message">
              <p>선택한 날짜(${targetDate || 'N/A'})의 FED H.4.1 데이터를 가져오는 중 오류가 발생했습니다.</p>
              <p><strong>오류 내용:</strong> ${escapeHtml(errorMessage)}</p>
              <p>다른 날짜를 선택하거나 최신 데이터를 확인해주세요.</p>
            </div>
            <a href="/" class="back-link">← 대시보드로 돌아가기</a>
          </div>
        </body>
        </html>
      `);
    }
    
    // 경제 지표 수집 및 진단 (releaseDates는 이미 위에서 선언됨)
    let economicStatus = null;
    try {
      const indicators = await fetchAllEconomicIndicators();
      economicStatus = diagnoseEconomicStatus(indicators);
    } catch (e) {
      console.error("Failed to fetch economic indicators:", e);
    }
    
    // 거시경제 뉴스 가져오기
    let economicNews: Array<{ title: string; source: string; publishedAt: string }> = [];
    try {
      economicNews = await fetchEconomicNews();
    } catch (e) {
      console.error("Failed to fetch economic news:", e);
    }
    
    // 원/달러 환율 가져오기 (Yahoo Finance API)
    let usdKrwRate: { price: number; change: number; changePercent: number } | null = null;
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/KRW=X?interval=1d&range=2d`;
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        const result = data.chart?.result?.[0];
        if (result) {
          const quote = result.indicators?.quote?.[0];
          if (quote) {
            const prices = quote.close.filter((p: number | null) => p !== null);
            if (prices.length >= 2) {
              const currentPrice = prices[prices.length - 1];
              const previousPrice = prices[prices.length - 2];
              const change = currentPrice - previousPrice;
              const changePercent = (change / previousPrice) * 100;
              usdKrwRate = {
                price: currentPrice,
                change,
                changePercent,
              };
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to fetch USD/KRW rate:", e);
    }
    
    const levelText = ["안정", "주의", "경계", "위험"][report.warningLevel];
    const levelColors = ["#22c55e", "#f59e0b", "#f97316", "#ef4444"]; // TOSS 스타일 색상
    const levelBgColors = ["#f0fdf4", "#fffbeb", "#fff7ed", "#fef2f2"]; // TOSS 스타일 배경
    
    // 신호등 색상 및 상태
    const trafficLightColor = economicStatus 
      ? (economicStatus.status === "green" ? "#22c55e" : economicStatus.status === "yellow" ? "#f59e0b" : "#ef4444")
      : "#808080";
    const trafficLightText = economicStatus
      ? (economicStatus.status === "green" ? "양호" : economicStatus.status === "yellow" ? "주의" : "위험")
      : "데이터 없음";

    // 상단 고정 영역: 경고 레벨 + 가이드 + 청팀/백팀
    const headerSection = `
    <div class="warning-header" style="border-left: 4px solid ${levelColors[report.warningLevel]}">
      <div class="warning-level">
        <span class="level-badge" style="background: ${levelColors[report.warningLevel]}">LEVEL ${report.warningLevel}</span>
        <span class="level-text">${levelText}</span>
        <a href="/levels" class="level-info-link">ℹ️ 레벨 설명 보기</a>
      </div>
      <div class="asset-guidance">${escapeHtml(report.assetGuidance).replace(/\n/g, "<br/>")}</div>
      <div class="team-signal">
        <div class="signal-summary">${escapeHtml(report.teamSignal.summary)}</div>
        <div class="signal-detail">
          <span class="blue-team">청팀: ${escapeHtml(report.teamSignal.blueTeam)}</span>
          <span class="white-team">백팀: ${escapeHtml(report.teamSignal.whiteTeam)}</span>
        </div>
      </div>
    </div>`;

    // 핵심 6개 카드 (클릭 시 확장)
    const cardsHtml = report.coreCards.map((c, idx) => {
      const chSign = c.change_okeusd > 0 ? "+" : c.change_okeusd < 0 ? "-" : "";
      const chColor = c.change_okeusd > 0 ? "#ff6b6b" : c.change_okeusd < 0 ? "#51cf66" : "#adb5bd";
      
      // 유동성 효과를 동적으로 계산
      let liquidityEffect = "";
      if (c.fedLabel === "U.S. Treasury, General Account") {
        // TGA: 증가 → 유동성 흡수, 감소 → 유동성 공급
        if (c.change_okeusd > 0) {
          liquidityEffect = "유동성 흡수 (정부 자금 모집)";
        } else if (c.change_okeusd < 0) {
          liquidityEffect = "유동성 공급 (정부 지출 확대)";
        } else {
          liquidityEffect = "유동성 중립";
        }
      } else if (c.fedLabel === "Reverse repurchase agreements") {
        // RRP: 증가 → 유동성 흡수, 감소 → 유동성 공급
        if (c.change_okeusd > 0) {
          liquidityEffect = "유동성 흡수 (기관 자금 연준 예치)";
        } else if (c.change_okeusd < 0) {
          liquidityEffect = "유동성 공급 (기관 자금 시장 복귀)";
        } else {
          liquidityEffect = "유동성 중립";
        }
      } else if (c.fedLabel === "Repurchase agreements") {
        // Repo: 증가 → 유동성 공급, 감소 → 유동성 흡수
        if (c.change_okeusd > 0) {
          liquidityEffect = "유동성 공급 (연준 자금 시장 공급)";
        } else if (c.change_okeusd < 0) {
          liquidityEffect = "유동성 흡수 (연준 자금 회수)";
        } else {
          liquidityEffect = "유동성 중립";
        }
      } else if (c.fedLabel === "Primary credit") {
        // Primary Credit: 증가 → 유동성 공급, 감소 → 유동성 흡수
        if (c.change_okeusd > 0) {
          liquidityEffect = "유동성 공급 (연준 융자 확대)";
        } else if (c.change_okeusd < 0) {
          liquidityEffect = "유동성 흡수 (연준 융자 축소)";
        } else {
          liquidityEffect = "유동성 중립";
        }
      } else if (c.fedLabel === "Securities held outright") {
        // 보유증권: 감소 → QT (유동성 흡수), 증가 → QE (유동성 공급)
        if (c.change_okeusd < 0) {
          liquidityEffect = "QT 진행 (유동성 흡수)";
        } else if (c.change_okeusd > 0) {
          liquidityEffect = "QE 신호 (유동성 공급)";
        } else {
          liquidityEffect = "중립";
        }
      } else if (c.fedLabel === "Currency in circulation") {
        // 통화발행: 증가 → 유동성 흡수 (현금이 시장에서 빠져나감), 감소 → 유동성 공급
        if (c.change_okeusd > 0) {
          liquidityEffect = "유동성 흡수 (현금 발행 증가)";
        } else if (c.change_okeusd < 0) {
          liquidityEffect = "유동성 공급 (현금 회수)";
        } else {
          liquidityEffect = "유동성 중립";
        }
      } else if (c.fedLabel === "Reserve balances with Federal Reserve Banks") {
        // 지준금: 시스템 상태 표시
        if (c.change_okeusd > 0) {
          liquidityEffect = "은행 유동성 여유 증가";
        } else if (c.change_okeusd < 0) {
          liquidityEffect = "은행 유동성 여유 감소";
        } else {
          liquidityEffect = "은행 유동성 안정";
        }
      } else {
        // 기본값: 기존 liquidityTag 사용하되 더 명확하게
        if (c.liquidityTag === "흡수(약재)") {
          liquidityEffect = c.change_okeusd > 0 ? "유동성 흡수" : c.change_okeusd < 0 ? "유동성 공급" : "유동성 중립";
        } else if (c.liquidityTag === "공급(해열)") {
          liquidityEffect = c.change_okeusd > 0 ? "유동성 공급" : c.change_okeusd < 0 ? "유동성 흡수" : "유동성 중립";
        } else {
          liquidityEffect = c.liquidityTag;
        }
      }
      
      return `
      <div class="card" data-card-id="${idx}">
        <div class="card-header" onclick="event.stopPropagation(); toggleCard(${idx});">
          <div class="k">${c.key}</div>
          <div class="t">${escapeHtml(c.title)}</div>
          <div class="expand-icon" id="expand-icon-${idx}">▼</div>
        </div>
        <div class="card-body">
          <div class="m">
            <div><b>잔액</b> : <span class="highlight-number">$${c.balance_okeusd.toFixed(1)}억</span></div>
            <div><b>변동</b> : <span style="color: ${chColor};font-weight:700">${chSign}$${Math.abs(c.change_okeusd).toFixed(1)}억</span></div>
            <div class="tag">${escapeHtml(liquidityEffect)}</div>
            <div class="data-date">데이터 기준: ${escapeHtml(c.dataDate)}</div>
          </div>
          <div class="card-expanded" id="card-expanded-${idx}">
            <div class="expanded-section">
              <div class="expanded-label">지난주 대비</div>
              <div class="expanded-value" style="color: ${chColor};font-weight:700">${chSign}$${Math.abs(c.change_okeusd).toFixed(1)}억</div>
            </div>
            <div class="i">
              <div class="interpretation-label">해석</div>
              <div class="interpretation-text">${escapeHtml(c.interpretation).replace(/\n/g, "<br/>")}</div>
            </div>
          </div>
        </div>
        <div class="s">${escapeHtml(c.fedLabel)}</div>
      </div>`;
    }).join("\n");

    // 종합 QT/QE 평가 계산
    const securities = report.coreCards.find(c => c.fedLabel === "Securities held outright");
    const reserves = report.coreCards.find(c => c.fedLabel === "Reserve balances with Federal Reserve Banks");
    const tga = report.coreCards.find(c => c.fedLabel === "U.S. Treasury, General Account");
    const rrp = report.coreCards.find(c => c.fedLabel === "Reverse repurchase agreements");
    const repo = report.coreCards.find(c => c.fedLabel === "Repurchase agreements");
    const primaryCredit = report.coreCards.find(c => c.fedLabel === "Primary credit");

    let qtScore = 0;
    let qeScore = 0;

    // 보유증권 감소 = QT, 증가 = QE
    if (securities) {
      if (securities.change_musd < -20000) qtScore += 2; // 200억 이상 감소
      else if (securities.change_musd < -5000) qtScore += 1; // 50억 이상 감소
      else if (securities.change_musd > 20000) qeScore += 2; // 200억 이상 증가
      else if (securities.change_musd > 5000) qeScore += 1; // 50억 이상 증가
    }

    // 지준금 감소 = QT 신호, 증가 = QE 신호
    if (reserves) {
      if (reserves.change_musd < -50000) qtScore += 1; // 500억 이상 감소
      else if (reserves.change_musd > 50000) qeScore += 1; // 500억 이상 증가
    }

    // TGA 증가 = 유동성 흡수 = QT 신호
    if (tga && tga.change_musd > 50000) qtScore += 1;
    // RRP 증가 = 유동성 흡수 = QT 신호
    if (rrp && rrp.change_musd > 30000) qtScore += 1;
    // Repo/Primary Credit 증가 = 유동성 공급 = QE 신호
    if (repo && repo.change_musd > 10000) qeScore += 1;
    if (primaryCredit && primaryCredit.change_musd > 5000) qeScore += 1;

    let overallSignal: "QT" | "QE" | "중립" = "중립";
    let signalColor = "#adb5bd";
    let signalText = "중립";
    
    if (qtScore > qeScore && qtScore >= 2) {
      overallSignal = "QT";
      signalColor = "#ff6b6b";
      signalText = "양적긴축(QT)";
    } else if (qeScore > qtScore && qeScore >= 2) {
      overallSignal = "QE";
      signalColor = "#51cf66";
      signalText = "양적완화(QE)";
    } else {
      overallSignal = "중립";
      signalColor = "#adb5bd";
      signalText = "중립";
    }

    // 종합 QT/QE 평가 섹션
    const qtQeSummarySection = `
    <div class="qt-qe-summary">
      <div class="qt-qe-header">
        <h2>종합 QT/QE 평가 📊</h2>
      </div>
      <div class="qt-qe-content">
        <div class="qt-qe-main" style="border-left: 4px solid ${signalColor}">
          <div class="qt-qe-label">현재 유동성 정책 방향</div>
          <div class="qt-qe-value" style="color: ${signalColor}">${signalText}</div>
          <div class="qt-qe-detail">
            ${overallSignal === "QT" ? "연준의 양적긴축(QT)이 진행 중이에요. 시장 유동성이 흡수되고 있어서, 자산 가격에 압박이 가해질 수 있습니다." : 
              overallSignal === "QE" ? "연준의 양적완화(QE) 신호가 보여요. 시장 유동성 공급이 확대되고 있어서, 자산 가격 상승 여지가 생길 수 있습니다." : 
              "현재 양적정책은 중립적 수준을 유지하고 있어요. 큰 변화 없이 안정적으로 흐르고 있습니다."}
          </div>
        </div>
      </div>
    </div>`;

    // 주간 리포트 주요 문구 추출
    const summaryLines = report.weeklySummary.split("\n");
    const mainPhrase = summaryLines.find(line => line.startsWith("**") && line.endsWith("**")) || "";
    const mainPhraseClean = mainPhrase.replace(/\*\*/g, "");
    const restOfSummary = summaryLines.filter(line => !line.startsWith("**") || !line.endsWith("**")).join("\n");

    // 하단 주간 요약 리포트
    const weeklyReportSection = `
    <div class="weekly-report">
      <div class="report-header" onclick="toggleReport()">
        <h2>주간 요약 리포트 📄</h2>
        <div class="expand-icon" id="report-icon">▼</div>
      </div>
      <div class="report-content" id="report-content">
        ${mainPhraseClean ? `<div class="report-main-phrase">${escapeHtml(mainPhraseClean)}</div>` : ""}
        <div class="report-text">${escapeHtml(restOfSummary).split("\n").map(line => {
          if (line.trim() === "") return "<br/>";
          if (line.startsWith("[") && line.endsWith("]")) {
            return `<div class="report-section-title">${line}</div>`;
          }
          if (line.startsWith("•")) {
            // 볼드 처리된 부분 찾기
            const processed = line.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#ffffff;font-weight:700">$1</strong>');
            return `<div class="report-bullet">${processed}</div>`;
          }
          if (line.startsWith("  →")) {
            return `<div class="report-sub-bullet">${line}</div>`;
          }
          // 볼드 처리된 부분 찾기
          const processed = line.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#ffffff;font-weight:700">$1</strong>');
          return `<div class="report-paragraph">${processed}</div>`;
        }).join("")}</div>
      </div>
    </div>`;

    // Info 접힘 영역
    const infoSection = `
    <div class="info-section">
      <div class="info-header" onclick="toggleInfo()">
        <span class="info-icon">ℹ️</span>
        <span>이 페이지는 무엇을 알려주는가?</span>
        <div class="expand-icon" id="info-icon">▼</div>
      </div>
      <div class="info-content" id="info-content">
        <p>이 페이지는 FED 대차대조표(H.4.1)를 통해 '유동성 환경'을 읽고 '자산군에 유리한 방향'을 해석하는 도구예요. 거대 자본가들이 어떻게 움직이는지, 그리고 당신의 포트폴리오를 어떻게 조정해야 하는지 알려드립니다.</p>
        <p><strong>투자 유의:</strong> 특정 종목을 추천하는 게 아니라, 거시 환경을 해석하는 참고 자료예요. 이 정보를 바탕으로 스스로 판단하셔야 합니다.</p>
      </div>
    </div>`;

    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(`
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>FED H.4.1 유동성 대시보드</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;margin:0;background:#121212;color:#e8e8e8;line-height:1.6}
    
    /* 헤더 - 다크 모드 (밝게 조정) */
    .page-header{padding:20px 24px;border-bottom:1px solid #2d2d2d;position:sticky;top:0;background:#1a1a1a;z-index:100;display:flex;justify-content:space-between;align-items:flex-start}
    .page-header-content{flex:1}
    .page-header h1{margin:0;font-size:20px;font-weight:700;color:#ffffff}
    .page-header .sub{opacity:.8;font-size:13px;margin-top:8px;line-height:1.5;color:#c0c0c0}
    .page-header a{color:#4dabf7;text-decoration:none;font-weight:500}
    .page-header a:hover{text-decoration:underline;color:#74c0fc}
    
    /* 날짜 선택기 */
    .date-selector{margin-top:12px;display:flex;align-items:center;gap:8px}
    .date-selector label{font-size:13px;color:#c0c0c0}
    .date-selector input[type="date"]{padding:6px 12px;border:1px solid #2d2d2d;border-radius:6px;background:#1f1f1f;color:#ffffff;font-size:13px;cursor:pointer}
    .date-selector input[type="date"]:hover{border-color:#3d3d3d}
    .date-selector input[type="date"]:focus{outline:none;border-color:#4dabf7}
    .date-selector button{padding:6px 16px;border:1px solid #4dabf7;border-radius:6px;background:#4dabf7;color:#ffffff;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s}
    .date-selector button:hover{background:#74c0fc;border-color:#74c0fc}
    .date-selector .reset-btn{padding:6px 12px;border:1px solid #2d2d2d;background:transparent;color:#808080}
    .date-selector .reset-btn:hover{background:#2d2d2d;color:#c0c0c0}
    
    /* 환율 표시 */
    .exchange-rate-container{display:flex;align-items:center;gap:12px;padding:10px 18px;background:#1f1f1f;border:1px solid #2d2d2d;border-radius:8px;margin-top:12px}
    .exchange-rate-label{font-size:14px;color:#c0c0c0;font-weight:700}
    .exchange-rate-value{font-size:20px;font-weight:900;color:#ffffff;letter-spacing:0.5px}
    .exchange-rate-change{font-size:14px;font-weight:700}
    .exchange-rate-up{color:#ff6b6b}
    .exchange-rate-down{color:#51cf66}
    .exchange-rate-neutral{color:#adb5bd}
    .exchange-rate-refresh{background:#4dabf7;border:none;color:#ffffff;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;transition:all 0.2s;display:flex;align-items:center;gap:4px}
    .exchange-rate-refresh:hover{background:#74c0fc;transform:scale(1.05)}
    .exchange-rate-refresh:active{transform:scale(0.95)}
    .exchange-rate-refresh.loading{opacity:0.6;cursor:not-allowed}
    
    /* 신호등 UI */
    .traffic-light-container{position:relative;margin-left:20px}
    .traffic-light-link{display:flex;flex-direction:column;align-items:center;text-decoration:none;padding:12px 16px;border-radius:12px;background:#1f1f1f;border:1px solid #2d2d2d;transition:all 0.2s;min-width:80px}
    .traffic-light-link:hover{background:#252525;border-color:#3d3d3d;transform:translateY(-2px)}
    .traffic-light-circle{width:32px;height:32px;border-radius:50%;margin-bottom:8px;box-shadow:0 0 12px rgba(0,0,0,0.3),inset 0 2px 4px rgba(255,255,255,0.1)}
    .traffic-light-label{font-size:12px;font-weight:600;color:#c0c0c0;text-align:center}
    .traffic-light-score{font-size:10px;color:#808080;margin-top:4px}

    .macro-trace-link{display:inline-flex;align-items:center;gap:6px;padding:10px 14px;border-radius:999px;background:#1f1f1f;border:1px solid #2d2d2d;color:#ffffff;text-decoration:none;font-weight:700;font-size:13px;white-space:nowrap;transition:all 0.2s}
    .macro-trace-link:hover{background:#252525;border-color:#3d3d3d;transform:translateY(-1px)}
    
    /* 경고 헤더 - 다크 모드 (밝게 조정) */
    .warning-header{padding:24px;border-bottom:1px solid #2d2d2d;margin:0;background:#1a1a1a;margin-bottom:24px}
    .warning-level{display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap}
    .level-badge{padding:6px 14px;border-radius:6px;font-weight:700;font-size:13px;color:#ffffff}
    .level-text{font-size:18px;font-weight:700;color:#ffffff}
    .level-info-link{font-size:12px;color:#4dabf7;text-decoration:none;margin-left:auto;padding:4px 8px;border-radius:4px;transition:background 0.2s;font-weight:500}
    .level-info-link:hover{background:#2d2d2d;text-decoration:none;color:#74c0fc}
    .asset-guidance{font-size:14px;line-height:1.8;margin-bottom:16px;white-space:pre-line;color:#c0c0c0}
    .team-signal{margin-top:16px;padding-top:16px;border-top:1px solid #2d2d2d}
    .signal-summary{font-size:15px;font-weight:700;margin-bottom:10px;color:#ffffff}
    .signal-detail{display:flex;gap:20px;font-size:13px;color:#c0c0c0}
    .blue-team{color:#4dabf7;font-weight:600}
    .white-team{color:#ffd43b;font-weight:600}
    
    /* 뉴스 섹션 */
    .news-section{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:16px 20px;margin:0 24px 24px 24px}
    .news-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
    .news-title{font-size:14px;font-weight:700;color:#ffffff}
    .news-count{font-size:11px;color:#808080;background:#2d2d2d;padding:3px 8px;border-radius:4px}
    .news-toggle{font-size:12px;color:#4dabf7;cursor:pointer;user-select:none;padding:4px 8px;border-radius:4px;transition:background 0.2s}
    .news-toggle:hover{background:#2d2d2d}
    .news-list{display:flex;gap:16px;overflow-x:auto;overflow-y:hidden;padding-bottom:8px;scrollbar-width:thin;scrollbar-color:#2d2d2d #1a1a1a;max-height:60px}
    .news-list::-webkit-scrollbar{height:4px}
    .news-list::-webkit-scrollbar-track{background:#1a1a1a;border-radius:2px}
    .news-list::-webkit-scrollbar-thumb{background:#2d2d2d;border-radius:2px}
    .news-list::-webkit-scrollbar-thumb:hover{background:#3d3d3d}
    .news-list.expanded{flex-direction:column;gap:8px;max-height:400px;overflow-y:auto;overflow-x:hidden;transition:max-height 0.3s ease}
    .news-item{flex-shrink:0;padding:8px 12px;background:#1a1a1a;border-radius:6px;border:1px solid #2d2d2d;transition:all 0.2s;white-space:nowrap;min-width:fit-content}
    .news-list.expanded .news-item{white-space:normal;min-width:auto;width:100%}
    .news-item:hover{background:#252525;border-color:#3d3d3d}
    .news-content{display:flex;justify-content:space-between;align-items:center;gap:12px}
    .news-text{flex:1;font-size:13px;line-height:1.5;color:#c0c0c0;overflow:hidden;text-overflow:ellipsis}
    .news-list.expanded .news-text{overflow:visible;text-overflow:clip}
    .news-source{font-size:11px;color:#808080;white-space:nowrap;padding:3px 6px;background:#2d2d2d;border-radius:4px}
    
    /* 메인 컨텐츠 - 다크 모드 (밝게 조정) */
    .main-content{padding:24px;max-width:1400px;margin:0 auto}
    
    /* 카드 그리드 - 다크 모드 (밝게 조정) */
    .cards-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px;margin-bottom:32px}
    .card{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;overflow:hidden;transition:all 0.2s}
    .card:hover{border-color:#3d3d3d}
    .card-header{display:flex;align-items:flex-start;gap:12px;padding:20px;cursor:pointer;user-select:none}
    .card-header:hover{background:#252525}
    .expand-icon{font-size:12px;color:#808080;margin-left:auto;transition:transform 0.2s}
    .card.expanded .expand-icon{transform:rotate(180deg);color:#4dabf7}
    .card-body{padding:0 20px 20px}
    .k{font-size:12px;color:#808080;font-weight:600}
    .t{font-size:16px;font-weight:700;margin-top:6px;line-height:1.4;flex:1;color:#ffffff}
    .m{margin-top:16px;font-size:14px;line-height:1.8;color:#c0c0c0}
    .m div{margin-bottom:8px}
    .m b{color:#ffffff;font-weight:700}
    .highlight-number{color:#4dabf7;font-weight:700;font-size:15px}
    .tag{display:inline-block;margin-top:10px;padding:4px 12px;border-radius:6px;background:#2d2d2d;color:#c0c0c0;font-size:12px;font-weight:500}
    .data-date{margin-top:12px;font-size:12px;color:#808080}
    .card-expanded{display:none !important;margin-top:20px;padding-top:20px;border-top:1px solid #2d2d2d}
    .card.expanded .card-expanded{display:block !important}
    .expanded-section{margin-bottom:16px}
    .expanded-label{font-size:12px;color:#808080;margin-bottom:6px;font-weight:500}
    .expanded-value{font-size:16px;font-weight:700;color:#ffffff}
    .i{margin-top:20px;padding-top:20px;border-top:1px solid #2d2d2d}
    .interpretation-label{font-size:12px;font-weight:600;color:#808080;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px}
    .interpretation-text{font-size:14px;line-height:1.8;color:#c0c0c0}
    .s{margin-top:16px;padding-top:16px;border-top:1px solid #2d2d2d;font-size:12px;color:#808080}
    
    /* 종합 QT/QE 평가 섹션 */
    .qt-qe-summary{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;margin:32px 0;overflow:hidden}
    .qt-qe-header{padding:20px;border-bottom:1px solid #2d2d2d}
    .qt-qe-header h2{margin:0;font-size:18px;font-weight:700;color:#ffffff}
    .qt-qe-content{padding:20px}
    .qt-qe-main{padding:20px;background:#252525;border-radius:8px}
    .qt-qe-label{font-size:12px;color:#808080;margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px}
    .qt-qe-value{font-size:24px;font-weight:700;margin-bottom:12px}
    .qt-qe-detail{font-size:14px;line-height:1.7;color:#c0c0c0}
    
    /* 주간 리포트 - 다크 모드 (밝게 조정) */
    .weekly-report{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;margin:40px 0;overflow:hidden}
    .report-header{display:flex;align-items:center;justify-content:space-between;padding:20px;cursor:pointer;user-select:none;border-bottom:1px solid #2d2d2d}
    .report-header:hover{background:#252525}
    .report-header h2{margin:0;font-size:18px;font-weight:700;color:#ffffff}
    .report-content{display:none;padding:20px}
    .weekly-report.expanded .report-content{display:block}
    .weekly-report.expanded .expand-icon{transform:rotate(180deg);color:#4dabf7}
    .report-main-phrase{font-size:20px;font-weight:700;color:#ffffff;margin-bottom:20px;padding:16px;background:#252525;border-radius:8px;border-left:4px solid #4dabf7;line-height:1.5}
    .report-text{font-size:14px;line-height:1.9;white-space:pre-line}
    .report-section-title{margin-top:20px;margin-bottom:12px;font-weight:700;font-size:16px;color:#ffffff}
    .report-bullet{margin-bottom:8px;padding-left:8px;color:#c0c0c0;line-height:1.7}
    .report-sub-bullet{margin-bottom:4px;padding-left:24px;color:#808080;font-size:13px;line-height:1.6}
    .report-paragraph{margin-bottom:12px;color:#c0c0c0;line-height:1.8}
    .report-text strong{color:#ffffff;font-weight:700}
    
    /* Info 섹션 - 다크 모드 (밝게 조정) */
    .info-section{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;margin:20px 0;overflow:hidden}
    .info-header{display:flex;align-items:center;gap:10px;padding:16px 20px;cursor:pointer;user-select:none;font-size:14px;font-weight:500;color:#ffffff;border-bottom:1px solid #2d2d2d}
    .info-header:hover{background:#252525}
    .info-icon{font-size:18px}
    .info-content{display:none;padding:20px;font-size:14px;line-height:1.8;color:#c0c0c0}
    .info-content p{margin-bottom:12px}
    .info-content strong{color:#ffffff;font-weight:700}
    .info-section.expanded .info-content{display:block}
    .info-section.expanded .expand-icon{transform:rotate(180deg);color:#4dabf7}
    
    @media (max-width: 768px) {
      .cards-grid{grid-template-columns:1fr}
      .signal-detail{flex-direction:column;gap:8px}
    }
  </style>
</head>
<body>
  <div class="page-header">
    <div class="page-header-content">
      <h1>FED H.4.1 유동성 대시보드 🎯</h1>
      <div class="sub">
        Release: ${escapeHtml(report.releaseDateText)} · Week ended: ${escapeHtml(report.asOfWeekEndedText)}<br/>
        API: <a href="/api/h41">/api/h41</a> · 알림용 텍스트: <a href="/api/h41.txt">/api/h41.txt</a> · 
        <a href="/concepts" style="font-weight:600">계정항목 알아보기 📋</a>
      </div>
      ${usdKrwRate ? `
      <div class="exchange-rate-container">
        <span class="exchange-rate-label">💵 USD/KRW:</span>
        <span class="exchange-rate-value" id="exchangeRateValue">${usdKrwRate.price.toFixed(2)}</span>
        <span class="exchange-rate-change ${usdKrwRate.change > 0 ? 'exchange-rate-up' : usdKrwRate.change < 0 ? 'exchange-rate-down' : 'exchange-rate-neutral'}" id="exchangeRateChange">
          ${usdKrwRate.change > 0 ? '📈' : usdKrwRate.change < 0 ? '📉' : '➡️'} ${usdKrwRate.change > 0 ? '+' : ''}${usdKrwRate.change.toFixed(2)} (${usdKrwRate.changePercent > 0 ? '+' : ''}${usdKrwRate.changePercent.toFixed(2)}%)
        </span>
        <button class="exchange-rate-refresh" id="exchangeRateRefresh" onclick="refreshExchangeRate()" title="환율 새로고침">
          🔄
        </button>
      </div>
      ` : ''}
      <div class="date-selector">
        <label for="dateInput">FED 발표 날짜 선택:</label>
        <input type="date" id="dateInput" value="${targetDate || ''}" style="padding:6px 12px;border:1px solid #2d2d2d;border-radius:6px;background:#1f1f1f;color:#ffffff;font-size:13px;cursor:pointer" />
        <button onclick="loadDate()">조회</button>
        ${targetDate ? `<button class="reset-btn" onclick="resetDate()">초기화</button>` : ''}
      </div>
    </div>
    <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;justify-content:flex-end">
      <a href="/macro-trace" class="macro-trace-link" title="주간 목금월 루틴 워크북">
        주간 목금월 루틴
      </a>
      <a href="/platform-map" class="macro-trace-link" title="보물지도: 한국 시군구 플랫폼 편입 등급 지도">
        보물지도
      </a>
      <div class="traffic-light-container">
        <a href="/economic-indicators" class="traffic-light-link" title="${economicStatus ? escapeHtml(economicStatus.summary) : "경제 지표 데이터를 불러오는 중..."}">
          <div class="traffic-light-circle" style="background:${trafficLightColor}"></div>
          <div class="traffic-light-label">경제 진단</div>
          <div class="traffic-light-label" style="color:${trafficLightColor};font-weight:700">${trafficLightText}</div>
          ${economicStatus ? `<div class="traffic-light-score">점수: ${economicStatus.score}/100</div>` : ""}
        </a>
      </div>
      <div class="traffic-light-container">
        <a href="/secret-indicators" class="traffic-light-link" title="자본주의 내부 신경계를 해부하는 12개 선행 지표">
          <div class="traffic-light-circle" style="background:linear-gradient(135deg,#8b5cf6 0%,#6366f1 100%)"></div>
          <div class="traffic-light-label">비밀지표</div>
          <div class="traffic-light-label" style="color:#a78bfa;font-weight:700">12개</div>
          <div class="traffic-light-score">선행지표</div>
        </a>
      </div>
    </div>
  </div>
  
  ${headerSection}
  
  <div class="main-content">
    <div class="cards-grid">
      ${cardsHtml}
    </div>
    
    ${qtQeSummarySection}
    
    ${weeklyReportSection}
    
    ${infoSection}
  </div>
  
  <script>
    function loadDate() {
      const dateInput = document.getElementById('dateInput');
      const selectedDate = dateInput ? dateInput.value : null;
      if (selectedDate) {
        window.location.href = '/?date=' + selectedDate;
      } else {
        window.location.href = '/';
      }
    }
    
    function resetDate() {
      window.location.href = '/';
    }
    
    async function refreshExchangeRate() {
      const refreshBtn = document.getElementById('exchangeRateRefresh');
      const valueEl = document.getElementById('exchangeRateValue');
      const changeEl = document.getElementById('exchangeRateChange');
      
      if (!refreshBtn || !valueEl || !changeEl) return;
      
      refreshBtn.classList.add('loading');
      refreshBtn.disabled = true;
      
      try {
        const response = await fetch('/api/exchange-rate');
        if (response.ok) {
          const data = await response.json();
          if (data.price) {
            valueEl.textContent = data.price.toFixed(2);
            const changeSign = data.change > 0 ? '+' : '';
            const changePercentSign = data.changePercent > 0 ? '+' : '';
            const emoji = data.change > 0 ? '📈' : data.change < 0 ? '📉' : '➡️';
            const changeClass = data.change > 0 ? 'exchange-rate-up' : data.change < 0 ? 'exchange-rate-down' : 'exchange-rate-neutral';
            changeEl.className = 'exchange-rate-change ' + changeClass;
            changeEl.innerHTML = emoji + ' ' + changeSign + data.change.toFixed(2) + ' (' + changePercentSign + data.changePercent.toFixed(2) + '%)';
          }
        }
      } catch (error) {
        console.error('Failed to refresh exchange rate:', error);
      } finally {
        refreshBtn.classList.remove('loading');
        refreshBtn.disabled = false;
      }
    }
    
    function toggleNews() {
      const newsList = document.getElementById('newsList');
      const newsToggle = document.getElementById('newsToggle');
      if (newsList && newsToggle) {
        newsList.classList.toggle('expanded');
        newsToggle.textContent = newsList.classList.contains('expanded') ? '숨기기' : '더보기';
      }
    }
    
    function toggleCard(idx) {
      try {
        const card = document.querySelector('[data-card-id="' + idx + '"]');
        if (!card) {
          console.error('Card not found for idx:', idx);
          return;
        }
        
        const isExpanded = card.classList.contains('expanded');
        card.classList.toggle('expanded');
        
        const expandIcon = document.getElementById('expand-icon-' + idx);
        const expandedContent = document.getElementById('card-expanded-' + idx);
        
        if (expandIcon) {
          expandIcon.textContent = !isExpanded ? '▲' : '▼';
        }
        
        if (expandedContent) {
          expandedContent.style.display = !isExpanded ? 'block' : 'none';
        }
        
        console.log('Card toggled:', idx, 'Expanded:', !isExpanded, 'Card element:', card);
      } catch (error) {
        console.error('Error in toggleCard:', error, 'idx:', idx);
      }
    }
    
    function toggleReport() {
      const report = document.querySelector('.weekly-report');
      if (report) {
        report.classList.toggle('expanded');
        const expandIcon = document.getElementById('report-icon');
        if (expandIcon) {
          expandIcon.textContent = report.classList.contains('expanded') ? '▲' : '▼';
        }
      }
    }
    
    function toggleInfo() {
      const info = document.querySelector('.info-section');
      info.classList.toggle('expanded');
    }
  </script>
</body>
</html>`);
  } catch (e: any) {
    res.status(500).send(e?.message ?? String(e));
  }
});

// 레벨 설명 페이지
app.get("/levels", async (_req, res) => {
  try {
      const levelDescriptions = {
      0: {
        title: "LEVEL 0 - 안정",
        emoji: "✅",
        description: "유동성 환경이 안정적인 국면이에요.",
        details: [
          "성장주, 기술주, 장기 테마 자산에 대한 비중을 늘릴 수 있는 구간이에요. 거대 자본가들도 이런 시점에 성장 자산의 비중을 늘립니다.",
          "시장 유동성 공급이 흡수 요인을 상쇄하고 있어서, 자산 가격에 긍정적 영향을 줄 수 있는 환경이에요.",
          "고변동성 자산의 상승 여력이 충분해요. 리스크 관리보다는 성장 포트폴리오를 확대하는 데 집중하는 게 좋을 것 같아요."
        ]
      },
      1: {
        title: "LEVEL 1 - 주의",
        emoji: "⚠️",
        description: "유동성 흡수 신호가 일부 보여요.",
        details: [
          "공격적 자산 비중은 유지하되, 변동성 확대에 대비해서 분산하는 게 좋아요. 거대 자본가들도 이런 시점을 '관찰 모드'로 보고 있어요.",
          "일부 유동성 압박 신호가 보이지만, 전반적으로는 안정적인 수준을 유지하고 있어요.",
          "성장 자산과 방어 자산의 균형을 유지하면서 점진적으로 포트폴리오를 조정하는 게 좋을 것 같아요."
        ]
      },
      2: {
        title: "LEVEL 2 - 경계",
        emoji: "🔶",
        description: "유동성 압박이 가시화되고 있어요.",
        details: [
          "방어적 자산과 현금성 비중을 점진적으로 높이는 게 좋아요. 거대 자본가들도 이런 환경에서 방어적으로 포지션을 조정합니다.",
          "시장 유동성이 전주 대비 더 타이트해졌어요. 변동성 확대 가능성이 있으니 주의해야 합니다.",
          "고변동성 자산의 리스크 관리가 필요한 시점이에요. 방어적 자산에 유리한 환경이 지속되고 있어요."
        ]
      },
      3: {
        title: "LEVEL 3 - 위험",
        emoji: "🚨",
        description: "유동성 급감과 긴축 가속이 동시에 진행 중이에요.",
        details: [
          "고위험 자산 비중을 줄이고 방어적 포지션을 유지하는 게 우선이에요. 거대 자본가들도 이런 시점에 방어 모드로 전환합니다.",
          "유동성 흡수 요인의 증가와 공급 요인의 감소가 동시에 진행되어서, 시장 변동성이 크게 확대될 수 있어요.",
          "현금성 자산과 방어적 섹터에 집중하고, 고위험 자산의 노출을 최소화하는 게 좋을 것 같아요."
        ]
      }
    };

    const levelsHtml = Object.entries(levelDescriptions).map(([level, info]) => {
      const levelNum = Number(level);
      const levelColors = ["#22c55e", "#f59e0b", "#f97316", "#ef4444"];
      return `
      <div class="level-item">
        <div class="level-header">
          <span class="level-badge" style="background: ${levelColors[levelNum]}">${info.emoji} ${info.title}</span>
        </div>
        <div class="level-description">
          <p class="level-main-desc">${escapeHtml(info.description)}</p>
          <ul class="level-details">
            ${info.details.map(detail => `<li>${escapeHtml(detail)}</li>`).join("")}
          </ul>
        </div>
      </div>`;
    }).join("\n");

    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(`
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>레벨 설명 - FED H.4.1</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;margin:0;background:#121212;color:#e8e8e8;line-height:1.6}
    
    .page-header{padding:20px 24px;border-bottom:1px solid #2d2d2d;position:sticky;top:0;background:#1a1a1a;z-index:100}
    .page-header h1{margin:0;font-size:20px;font-weight:700;color:#ffffff}
    .page-header .sub{opacity:.8;font-size:13px;margin-top:8px;line-height:1.5;color:#c0c0c0}
    .page-header a{color:#4dabf7;text-decoration:none;font-weight:500}
    .page-header a:hover{text-decoration:underline;color:#74c0fc}
    
    .main-content{padding:24px;max-width:1000px;margin:0 auto}
    
    .level-item{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:24px;margin-bottom:20px}
    .level-header{margin-bottom:16px}
    .level-badge{padding:8px 16px;border-radius:6px;font-weight:700;font-size:16px;color:#ffffff;display:inline-block}
    .level-description{color:#c0c0c0}
    .level-main-desc{font-size:16px;font-weight:600;color:#ffffff;margin-bottom:12px}
    .level-details{list-style:none;padding-left:0;margin-top:12px}
    .level-details li{padding-left:20px;position:relative;margin-bottom:8px;line-height:1.7}
    .level-details li:before{content:"•";position:absolute;left:0;color:#4dabf7;font-weight:700}
  </style>
</head>
<body>
  <div class="page-header">
    <h1>레벨 설명</h1>
    <div class="sub">
      <a href="/">← 대시보드로 돌아가기</a>
    </div>
  </div>
  
  <div class="main-content">
    ${levelsHtml}
  </div>
</body>
</html>`);
  } catch (e: any) {
    res.status(500).send(e?.message ?? String(e));
  }
});

// 계정 개념 페이지
app.get("/concepts", async (_req, res) => {
  try {
    const coreItems = ITEM_DEFS.filter(item => item.isCore);
    
    const conceptsHtml = coreItems.map(item => {
      const concept = getConcept(item.fedLabel, item.liquidityTag);
      return `
      <div class="concept-item">
        <div class="concept-header">
          <span class="concept-key">${item.key}</span>
          <h3 class="concept-title">${escapeHtml(item.title)}</h3>
        </div>
        <div class="concept-content">${escapeHtml(concept)}</div>
        <div class="concept-label">${escapeHtml(item.fedLabel)}</div>
      </div>`;
    }).join("\n");

    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(`
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>계정항목 알아보기 - FED H.4.1</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;margin:0;background:#121212;color:#e8e8e8;line-height:1.6}
    
    .page-header{padding:20px 24px;border-bottom:1px solid #2d2d2d;position:sticky;top:0;background:#1a1a1a;z-index:100}
    .page-header h1{margin:0;font-size:20px;font-weight:700;color:#ffffff}
    .page-header .sub{opacity:.8;font-size:13px;margin-top:8px;line-height:1.5;color:#c0c0c0}
    .page-header a{color:#4dabf7;text-decoration:none;font-weight:500}
    .page-header a:hover{text-decoration:underline;color:#74c0fc}
    
    .main-content{padding:24px;max-width:1000px;margin:0 auto}
    
    .concept-item{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:24px;margin-bottom:20px}
    .concept-header{display:flex;align-items:flex-start;gap:12px;margin-bottom:16px}
    .concept-key{font-size:14px;color:#808080;font-weight:600}
    .concept-title{font-size:18px;font-weight:700;color:#ffffff;flex:1;margin:0}
    .concept-content{font-size:14px;line-height:1.8;color:#c0c0c0;margin-bottom:12px}
    .concept-label{font-size:12px;color:#808080;padding-top:12px;border-top:1px solid #2d2d2d}
  </style>
</head>
<body>
  <div class="page-header">
    <h1>계정항목 알아보기 📋</h1>
    <div class="sub">
      <a href="/">← 대시보드로 돌아가기</a>
    </div>
  </div>
  
  <div class="main-content">
    ${conceptsHtml}
  </div>
</body>
</html>`);
  } catch (e: any) {
    res.status(500).send(e?.message ?? String(e));
  }
});

// 경제 지표 페이지
app.get("/economic-indicators", async (_req, res) => {
  try {
    const indicators = await fetchAllEconomicIndicators();
    const status = diagnoseEconomicStatus(indicators);
    
    const statusColors = {
      green: "#22c55e",
      yellow: "#f59e0b",
      red: "#ef4444",
    };
    
    const statusTexts = {
      green: "양호",
      yellow: "주의",
      red: "위험",
    };
    
    // 카테고리별로 그룹화
    const indicatorsByCategory: Record<string, typeof indicators> = {};
    indicators.forEach((ind) => {
      if (!indicatorsByCategory[ind.category]) {
        indicatorsByCategory[ind.category] = [];
      }
      indicatorsByCategory[ind.category].push(ind);
    });
    
    // FED 자산/부채 카테고리 추가 (1번째 위치로)
    indicatorsByCategory["FED자산/부채"] = [];
    
    // 카테고리 순서 정의 (FED자산/부채를 첫 번째로)
    const categoryOrder = ["FED자산/부채", "금리", "지수", "심리", "신용"];
    const orderedCategories = categoryOrder.filter(cat => indicatorsByCategory[cat] !== undefined);
    const otherCategories = Object.keys(indicatorsByCategory).filter(cat => !categoryOrder.includes(cat));
    const finalCategoryOrder = [...orderedCategories, ...otherCategories];
    
    const categorySections = finalCategoryOrder.map((category: string) => {
      const items = indicatorsByCategory[category];
      return [category, items] as [string, typeof indicators];
    }).map(([category, items]: [string, typeof indicators]) => {
      // FED 자산/부채는 특별 처리
      if (category === "FED자산/부채") {
        return `
        <div class="category-section">
          <h2 class="category-title">${escapeHtml(category)}</h2>
          <div class="indicators-grid">
            <a href="/economic-indicators/fed-assets-liabilities" class="indicator-item-link">
              <div class="indicator-item" style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#ffffff;border:none">
                <div class="indicator-header">
                  <div class="indicator-name" style="color:#ffffff">FED 자산/부채 분석</div>
                  <div class="indicator-symbol" style="color:rgba(255,255,255,0.8)">자산과 부채 종합 분석</div>
                </div>
                <div class="indicator-value">
                  <span class="value-main" style="color:#ffffff">자세히 보기</span>
                </div>
                <div class="indicator-meta" style="color:rgba(255,255,255,0.8)">
                  <span>H.4.1 리포트 기반</span>
                </div>
              </div>
            </a>
          </div>
        </div>
        `;
      }
      const itemsHtml = items.map((ind) => {
        const changeColor = ind.changePercent !== null
          ? (ind.changePercent > 0 ? "#ff6b6b" : ind.changePercent < 0 ? "#51cf66" : "#adb5bd")
          : "#adb5bd";
        const changeSign = ind.changePercent !== null && ind.changePercent > 0 ? "+" : "";
        
        const detailLink = ind.id ? `/economic-indicators/${ind.id}` : "#";
        return `
        <a href="${detailLink}" class="indicator-item-link" ${!ind.id ? 'onclick="return false;"' : ""}>
        <div class="indicator-item">
          <div class="indicator-header">
            <div class="indicator-name">${escapeHtml(ind.name)}</div>
            <div class="indicator-symbol">${escapeHtml(ind.symbol)}</div>
          </div>
          <div class="indicator-value">
            ${ind.value !== null 
              ? `<span class="value-main">${ind.value.toFixed(2)}</span><span class="value-unit">${escapeHtml(ind.unit)}</span>`
              : "<span class=\"value-null\">데이터 없음</span>"}
          </div>
          ${ind.changePercent !== null 
            ? `<div class="indicator-change" style="color:${changeColor}">
                ${changeSign}${ind.changePercent.toFixed(2)}%
                ${ind.change !== null ? `(${changeSign}${ind.change.toFixed(2)})` : ""}
              </div>`
            : ""}
          <div class="indicator-meta">
            <span class="indicator-source">${escapeHtml(ind.source)}</span>
            <span class="indicator-updated">${new Date(ind.lastUpdated).toLocaleString("ko-KR")}</span>
          </div>
          ${ind.id ? '<div class="indicator-detail-link">상세 보기 →</div>' : ""}
        </div>
        </a>`;
      }).join("");
      
      return `
      <div class="category-section">
        <h2 class="category-title">${escapeHtml(category)}</h2>
        <div class="indicators-grid">
          ${itemsHtml}
        </div>
      </div>`;
    }).join("");
    
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(`
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>경제 지표 - FED H.4.1</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;margin:0;background:#121212;color:#e8e8e8;line-height:1.6}
    
    .page-header{padding:20px 24px;border-bottom:1px solid #2d2d2d;position:sticky;top:0;background:#1a1a1a;z-index:100}
    .page-header h1{margin:0;font-size:20px;font-weight:700;color:#ffffff}
    .page-header .sub{opacity:.8;font-size:13px;margin-top:8px;line-height:1.5;color:#c0c0c0}
    .page-header a{color:#4dabf7;text-decoration:none;font-weight:500}
    .page-header a:hover{text-decoration:underline;color:#74c0fc}
    
    .status-summary{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:24px;margin:24px;max-width:1400px;margin-left:auto;margin-right:auto}
    .status-header{display:flex;align-items:center;gap:16px;margin-bottom:16px}
    .status-circle{width:48px;height:48px;border-radius:50%;background:${statusColors[status.status]};box-shadow:0 0 16px ${statusColors[status.status]}40}
    .status-info h2{margin:0;font-size:20px;font-weight:700;color:#ffffff}
    .status-info .status-text{font-size:14px;color:#c0c0c0;margin-top:4px}
    .status-score{margin-left:auto;text-align:right}
    .status-score-value{font-size:32px;font-weight:700;color:${statusColors[status.status]}}
    .status-score-label{font-size:12px;color:#808080;margin-top:4px}
    .status-summary-text{font-size:14px;line-height:1.8;color:#c0c0c0;margin-top:16px;padding-top:16px;border-top:1px solid #2d2d2d}
    
    .main-content{padding:24px;max-width:1400px;margin:0 auto}
    
    .category-section{margin-bottom:40px}
    .category-title{font-size:18px;font-weight:700;color:#ffffff;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #2d2d2d}
    
    .indicators-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
    .indicator-item-link{text-decoration:none;color:inherit;display:block}
    .indicator-item{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:20px;transition:all 0.2s;cursor:pointer}
    .indicator-item:hover{border-color:#3d3d3d;transform:translateY(-2px)}
    .indicator-detail-link{font-size:12px;color:#4dabf7;margin-top:12px;text-align:right;font-weight:500}
    .indicator-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}
    .indicator-name{font-size:15px;font-weight:600;color:#ffffff;flex:1}
    .indicator-symbol{font-size:11px;color:#808080;background:#2d2d2d;padding:2px 8px;border-radius:4px;margin-left:8px}
    .indicator-value{margin-bottom:8px}
    .value-main{font-size:24px;font-weight:700;color:#ffffff}
    .value-unit{font-size:14px;color:#808080;margin-left:4px}
    .value-null{font-size:14px;color:#808080;font-style:italic}
    .indicator-change{font-size:13px;font-weight:600;margin-bottom:8px}
    .indicator-meta{display:flex;justify-content:space-between;font-size:11px;color:#808080;padding-top:8px;border-top:1px solid #2d2d2d}
    
    @media (max-width: 768px) {
      .indicators-grid{grid-template-columns:1fr}
      .status-header{flex-direction:column;align-items:flex-start}
      .status-score{margin-left:0;margin-top:12px}
    }
  </style>
</head>
<body>
  <div class="page-header">
    <h1>경제 지표 📈</h1>
    <div class="sub">
      <a href="/">← 대시보드로 돌아가기</a>
    </div>
  </div>
  
  <div class="status-summary">
    <div class="status-header">
      <div class="status-circle"></div>
      <div class="status-info">
        <h2>경제 상태: ${statusTexts[status.status]}</h2>
        <div class="status-text">경제코치의 종합 진단 결과예요</div>
      </div>
      <div class="status-score">
        <div class="status-score-value">${status.score}</div>
        <div class="status-score-label">점수 / 100</div>
      </div>
    </div>
    <div class="status-summary-text">${escapeHtml(status.summary)}</div>
  </div>
  
  <div class="main-content">
    ${categorySections}
  </div>
</body>
</html>`);
  } catch (e: any) {
    res.status(500).send(e?.message ?? String(e));
  }
});

// Fear & Greed Index 전용 페이지 (일반 세부 페이지보다 먼저 정의)
app.get("/economic-indicators/fear-greed-index", async (req, res) => {
  try {
    const detail = await getIndicatorDetail("fear-greed-index", '1Y');
    
    if (!detail.indicator) {
      res.status(404).send("죄송해요, Fear & Greed Index 데이터를 찾을 수 없어요.");
      return;
    }
    
    const ind = detail.indicator;
    const currentValue = ind.value !== null ? Math.round(ind.value) : 0;
    
    // 구간 판단
    const getLevel = (value: number): { name: string; color: string; bgColor: string } => {
      if (value < 25) return { name: "EXTREME FEAR", color: "#ef4444", bgColor: "#7f1d1d" };
      if (value < 45) return { name: "FEAR", color: "#f97316", bgColor: "#7c2d12" };
      if (value < 55) return { name: "NEUTRAL", color: "#eab308", bgColor: "#713f12" };
      if (value < 75) return { name: "GREED", color: "#22c55e", bgColor: "#14532d" };
      return { name: "EXTREME GREED", color: "#10b981", bgColor: "#064e3b" };
    };
    
    const level = getLevel(currentValue);
    
    // 히스토리 데이터 계산
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    
    const findClosestValue = (targetDate: Date): { value: number; date: string } | null => {
      if (!detail.history || detail.history.length === 0) return null;
      let closest = detail.history[0];
      let minDiff = Math.abs(new Date(closest.date).getTime() - targetDate.getTime());
      
      for (const h of detail.history) {
        const diff = Math.abs(new Date(h.date).getTime() - targetDate.getTime());
        if (diff < minDiff) {
          minDiff = diff;
          closest = h;
        }
      }
      return { value: Math.round(closest.value), date: closest.date };
    };
    
    const previousClose = detail.history && detail.history.length > 1 
      ? { value: Math.round(detail.history[detail.history.length - 2].value), date: detail.history[detail.history.length - 2].date }
      : null;
    const weekAgo = findClosestValue(oneWeekAgo);
    const monthAgo = findClosestValue(oneMonthAgo);
    const yearAgo = findClosestValue(oneYearAgo);
    
    const getLevelForValue = (value: number): string => {
      if (value < 25) return "Extreme Fear";
      if (value < 45) return "Fear";
      if (value < 55) return "Neutral";
      if (value < 75) return "Greed";
      return "Extreme Greed";
    };
    
    const getBadgeColor = (value: number): string => {
      if (value < 25) return "#ef4444";
      if (value < 45) return "#f97316";
      if (value < 55) return "#808080";
      if (value < 75) return "#22c55e";
      return "#10b981";
    };
    
    // 게이지 각도 계산 (0-180도, 반원)
    const gaugeAngle = (currentValue / 100) * 180;
    
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(`
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Fear & Greed Index - 경제 지표 상세</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;margin:0;background:#f5f5f5;color:#333333;line-height:1.6}
    
    .page-header{padding:20px 24px;border-bottom:1px solid #e0e0e0;position:sticky;top:0;background:#ffffff;z-index:100}
    .page-header h1{margin:0;font-size:20px;font-weight:700;color:#000000}
    .page-header .sub{opacity:.8;font-size:13px;margin-top:8px;line-height:1.5;color:#666666}
    .page-header a{color:#0066cc;text-decoration:none;font-weight:500}
    .page-header a:hover{text-decoration:underline;color:#0052a3}
    
    .main-content{padding:24px;max-width:1400px;margin:0 auto}
    
    .fng-container{display:flex;gap:32px;flex-wrap:wrap;margin-bottom:32px}
    
    .gauge-section{flex:1;min-width:400px;background:#ffffff;border:1px solid #e0e0e0;border-radius:12px;padding:32px;display:flex;flex-direction:column;align-items:center}
    .fng-title{font-size:28px;font-weight:700;color:#000000;margin-bottom:8px;text-align:center}
    .fng-question{font-size:16px;color:#666666;margin-bottom:16px;text-align:center}
    .fng-link{color:#0066cc;text-decoration:none;font-size:14px;margin-bottom:32px}
    .fng-link:hover{text-decoration:underline}
    
    .gauge-wrapper{position:relative;width:100%;max-width:500px;margin:0 auto 32px}
    .gauge-svg{width:100%;height:auto}
    .gauge-value{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);font-size:48px;font-weight:700;color:#000000;text-align:center}
    
    .fng-updated{font-size:13px;color:#666666;text-align:center}
    
    .history-section{flex:0 0 320px;background:#ffffff;border:1px solid #e0e0e0;border-radius:12px;padding:24px}
    .history-item{margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid #e0e0e0}
    .history-item:last-child{border-bottom:none;margin-bottom:0;padding-bottom:0}
    .history-label{font-size:13px;color:#666666;margin-bottom:8px}
    .history-value-row{display:flex;align-items:center;gap:12px}
    .history-badge{width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#ffffff}
    .history-level{font-size:14px;color:#333333}
    
    .analysis-section{background:#ffffff;border:1px solid #e0e0e0;border-radius:12px;padding:24px;margin-bottom:24px}
    .analysis-title{font-size:18px;font-weight:700;color:#000000;margin-bottom:16px}
    .analysis-text{font-size:15px;line-height:2.2;color:#333333;white-space:pre-line}
    .analysis-text strong{color:#000000;font-weight:700}
    
    .news-section-detail{background:#ffffff;border:1px solid #e0e0e0;border-radius:12px;padding:24px;margin-bottom:24px}
    .news-section-title{font-size:18px;font-weight:700;color:#000000;margin-bottom:16px}
    .news-list-detail{display:flex;flex-direction:column;gap:12px;margin-bottom:16px}
    .news-item-detail{padding:12px;background:#f9f9f9;border-radius:8px;border:1px solid #e0e0e0;transition:all 0.2s}
    .news-item-detail:hover{background:#f0f0f0;border-color:#d0d0d0}
    .news-content-detail{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
    .news-text-detail{flex:1;font-size:14px;line-height:1.6;color:#333333}
    .news-meta-detail{display:flex;flex-direction:column;align-items:flex-end;gap:4px}
    .news-source-detail{font-size:12px;color:#666666;white-space:nowrap;padding:4px 8px;background:#e0e0e0;border-radius:4px}
    .news-date-detail{font-size:11px;color:#999999;white-space:nowrap}
    .news-comment{margin-top:16px;padding-top:16px;border-top:1px solid #e0e0e0}
    .news-comment-title{font-size:16px;font-weight:700;color:#000000;margin-bottom:12px}
    .news-comment-text{font-size:14px;line-height:1.8;color:#333333}
    
    @media (max-width: 768px) {
      .fng-container{flex-direction:column}
      .gauge-section{min-width:auto}
      .history-section{flex:1 1 100%}
      .gauge-value{font-size:36px}
    }
  </style>
</head>
<body>
  <div class="page-header">
    <h1>Fear & Greed Index</h1>
    <div class="sub">
      <a href="/economic-indicators">← 경제 지표로 돌아가기</a>
    </div>
  </div>
  
  <div class="main-content">
    <div class="fng-container">
      <div class="gauge-section">
        <div class="fng-title">Fear & Greed Index</div>
        <div class="fng-question">What emotion is driving the market now?</div>
        <a href="https://www.cnn.com/markets/fear-and-greed" target="_blank" class="fng-link">Learn more about the index</a>
        
        <div class="gauge-wrapper">
          <svg class="gauge-svg" viewBox="0 0 400 250" xmlns="http://www.w3.org/2000/svg">
            <!-- 배경 원호 (가독성 개선: 더 진한 배경) -->
            <path d="M 50 200 A 150 150 0 0 1 350 200" fill="none" stroke="#d0d0d0" stroke-width="22" stroke-linecap="round"/>
            
            <!-- 구간별 색상 (0-100 범위, 가독성 개선: 더 두껍고 진한 색상) -->
            <!-- EXTREME FEAR: 0-25 -->
            <path d="M 50 200 A 150 150 0 0 1 125 50" fill="none" stroke="#dc2626" stroke-width="22" stroke-linecap="round"/>
            <!-- FEAR: 25-45 -->
            <path d="M 125 50 A 150 150 0 0 1 200 50" fill="none" stroke="#ea580c" stroke-width="22" stroke-linecap="round"/>
            <!-- NEUTRAL: 45-55 -->
            <path d="M 200 50 A 150 150 0 0 1 275 50" fill="none" stroke="#ca8a04" stroke-width="22" stroke-linecap="round"/>
            <!-- GREED: 55-75 -->
            <path d="M 275 50 A 150 150 0 0 1 350 200" fill="none" stroke="#16a34a" stroke-width="22" stroke-linecap="round"/>
            
            <!-- 현재 값 강조 (활성 구간, 가독성 개선: 더 두껍고 진한 색상) -->
            ${currentValue >= 75 ? `
            <!-- EXTREME GREED: 75-100 -->
            <path d="M 350 200 A 150 150 0 0 1 350 200" fill="none" stroke="#059669" stroke-width="26" stroke-linecap="round" opacity="1"/>
            ` : currentValue >= 55 && currentValue < 75 ? `
            <!-- GREED: 55-75 -->
            <path d="M 275 50 A 150 150 0 0 1 350 200" fill="none" stroke="#16a34a" stroke-width="26" stroke-linecap="round" opacity="1"/>
            ` : currentValue >= 45 && currentValue < 55 ? `
            <!-- NEUTRAL: 45-55 -->
            <path d="M 200 50 A 150 150 0 0 1 275 50" fill="none" stroke="#ca8a04" stroke-width="26" stroke-linecap="round" opacity="1"/>
            ` : currentValue >= 25 && currentValue < 45 ? `
            <!-- FEAR: 25-45 -->
            <path d="M 125 50 A 150 150 0 0 1 200 50" fill="none" stroke="#ea580c" stroke-width="26" stroke-linecap="round" opacity="1"/>
            ` : `
            <!-- EXTREME FEAR: 0-25 -->
            <path d="M 50 200 A 150 150 0 0 1 125 50" fill="none" stroke="#dc2626" stroke-width="26" stroke-linecap="round" opacity="1"/>
            `}
            
            <!-- 눈금 (가독성 개선: 더 두껍고 진한 색상) -->
            <line x1="50" y1="200" x2="50" y2="210" stroke="#666666" stroke-width="3"/>
            <line x1="125" y1="50" x2="130" y2="45" stroke="#666666" stroke-width="3"/>
            <line x1="200" y1="50" x2="200" y2="40" stroke="#666666" stroke-width="3"/>
            <line x1="275" y1="50" x2="270" y2="45" stroke="#666666" stroke-width="3"/>
            <line x1="350" y1="200" x2="350" y2="210" stroke="#666666" stroke-width="3"/>
            
            <!-- 눈금 라벨 (가독성 개선: 큰 글자, 진한 색상) -->
            <text x="50" y="225" fill="#333333" font-size="14" text-anchor="middle" font-weight="700">0</text>
            <text x="125" y="40" fill="#333333" font-size="14" text-anchor="middle" font-weight="700">25</text>
            <text x="200" y="30" fill="#333333" font-size="14" text-anchor="middle" font-weight="700">50</text>
            <text x="275" y="40" fill="#333333" font-size="14" text-anchor="middle" font-weight="700">75</text>
            <text x="350" y="225" fill="#333333" font-size="14" text-anchor="middle" font-weight="700">100</text>
            
            <!-- 구간 라벨 (가독성 개선: 큰 글자, 배경 원, 그림자 효과) -->
            <!-- EXTREME FEAR 배경 -->
            <circle cx="87.5" cy="120" r="28" fill="rgba(255,255,255,0.9)" stroke="#ef4444" stroke-width="2"/>
            <text x="87.5" y="115" fill="#dc2626" font-size="12" font-weight="700" text-anchor="middle" transform="rotate(-45 87.5 120)">
              <tspan x="87.5" dy="0">EXTREME</tspan>
              <tspan x="87.5" dy="13">FEAR</tspan>
            </text>
            
            <!-- FEAR 배경 -->
            <circle cx="162.5" cy="70" r="22" fill="rgba(255,255,255,0.9)" stroke="#ea580c" stroke-width="2"/>
            <text x="162.5" y="70" fill="#ea580c" font-size="15" font-weight="700" text-anchor="middle">FEAR</text>
            
            <!-- NEUTRAL 배경 -->
            <circle cx="237.5" cy="70" r="22" fill="rgba(255,255,255,0.9)" stroke="#ca8a04" stroke-width="2"/>
            <text x="237.5" y="70" fill="#ca8a04" font-size="15" font-weight="700" text-anchor="middle">NEUTRAL</text>
            
            <!-- GREED 배경 -->
            <circle cx="312.5" cy="120" r="22" fill="rgba(255,255,255,0.9)" stroke="#16a34a" stroke-width="2"/>
            <text x="312.5" y="120" fill="#16a34a" font-size="15" font-weight="700" text-anchor="middle" transform="rotate(45 312.5 120)">GREED</text>
            
            <!-- EXTREME GREED 배경 -->
            <circle cx="350" cy="180" r="28" fill="rgba(255,255,255,0.9)" stroke="#059669" stroke-width="2"/>
            <text x="350" y="175" fill="#059669" font-size="12" font-weight="700" text-anchor="middle">
              <tspan x="350" dy="0">EXTREME</tspan>
              <tspan x="350" dy="13">GREED</tspan>
            </text>
            
            <!-- 바늘 (현재 값) -->
            <g transform="translate(200, 200)">
              <line x1="0" y1="0" x2="${Math.cos((180 - gaugeAngle) * Math.PI / 180) * 150}" y2="${-Math.sin((180 - gaugeAngle) * Math.PI / 180) * 150}" 
                    stroke="#000000" stroke-width="4" stroke-linecap="round"/>
              <circle cx="0" cy="0" r="8" fill="#000000"/>
            </g>
          </svg>
          <div class="gauge-value">${currentValue}</div>
        </div>
        
        <div class="fng-updated">Last updated ${ind.lastUpdated ? new Date(ind.lastUpdated).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York" }) : new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York" })} ET</div>
        
        <!-- 점수별 의미 설명 -->
        <div style="margin-top:24px;padding:16px;background:#f9f9f9;border-radius:8px;width:100%;max-width:500px">
          <div style="font-size:13px;color:#666666;margin-bottom:8px;font-weight:600">점수별 의미:</div>
          <div style="font-size:12px;color:#333333;line-height:1.8">
            <div><span style="color:#ef4444;font-weight:600">0-24: Extreme Fear</span> - 극도의 공포 상태</div>
            <div><span style="color:#f97316;font-weight:600">25-44: Fear</span> - 공포 상태</div>
            <div><span style="color:#eab308;font-weight:600">45-54: Neutral</span> - 중립 상태</div>
            <div><span style="color:#22c55e;font-weight:600">55-74: Greed</span> - 탐욕 상태</div>
            <div><span style="color:#10b981;font-weight:600">75-100: Extreme Greed</span> - 극도의 탐욕 상태</div>
          </div>
        </div>
      </div>
      
      <div class="history-section">
        
        ${previousClose ? `
        <div class="history-item">
          <div class="history-label">Previous close</div>
          <div class="history-value-row">
            <div class="history-badge" style="background:${getBadgeColor(previousClose.value)}">${previousClose.value}</div>
            <div class="history-level">${getLevelForValue(previousClose.value)}</div>
          </div>
        </div>
        ` : ""}
        
        ${weekAgo ? `
        <div class="history-item">
          <div class="history-label">1 week ago</div>
          <div class="history-value-row">
            <div class="history-badge" style="background:${getBadgeColor(weekAgo.value)}">${weekAgo.value}</div>
            <div class="history-level">${getLevelForValue(weekAgo.value)}</div>
          </div>
        </div>
        ` : ""}
        
        ${monthAgo ? `
        <div class="history-item">
          <div class="history-label">1 month ago</div>
          <div class="history-value-row">
            <div class="history-badge" style="background:${getBadgeColor(monthAgo.value)}">${monthAgo.value}</div>
            <div class="history-level">${getLevelForValue(monthAgo.value)}</div>
          </div>
        </div>
        ` : ""}
        
        ${yearAgo ? `
        <div class="history-item">
          <div class="history-label">1 year ago</div>
          <div class="history-value-row">
            <div class="history-badge" style="background:${getBadgeColor(yearAgo.value)}">${yearAgo.value}</div>
            <div class="history-level">${getLevelForValue(yearAgo.value)}</div>
          </div>
        </div>
        ` : ""}
      </div>
    </div>
    
    <div class="analysis-section">
      <div class="analysis-title">경제코치 분석 💡</div>
      <div class="analysis-text">${escapeHtml(detail.analysis)}</div>
    </div>
    
    ${detail.relatedNews && detail.relatedNews.length > 0 ? `
    <div class="news-section-detail">
      <div class="news-section-title">최근 뉴스 항목</div>
      <div class="news-list-detail">
        ${detail.relatedNews.map((news: any) => `
          <div class="news-item-detail">
            <div class="news-content-detail">
              <div class="news-text-detail">${escapeHtml(news.title)}</div>
              <div class="news-meta-detail">
                <div class="news-source-detail">${escapeHtml(news.source)}</div>
                ${news.publishedAt ? `<div class="news-date-detail">${escapeHtml(news.publishedAt)}</div>` : ""}
              </div>
            </div>
          </div>
        `).join("")}
      </div>
      ${detail.newsComment && detail.newsComment !== "none" ? `
      <div class="news-comment">
        <div class="news-comment-title">경제코치 코멘트 💬</div>
        <div class="news-comment-text">${escapeHtml(detail.newsComment)}</div>
      </div>
      ` : ""}
    </div>
    ` : ""}
  </div>
</body>
</html>`);
  } catch (e: any) {
    res.status(500).send(e?.message ?? String(e));
  }
});

// FED 자산/부채 페이지
app.get("/economic-indicators/fed-assets-liabilities", async (req, res) => {
  try {
    // 날짜 파라미터 확인
    const targetDate = req.query.date as string | undefined;
    let report: Awaited<ReturnType<typeof fetchH41Report>>;
    try {
      report = await fetchH41Report(targetDate);
    } catch (error: any) {
      // 아카이브 데이터 가져오기 실패 시 에러 메시지 표시
      const errorMessage = error?.message || String(error);
      console.error(`[Assets/Liabilities] Failed to fetch H.41 report for date ${targetDate}:`, errorMessage);
      
      // 에러 페이지 렌더링
      return res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>FED 자산/부채 분석 - 오류</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; background: #ffffff; color: #1a1a1a; }
            .error-container { max-width: 600px; margin: 0 auto; }
            .error-title { font-size: 24px; margin-bottom: 20px; color: #ef4444; }
            .error-message { background: #f3f4f6; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
            .back-link { color: #3b82f6; text-decoration: none; }
            .back-link:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <div class="error-container">
            <h1 class="error-title">데이터를 불러올 수 없습니다</h1>
            <div class="error-message">
              <p>선택한 날짜(${targetDate || 'N/A'})의 FED H.4.1 데이터를 가져오는 중 오류가 발생했습니다.</p>
              <p><strong>오류 내용:</strong> ${escapeHtml(errorMessage)}</p>
              <p>다른 날짜를 선택하거나 최신 데이터를 확인해주세요.</p>
            </div>
            <a href="/economic-indicators/fed-assets-liabilities" class="back-link">← 자산/부채 분석으로 돌아가기</a>
          </div>
        </body>
        </html>
      `);
    }
    
    // FED 발표 날짜 목록 가져오기
    const releaseDates = await getFedReleaseDates();
    
    // 최근 10회분 데이터 가져오기 (선택한 날짜 기준)
    const historicalData: Array<{
      date: string;
      assets: { treasury: number; mbs: number; repo: number; loans: number };
      liabilities: { currency: number; rrp: number; tga: number; reserves: number };
    }> = [];
    
    // releaseDates가 비어있으면 경고만 출력 (fallback 제거)
    if (releaseDates.length === 0) {
      console.warn(`[Assets/Liabilities] No release dates available from calendar`);
    }
    
    console.log(`[Assets/Liabilities] Got ${releaseDates.length} release dates (for historical data)`);
    
    // 최신 날짜부터 10회분 가져오기 (항상 최신 10회분)
    // getFedReleaseDates()가 이미 최신부터 정렬된 날짜를 반환하므로, 처음 10개를 사용
    const datesToFetch = releaseDates.slice(0, Math.min(10, releaseDates.length));
    
    if (datesToFetch.length > 0) {
      console.log(`[Assets/Liabilities] Fetching historical data for ${datesToFetch.length} dates:`, datesToFetch);
      
      // 순차적으로 처리 (병렬 처리 시 rate limiting 문제 방지)
      for (const dateStr of datesToFetch) {
        try {
          // availableDates를 전달하여 가장 가까운 날짜를 찾을 수 있도록 함
          const histReport = await fetchH41Report(dateStr, releaseDates);
          
          // 데이터 유효성 검사
          if (!histReport || !histReport.cards || histReport.cards.length === 0) {
            console.warn(`[Assets/Liabilities] No cards found in report for ${dateStr}`);
            continue; // 다음 날짜 시도
          }
          
          const histAssets = {
            treasury: histReport.cards.find(c => c.fedLabel === "U.S. Treasury securities")?.balance_musd || 0,
            mbs: histReport.cards.find(c => c.fedLabel === "Mortgage-backed securities")?.balance_musd || 0,
            repo: histReport.cards.find(c => c.fedLabel === "Repurchase agreements")?.balance_musd || 0,
            loans: histReport.cards.find(c => c.fedLabel === "Primary credit")?.balance_musd || 0,
          };
          const histLiabilities = {
            currency: histReport.cards.find(c => c.fedLabel === "Currency in circulation")?.balance_musd || 0,
            rrp: histReport.cards.find(c => c.fedLabel === "Reverse repurchase agreements")?.balance_musd || 0,
            tga: histReport.cards.find(c => c.fedLabel === "U.S. Treasury, General Account")?.balance_musd || 0,
            reserves: histReport.cards.find(c => c.fedLabel === "Reserve balances with Federal Reserve Banks")?.balance_musd || 0,
          };
          
          // 데이터 유효성 검사: 최소한 하나의 값이라도 0이 아니면 유효한 데이터로 간주
          // (일부 항목이 0일 수 있으므로 더 관대하게 검사)
          const totalAssets = histAssets.treasury + histAssets.mbs + histAssets.repo + histAssets.loans;
          const totalLiabilities = histLiabilities.currency + histLiabilities.rrp + histLiabilities.tga + histLiabilities.reserves;
          const hasValidData = totalAssets > 0 || totalLiabilities > 0;
          
          if (!hasValidData) {
            console.warn(`[Assets/Liabilities] All values are zero for ${dateStr}, skipping`);
            continue; // 다음 날짜 시도
          }
          
          historicalData.push({
            date: dateStr,
            assets: histAssets,
            liabilities: histLiabilities,
          });
          console.log(`[Assets/Liabilities] Successfully fetched historical data for ${dateStr}`);
        } catch (e) {
          console.error(`[Assets/Liabilities] Failed to fetch historical data for ${dateStr}:`, e instanceof Error ? e.message : String(e));
          // 실패해도 계속 진행 (다음 날짜 시도)
        }
      }
      
      console.log(`[Assets/Liabilities] Total historical data fetched: ${historicalData.length} records out of ${datesToFetch.length} attempts`);
    } else {
      console.warn(`[Assets/Liabilities] No dates to fetch for historical data`);
    }
    
    // 날짜 순서를 최신부터 과거 순으로 정렬 (최신이 위로) - 항상 최신 날짜가 상단에 오도록 보장
    // 날짜 문자열을 직접 비교 (YYYY-MM-DD 형식이므로 localeCompare로 충분)
    historicalData.sort((a, b) => {
      // 최신 날짜가 위로 오도록 내림차순 정렬
      return b.date.localeCompare(a.date);
    });
    
    // 정렬 후 로그 출력 (디버깅용)
    if (historicalData.length > 0) {
      console.log(`[Assets/Liabilities] Historical data sorted - First date: ${historicalData[0].date}, Last date: ${historicalData[historicalData.length - 1].date}`);
    }
    
    // FED 자산 항목 추출
    const assets = {
      treasury: report.cards.find(c => c.fedLabel === "U.S. Treasury securities"),
      mbs: report.cards.find(c => c.fedLabel === "Mortgage-backed securities"),
      repo: report.cards.find(c => c.fedLabel === "Repurchase agreements"),
      loans: report.cards.find(c => c.fedLabel === "Primary credit"),
    };
    
    // FED 부채 항목 추출
    const liabilities = {
      currency: report.cards.find(c => c.fedLabel === "Currency in circulation"),
      rrp: report.cards.find(c => c.fedLabel === "Reverse repurchase agreements"),
      tga: report.cards.find(c => c.fedLabel === "U.S. Treasury, General Account"),
      reserves: report.cards.find(c => c.fedLabel === "Reserve balances with Federal Reserve Banks"),
    };
    
    // 자산 총합 계산
    const totalAssets = (assets.treasury?.balance_musd || 0) + 
                       (assets.mbs?.balance_musd || 0) + 
                       (assets.repo?.balance_musd || 0) + 
                       (assets.loans?.balance_musd || 0);
    const totalAssetsChange = (assets.treasury?.change_musd || 0) + 
                              (assets.mbs?.change_musd || 0) + 
                              (assets.repo?.change_musd || 0) + 
                              (assets.loans?.change_musd || 0);
    
    // 부채 총합 계산
    const totalLiabilities = (liabilities.currency?.balance_musd || 0) + 
                            (liabilities.rrp?.balance_musd || 0) + 
                            (liabilities.tga?.balance_musd || 0) + 
                            (liabilities.reserves?.balance_musd || 0);
    const totalLiabilitiesChange = (liabilities.currency?.change_musd || 0) + 
                                    (liabilities.rrp?.change_musd || 0) + 
                                    (liabilities.tga?.change_musd || 0) + 
                                    (liabilities.reserves?.change_musd || 0);
    
    // 경제 지표 및 뉴스 가져오기
    let economicIndicators = null;
    let economicNews: Array<{ title: string; source: string; publishedAt: string }> = [];
    try {
      economicIndicators = await fetchAllEconomicIndicators();
      economicNews = await fetchEconomicNews();
    } catch (e) {
      console.error("Failed to fetch economic indicators/news:", e);
    }
    
    // 경제 코치 LLM 분석 생성
    const analysis = await generateEconomicCoachAnalysis({
      assets,
      liabilities,
      totalAssets,
      totalAssetsChange,
      totalLiabilities,
      totalLiabilitiesChange,
      report,
      economicIndicators,
      economicNews,
    });
    
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(`
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>FED 자산/부채 분석</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;margin:0;background:#ffffff;color:#1a1a1a;line-height:1.6}
    .page-header{padding:20px 24px;border-bottom:2px solid #e5e7eb;background:#ffffff;position:sticky;top:0;z-index:100}
    .page-header h1{font-size:24px;font-weight:700;color:#1a1a1a;margin-bottom:8px}
    .page-header .sub{font-size:14px;color:#6b7280}
    .main-content{max-width:1200px;margin:0 auto;padding:24px}
    .section{background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:24px}
    .section-title{font-size:20px;font-weight:700;color:#1a1a1a;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #e5e7eb}
    .items-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:24px}
    .item-card{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px}
    .item-name{font-size:14px;font-weight:600;color:#6b7280;margin-bottom:8px}
    .item-value{font-size:24px;font-weight:700;color:#1a1a1a;margin-bottom:4px}
    .item-change{font-size:14px;font-weight:600}
    .item-change.positive{color:#dc2626}
    .item-change.negative{color:#16a34a}
    .item-change.neutral{color:#6b7280}
    .summary-card{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#ffffff;border-radius:12px;padding:24px;margin-bottom:24px}
    .summary-title{font-size:18px;font-weight:600;margin-bottom:16px;opacity:0.9}
    .summary-value{font-size:36px;font-weight:700;margin-bottom:8px}
    .summary-change{font-size:16px;font-weight:600;opacity:0.9}
    .analysis-section{background:#f0f9ff;border:2px solid #0ea5e9;border-radius:12px;padding:28px;margin-top:24px;box-shadow:0 4px 6px rgba(0,0,0,0.1)}
    .analysis-title{font-size:22px;font-weight:800;color:#0369a1;margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #bae6fd}
    .analysis-content{font-size:15px;color:#0c4a6e;line-height:2.0;white-space:pre-wrap;font-weight:500}
    .back-link{display:inline-block;margin-top:16px;color:#3b82f6;text-decoration:none;font-weight:600}
    .back-link:hover{text-decoration:underline}
    .date-selector{margin-top:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .date-selector label{font-size:13px;color:#6b7280;font-weight:600}
    .date-selector input[type="date"]{padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:#ffffff;color:#1a1a1a;font-size:13px;cursor:pointer;min-width:200px}
    .date-selector input[type="date"]:hover{border-color:#9ca3af}
    .date-selector input[type="date"]:focus{outline:none;border-color:#3b82f6}
    .date-selector button{padding:6px 16px;border:1px solid #3b82f6;border-radius:6px;background:#3b82f6;color:#ffffff;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s}
    .date-selector button:hover{background:#2563eb;border-color:#2563eb}
    .date-selector .reset-btn{padding:6px 12px;border:1px solid #d1d5db;background:transparent;color:#6b7280}
    .date-selector .reset-btn:hover{background:#f3f4f6;color:#1a1a1a}
    .history-table-section{margin-top:40px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px}
    .history-table-title{font-size:20px;font-weight:700;color:#1a1a1a;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #e5e7eb}
    .history-table-wrapper{overflow-x:auto;overflow-y:visible}
    .history-table{width:100%;border-collapse:collapse;min-width:600px}
    .history-table th{background:#f9fafb;padding:12px;text-align:center;font-size:13px;font-weight:600;color:#6b7280;border-bottom:2px solid #e5e7eb;white-space:nowrap}
    .history-table th.sticky-col{background:#f9fafb;position:sticky;left:0;z-index:20;min-width:140px;text-align:left;box-shadow:2px 0 4px rgba(0,0,0,0.1)}
    .history-table th.asset-col{background:#f0fdf4 !important;color:#166534;font-weight:700}
    .history-table th.liability-col{background:#fef2f2 !important;color:#991b1b;font-weight:700}
    .history-table td{padding:12px;text-align:center;font-size:13px;color:#1a1a1a;border-bottom:1px solid #e5e7eb;white-space:nowrap;vertical-align:middle}
    .history-table td.sticky-col{background:#ffffff;position:sticky;left:0;z-index:10;font-weight:600;color:#1a1a1a;min-width:140px;text-align:left;box-shadow:2px 0 4px rgba(0,0,0,0.1)}
    .history-table td.asset-cell{background:#f0fdf4 !important}
    .history-table td.liability-cell{background:#fef2f2 !important}
    .history-table tr:hover td{background:#f3f4f6}
    .history-table tr:hover td.sticky-col{background:#f3f4f6 !important}
    .history-table tr:hover td.asset-cell{background:#dcfce7 !important}
    .history-table tr:hover td.liability-cell{background:#fee2e2 !important}
    @media (max-width: 768px) {
      .history-table-wrapper{overflow-x:scroll;overflow-y:visible;-webkit-overflow-scrolling:touch}
      .history-table th.sticky-col,.history-table td.sticky-col{position:sticky;left:0;box-shadow:2px 0 4px rgba(0,0,0,0.15)}
    }
  </style>
</head>
<body>
  <div class="page-header">
    <h1>FED 자산/부채 분석 📊</h1>
    <div class="sub">
      Week ended: ${escapeHtml(report.asOfWeekEndedText)} · Release: ${escapeHtml(report.releaseDateText)}<br/>
      <div class="date-selector">
        <label for="dateInput">FED 발표 날짜 선택:</label>
        <input type="date" id="dateInput" value="${targetDate || ''}" style="padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:#ffffff;color:#1a1a1a;font-size:13px;cursor:pointer" />
        <button onclick="loadDate()">조회</button>
        ${targetDate ? `<button class="reset-btn" onclick="resetDate()">초기화</button>` : ''}
      </div>
      <a href="/economic-indicators" class="back-link">← 경제 지표로 돌아가기</a>
    </div>
  </div>
  
  <div class="main-content">
    <!-- 자산 총합 -->
    <div class="summary-card" style="background:linear-gradient(135deg,#10b981 0%,#059669 100%)">
      <div class="summary-title">FED 자산 총합${targetDate ? ` <span style="font-size:14px;opacity:0.9">(Date: ${targetDate})</span>` : ''}</div>
      <div class="summary-value">$${(totalAssets / 1000).toFixed(1)}조</div>
      <div class="summary-change ${totalAssetsChange > 0 ? 'positive' : totalAssetsChange < 0 ? 'negative' : 'neutral'}">
        ${totalAssetsChange > 0 ? '+' : ''}${(totalAssetsChange / 1000).toFixed(1)}조 (${totalAssetsChange > 0 ? '+' : ''}${((totalAssetsChange / (totalAssets - totalAssetsChange)) * 100).toFixed(2)}%)
      </div>
    </div>
    
    <!-- FED 자산 -->
    <div class="section">
      <div class="section-title">FED 자산</div>
      <div class="items-grid">
        ${assets.treasury ? `
        <div class="item-card">
          <div class="item-name">국채 (U.S. Treasury securities)</div>
          <div class="item-value">$${(assets.treasury.balance_musd / 1000).toFixed(1)}조</div>
          <div class="item-change ${assets.treasury.change_musd > 0 ? 'positive' : assets.treasury.change_musd < 0 ? 'negative' : 'neutral'}">
            ${assets.treasury.change_musd > 0 ? '+' : ''}${(assets.treasury.change_musd / 1000).toFixed(1)}조
          </div>
        </div>
        ` : ''}
        ${assets.mbs ? `
        <div class="item-card">
          <div class="item-name">MBS (Mortgage-backed securities)</div>
          <div class="item-value">$${(assets.mbs.balance_musd / 1000).toFixed(1)}조</div>
          <div class="item-change ${assets.mbs.change_musd > 0 ? 'positive' : assets.mbs.change_musd < 0 ? 'negative' : 'neutral'}">
            ${assets.mbs.change_musd > 0 ? '+' : ''}${(assets.mbs.change_musd / 1000).toFixed(1)}조
          </div>
        </div>
        ` : ''}
        ${assets.repo ? `
        <div class="item-card">
          <div class="item-name">리포 (Repurchase agreements)</div>
          <div class="item-value">$${(assets.repo.balance_musd / 1000).toFixed(1)}조</div>
          <div class="item-change ${assets.repo.change_musd > 0 ? 'positive' : assets.repo.change_musd < 0 ? 'negative' : 'neutral'}">
            ${assets.repo.change_musd > 0 ? '+' : ''}${(assets.repo.change_musd / 1000).toFixed(1)}조
          </div>
        </div>
        ` : ''}
        ${assets.loans ? `
        <div class="item-card">
          <div class="item-name">대출 (Loans)</div>
          <div class="item-value">$${(assets.loans.balance_musd / 1000).toFixed(1)}조</div>
          <div class="item-change ${assets.loans.change_musd > 0 ? 'positive' : assets.loans.change_musd < 0 ? 'negative' : 'neutral'}">
            ${assets.loans.change_musd > 0 ? '+' : ''}${(assets.loans.change_musd / 1000).toFixed(1)}조
          </div>
        </div>
        ` : ''}
      </div>
    </div>
    
    <!-- 부채 총합 -->
    <div class="summary-card" style="background:linear-gradient(135deg,#ef4444 0%,#dc2626 100%)">
      <div class="summary-title">FED 부채 총합${targetDate ? ` <span style="font-size:14px;opacity:0.9">(Date: ${targetDate})</span>` : ''}</div>
      <div class="summary-value">$${(totalLiabilities / 1000).toFixed(1)}조</div>
      <div class="summary-change ${totalLiabilitiesChange > 0 ? 'positive' : totalLiabilitiesChange < 0 ? 'negative' : 'neutral'}">
        ${totalLiabilitiesChange > 0 ? '+' : ''}${(totalLiabilitiesChange / 1000).toFixed(1)}조 (${totalLiabilitiesChange > 0 ? '+' : ''}${((totalLiabilitiesChange / (totalLiabilities - totalLiabilitiesChange)) * 100).toFixed(2)}%)
      </div>
    </div>
    
    <!-- FED 부채 -->
    <div class="section">
      <div class="section-title">FED 부채</div>
      <div class="items-grid">
        ${liabilities.currency ? `
        <div class="item-card">
          <div class="item-name">시중통화량 (Currency in circulation)</div>
          <div class="item-value">$${(liabilities.currency.balance_musd / 1000).toFixed(1)}조</div>
          <div class="item-change ${liabilities.currency.change_musd > 0 ? 'positive' : liabilities.currency.change_musd < 0 ? 'negative' : 'neutral'}">
            ${liabilities.currency.change_musd > 0 ? '+' : ''}${(liabilities.currency.change_musd / 1000).toFixed(1)}조
          </div>
        </div>
        ` : ''}
        ${liabilities.rrp ? `
        <div class="item-card">
          <div class="item-name">역리포 (Reverse Repurchase agreements)</div>
          <div class="item-value">$${(liabilities.rrp.balance_musd / 1000).toFixed(1)}조</div>
          <div class="item-change ${liabilities.rrp.change_musd > 0 ? 'positive' : liabilities.rrp.change_musd < 0 ? 'negative' : 'neutral'}">
            ${liabilities.rrp.change_musd > 0 ? '+' : ''}${(liabilities.rrp.change_musd / 1000).toFixed(1)}조
          </div>
        </div>
        ` : ''}
        ${liabilities.tga ? `
        <div class="item-card">
          <div class="item-name">TGA (U.S. Treasury General Account)</div>
          <div class="item-value">$${(liabilities.tga.balance_musd / 1000).toFixed(1)}조</div>
          <div class="item-change ${liabilities.tga.change_musd > 0 ? 'positive' : liabilities.tga.change_musd < 0 ? 'negative' : 'neutral'}">
            ${liabilities.tga.change_musd > 0 ? '+' : ''}${(liabilities.tga.change_musd / 1000).toFixed(1)}조
          </div>
        </div>
        ` : ''}
        ${liabilities.reserves ? `
        <div class="item-card">
          <div class="item-name">지급준비금 (Reserve balances)</div>
          <div class="item-value">$${(liabilities.reserves.balance_musd / 1000).toFixed(1)}조</div>
          <div class="item-change ${liabilities.reserves.change_musd > 0 ? 'positive' : liabilities.reserves.change_musd < 0 ? 'negative' : 'neutral'}">
            ${liabilities.reserves.change_musd > 0 ? '+' : ''}${(liabilities.reserves.change_musd / 1000).toFixed(1)}조
          </div>
        </div>
        ` : ''}
      </div>
    </div>
    
    <!-- 경제 코치 종합 진단 -->
    <div class="analysis-section">
      <div class="analysis-title">🎯 경제 코치 종합 진단</div>
      <div class="analysis-content">${escapeHtml(analysis)}</div>
    </div>
    
    <!-- 최근 10회분 추이 테이블 -->
    <div class="history-table-section">
      <div class="history-table-title">최근 10회분 추이 📈</div>
      ${historicalData.length > 0 ? `
      <div class="history-table-wrapper">
        <table class="history-table">
          <thead>
            <tr>
              <th class="sticky-col">날짜</th>
              <th class="asset-col">국채 (조)</th>
              <th class="asset-col">MBS (조)</th>
              <th class="asset-col">리포 (조)</th>
              <th class="asset-col">대출 (조)</th>
              <th class="liability-col">통화발행 (조)</th>
              <th class="liability-col">역리포 (조)</th>
              <th class="liability-col">TGA (조)</th>
              <th class="liability-col">지준금 (조)</th>
            </tr>
          </thead>
          <tbody>
            ${historicalData.map((item, index) => {
              const dateObj = new Date(item.date);
              const formattedDate = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
              
              // 이전 날짜 데이터 (다음 인덱스, 더 오래된 날짜)
              const prevItem = index < historicalData.length - 1 ? historicalData[index + 1] : null;
              
              // 증감 계산 함수
              const getChangeDisplay = (current: number, previous: number | null) => {
                if (previous === null || previous === 0) return '';
                const change = current - previous;
                const changePercent = (change / previous) * 100;
                const sign = change >= 0 ? '+' : '';
                return `<div style="font-size:11px;color:${change >= 0 ? '#059669' : '#dc2626'};margin-top:2px">${sign}${(change / 1000).toFixed(1)} (${sign}${changePercent.toFixed(2)}%)</div>`;
              };
              
              return `
            <tr>
              <td class="sticky-col">${formattedDate}</td>
              <td class="asset-cell" data-value="${item.assets.treasury}">
                $${(item.assets.treasury / 1000).toFixed(1)}
                ${getChangeDisplay(item.assets.treasury, prevItem?.assets.treasury || null)}
              </td>
              <td class="asset-cell" data-value="${item.assets.mbs}">
                $${(item.assets.mbs / 1000).toFixed(1)}
                ${getChangeDisplay(item.assets.mbs, prevItem?.assets.mbs || null)}
              </td>
              <td class="asset-cell" data-value="${item.assets.repo}">
                $${(item.assets.repo / 1000).toFixed(1)}
                ${getChangeDisplay(item.assets.repo, prevItem?.assets.repo || null)}
              </td>
              <td class="asset-cell" data-value="${item.assets.loans}">
                $${(item.assets.loans / 1000).toFixed(1)}
                ${getChangeDisplay(item.assets.loans, prevItem?.assets.loans || null)}
              </td>
              <td class="liability-cell" data-value="${item.liabilities.currency}">
                $${(item.liabilities.currency / 1000).toFixed(1)}
                ${getChangeDisplay(item.liabilities.currency, prevItem?.liabilities.currency || null)}
              </td>
              <td class="liability-cell" data-value="${item.liabilities.rrp}">
                $${(item.liabilities.rrp / 1000).toFixed(1)}
                ${getChangeDisplay(item.liabilities.rrp, prevItem?.liabilities.rrp || null)}
              </td>
              <td class="liability-cell" data-value="${item.liabilities.tga}">
                $${(item.liabilities.tga / 1000).toFixed(1)}
                ${getChangeDisplay(item.liabilities.tga, prevItem?.liabilities.tga || null)}
              </td>
              <td class="liability-cell" data-value="${item.liabilities.reserves}">
                $${(item.liabilities.reserves / 1000).toFixed(1)}
                ${getChangeDisplay(item.liabilities.reserves, prevItem?.liabilities.reserves || null)}
              </td>
            </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
      ` : `
      <div style="padding: 40px; text-align: center; color: #6b7280; font-size: 14px;">
        데이터를 불러오는 중입니다...<br/>
        <small style="color: #9ca3af; margin-top: 8px; display: block;">최신 FED H.4.1 데이터를 가져오는 중입니다.</small>
      </div>
      `}
    </div>
  </div>
  
  <script>
    function loadDate() {
      const dateInput = document.getElementById('dateInput');
      const selectedDate = dateInput ? dateInput.value : null;
      if (selectedDate) {
        window.location.href = '/economic-indicators/fed-assets-liabilities?date=' + selectedDate;
      } else {
        window.location.href = '/economic-indicators/fed-assets-liabilities';
      }
    }
    
    function resetDate() {
      window.location.href = '/economic-indicators/fed-assets-liabilities';
    }
  </script>
</body>
</html>
    `);
  } catch (e: any) {
    res.status(500).send(`오류 발생: ${e?.message ?? String(e)}`);
  }
});

// 경제 코치 LLM 분석 생성 함수 (고급 분석 - 금융패권자 관점)
async function generateEconomicCoachAnalysis(data: {
  assets: any;
  liabilities: any;
  totalAssets: number;
  totalAssetsChange: number;
  totalLiabilities: number;
  totalLiabilitiesChange: number;
  report: any;
  economicIndicators: any;
  economicNews: Array<{ title: string; source: string; publishedAt: string }>;
}): Promise<string> {
  const { assets, liabilities, totalAssets, totalAssetsChange, totalLiabilities, totalLiabilitiesChange, report, economicIndicators, economicNews } = data;
  
  // 심층 분석을 위한 데이터 준비
  const securitiesChange = (assets.treasury?.change_musd || 0) + (assets.mbs?.change_musd || 0);
  const qtSignal = securitiesChange < -50000;
  const qeSignal = securitiesChange > 50000;
  const netLiquidity = totalAssetsChange - totalLiabilitiesChange;
  
  // 경제 지표에서 주요 데이터 추출
  const fedRate = economicIndicators?.find((i: any) => i.id === "fed-funds-rate");
  const dxy = economicIndicators?.find((i: any) => i.id === "dxy");
  const sp500 = economicIndicators?.find((i: any) => i.id === "sp500");
  const vix = economicIndicators?.find((i: any) => i.id === "vix");
  const yieldSpread = economicIndicators?.find((i: any) => i.id === "yield-spread");
  
  // 분석 시작 - 금융패권자 관점으로 통합 분석
  let analysis = "";
  
  // 통합 서론: 거시경제의 큰 그림
  analysis += `🎯 [경제 코치 종합 진단: 금융패권자의 눈으로 본 거시경제]\n\n`;
  
  analysis += `이번 주 FED 대차대조표의 변화는 단순한 숫자가 아닙니다. `;
  analysis += `자산 $${(totalAssets / 1000).toFixed(1)}조(${totalAssetsChange > 0 ? `+${(totalAssetsChange / 1000).toFixed(1)}조` : totalAssetsChange < 0 ? `${(totalAssetsChange / 1000).toFixed(1)}조` : '변동 없음'}), `;
  analysis += `부채 $${(totalLiabilities / 1000).toFixed(1)}조(${totalLiabilitiesChange > 0 ? `+${(totalLiabilitiesChange / 1000).toFixed(1)}조` : totalLiabilitiesChange < 0 ? `${(totalLiabilitiesChange / 1000).toFixed(1)}조` : '변동 없음'})의 움직임은 `;
  analysis += `블랙록(BlackRock), 뱅가드(Vanguard), 스테이트 스트릿(State Street), JPMorgan, Fidelity Investment 같은 금융패권자들이 `;
  analysis += `글로벌 자본을 어떻게 배분하고 있는지를 보여주는 거울입니다. `;
  analysis += `이들이 보는 것은 단순한 수치가 아니라, 미국과 중국의 헤게모니 경쟁, 달러 체제의 안정성, 그리고 글로벌 자산 가격의 다음 움직임입니다.\n\n`;
  
  // 미국 vs 중국: 헤게모니 경쟁 관점
  analysis += `🌍 [미국 vs 중국: 헤게모니 경쟁의 이면]\n\n`;
  
  if (qtSignal) {
    analysis += `현재 QT 진행은 미국이 의도적으로 글로벌 달러 유동성을 축소하고 있음을 의미합니다. `;
    analysis += `이는 단순한 통화정책이 아니라, 중국의 위안화 국제화와 디지털 위안화(DCEP) 확산에 대응하는 전략적 움직임입니다. `;
    if (dxy && dxy.value && dxy.value > 105) {
      analysis += `달러 강세(${dxy.value.toFixed(1)})는 미국의 금융 헤게모니를 강화하면서, 중국을 포함한 신흥국에 자본 유출 압력을 가하고 있습니다. `;
    }
    analysis += `블랙록과 뱅가드는 이런 환경에서 중국 자산의 비중을 줄이고, 미국 자산으로의 전환을 가속화하고 있습니다. `;
    analysis += `특히 중국 국채와 기업채에 대한 신용 리스크를 재평가하며, 미국 국채와 달러 자산의 상대적 매력을 높게 평가하고 있습니다.\n\n`;
  } else if (qeSignal) {
    analysis += `QE 진행은 미국이 글로벌 유동성을 확대하여 세계 경제를 자극하려는 시도입니다. `;
    analysis += `하지만 이는 동시에 중국에게도 기회를 제공합니다. `;
    analysis += `중국은 이런 환경에서 위안화 국제화를 가속화하고, 아시아 인프라 투자은행(AIIB)과 일대일로 전략을 통해 영향력을 확대하고 있습니다. `;
    analysis += `금융패권자들은 이런 변화를 주시하며, 미국과 중국 자산의 균형을 재조정하고 있습니다.\n\n`;
  } else {
    analysis += `현재 중립적 통화정책은 미국과 중국이 서로의 움직임을 관찰하며 다음 수를 두고 있는 시점입니다. `;
    analysis += `블랙록과 뱅가드는 이런 전환 구간에서 매우 신중하게 포지션을 조정합니다. `;
    analysis += `한쪽에 과도하게 기울지 않으면서, 양쪽의 정책 변화에 유연하게 대응할 수 있는 포트폴리오를 유지하고 있습니다.\n\n`;
  }
  
  // 통합 해석: 금융패권자들이 보는 큰 그림 (금융패권자 관점을 전반에 통합)
  analysis += `🔍 [통합 해석: 금융패권자들이 보는 거시경제의 큰 그림]\n\n`;
  
  // netLiquidity는 이미 위에서 선언됨 (2030줄)
  if (netLiquidity < -50000) {
    analysis += `현재 순 유동성 흡수 환경에서, 블랙록(BlackRock), 뱅가드(Vanguard), 스테이트 스트릿(State Street), JPMorgan, Fidelity Investment 같은 금융패권자들은 모두 공통적으로 방어적 포지션을 강화하고 있습니다. `;
    if (assets.treasury && assets.treasury.change_musd < -50000) {
      analysis += `FED의 국채 보유 감소(${(Math.abs(assets.treasury.change_musd) / 1000).toFixed(1)}조)는 장기 금리 상승 압력을 만들고 있어, 블랙록은 장기 국채의 비중을 줄이고 단기 채권과 현금으로 전환하며, 주식 포트폴리오에서 성장주보다 가치주에 더 집중하고 있습니다. `;
    }
    if (liabilities.reserves && liabilities.reserves.change_musd < -100000) {
      analysis += `지급준비금의 큰 폭 감소(${(Math.abs(liabilities.reserves.change_musd) / 1000).toFixed(1)}조)를 뱅가드는 매우 경계하며, 즉시 포트폴리오의 방어적 자산 비중을 높이고 변동성이 큰 자산의 비중을 줄입니다. `;
      analysis += `특히 신흥국 자산에 대한 노출을 줄이며, 미국과 유럽 등 선진국 자산으로 전환하고 있습니다. `;
    }
    analysis += `이들은 FED의 QT가 단순한 통화정책이 아니라, 미국의 금융 헤게모니를 유지하기 위한 전략적 움직임임을 알고 있습니다. `;
    analysis += `달러 강세와 결합된 유동성 축소는 신흥국, 특히 중국에 자본 유출 압력을 가하며, `;
    analysis += `이를 통해 미국은 글로벌 자본을 자신의 시장으로 끌어들이고 있습니다. `;
    analysis += `금융패권자들은 이런 흐름을 따라가며, 미국 자산의 비중을 늘리고 신흥국 자산의 비중을 줄이고 있습니다.\n\n`;
  } else if (netLiquidity > 50000) {
    analysis += `순 유동성 공급 확대 환경에서, 금융패권자들은 리스크 자산에 더 적극적으로 투자하고 있습니다. `;
    if (assets.treasury && assets.treasury.change_musd > 50000) {
      analysis += `FED의 국채 보유 증가는 장기 금리 안정화 신호로, 블랙록은 장기 국채와 주식의 균형을 유지하며, 특히 기술주와 성장주에 더 적극적으로 투자하고 있습니다. `;
    }
    if (liabilities.reserves && liabilities.reserves.change_musd > 50000) {
      analysis += `지급준비금 증가는 금융 시스템의 안정성 신호로, 뱅가드는 리스크 자산의 비중을 점진적으로 늘리며, 특히 신흥국 인덱스 펀드에 대한 투자를 늘려 글로벌 다각화를 강화하고 있습니다. `;
    }
    if (sp500 && sp500.changePercent && sp500.changePercent > 0) {
      analysis += `S&P500이 ${sp500.changePercent.toFixed(2)}% 상승하는 환경에서, Fidelity는 개인 투자자들의 401(k)와 IRA 계좌를 통해 주식 시장에 자금을 유입시키고 있습니다. `;
    }
    analysis += `하지만 이들은 동시에 중국의 움직임을 주시하고 있습니다. `;
    analysis += `중국이 이런 환경에서 위안화 국제화와 디지털 위안화를 통해 달러 체제에 도전하고 있기 때문입니다. `;
    analysis += `금융패권자들은 미국과 중국 자산의 균형을 유지하면서, 양쪽의 정책 변화에 유연하게 대응할 수 있는 포트폴리오를 구성하고 있습니다.\n\n`;
  } else {
    analysis += `현재 중립적 환경은 금융패권자들에게 전환 구간으로 보입니다. `;
    if (liabilities.tga && liabilities.tga.change_musd < -50000) {
      analysis += `TGA 감소(${(Math.abs(liabilities.tga.change_musd) / 1000).toFixed(1)}조)는 정부 지출 확대를 의미하며, 스테이트 스트릿은 인프라와 국방 관련 주식에 더 집중하고 있습니다. `;
    }
    if (assets.repo && assets.repo.balance_musd > 10000) {
      analysis += `FED의 리포 증가(${(assets.repo.balance_musd / 1000).toFixed(1)}조)는 금융 시스템에 스트레스가 있다는 신호로, JPMorgan은 신용 리스크를 재평가하며 고수익 채권의 비중을 줄이고 고품질 채권으로 전환하고 있습니다. `;
    }
    analysis += `이들은 미국과 중국의 다음 움직임을 예측하며, 양쪽에 모두 노출되되 한쪽에 과도하게 기울지 않는 전략을 취하고 있습니다. `;
    analysis += `특히 블랙록과 뱅가드는 글로벌 다각화를 강화하며, 지역별, 섹터별로 균형 잡힌 포트폴리오를 유지하고 있습니다.\n\n`;
  }
  
  // 최근 뉴스와의 연계
  if (economicNews && economicNews.length > 0) {
    analysis += `📰 [최근 경제 뉴스: 금융패권자들이 주시하는 신호]\n\n`;
    const relevantNews = economicNews.slice(0, 3);
    relevantNews.forEach((news, idx) => {
      analysis += `${idx + 1}. ${news.title} (${news.source})\n`;
    });
    analysis += `\n`;
    analysis += `이러한 뉴스는 금융패권자들이 FED의 자산/부채 변화를 어떻게 해석하는지를 보여줍니다. `;
    analysis += `블랙록, 뱅가드, 스테이트 스트릿, JPMorgan, Fidelity의 수십억 달러 규모의 자본 이동은 `;
    analysis += `이런 뉴스와 FED 데이터를 종합적으로 분석한 결과입니다. `;
    if (qtSignal) {
      analysis += `QT 진행과 함께 나타나는 경제 지표 변화는 금융패권자들이 방어적으로 전환하는 신호이며, `;
      analysis += `이들의 움직임이 다시 시장 전체를 움직입니다.\n\n`;
    } else {
      analysis += `현재 환경에서 금융패권자들은 다음 정책 전환 시점을 주시하며, 유연하게 대응할 준비를 하고 있습니다.\n\n`;
    }
  }
  
  // 실전 조언: 금융패권자를 따라가는 방법
  analysis += `💡 [실전 조언: 금융패권자를 따라가는 투자 전략]\n\n`;
  
  // 리스크 평가
  let riskLevel = "중간";
  let riskFactors: string[] = [];
  if (liabilities.reserves && liabilities.reserves.change_musd < -100000) {
    riskLevel = "높음";
    riskFactors.push("지급준비금 급감");
  }
  if (qtSignal && vix && vix.value && vix.value > 20) {
    riskLevel = "높음";
    riskFactors.push("QT 진행 + 높은 변동성");
  }
  if (yieldSpread && yieldSpread.value && yieldSpread.value < 0) {
    riskLevel = "높음";
    riskFactors.push("금리스프레드 역전");
  }
  
  analysis += `현재 리스크 수준: ${riskLevel}${riskFactors.length > 0 ? ` (${riskFactors.join(", ")})` : ""}\n\n`;
  
  // 금융패권자 관점의 자산 배분
  analysis += `금융패권자들이 현재 취하고 있는 전략을 참고하면:\n\n`;
  
  if (qtSignal) {
    analysis += `QT 환경에서의 금융패권자 전략:\n`;
    analysis += `블랙록과 뱅가드는 방어적 자산(고품질 채권, 현금)의 비중을 늘리고 있습니다. `;
    analysis += `특히 단기 국채와 현금의 비중을 높이며, 장기 국채는 금리 상승 리스크를 고려해 비중을 줄이고 있습니다. `;
    analysis += `스테이트 스트릿과 JPMorgan은 신용 리스크를 재평가하며, 하이일드 채권의 비중을 줄이고 고품질 회사채로 전환하고 있습니다. `;
    analysis += `Fidelity는 개인 투자자들에게 단계적 매수를 권장하며, 변동성이 큰 성장주보다 가치주에 더 집중하고 있습니다. `;
    analysis += `모든 금융패권자들이 공통적으로 신흥국 자산, 특히 중국 자산의 비중을 줄이며, 미국과 유럽 등 선진국 자산으로 전환하고 있습니다.\n\n`;
  } else if (qeSignal) {
    analysis += `QE 환경에서의 금융패권자 전략:\n`;
    analysis += `블랙록과 뱅가드는 리스크 자산의 비중을 늘리며, 특히 기술주와 성장주에 더 적극적으로 투자하고 있습니다. `;
    analysis += `스테이트 스트릿은 신흥국 인덱스 펀드에 대한 투자를 늘리며, 글로벌 다각화를 강화하고 있습니다. `;
    analysis += `JPMorgan은 하이일드 채권과 주식의 비중을 늘리며, 유동성 확대 환경에서 수익을 극대화하려고 합니다. `;
    analysis += `Fidelity는 개인 투자자들의 401(k)와 IRA 계좌를 통해 주식 시장에 자금을 유입시키고 있습니다.\n\n`;
  } else {
    analysis += `중립적 환경에서의 금융패권자 전략:\n`;
    analysis += `모든 금융패권자들이 균형 잡힌 포트폴리오를 유지하며, 미국과 중국, 선진국과 신흥국 자산의 균형을 맞추고 있습니다. `;
    analysis += `블랙록과 뱅가드는 지역별, 섹터별로 다각화를 강화하며, 한쪽에 과도하게 기울지 않는 전략을 취하고 있습니다. `;
    analysis += `스테이트 스트릿과 JPMorgan은 현금 비중을 유지하며, 다음 정책 전환 시점에 대비하고 있습니다. `;
    analysis += `Fidelity는 개인 투자자들에게 장기 투자 관점을 강조하며, 단기 변동성에 흔들리지 않도록 조언하고 있습니다.\n\n`;
  }
  
  // 시장 타이밍: 금융패권자의 관점
  analysis += `⏰ [시장 타이밍: 금융패권자들이 보는 현재 시점]\n\n`;
  
  if (qtSignal && liabilities.reserves && liabilities.reserves.change_musd < -50000) {
    analysis += `금융패권자들은 현재를 **방어적 전환 시점**으로 보고 있습니다. `;
    analysis += `블랙록과 뱅가드는 이미 포트폴리오의 방어적 자산 비중을 높였으며, `;
    analysis += `개인 투자자들도 이런 움직임을 따라가야 합니다. `;
    analysis += `하지만 금융패권자들은 동시에 과도한 공포가 만드는 매수 기회도 노리고 있습니다. `;
    analysis += `그들은 시장이 과도하게 하락하면 역으로 매수에 나서며, 개인 투자자들보다 훨씬 빠르게 움직입니다.\n\n`;
  } else if (qeSignal && sp500 && sp500.changePercent && sp500.changePercent > 0) {
    analysis += `금융패권자들은 현재를 **리스크 자산 투자 시점**으로 보고 있습니다. `;
    analysis += `하지만 이들은 동시에 과열 신호를 경계하고 있습니다. `;
    analysis += `블랙록과 뱅가드는 수익 실현과 리스크 관리를 병행하며, `;
    analysis += `개인 투자자들도 이런 전략을 따라가야 합니다. `;
    analysis += `금융패권자들은 시장이 과도하게 상승하면 수익을 실현하며, 개인 투자자들보다 훨씬 빠르게 포지션을 조정합니다.\n\n`;
  } else {
    analysis += `금융패권자들은 현재를 **관찰 모드**로 보고 있습니다. `;
    analysis += `이들은 미국과 중국의 다음 움직임을 예측하며, 양쪽의 정책 변화에 유연하게 대응할 준비를 하고 있습니다. `;
    analysis += `개인 투자자들도 이런 환경에서 균형 잡힌 포트폴리오를 유지하며, `;
    analysis += `금융패권자들의 다음 움직임을 주시해야 합니다.\n\n`;
  }
  
  // 마무리: 금융패권자의 관점에서 본 거시경제
  analysis += `🎓 [경제 코치의 한마디: 금융패권자가 보는 거시경제의 진실]\n\n`;
  
  analysis += `FED의 대차대조표는 단순한 숫자가 아닙니다. `;
  analysis += `이것은 블랙록, 뱅가드, 스테이트 스트릿, JPMorgan, Fidelity Investment 같은 금융패권자들이 `;
  analysis += `수십억 달러 규모의 자본을 어떻게 배분하는지를 결정하는 가장 중요한 신호입니다.\n\n`;
  
  analysis += `이들이 보는 것은:\n`;
  analysis += `• 미국과 중국의 헤게모니 경쟁이 어떻게 전개되는가\n`;
  analysis += `• 달러 체제의 안정성이 유지되는가\n`;
  analysis += `• 글로벌 자본이 어디로 흐르는가\n`;
  analysis += `• 다음 금융 위기가 어디서 시작될 수 있는가\n\n`;
  
  analysis += `현재 데이터(${report.asOfWeekEndedText} 기준)를 보면, `;
  if (qtSignal) {
    analysis += `금융패권자들은 방어적으로 전환하고 있으며, 미국의 금융 헤게모니 강화 전략을 따라가고 있습니다. `;
  } else if (qeSignal) {
    analysis += `금융패권자들은 리스크 자산에 투자하고 있지만, 동시에 중국의 움직임을 경계하고 있습니다. `;
  } else {
    analysis += `금융패권자들은 관찰 모드에 있으며, 다음 정책 전환 시점을 주시하고 있습니다. `;
  }
  analysis += `개인 투자자들은 이들의 움직임을 주시하며, 그들의 전략을 참고해야 합니다.\n\n`;
  
  analysis += `하지만 기억하세요: 금융패권자들은 항상 개인 투자자들보다 빠르게 움직입니다. `;
  analysis += `그들이 이미 포지션을 조정한 후에야 개인 투자자들이 그 변화를 느낄 수 있습니다. `;
  analysis += `따라서 FED의 대차대조표를 주시하고, 금융패권자들이 어떻게 해석하는지를 이해하는 것이 중요합니다.\n\n`;
  
  analysis += `경제 코치는 당신이 금융패권자의 관점에서 거시경제를 이해할 수 있도록 돕습니다. `;
  analysis += `이들의 눈으로 경제를 보면, 단순한 수치가 아니라 세계 경제의 큰 그림이 보입니다. 💪\n`;
  
  return analysis;
}

// 경제 지표 세부 페이지
app.get("/economic-indicators/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    // Fear & Greed Index는 전용 페이지로 리다이렉트
    if (id === "fear-greed-index") {
      res.redirect("/economic-indicators/fear-greed-index");
      return;
    }
    
    // FED 자산/부채는 전용 페이지로 리다이렉트
    if (id === "fed-assets-liabilities") {
      res.redirect("/economic-indicators/fed-assets-liabilities");
      return;
    }
    
    const period = (req.query.period as '1D' | '1M' | '1Y' | '5Y' | 'MAX') || '1M';
    const detail = await getIndicatorDetail(id, period);
    
    if (!detail.indicator) {
      res.status(404).send("죄송해요, 해당 지표를 찾을 수 없어요.");
      return;
    }
    
    const ind = detail.indicator;
    const changeColor = ind.changePercent !== null
      ? (ind.changePercent > 0 ? "#ff6b6b" : ind.changePercent < 0 ? "#51cf66" : "#adb5bd")
      : "#adb5bd";
    const changeSign = ind.changePercent !== null && ind.changePercent > 0 ? "+" : "";
    
    // 차트 데이터 준비
    const chartData = detail.history.map(h => ({
      date: h.date,
      value: h.value,
    }));
    const chartLabels = chartData.map(d => {
      const date = new Date(d.date);
      return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
    });
    const chartValues = chartData.map(d => d.value);
    const chartFullDates = chartData.map(d => {
      const date = new Date(d.date);
      return date.toLocaleDateString("ko-KR", { 
        weekday: "long", 
        year: "numeric", 
        month: "long", 
        day: "numeric" 
      });
    });
    
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(`
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(ind.name)} - 경제 지표 상세</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;margin:0;background:#121212;color:#e8e8e8;line-height:1.6}
    
    .page-header{padding:20px 24px;border-bottom:1px solid #2d2d2d;position:sticky;top:0;background:#1a1a1a;z-index:100}
    .page-header h1{margin:0;font-size:20px;font-weight:700;color:#ffffff}
    .page-header .sub{opacity:.8;font-size:13px;margin-top:8px;line-height:1.5;color:#c0c0c0}
    .page-header a{color:#4dabf7;text-decoration:none;font-weight:500}
    .page-header a:hover{text-decoration:underline;color:#74c0fc}
    
    .main-content{padding:24px;max-width:1400px;margin:0 auto}
    
    .indicator-summary{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:24px;margin-bottom:24px}
    .indicator-title{font-size:24px;font-weight:700;color:#ffffff;margin-bottom:8px}
    .indicator-symbol{font-size:14px;color:#808080;background:#2d2d2d;padding:4px 12px;border-radius:6px;display:inline-block;margin-bottom:16px}
    .indicator-current{display:flex;align-items:baseline;gap:12px;margin-bottom:16px}
    .current-value{font-size:48px;font-weight:700;color:#ffffff}
    .current-unit{font-size:20px;color:#808080}
    .current-change{font-size:18px;font-weight:600;color:${changeColor}}
    .indicator-meta{display:flex;gap:20px;font-size:13px;color:#808080;padding-top:16px;border-top:1px solid #2d2d2d}
    
    .chart-section{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:24px;margin-bottom:24px}
    .chart-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
    .chart-title{font-size:18px;font-weight:700;color:#ffffff}
    .chart-period-tabs{display:flex;gap:8px}
    .period-tab{padding:6px 16px;border:1px solid #2d2d2d;border-radius:6px;background:#1a1a1a;color:#c0c0c0;text-decoration:none;font-size:13px;font-weight:600;transition:all 0.2s}
    .period-tab:hover{background:#252525;border-color:#3d3d3d;color:#ffffff}
    .period-tab.active{background:#4dabf7;border-color:#4dabf7;color:#ffffff}
    .chart-container{position:relative;height:400px}
    
    .analysis-section{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:24px;margin-bottom:24px}
    .analysis-title{font-size:18px;font-weight:700;color:#ffffff;margin-bottom:16px}
    .analysis-text{font-size:15px;line-height:2.2;color:#c0c0c0;white-space:pre-line}
    .analysis-text strong{color:#ffffff;font-weight:700}
    
    .news-section-detail{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:24px;margin-bottom:24px}
    .news-section-title{font-size:18px;font-weight:700;color:#ffffff;margin-bottom:16px}
    .news-list-detail{display:flex;flex-direction:column;gap:12px;margin-bottom:16px}
    .news-item-detail{padding:12px;background:#1a1a1a;border-radius:8px;border:1px solid #2d2d2d;transition:all 0.2s}
    .news-item-detail:hover{background:#252525;border-color:#3d3d3d}
    .news-content-detail{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
    .news-text-detail{flex:1;font-size:14px;line-height:1.6;color:#c0c0c0}
    .news-meta-detail{display:flex;flex-direction:column;align-items:flex-end;gap:4px}
    .news-source-detail{font-size:12px;color:#808080;white-space:nowrap;padding:4px 8px;background:#2d2d2d;border-radius:4px}
    .news-date-detail{font-size:11px;color:#808080;white-space:nowrap}
    .news-comment{margin-top:16px;padding-top:16px;border-top:1px solid #2d2d2d}
    .news-comment-title{font-size:16px;font-weight:700;color:#ffffff;margin-bottom:12px}
    .news-comment-text{font-size:14px;line-height:1.8;color:#c0c0c0}
    
    .history-table{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:24px;overflow-x:auto}
    .history-title{font-size:18px;font-weight:700;color:#ffffff;margin-bottom:16px}
    table{width:100%;border-collapse:collapse}
    th,td{padding:12px;text-align:left;border-bottom:1px solid #2d2d2d}
    th{font-weight:600;color:#ffffff;font-size:13px}
    td{color:#c0c0c0;font-size:14px}
    tr:hover{background:#252525}
    
    @media (max-width: 768px) {
      .current-value{font-size:36px}
      .chart-container{height:300px}
    }
  </style>
</head>
<body>
  <div class="page-header">
    <h1>${escapeHtml(ind.name)}</h1>
    <div class="sub">
      <a href="/economic-indicators">← 경제 지표로 돌아가기</a>
    </div>
  </div>
  
  <div class="main-content">
    <div class="indicator-summary">
      <div class="indicator-title">${escapeHtml(ind.name)}</div>
      <div class="indicator-symbol">${escapeHtml(ind.symbol)}</div>
      <div class="indicator-current">
        <span class="current-value">${ind.value !== null ? ind.value.toFixed(2) : "N/A"}</span>
        <span class="current-unit">${escapeHtml(ind.unit)}</span>
        ${ind.changePercent !== null 
          ? `<span class="current-change">${changeSign}${ind.changePercent.toFixed(2)}%</span>`
          : ""}
      </div>
      <div class="indicator-meta">
        <span>출처: ${escapeHtml(ind.source)}</span>
        <span>업데이트: ${new Date(ind.lastUpdated).toLocaleString("ko-KR")}</span>
      </div>
    </div>
    
    ${chartData.length > 0 ? `
    <div class="chart-section">
      <div class="chart-header">
        <div class="chart-title">변동 추이</div>
        <div class="chart-period-tabs">
          <a href="/economic-indicators/${id}?period=1D" class="period-tab ${period === '1D' ? 'active' : ''}">1D</a>
          <a href="/economic-indicators/${id}?period=1M" class="period-tab ${period === '1M' ? 'active' : ''}">1M</a>
          <a href="/economic-indicators/${id}?period=1Y" class="period-tab ${period === '1Y' ? 'active' : ''}">1Y</a>
          <a href="/economic-indicators/${id}?period=5Y" class="period-tab ${period === '5Y' ? 'active' : ''}">5Y</a>
          <a href="/economic-indicators/${id}?period=MAX" class="period-tab ${period === 'MAX' ? 'active' : ''}">MAX</a>
        </div>
      </div>
      <div class="chart-container">
        <canvas id="indicatorChart"></canvas>
      </div>
    </div>
    
    <script>
      const ctx = document.getElementById('indicatorChart').getContext('2d');
      const chartLabels = ${JSON.stringify(chartLabels)};
      const chartValues = ${JSON.stringify(chartValues)};
      const chartFullDates = ${JSON.stringify(chartFullDates)};
      const indicatorName = ${JSON.stringify(ind.name)};
      const indicatorUnit = ${JSON.stringify(ind.unit)};
      const isFearGreedIndex = ${ind.id === 'fear-greed-index' ? 'true' : 'false'};
      
      const chartConfig = {
        type: 'line',
        data: {
          labels: chartLabels,
          datasets: [{
            label: indicatorName,
            data: chartValues,
            borderColor: '#4dabf7',
            backgroundColor: 'rgba(77, 171, 247, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            intersect: false,
            mode: 'index'
          },
          plugins: {
            legend: {
              display: true,
              labels: {
                color: '#c0c0c0'
              }
            },
            tooltip: {
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              titleColor: '#ffffff',
              bodyColor: '#ffffff',
              borderColor: '#4dabf7',
              borderWidth: 1,
              padding: 12,
              displayColors: false,
              callbacks: {
                title: function(context) {
                  const index = context[0].dataIndex;
                  return chartFullDates[index] || chartLabels[index];
                },
                label: function(context) {
                  const value = context.parsed.y;
                  const formattedValue = value.toFixed(2);
                  return indicatorName + ': ' + formattedValue + indicatorUnit;
                },
                afterLabel: function(context) {
                  const index = context.dataIndex;
                  if (index > 0 && chartValues[index] !== undefined && chartValues[index - 1] !== undefined) {
                    const current = chartValues[index];
                    const previous = chartValues[index - 1];
                    const change = current - previous;
                    const changePercent = previous !== 0 ? ((change / previous) * 100) : 0;
                    const changeSign = change >= 0 ? '+' : '';
                    return '변동: ' + changeSign + change.toFixed(2) + indicatorUnit + ' (' + changeSign + changePercent.toFixed(2) + '%)';
                  }
                  return '';
                }
              }
            }
          },
          scales: {
            x: {
              ticks: { color: '#808080' },
              grid: { color: '#2d2d2d' }
            },
            y: {
              ticks: { 
                color: '#808080',
                callback: function(value) {
                  return value.toFixed(2) + indicatorUnit;
                }
              },
              grid: { color: '#2d2d2d' }
            }
          }
        }
      };
      
      // Fear & Greed Index인 경우 Y축 최대값을 100으로 설정
      if (isFearGreedIndex) {
        chartConfig.options.scales.y.min = 0;
        chartConfig.options.scales.y.max = 100;
      }
      
      new Chart(ctx, chartConfig);
    </script>
    ` : ""}
    
    <div class="analysis-section">
      <div class="analysis-title">경제코치 분석 💡</div>
      <div class="analysis-text">${escapeHtml(detail.analysis)}</div>
    </div>
    
    ${detail.relatedNews && detail.relatedNews.length > 0 ? `
    <div class="news-section-detail">
      <div class="news-section-title">최근 뉴스 항목</div>
      <div class="news-list-detail">
        ${detail.relatedNews.map((news, idx) => `
          <div class="news-item-detail">
            <div class="news-content-detail">
              <div class="news-text-detail">${escapeHtml(news.title)}</div>
              <div class="news-meta-detail">
                <div class="news-source-detail">${escapeHtml(news.source)}</div>
                ${news.publishedAt ? `<div class="news-date-detail">${escapeHtml(news.publishedAt)}</div>` : ""}
              </div>
            </div>
          </div>
        `).join("")}
      </div>
      ${detail.newsComment && detail.newsComment !== "none" ? `
      <div class="news-comment">
        <div class="news-comment-title">경제코치 코멘트 💬</div>
        <div class="news-comment-text">${escapeHtml(detail.newsComment)}</div>
      </div>
      ` : ""}
    </div>
    ` : ""}
    
    ${detail.history.length > 0 ? `
    <div class="history-table">
      <div class="history-title">일별 수치 (최근 ${Math.min(30, detail.history.length)}일)</div>
      <table>
        <thead>
          <tr>
            <th>날짜</th>
            <th>값</th>
            <th>변동</th>
          </tr>
        </thead>
        <tbody>
          ${detail.history.slice(-30).reverse().map((h, idx, arr) => {
            const prev = arr[idx + 1];
            const change = prev ? h.value - prev.value : null;
            const changePercent = prev && prev.value !== 0 ? ((change! / prev.value) * 100) : null;
            return `
            <tr>
              <td>${new Date(h.date).toLocaleDateString("ko-KR")}</td>
              <td>${h.value.toFixed(2)} ${escapeHtml(ind.unit)}</td>
              <td style="color:${change !== null && change > 0 ? "#ff6b6b" : change !== null && change < 0 ? "#51cf66" : "#adb5bd"}">
                ${change !== null ? `${change > 0 ? "+" : ""}${change.toFixed(2)}` : "-"}
                ${changePercent !== null ? `(${changePercent > 0 ? "+" : ""}${changePercent.toFixed(2)}%)` : ""}
              </td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
    ` : ""}
  </div>
</body>
</html>`);
  } catch (e: any) {
    res.status(500).send(e?.message ?? String(e));
  }
});

// 경제 지표 API
app.get("/api/economic-indicators", async (_req, res) => {
  try {
    const indicators = await fetchAllEconomicIndicators();
    const status = diagnoseEconomicStatus(indicators);
    res.json({
      status,
      indicators,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

// 지표 세부 데이터 API
app.get("/api/economic-indicators/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const detail = await getIndicatorDetail(id);
    res.json(detail);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

// 환율 API (새로고침용)
app.get("/api/exchange-rate", async (_req, res) => {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/KRW=X?interval=1d&range=2d`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });
    
    if (response.ok) {
      const data = await response.json();
      const result = data.chart?.result?.[0];
      if (result) {
        const quote = result.indicators?.quote?.[0];
        if (quote) {
          const prices = quote.close.filter((p: number | null) => p !== null);
          if (prices.length >= 2) {
            const currentPrice = prices[prices.length - 1];
            const previousPrice = prices[prices.length - 2];
            const change = currentPrice - previousPrice;
            const changePercent = (change / previousPrice) * 100;
            res.json({
              price: currentPrice,
              change,
              changePercent,
            });
            return;
          }
        }
      }
    }
    res.status(500).json({ error: "Failed to fetch exchange rate" });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m] as string));
}

// 비밀지표 페이지
app.get("/secret-indicators", async (req, res) => {
  try {
    const indicators = await fetchAllSecretIndicators();
    
    const getRiskColor = (risk: string) => {
      switch (risk) {
        case "critical": return "#dc2626";
        case "high": return "#f59e0b";
        case "medium": return "#eab308";
        case "low": return "#10b981";
        default: return "#6b7280";
      }
    };
    
    const getTrendIcon = (trend: string) => {
      switch (trend) {
        case "up": return "📈";
        case "down": return "📉";
        default: return "➡️";
      }
    };
    
    res.send(`
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>비밀지표 - 자본주의 내부 신경계 해부</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;margin:0;background:#121212;color:#e8e8e8;line-height:1.6}
    
    .page-header{padding:20px 24px;border-bottom:1px solid #2d2d2d;position:sticky;top:0;background:#1a1a1a;z-index:100}
    .page-header h1{margin:0;font-size:24px;font-weight:700;color:#ffffff;margin-bottom:8px}
    .page-header .sub{opacity:.8;font-size:14px;line-height:1.6;color:#c0c0c0}
    .page-header a{color:#a78bfa;text-decoration:none;font-weight:500}
    .page-header a:hover{text-decoration:underline;color:#c4b5fd}
    
    .intro-section{background:linear-gradient(135deg,#8b5cf6 0%,#6366f1 100%);border-radius:12px;padding:32px;margin:24px;max-width:1400px;margin-left:auto;margin-right:auto;margin-bottom:32px}
    .intro-title{font-size:28px;font-weight:700;color:#ffffff;margin-bottom:16px}
    .intro-description{font-size:16px;line-height:1.8;color:#f3f4f6;margin-bottom:12px}
    .intro-note{font-size:14px;line-height:1.6;color:#e0e7ff;margin-top:16px;padding:16px;background:rgba(255,255,255,0.1);border-radius:8px}
    
    .main-content{padding:24px;max-width:1400px;margin:0 auto}
    
    .indicator-card{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:24px;margin-bottom:24px;transition:all 0.2s}
    .indicator-card:hover{border-color:#3d3d3d;transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,0.3)}
    .indicator-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #2d2d2d}
    .indicator-title{font-size:20px;font-weight:700;color:#ffffff;margin-bottom:8px}
    .indicator-description{font-size:14px;color:#9ca3af;line-height:1.6;margin-bottom:12px}
    .indicator-meta{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:#808080}
    .indicator-source{background:#2d2d2d;padding:4px 8px;border-radius:4px}
    
    .indicator-value-section{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:20px}
    .value-item{background:#252525;border-radius:8px;padding:16px}
    .value-label{font-size:12px;color:#9ca3af;margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px}
    .value-number{font-size:24px;font-weight:700;color:#ffffff;margin-bottom:4px}
    .value-change{font-size:14px;font-weight:600}
    .value-change.positive{color:#10b981}
    .value-change.negative{color:#ef4444}
    .value-change.neutral{color:#9ca3af}
    
    .indicator-interpretation{background:#252525;border-radius:8px;padding:20px;margin-top:20px;border-left:4px solid #8b5cf6}
    .interpretation-title{font-size:16px;font-weight:700;color:#ffffff;margin-bottom:12px;display:flex;align-items:center;gap:8px}
    .interpretation-text{font-size:14px;line-height:1.8;color:#c0c0c0;white-space:pre-line}
    
    .risk-badge{display:inline-block;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:700;color:#ffffff}
    .risk-critical{background:#dc2626}
    .risk-high{background:#f59e0b}
    .risk-medium{background:#eab308}
    .risk-low{background:#10b981}
    
    .trend-badge{display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border-radius:4px;font-size:12px;font-weight:600;background:#2d2d2d;color:#c0c0c0}
    
    @media (max-width: 768px) {
      .indicator-value-section{grid-template-columns:1fr}
      .intro-section{padding:24px;margin:16px}
      .intro-title{font-size:24px}
    }
  </style>
</head>
<body>
  <div class="page-header">
    <h1>🔮 비밀지표 - 자본주의 내부 신경계 해부</h1>
    <div class="sub">
      <a href="/">← 대시보드로 돌아가기</a>
    </div>
  </div>
  
  <div class="intro-section">
    <div class="intro-title">위기가 준비되는 과정을 가장 먼저 알아차리는 지표</div>
    <div class="intro-description">
      이 지표들은 예측을 위한 것이 아닙니다. 자본주의 내부에서 이미 시작된 변화를 가장 먼저 확인하는 지표입니다.<br/>
      위기가 터진 뒤 대응하는 것이 아닌, 위기가 준비되는 과정을 가장 먼저 알아차리고 그 시야를 갖게 하는 것이 목적입니다.
    </div>
    <div class="intro-note">
      <strong>💡 거대 자본가들의 관점:</strong> 이 지표들은 자본주의가 실제로 움직이는 내부 신경계를 마인드맵으로 그리듯 해부하는 원리를 보여줍니다. 
      뱅가드, 블랙록 같은 거대 자본가들이 가장 먼저 주시하는 선행 지표들입니다.
    </div>
  </div>
  
  <div class="main-content">
    ${indicators.map((ind, idx) => {
      const changeColor = ind.change && ind.change > 0 ? "positive" : ind.change && ind.change < 0 ? "negative" : "neutral";
      const changeSign = ind.change && ind.change > 0 ? "+" : "";
      const changePercentSign = ind.changePercent && ind.changePercent > 0 ? "+" : "";
      
      return `
    <div class="indicator-card">
      <div class="indicator-header">
        <div style="flex:1">
          <div class="indicator-title">${idx + 1}. ${escapeHtml(ind.name)}</div>
          <div class="indicator-description">${escapeHtml(ind.description)}</div>
          <div class="indicator-meta">
            ${ind.fredSeriesId ? `<span class="indicator-source">FRED: ${ind.fredSeriesId}</span>` : ""}
            ${ind.alternativeSource ? `<span class="indicator-source">보조지표: ${escapeHtml(ind.alternativeSource)}</span>` : ""}
            ${ind.lastUpdated ? `<span class="indicator-source">업데이트: ${ind.lastUpdated}</span>` : ""}
            <span class="trend-badge">${getTrendIcon(ind.trend)} ${ind.trend === "up" ? "상승" : ind.trend === "down" ? "하락" : "중립"}</span>
            <span class="risk-badge risk-${ind.riskLevel}">위험: ${ind.riskLevel === "critical" ? "치명적" : ind.riskLevel === "high" ? "높음" : ind.riskLevel === "medium" ? "보통" : "낮음"}</span>
          </div>
        </div>
      </div>
      
      <div class="indicator-value-section">
        <div class="value-item">
          <div class="value-label">현재 값</div>
          <div class="value-number">${ind.value !== null ? ind.value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "N/A"}</div>
          <div class="value-label">${ind.unit}</div>
        </div>
        ${ind.previousValue !== null ? `
        <div class="value-item">
          <div class="value-label">이전 값</div>
          <div class="value-number" style="font-size:20px;color:#9ca3af">${ind.previousValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}</div>
          <div class="value-label">${ind.unit}</div>
        </div>
        ` : ""}
        ${ind.change !== null ? `
        <div class="value-item">
          <div class="value-label">변동</div>
          <div class="value-number ${changeColor}">${changeSign}${ind.change.toLocaleString("en-US", { maximumFractionDigits: 2 })}</div>
          <div class="value-change ${changeColor}">${changePercentSign}${ind.changePercent?.toFixed(2) || "0.00"}%</div>
        </div>
        ` : ""}
      </div>
      
      ${ind.interpretation ? `
      <div class="indicator-interpretation">
        <div class="interpretation-title">
          <span>💼 경제 코치 해석</span>
        </div>
        <div class="interpretation-text">${escapeHtml(ind.interpretation)}</div>
      </div>
      ` : `
      <div class="indicator-interpretation">
        <div class="interpretation-title">
          <span>⚠️ 데이터 수집 중</span>
        </div>
        <div class="interpretation-text">이 지표의 데이터를 가져오는 중입니다. 잠시 후 다시 확인해주세요.</div>
      </div>
      `}
    </div>
      `;
    }).join('')}
  </div>
</body>
</html>
    `);
  } catch (e: any) {
    res.status(500).send(`오류 발생: ${e?.message ?? String(e)}`);
  }
});

app.listen(PORT, () => {
  console.log(`H.4.1 dashboard running: http://localhost:${PORT}`);
});

