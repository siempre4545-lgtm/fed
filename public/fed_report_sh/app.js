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

const sec13dfgOrg = document.getElementById("sec13dfgOrg");
const sec13dfgLoad = document.getElementById("sec13dfgLoad");
const sec13dfgCikManual = document.getElementById("sec13dfgCikManual");
const sec13dfgCikInput = document.getElementById("sec13dfgCikInput");
const sec13dfgLoadByCik = document.getElementById("sec13dfgLoadByCik");
const sec13dfgStatus = document.getElementById("sec13dfgStatus");
const sec13dfgSummary = document.getElementById("sec13dfgSummary");
const sec13dfgTableWrap = document.getElementById("sec13dfgTableWrap");
const sec13dfgTableBody = document.getElementById("sec13dfgTableBody");
const sec13dfgExplain = document.getElementById("sec13dfgExplain");

if (sec13dfgOrg) {
  sec13dfgOrg.addEventListener("change", () => {
    if (sec13dfgLoad) sec13dfgLoad.disabled = !sec13dfgOrg.value;
  });
}
if (sec13dfgLoad) {
  sec13dfgLoad.addEventListener("click", () => {
    const name = sec13dfgOrg?.value?.trim();
    if (!name) return;
    renderSec13dfgByOrg(name);
  });
}
if (sec13dfgLoadByCik && sec13dfgCikInput) {
  sec13dfgLoadByCik.addEventListener("click", () => {
    const cik = sec13dfgCikInput.value.trim();
    if (!cik) return;
    renderSec13dfgByCik(cik);
  });
}

function setSec13dfgStatus(message, isError) {
  if (!sec13dfgStatus) return;
  sec13dfgStatus.textContent = message || "";
  sec13dfgStatus.className = "sec13dfg-status" + (isError ? " error" : "");
  sec13dfgStatus.classList.toggle("hidden", !message);
}

function renderSec13dfgByOrg(name) {
  setSec13dfgStatus("CIK 검색 중...", false);
  if (sec13dfgSummary) sec13dfgSummary.classList.add("hidden");
  if (sec13dfgTableWrap) sec13dfgTableWrap.classList.add("hidden");
  if (sec13dfgCikManual) sec13dfgCikManual.classList.add("hidden");
  fetch("/api/sec/cik-search?q=" + encodeURIComponent(name), { cache: "no-store" })
    .then((r) => r.json())
    .then((data) => {
      if (!data.ok) {
        setSec13dfgStatus(data.message || "CIK를 찾지 못했습니다. 수동 입력을 이용하세요.", true);
        if (sec13dfgCikManual) sec13dfgCikManual.classList.remove("hidden");
        return;
      }
      setSec13dfgStatus("", false);
      renderSec13dfgByCik(data.cik, data.title);
    })
    .catch(() => {
      setSec13dfgStatus("검색 요청에 실패했습니다. 잠시 후 다시 시도하세요.", true);
    });
}

function renderSec13dfgByCik(cik, titleLabel) {
  setSec13dfgStatus("공시 목록 불러오는 중...", false);
  if (sec13dfgSummary) sec13dfgSummary.classList.add("hidden");
  if (sec13dfgTableWrap) sec13dfgTableWrap.classList.add("hidden");
  fetch("/api/sec/filings?cik=" + encodeURIComponent(cik), { cache: "no-store" })
    .then((r) => r.json())
    .then((data) => {
      if (!data.ok) {
        setSec13dfgStatus(data.message || "공시 데이터를 불러오지 못했습니다.", true);
        return;
      }
      setSec13dfgStatus("", false);
      renderSec13dfgContent(data.summary, data.filings, titleLabel || ("CIK " + data.cik), data.cik);
    })
    .catch(() => {
      setSec13dfgStatus("요청 실패(403/429/타임아웃 등). 잠시 후 다시 시도하세요.", true);
    });
}

function renderSec13dfgContent(summary, filings, titleLabel, currentCik) {
  if (sec13dfgSummary) {
    const count90 = summary?.count90d ?? 0;
    const latest = summary?.latestFilingDate ?? "—";
    const fc = summary?.formCounts ?? {};
    const eventLabel = summary?.latestEventLabel ?? "—";
    sec13dfgSummary.innerHTML =
      "<h3>" + (titleLabel || "요약") + "</h3>" +
      "<div class=\"sec13dfg-cards\">" +
      "<div class=\"sec13dfg-card\"><span class=\"label\">최근 90일 제출 건수</span><span class=\"value\">" + count90 + "</span></div>" +
      "<div class=\"sec13dfg-card\"><span class=\"label\">최근 제출일</span><span class=\"value\">" + latest + "</span></div>" +
      "<div class=\"sec13dfg-card\"><span class=\"label\">Form 비중 (13D/13G/13F)</span><span class=\"value\">" +
      (fc["13D"] || 0) + " / " + (fc["13G"] || 0) + " / " + (fc["13F"] || 0) + "</span></div>" +
      "<div class=\"sec13dfg-card\"><span class=\"label\">최근 이벤트</span><span class=\"value\">" + (eventLabel || "—") + "</span></div>" +
      "</div>";
    sec13dfgSummary.classList.remove("hidden");
  }
  if (sec13dfgTableWrap) {
    sec13dfgTableWrap.dataset.cik = currentCik || "";
  }
  if (sec13dfgTableBody && Array.isArray(filings)) {
    sec13dfgTableBody.innerHTML = filings
      .map(function (f) {
        const acc = (f.accessionNumber || "").replace(/"/g, "&quot;");
        const doc = (f.primaryDocument || "").replace(/"/g, "&quot;");
        const form = (f.formType || "").replace(/"/g, "&quot;");
        const is13DG = /^13[DG](\/A)?$/i.test(f.formType || "");
        const is13F = /^13F-HR(\/A)?$/i.test(f.formType || "");
        const showDetail = is13DG || is13F;
        const cell4 =
          (f.secLink ? "<a href=\"" + f.secLink + "\" target=\"_blank\" rel=\"noopener\">원문</a>" : "—") +
          (showDetail
            ? " <button type=\"button\" class=\"sec13dfg-detail-btn\" data-accession=\"" + acc + "\" data-primary-doc=\"" + doc + "\" data-form-type=\"" + form + "\">상세</button>"
            : "");
        return "<tr><td>" + (f.filingDate || "") + "</td><td>" + (f.formType || "") + "</td><td>" +
          (f.accessionNumberShort || f.accessionNumber || "") + "</td><td>" + cell4 + "</td><td>" + (f.note || "") + "</td></tr>";
      })
      .join("");
  }
  if (sec13dfgTableWrap) sec13dfgTableWrap.classList.remove("hidden");
  if (sec13dfgExplain) sec13dfgExplain.classList.remove("hidden");
  bindSec13dfgDetailButtons();
}

function bindSec13dfgDetailButtons() {
  if (!sec13dfgTableBody || !sec13dfgTableWrap) return;
  sec13dfgTableBody.querySelectorAll(".sec13dfg-detail-btn").forEach(function (btn) {
    btn.removeEventListener("click", onSec13dfgDetailClick);
    btn.addEventListener("click", onSec13dfgDetailClick);
  });
}

function onSec13dfgDetailClick(ev) {
  var btn = ev.target;
  if (!btn || !btn.classList.contains("sec13dfg-detail-btn")) return;
  var tr = btn.closest("tr");
  if (!tr) return;
  var next = tr.nextElementSibling;
  if (next && next.classList.contains("sec13dfg-detail-row")) {
    next.remove();
    return;
  }
  var cik = (sec13dfgTableWrap && sec13dfgTableWrap.dataset.cik) || "";
  var accession = (btn.dataset.accession || "").replace(/&quot;/g, '"');
  var primaryDoc = (btn.dataset.primaryDoc || "").replace(/&quot;/g, '"');
  var formType = (btn.dataset.formType || "").replace(/&quot;/g, '"');
  var is13F = /^13F-HR(\/A)?$/i.test(formType);
  var detailRow = document.createElement("tr");
  detailRow.className = "sec13dfg-detail-row";
  detailRow.innerHTML = "<td colspan=\"5\"><div class=\"sec13dfg-detail-inner\">로딩 중…</div></td>";
  tr.parentNode.insertBefore(detailRow, tr.nextSibling);
  var url = is13F
    ? "/api/sec/13f-summary?cik=" + encodeURIComponent(cik) + "&accession=" + encodeURIComponent(accession) + "&primaryDoc=" + encodeURIComponent(primaryDoc)
    : "/api/sec/filing-detail?cik=" + encodeURIComponent(cik) + "&accession=" + encodeURIComponent(accession) + "&primaryDoc=" + encodeURIComponent(primaryDoc) + "&formType=" + encodeURIComponent(formType);
  fetch(url, { cache: "no-store" })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var inner = detailRow.querySelector(".sec13dfg-detail-inner");
      if (!inner) return;
      if (is13F) {
        if (data.ok) {
          var sectors = (data.topSectors && data.topSectors.length) ? data.topSectors.join(" / ") : "—";
          var etf = data.etfExposure ? ("있음" + (data.etfLabels && data.etfLabels.length ? " (" + data.etfLabels.slice(0, 2).join(", ") + " 등)" : "")) : "없음";
          inner.innerHTML = "<span class=\"sec13dfg-detail-label\">(추정)</span> " +
            "섹터 노출: " + sectors + " · ETF 노출: " + etf + " · 성격 추정: " + (data.mixLabel || "—");
        } else {
          inner.textContent = data.message || "13F 제출 확인됨 (상세 비공개)";
        }
      } else {
        if (data.ok) {
          var p = data.percentOfClass != null ? "지분율: " + data.percentOfClass + "% (문서 기준)" : "";
          var s = data.sharesOwned != null ? "보유주식: " + (data.sharesOwned).toLocaleString() : "";
          var parts = [p, s].filter(Boolean);
          inner.innerHTML = (parts.join(" · ") || "지분 정보 미확인") + " · 출처: " + (data.source || formType) + " 원문";
        } else {
          inner.textContent = data.message || "지분 정보 미확인";
        }
      }
    })
    .catch(function () {
      var inner = detailRow.querySelector(".sec13dfg-detail-inner");
      if (inner) inner.textContent = "상세 정보를 불러오지 못했습니다.";
    });
}

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
