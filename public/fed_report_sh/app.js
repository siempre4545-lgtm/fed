const dateInput = document.getElementById("dateInput");
const statusMessage = document.getElementById("statusMessage");
const overviewContainer = document.getElementById("overviewContainer");
const assetContainer = document.getElementById("assetContainer");
const supplyingContainer = document.getElementById("supplyingContainer");
const absorbingContainer = document.getElementById("absorbingContainer");
const totalsContainer = document.getElementById("totalsContainer");
const summarySupplyingContainer = document.getElementById(
  "summarySupplyingContainer"
);
const summaryAbsorbingContainer = document.getElementById(
  "summaryAbsorbingContainer"
);
const maturityTableContainer = document.getElementById("maturityTableContainer");
const maturityChartsContainer = document.getElementById(
  "maturityChartsContainer"
);
const loansTableContainer = document.getElementById("loansTableContainer");
const securitiesTableContainer = document.getElementById(
  "securitiesTableContainer"
);
const assetsTableContainer = document.getElementById("assetsTableContainer");
const liabilitiesTableContainer = document.getElementById(
  "liabilitiesTableContainer"
);
const historyTableBody = document.getElementById("historyTableBody");
const historyMoreWrap = document.getElementById("historyMoreWrap");
const historyMoreBtn = document.getElementById("historyMoreBtn");
const historyStatusEl = document.getElementById("historyStatus");
const settingsButton = document.getElementById("settingsButton");
const settingsPanel = document.getElementById("settingsPanel");
const tabButtons = document.querySelectorAll(".tab-button");
const tabPanels = document.querySelectorAll(".tab-panel");

const overviewLabels = {
  totalAssets: "총 자산",
  securitiesHeld: "보유 증권",
  reserveBalances: "지급준비금",
  tga: "재무부 일반계정 (TGA)",
  reverseRepo: "역환매조건부 (RRP)",
  currency: "유통 통화",
};

const assetLabels = {
  treasury: "국채",
  mbs: "MBS",
  otherAssets: "기타",
};

const supplyingLabels = {
  reserveBankCredit: "연준 신용 (Reserve Bank Credit)",
  securitiesHeld: "보유 증권 (Securities Held)",
  treasurySecurities: "미 국채 (Treasury Securities)",
  bills: "단기채 (Bills)",
  notesAndBonds: "중장기채 (Notes and Bonds)",
  tips: "물가연동채 (TIPS)",
  mbs: "주택저당증권 (MBS)",
  repos: "레포 (Repos)",
  loans: "대출 (Loans)",
  btfp: "은행기간대출 (BTFP)",
  cbSwaps: "통화스왑 (CB Swaps)",
  gold: "금 (Gold)",
  sdr: "SDR 증서 (SDR)",
};

const absorbingLabels = {
  currency: "유통 통화 (Currency)",
  reverseRepo: "역레포 (Reverse Repos)",
  deposits: "연준 예치금 (Deposits)",
  tga: "재무부 일반계정 (TGA)",
};

const totalsLabels = {
  totalSupplying: "공급 합계 (Total Supplying)",
  totalAbsorbing: "흡수 합계 (Total Absorbing)",
  reserveBalances: "지급준비금 (Reserve Balances)",
};

const summarySupplyingLabels = {
  securitiesHeld: "보유 증권 (Securities Held)",
  repos: "레포 (Repos)",
  loans: "대출 (Loans)",
  cbSwaps: "통화스왑 (CB Swaps)",
};

const summaryAbsorbingLabels = {
  currency: "유통 통화 (Currency)",
  reverseRepo: "역레포 (Reverse Repos)",
  deposits: "연준 예치금 (Deposits)",
  tga: "재무부 일반계정 (TGA)",
};

const maturityColumns = [
  { key: "within15", label: "15일 이하" },
  { key: "days16to90", label: "16-90일" },
  { key: "days91to1y", label: "91일~1년" },
  { key: "years1to5", label: "1-5년" },
  { key: "years5to10", label: "5-10년" },
  { key: "years10plus", label: "10년 이상" },
  { key: "total", label: "합계" },
];

settingsButton.addEventListener("click", () => {
  settingsPanel.classList.toggle("hidden");
});

settingsPanel.addEventListener("click", (event) => {
  const theme = event.target.getAttribute("data-theme");
  const font = event.target.getAttribute("data-font");
  if (theme) {
    document.body.dataset.theme = theme;
  }
  if (font) {
    document.body.dataset.font = font;
  }
});

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.tab;
    tabButtons.forEach((btn) =>
      btn.classList.toggle("active", btn === button)
    );
    tabPanels.forEach((panel) =>
      panel.classList.toggle("active", panel.dataset.panel === target)
    );
    if (target === "history") renderHistoryTab();
  });
});

dateInput.addEventListener("change", () => {
  const date = dateInput.value;
  if (!date) return;
  fetchH41(date);
});

function fetchH41(date) {
  setStatus("데이터를 요청 중입니다...", "info");
  overviewContainer.innerHTML = "";
  assetContainer.innerHTML = "";
  supplyingContainer.innerHTML = "";
  absorbingContainer.innerHTML = "";
  totalsContainer.innerHTML = "";
  summarySupplyingContainer.innerHTML = "";
  summaryAbsorbingContainer.innerHTML = "";
  maturityTableContainer.innerHTML = "";
  maturityChartsContainer.innerHTML = "";
  loansTableContainer.innerHTML = "";
  securitiesTableContainer.innerHTML = "";
  assetsTableContainer.innerHTML = "";
  liabilitiesTableContainer.innerHTML = "";
  if (historyTableBody) historyTableBody.innerHTML = "";
  if (historyMoreWrap) historyMoreWrap.classList.add("hidden");
  if (historyStatusEl) historyStatusEl.textContent = "";

  fetch(`/api/h41?date=${date}`)
    .then(async (response) => {
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw errorPayload;
      }
      return response.json();
    })
    .then((data) => {
      setStatus("데이터 수집 완료", "success");
      window.__fedReportLastFactors = data.factors;
      window.__fedReportLastOverview = data.overview;
      window.__fedReportLastDate = date;
      renderOverview(data.overview);
      renderAssets(data.assetRatios);
      renderFactors(data.factors);
      renderSummary(data.summary);
      renderMaturity(data.maturityDistribution);
      renderLoansAndSecurities(data.loansAndSecurities);
      renderFinancials(data.financials);
      renderHistoryIfActive();
      logDebug(data);
    })
    .catch((error) => {
      if (error && error.error === "not_found") {
        setStatus("해당 날짜의 H.4.1 보고서가 존재하지 않습니다.", "error");
      } else if (error && error.error === "invalid_date") {
        setStatus("유효하지 않은 날짜 형식입니다.", "error");
      } else {
        setStatus("데이터 요청에 실패했습니다.", "error");
      }
    });
}

function setStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.dataset.type = type;
}

function renderOverview(overview) {
  const entries = Object.entries(overviewLabels);
  overviewContainer.innerHTML = entries
    .map(([key, label]) => {
      const value = overview[key];
      if (!value) {
        return createCard(label, "데이터 없음", "");
      }
      const current = formatNumber(value.current);
      const weekly = renderChangeLabel("주간", value.weeklyChange, value.weeklyChangePct);
      const yearly = renderChangeLabel("연간", value.yearlyChange, value.yearlyChangePct);
      return createCard(label, current, `${weekly}<br />${yearly}`);
    })
    .join("");
}

function renderAssets(assetRatios) {
  if (!assetRatios) {
    assetContainer.innerHTML = createCard("자산 구성", "데이터 없음", "");
    return;
  }
  const totalAssets = formatNumber(assetRatios.totals.totalAssets);
  const segments = Object.entries(assetLabels).map(([key, label]) => {
    const ratio =
      assetRatios.ratios[key] !== null ? assetRatios.ratios[key] * 100 : null;
    return {
      key,
      label,
      total: formatNumber(assetRatios.totals[key]),
      ratio,
    };
  });

  const bar = `
    <div class="ratio-bar">
      ${segments
        .map((segment) => {
          const width = segment.ratio !== null ? segment.ratio : 0;
          return `<span class="ratio-segment ratio-segment-${segment.key}" style="width:${width}%"></span>`;
        })
        .join("")}
    </div>
  `;

  const legend = segments
    .map((segment) => {
      const ratioText = formatPercent(segment.ratio);
      return `<span class="ratio-legend-item">${segment.label} ${ratioText}</span>`;
    })
    .join("");

  assetContainer.innerHTML = createCard(
    "자산 구성 비율",
    `총자산: ${totalAssets}`,
    `${bar}<div class="ratio-legend">${legend}</div>`
  );
}

function renderFactors(factors) {
  if (!factors) {
    supplyingContainer.innerHTML = createCard("공급 요인", "데이터 없음", "");
    absorbingContainer.innerHTML = createCard("흡수 요인", "데이터 없음", "");
    totalsContainer.innerHTML = createCard("합계", "데이터 없음", "");
    return;
  }

  supplyingContainer.innerHTML = renderFactorTable(
    factors.supplying,
    supplyingLabels
  );
  absorbingContainer.innerHTML = renderFactorTable(
    factors.absorbing,
    absorbingLabels
  );
  totalsContainer.innerHTML = renderFactorGroup(
    factors.totals,
    totalsLabels
  );
}

function renderSummary(summary) {
  if (!summary) {
    summarySupplyingContainer.innerHTML = createCard(
      "주요 공급 요인",
      "데이터 없음",
      ""
    );
    summaryAbsorbingContainer.innerHTML = createCard(
      "주요 흡수 요인",
      "데이터 없음",
      ""
    );
    return;
  }

  summarySupplyingContainer.innerHTML = renderFactorGroup(
    summary.supplying,
    summarySupplyingLabels
  );
  summaryAbsorbingContainer.innerHTML = renderFactorGroup(
    summary.absorbing,
    summaryAbsorbingLabels
  );
}

const totalsSubtitles = {
  totalSupplying: "*준비금을 늘린 요인",
  totalAbsorbing: "*준비금을 빼앗은 요인",
  reserveBalances: "*은행들이 연준계좌에 갖고있는 돈",
};

function renderFactorGroup(group, labels) {
  const entries = Object.entries(labels);
  return entries
    .map(([key, label]) => {
      const value = group ? group[key] : null;
      const subtitle = totalsSubtitles[key] || "";
      if (!value) {
        return createCard(label, "데이터 없음", subtitle ? `<div class="card-subtitle">${subtitle}</div>` : "");
      }
      const current = formatNumber(value.current);
      const weekly = renderChangeLabel("주간", value.weeklyChange, value.weeklyChangePct);
      const yearly = renderChangeLabel("연간", value.yearlyChange, value.yearlyChangePct);
      const subtitleHtml = subtitle ? `<div class="card-subtitle">${subtitle}</div>` : "";
      return createCard(label, current, `${subtitleHtml}${weekly}<br />${yearly}`);
    })
    .join("");
}

function renderFactorTable(group, labels) {
  const rows = Object.entries(labels)
    .map(([key, label]) => {
      const value = group ? group[key] : null;
      const thClass = "factor-label factor-label-" + key;
      if (!value) {
        return `
          <tr>
            <th class="${thClass}">${label}</th>
            <td>—</td>
            <td>—</td>
            <td>—</td>
          </tr>
        `;
      }
      return `
        <tr>
          <th class="${thClass}">${label}</th>
          <td>${formatNumber(value.current)}</td>
          <td>${renderChangeLabel("", value.weeklyChange, value.weeklyChangePct)}</td>
          <td>${renderChangeLabel("", value.yearlyChange, value.yearlyChangePct)}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>항목</th>
            <th>금액</th>
            <th>주간</th>
            <th>연간</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function renderMaturity(maturity) {
  if (!maturity || !maturity.rows) {
    maturityTableContainer.innerHTML = "데이터 없음";
    maturityChartsContainer.innerHTML = "";
    return;
  }

  const treasury = maturity.rows.treasury || {};
  const mbs = maturity.rows.mbs || {};

  const headerCells = maturityColumns
    .map((col) => `<th>${col.label}</th>`)
    .join("");
  const treasuryCells = maturityColumns
    .map((col) => `<td>${formatNumber(treasury[col.key])}</td>`)
    .join("");
  const mbsCells = maturityColumns
    .map((col) => `<td>${formatNumber(mbs[col.key])}</td>`)
    .join("");

  maturityTableContainer.innerHTML = `
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>구분</th>
            ${headerCells}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>미 국채 (Treasury)</th>
            ${treasuryCells}
          </tr>
          <tr>
            <th>MBS</th>
            ${mbsCells}
          </tr>
        </tbody>
      </table>
    </div>
  `;

  maturityChartsContainer.innerHTML = [
    buildChart("미 국채 (Treasury)", treasury),
    buildChart("MBS", mbs),
  ].join("");
}

function renderLoansAndSecurities(payload) {
  if (!payload) {
    loansTableContainer.innerHTML = "데이터 없음";
    securitiesTableContainer.innerHTML = "데이터 없음";
    return;
  }

  const loans = payload.loans || {};
  const securities = payload.securitiesLending || {};

  loansTableContainer.innerHTML = `
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>항목</th>
            <th>금액</th>
            <th>주간 Δ</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>1차 신용 (Primary Credit)</th>
            <td>${formatNumber(loans.primaryCredit?.current)}</td>
            <td>${renderChangeLabel("", loans.primaryCredit?.weeklyChange, loans.primaryCredit?.weeklyChangePct)}</td>
          </tr>
          <tr>
            <th>은행기간대출 (BTFP)</th>
            <td>${formatNumber(loans.btfp?.current)}</td>
            <td>${renderChangeLabel("", loans.btfp?.weeklyChange, loans.btfp?.weeklyChangePct)}</td>
          </tr>
          <tr>
            <th>대출 합계 (Total Loans)</th>
            <td>${formatNumber(loans.totalLoans?.current)}</td>
            <td>${renderChangeLabel("", loans.totalLoans?.weeklyChange, loans.totalLoans?.weeklyChangePct)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  securitiesTableContainer.innerHTML = `
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>유형</th>
            <th>금액</th>
            <th>설명</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>익일물 (Overnight)</th>
            <td>${formatNumber(securities.overnight?.current)}</td>
            <td>다음 영업일 만기</td>
          </tr>
          <tr>
            <th>기간물 (Term)</th>
            <td>${formatNumber(securities.term?.current)}</td>
            <td>특정 기간 지정</td>
          </tr>
          <tr>
            <th>합계</th>
            <td>${formatNumber(securities.total?.current)}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function renderFinancials(financials) {
  if (!financials) {
    assetsTableContainer.innerHTML = "데이터 없음";
    liabilitiesTableContainer.innerHTML = "데이터 없음";
    return;
  }

  const assets = financials.assets || {};
  const liabilities = financials.liabilities || {};

  assetsTableContainer.innerHTML = `
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>항목</th>
            <th>금액</th>
            <th>주간</th>
            <th>연간</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>금 (Gold)</th>
            <td>${formatNumber(assets.gold?.current)}</td>
            <td>${renderChangeLabel("", assets.gold?.weeklyChange, assets.gold?.weeklyChangePct)}</td>
            <td>${renderChangeLabel("", assets.gold?.yearlyChange, assets.gold?.yearlyChangePct)}</td>
          </tr>
          <tr>
            <th>SDR 증서 (SDR)</th>
            <td>${formatNumber(assets.sdr?.current)}</td>
            <td>${renderChangeLabel("", assets.sdr?.weeklyChange, assets.sdr?.weeklyChangePct)}</td>
            <td>${renderChangeLabel("", assets.sdr?.yearlyChange, assets.sdr?.yearlyChangePct)}</td>
          </tr>
          <tr>
            <th>보유 증권 (Securities Held)</th>
            <td>${formatNumber(assets.securitiesHeld?.current)}</td>
            <td>${renderChangeLabel("", assets.securitiesHeld?.weeklyChange, assets.securitiesHeld?.weeklyChangePct)}</td>
            <td>${renderChangeLabel("", assets.securitiesHeld?.yearlyChange, assets.securitiesHeld?.yearlyChangePct)}</td>
          </tr>
          <tr>
            <th>레포 (Repos)</th>
            <td>${formatNumber(assets.repos?.current)}</td>
            <td>${renderChangeLabel("", assets.repos?.weeklyChange, assets.repos?.weeklyChangePct)}</td>
            <td>${renderChangeLabel("", assets.repos?.yearlyChange, assets.repos?.yearlyChangePct)}</td>
          </tr>
          <tr>
            <th>대출 (Loans)</th>
            <td>${formatNumber(assets.loans?.current)}</td>
            <td>${renderChangeLabel("", assets.loans?.weeklyChange, assets.loans?.weeklyChangePct)}</td>
            <td>${renderChangeLabel("", assets.loans?.yearlyChange, assets.loans?.yearlyChangePct)}</td>
          </tr>
          <tr>
            <th>통화스왑 (Swaps)</th>
            <td>${formatNumber(assets.cbSwaps?.current)}</td>
            <td>${renderChangeLabel("", assets.cbSwaps?.weeklyChange, assets.cbSwaps?.weeklyChangePct)}</td>
            <td>${renderChangeLabel("", assets.cbSwaps?.yearlyChange, assets.cbSwaps?.yearlyChangePct)}</td>
          </tr>
          <tr>
            <th>총 자산 (Total Assets)</th>
            <td>${formatNumber(assets.totalAssets?.current)}</td>
            <td>${renderChangeLabel("", assets.totalAssets?.weeklyChange, assets.totalAssets?.weeklyChangePct)}</td>
            <td>${renderChangeLabel("", assets.totalAssets?.yearlyChange, assets.totalAssets?.yearlyChangePct)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  liabilitiesTableContainer.innerHTML = `
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>항목</th>
            <th>금액</th>
            <th>주간</th>
            <th>연간</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>연방준비권 (F.R. Notes)</th>
            <td>${formatNumber(liabilities.frNotes?.current)}</td>
            <td>${renderChangeLabel("", liabilities.frNotes?.weeklyChange, liabilities.frNotes?.weeklyChangePct)}</td>
            <td>${renderChangeLabel("", liabilities.frNotes?.yearlyChange, liabilities.frNotes?.yearlyChangePct)}</td>
          </tr>
          <tr>
            <th>역레포 (Reverse Repos)</th>
            <td>${formatNumber(liabilities.reverseRepo?.current)}</td>
            <td>${renderChangeLabel("", liabilities.reverseRepo?.weeklyChange, liabilities.reverseRepo?.weeklyChangePct)}</td>
            <td>${renderChangeLabel("", liabilities.reverseRepo?.yearlyChange, liabilities.reverseRepo?.yearlyChangePct)}</td>
          </tr>
          <tr>
            <th>예금 (Deposits)</th>
            <td>${formatNumber(liabilities.deposits?.current)}</td>
            <td>${renderChangeLabel("", liabilities.deposits?.weeklyChange, liabilities.deposits?.weeklyChangePct)}</td>
            <td>${renderChangeLabel("", liabilities.deposits?.yearlyChange, liabilities.deposits?.yearlyChangePct)}</td>
          </tr>
          <tr>
            <th>지급준비금 (Reserves)</th>
            <td>${formatNumber(liabilities.reserves?.current)}</td>
            <td>${renderChangeLabel("", liabilities.reserves?.weeklyChange, liabilities.reserves?.weeklyChangePct)}</td>
            <td>${renderChangeLabel("", liabilities.reserves?.yearlyChange, liabilities.reserves?.yearlyChangePct)}</td>
          </tr>
          <tr>
            <th>TGA (Treasury)</th>
            <td>${formatNumber(liabilities.tga?.current)}</td>
            <td>${renderChangeLabel("", liabilities.tga?.weeklyChange, liabilities.tga?.weeklyChangePct)}</td>
            <td>${renderChangeLabel("", liabilities.tga?.yearlyChange, liabilities.tga?.yearlyChangePct)}</td>
          </tr>
          <tr>
            <th>총 부채 (Total Liabilities)</th>
            <td>${formatNumber(liabilities.totalLiabilities?.current)}</td>
            <td>${renderChangeLabel("", liabilities.totalLiabilities?.weeklyChange, liabilities.totalLiabilities?.weeklyChangePct)}</td>
            <td>${renderChangeLabel("", liabilities.totalLiabilities?.yearlyChange, liabilities.totalLiabilities?.yearlyChangePct)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function buildChart(title, row) {
  const values = maturityColumns
    .filter((col) => col.key !== "total")
    .map((col) => ({ label: col.label, value: row?.[col.key] }))
    .filter((item) => item.value !== null && item.value !== undefined);

  if (!values.length) {
    return `
      <div class="chart-card">
        <div class="chart-title">${title}</div>
        <div class="chart-empty">데이터 없음</div>
      </div>
    `;
  }

  const maxValue = Math.max(...values.map((item) => item.value), 1);

  const bars = values
    .map((item) => {
      const height = (item.value / maxValue) * 100;
      return `
        <div class="chart-bar">
          <div class="chart-bar-fill" style="height:${height}%"></div>
          <div class="chart-bar-label">${item.label}</div>
          <div class="chart-bar-value">${formatNumber(item.value)}</div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="chart-card">
      <div class="chart-title">${title}</div>
      <div class="chart-bars">${bars}</div>
    </div>
  `;
}

function createCard(title, headline, body) {
  const headlineHtml = headline
    ? `<div class="card-headline">${headline}</div>`
    : "";
  return `
    <article class="card">
      <h3>${title}</h3>
      ${headlineHtml}
      <div class="card-body">${body}</div>
    </article>
  `;
}

function formatNumber(value) {
  if (value === null || value === undefined) return "—";
  return Number(value).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

function formatPercent(value) {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(2)}%`;
}

function formatSignedNumber(value) {
  if (value === null || value === undefined) return "—";
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return "—";
  const sign = numeric > 0 ? "+" : numeric < 0 ? "-" : "";
  return `${sign}${formatNumber(Math.abs(numeric))}`;
}

function formatSignedPercent(value) {
  if (value === null || value === undefined) return "—";
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return "—";
  const sign = numeric > 0 ? "+" : numeric < 0 ? "-" : "";
  return `${sign}${Math.abs(numeric).toFixed(2)}%`;
}

function renderChangeLabel(label, value, pct) {
  if (value === null || value === undefined) {
    return `<span class="change change-na">${label ? `${label}: ` : ""}—</span>`;
  }
  const numeric = Number(value);
  const changeClass = numeric > 0 ? "change-up" : numeric < 0 ? "change-down" : "change-zero";
  const pctText = formatSignedPercent(pct);
  const valueText = formatSignedNumber(value);
  const combined =
    pctText === "—"
      ? valueText
      : `${valueText} <span class="change-pct">(${pctText})</span>`;
  return `<span class="change ${changeClass}">${label ? `${label}: ` : ""}${combined}</span>`;
}

function logDebug(data) {
  console.group(`[H.4.1] ${data.date}`);
  console.log("선택 날짜", data.date);
  console.log("요청 URL", data.url);
  (data.logs || []).forEach((log) => {
    console.log("항목", log.key);
    console.log("원본 테이블명", log.tableTitle);
    console.log("매칭된 Row 텍스트", log.rowText);
    console.log("추출된 원시 값", log.rawValue);
    console.log("계산된 최종 값", {
      current: log.currentValue,
      weeklyChange: log.weeklyChange,
      weeklyChangePct: log.weeklyChangePct,
      yearlyChange: log.yearlyChange,
      yearlyChangePct: log.yearlyChangePct,
    });
  });
  console.groupEnd();
}

function historyCell(value, prevValue) {
  const num = value != null ? Number(value) : NaN;
  const prev = prevValue != null ? Number(prevValue) : NaN;
  const text = formatNumber(value);
  if (!Number.isFinite(num) || !Number.isFinite(prev)) {
    return `<td>${text}</td>`;
  }
  const delta = num - prev;
  if (delta === 0) {
    return `<td>${text}<span class="history-delta history-delta-zero">0</span></td>`;
  }
  const sign = delta > 0 ? "+" : "";
  const cls = delta > 0 ? "history-delta-up" : "history-delta-down";
  return `<td>${text}<span class="history-delta ${cls}">${sign}${formatNumber(delta)}</span></td>`;
}

function renderHistoryTab() {
  if (!historyTableBody) return;
  const factors = window.__fedReportLastFactors;
  const date = window.__fedReportLastDate || dateInput.value;
  historyTableBody.innerHTML = "";
  if (historyStatusEl) historyStatusEl.textContent = "";
  if (historyMoreWrap) historyMoreWrap.classList.add("hidden");

  if (!date) {
    if (historyStatusEl) historyStatusEl.textContent = "날짜를 선택한 뒤 조회해 주세요.";
    return;
  }

  if (!factors || !factors.supplying || !factors.absorbing) {
    if (historyStatusEl) historyStatusEl.textContent = "먼저 상단에서 날짜를 선택한 뒤 조회해 주세요.";
    return;
  }

  {
    const overview = window.__fedReportLastOverview;
    const totalAssets = overview?.totalAssets?.current ?? null;
    const sh = factors.supplying.securitiesHeld?.current;
    const rr = factors.absorbing.reverseRepo?.current;
    const tga = factors.absorbing.tga?.current;
    const repos = factors.supplying.repos?.current;
    const tr = document.createElement("tr");
    tr.className = "history-row-current";
    tr.innerHTML = `
      <td>${date}</td>
      <td>${formatNumber(totalAssets)}</td>
      <td>${formatNumber(sh)}</td>
      <td>${formatNumber(rr)}</td>
      <td>${formatNumber(tga)}</td>
      <td>${formatNumber(repos)}</td>
    `;
    historyTableBody.appendChild(tr);
    window.__fedReportHistoryRows = [
      { totalAssets, securitiesHeld: sh, reverseRepo: rr, tga, repos },
    ];
  }
  window.__fedReportHistoryNextCursor = date;
  loadHistoryChunk(date);
}

function renderHistoryIfActive() {
  const activePanel = document.querySelector(".tab-panel.active");
  if (activePanel && activePanel.dataset.panel === "history") {
    renderHistoryTab();
  }
}

function loadHistoryChunk(selectedDate) {
  const cursor = window.__fedReportHistoryNextCursor ?? selectedDate;
  const limit = 6;
  if (historyStatusEl) historyStatusEl.textContent = "이전 데이터 불러오는 중...";
  const url =
    "/api/h41/releases?limit=" +
    limit +
    (cursor ? "&cursor=" + encodeURIComponent(cursor) : "");
  fetch(url, { cache: "no-store", headers: { "Cache-Control": "no-cache" } })
    .then((res) => res.json())
    .then((data) => {
      if (historyStatusEl) historyStatusEl.textContent = "";
      if (!data.ok || !Array.isArray(data.rows)) {
        if (historyStatusEl && !window.__fedReportHistoryRows?.length)
          historyStatusEl.textContent = "이전 데이터를 불러오지 못했습니다.";
        return;
      }
      const rows = data.rows;
      const prevRows = window.__fedReportHistoryRows || [];
      const skipFirst = cursor && rows[0]?.date === cursor;
      const toAppend = skipFirst ? rows.slice(1) : rows;
      const isFirstChunk = prevRows.length === 1;
      toAppend.forEach((row) => {
        const totalAssets = row.assetTotal?.value ?? null;
        const securitiesHeld =
          (row.treasury?.value ?? 0) + (row.mbs?.value ?? 0);
        const reverseRepo = row.rrp?.value ?? null;
        const tga = row.tga?.value ?? null;
        const repos = row.repo?.value ?? null;
        const prev = prevRows[prevRows.length - 1];
        const tr = document.createElement("tr");
        tr.innerHTML =
          `<td>${row.date || ""}</td>` +
          historyCell(totalAssets, prev?.totalAssets ?? null) +
          historyCell(securitiesHeld, prev?.securitiesHeld ?? null) +
          historyCell(reverseRepo, prev?.reverseRepo ?? null) +
          historyCell(tga, prev?.tga ?? null) +
          historyCell(repos, prev?.repos ?? null);
        if (historyTableBody) historyTableBody.appendChild(tr);
        prevRows.push({
          totalAssets,
          securitiesHeld,
          reverseRepo,
          tga,
          repos,
        });
      });
      if (isFirstChunk && toAppend.length > 0 && historyTableBody) {
        const firstRow = historyTableBody.querySelector("tr.history-row-current");
        const firstPrev = toAppend[0];
        const prevTotalAssets = firstPrev.assetTotal?.value ?? null;
        const prevSh = (firstPrev.treasury?.value ?? 0) + (firstPrev.mbs?.value ?? 0);
        const prevRr = firstPrev.rrp?.value ?? null;
        const prevTga = firstPrev.tga?.value ?? null;
        const prevRepos = firstPrev.repo?.value ?? null;
        const current = prevRows[0];
        if (firstRow && current) {
          const dateTd = firstRow.querySelector("td");
          const dateText = dateTd ? dateTd.textContent || "" : "";
          firstRow.innerHTML =
            `<td>${dateText}</td>` +
            historyCell(current.totalAssets, prevTotalAssets) +
            historyCell(current.securitiesHeld, prevSh) +
            historyCell(current.reverseRepo, prevRr) +
            historyCell(current.tga, prevTga) +
            historyCell(current.repos, prevRepos);
        }
      }
      window.__fedReportHistoryRows = prevRows;
      window.__fedReportHistoryNextCursor = data.nextCursor || null;
      if (historyMoreWrap) {
        historyMoreWrap.classList.toggle(
          "hidden",
          !window.__fedReportHistoryNextCursor
        );
      }
    })
    .catch(() => {
      if (historyStatusEl)
        historyStatusEl.textContent = "이전 데이터를 불러오지 못했습니다.";
    });
}

if (historyMoreBtn) {
  historyMoreBtn.addEventListener("click", () => {
    const date = window.__fedReportLastDate || dateInput.value;
    if (date) loadHistoryChunk(date);
  });
}

const today = new Date();
dateInput.value = today.toISOString().slice(0, 10);
