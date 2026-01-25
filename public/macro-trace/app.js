const SAFE_ASSETS = [
  "GLD",
  "DXY",
  "SHY",
  "IEF",
  "TLT",
  "KO",
  "WMT",
  "PEP",
  "KHC",
  "CL",
  "AWK",
  "ECL",
  "GEV",
  "XYL",
];

const HEDGE_ASSETS = ["USO", "SLV", "VIX"];

const RISK_SECTORS = {
  빅테크: ["AAPL", "AMZN", "GOOG", "META", "MSFT", "TSLA", "NVDA"],
  우주경제: ["RKLB", "RDW", "ASTS", "SPCE"],
  장수과학: ["NTLA", "UNH", "CRSP"],
  합성생물학: ["DNA"],
  양자컴퓨터: ["IONQ", "RGTI"],
  인프라: ["GLW", "TEL", "VRT"],
  미래에너지: ["FLNC", "GEV", "NEE", "OKLO", "PWR", "SMR", "APD", "ETN"],
  결제시스템: ["HOOD", "V", "PYPL", "AXP"],
  "금융/자산운용": ["BLK", "GS", "JPM", "MS"],
  "명품/사치재": ["LVMUY", "HESAY", "PPRUY"],
  저작권: ["ADBE"],
};

const EXTRA_SECTORS = {
  사이버보안: ["NET", "PLTR", "CRWD"],
  "방산/우주": ["LMT", "NOC"],
  "데이터센터/냉각": ["VRT", "CARR"],
  "위성통신/우주데이터": ["IRDM", "ASTS"],
  "해양환경/로봇": ["TDY", "OII"],
  "수자원/대기물": ["GEV"],
  "친환경 리사이클링": ["EMN"],
  "세포 재프로그래밍": ["SANA"],
  "디지털 트윈/IoT": ["IOT"],
};

const INDICATORS = ["NQ"];

const QUARTERS = ["Q1", "Q2", "Q3"];
const QUARTER_LABELS = {
  Q1: "1Q (00:00)",
  Q2: "2Q (02:00)",
  Q3: "3Q (05:30)",
};

const actionsEl = document.getElementById("actions");
const dateInput = document.getElementById("dateInput");
const applyButton = document.getElementById("applyButton");
const statusEl = document.getElementById("status");
const warningEl = document.getElementById("warning");
const errorEl = document.getElementById("error");
const errorsEl = document.getElementById("errors");
const page1 = document.getElementById("page1");
const page2 = document.getElementById("page2");

const safeValueEl = document.getElementById("safeValue");
const riskValueEl = document.getElementById("riskValue");
const hedgeValueEl = document.getElementById("hedgeValue");

let lineChart = null;
let barChart = null;
let sectorChart = null;

const formatPct = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}%`;
};

const average = (values) => {
  const filtered = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (!filtered.length) return null;
  const sum = filtered.reduce((acc, value) => acc + value, 0);
  return Number((sum / filtered.length).toFixed(2));
};

const getQuarterValue = (priceMap, key, quarter) => {
  const entry = priceMap[key];
  if (!entry || !entry.ok) return null;
  return entry.quarters && entry.quarters[quarter] !== undefined
    ? entry.quarters[quarter]
    : null;
};

const seriesFromKeys = (priceMap, keys) => ({
  Q1: average(keys.map((key) => getQuarterValue(priceMap, key, "Q1"))),
  Q2: average(keys.map((key) => getQuarterValue(priceMap, key, "Q2"))),
  Q3: average(keys.map((key) => getQuarterValue(priceMap, key, "Q3"))),
});

const averageSeriesList = (seriesList) => ({
  Q1: average(seriesList.map((series) => series.Q1)),
  Q2: average(seriesList.map((series) => series.Q2)),
  Q3: average(seriesList.map((series) => series.Q3)),
});

const mergeSectors = (primary, secondary) => {
  const tickerToSector = new Map();
  const merged = {};
  const addSector = (sector, tickers) => {
    const unique = tickers.filter((ticker) => !tickerToSector.has(ticker));
    if (!unique.length) return;
    unique.forEach((ticker) => tickerToSector.set(ticker, sector));
    merged[sector] = (merged[sector] || []).concat(unique);
  };
  Object.entries(primary).forEach(([sector, tickers]) => addSector(sector, tickers));
  Object.entries(secondary).forEach(([sector, tickers]) => addSector(sector, tickers));
  return merged;
};

const buildSectorDefinitions = (base, tickers) => {
  const known = new Set(Object.values(base).flat());
  const merged = Object.entries(base).map(([name, list]) => ({
    name,
    tickers: Array.from(new Set(list)),
  }));
  tickers.forEach((ticker) => {
    if (known.has(ticker)) return;
    known.add(ticker);
    merged.push({ name: `신규-${ticker}`, tickers: [ticker] });
  });
  return merged;
};

const getAllKeys = (sectors) => {
  const keys = new Set();
  SAFE_ASSETS.forEach((key) => keys.add(key));
  HEDGE_ASSETS.forEach((key) => keys.add(key));
  sectors.forEach((sector) => sector.tickers.forEach((ticker) => keys.add(ticker)));
  INDICATORS.forEach((key) => keys.add(key));
  return Array.from(keys);
};

const getLabelForKey = (key) => {
  const labels = {
    NQ: "NQ선물",
  };
  return labels[key] || key;
};

const updateQuery = (state) => {
  const params = new URLSearchParams(window.location.search);
  if (state.date) {
    params.set("date", state.date);
  }
  if (state.page === 2) {
    params.set("page", "2");
  } else {
    params.delete("page");
  }
  const qs = params.toString();
  const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
  window.history.replaceState(null, "", nextUrl);
};

const renderActions = (state) => {
  if (state.page === 1) {
    actionsEl.innerHTML = `
      <button class="button" type="button" id="nextPage">다음 페이지 ▶</button>
      <a class="button" href="/">대시보드</a>
    `;
    document.getElementById("nextPage").onclick = () => setPage(2);
  } else {
    actionsEl.innerHTML = `
      <button class="button" type="button" id="prevPage">◀ 이전 페이지</button>
    `;
    document.getElementById("prevPage").onclick = () => setPage(1);
  }
};

const setPage = (page) => {
  state.page = page;
  renderView();
  updateQuery(state);
};

const setStatus = (message) => {
  statusEl.textContent = message || "";
};

const setWarning = (message) => {
  if (!message) {
    warningEl.classList.add("hidden");
    warningEl.textContent = "";
    return;
  }
  warningEl.classList.remove("hidden");
  warningEl.textContent = `경고: ${message}`;
};

const setError = (message) => {
  if (!message) {
    errorEl.classList.add("hidden");
    errorEl.textContent = "";
    return;
  }
  errorEl.classList.remove("hidden");
  errorEl.textContent = message;
};

const renderErrors = (priceMap, keys) => {
  const failures = keys
    .map((key) => ({ key, entry: priceMap[key] }))
    .filter(({ entry }) => entry && !entry.ok);
  if (!failures.length) {
    errorsEl.classList.add("hidden");
    errorsEl.innerHTML = "";
    return;
  }
  errorsEl.classList.remove("hidden");
  errorsEl.innerHTML = `
    <div class="chart-title">수집 실패 항목</div>
    <ul>
      ${failures
        .map((item) => `<li>${item.key}: ${item.entry.error || "데이터 없음"}</li>`)
        .join("")}
    </ul>
  `;
};

const updateCharts = (bucketSeries, indicatorSeries, sectorSeries, sectors) => {
  const lineData = {
    labels: QUARTERS.map((q) => QUARTER_LABELS[q]),
    datasets: [
      {
        label: "안전자산",
        data: QUARTERS.map((q) => bucketSeries.safe[q]),
        borderColor: "#fbbf24",
        backgroundColor: "rgba(251,191,36,0.2)",
        tension: 0.3,
      },
      {
        label: "위험자산",
        data: QUARTERS.map((q) => bucketSeries.risk[q]),
        borderColor: "#f87171",
        backgroundColor: "rgba(248,113,113,0.2)",
        tension: 0.3,
      },
      {
        label: "헷징자산",
        data: QUARTERS.map((q) => bucketSeries.hedge[q]),
        borderColor: "#34d399",
        backgroundColor: "rgba(52,211,153,0.2)",
        tension: 0.3,
      },
    ],
  };

  const comparisonLabels = ["안전자산", "위험자산", "헷징자산"].concat(
    INDICATORS.map((key) => getLabelForKey(key))
  );
  const comparisonSeries = [
    bucketSeries.safe,
    bucketSeries.risk,
    bucketSeries.hedge,
    ...INDICATORS.map((key) => indicatorSeries[key] || {}),
  ];

  const barData = {
    labels: comparisonLabels,
    datasets: QUARTERS.map((q, index) => ({
      label: QUARTER_LABELS[q],
      data: comparisonSeries.map((series) => series[q] ?? null),
      backgroundColor: ["#f59e0b", "#eab308", "#facc15"][index],
    })),
  };

  const sectorData = {
    labels: sectors.map((sector) => sector.name),
    datasets: QUARTERS.map((q, index) => ({
      label: QUARTER_LABELS[q],
      data: sectors.map((sector) => sectorSeries[sector.name]?.[q] ?? null),
      backgroundColor: ["#60a5fa", "#a78bfa", "#f87171"][index],
    })),
  };

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "nearest", intersect: true },
    plugins: {
      tooltip: {
        callbacks: {
          title: (items) => (items.length ? items[0].dataset.label : ""),
          label: (context) => {
            const data = context.dataset.data || [];
            return QUARTERS.map(
              (q, index) => `${QUARTER_LABELS[q]}: ${formatPct(data[index])}`
            );
          },
        },
      },
    },
  };

  if (!lineChart) {
    lineChart = new Chart(document.getElementById("lineChart"), {
      type: "line",
      data: lineData,
      options: lineChartOptions,
    });
  } else {
    lineChart.data = lineData;
    lineChart.options = lineChartOptions;
    lineChart.update();
  }

  if (!barChart) {
    barChart = new Chart(document.getElementById("barChart"), {
      type: "bar",
      data: barData,
      options: { responsive: true, maintainAspectRatio: false },
    });
  } else {
    barChart.data = barData;
    barChart.update();
  }

  if (!sectorChart) {
    sectorChart = new Chart(document.getElementById("sectorChart"), {
      type: "bar",
      data: sectorData,
      options: { responsive: true, maintainAspectRatio: false },
    });
  } else {
    sectorChart.data = sectorData;
    sectorChart.update();
  }
};

const renderView = () => {
  renderActions(state);
  page1.classList.toggle("hidden", state.page !== 1);
  page2.classList.toggle("hidden", state.page !== 2);
};

const loadData = async () => {
  setStatus("데이터 로딩 중...");
  setError("");
  setWarning("");
  try {
    const baseSectors = mergeSectors(RISK_SECTORS, EXTRA_SECTORS);
    const sectorDefs = buildSectorDefinitions(baseSectors, []);
    const keys = getAllKeys(sectorDefs);
    const query = new URLSearchParams();
    query.set("symbols", keys.join(","));
    if (state.date) query.set("date", state.date);
    query.set("quarters", "1");

    const response = await fetch(`/api/market/prices?${query.toString()}`);
    if (!response.ok) {
      throw new Error(`API 오류 (${response.status})`);
    }
    const payload = await response.json();
    if (!payload.ok) {
      throw new Error(payload.error || "데이터를 불러오지 못했습니다.");
    }

    const priceMap = payload.prices || {};
    const safeSeries = seriesFromKeys(priceMap, SAFE_ASSETS);
    const hedgeSeries = seriesFromKeys(priceMap, HEDGE_ASSETS);

    const safeSet = new Set(SAFE_ASSETS);
    const hedgeSet = new Set(HEDGE_ASSETS);
    const indicatorSet = new Set(INDICATORS);
    const riskCandidates = keys.filter(
      (key) => !safeSet.has(key) && !hedgeSet.has(key) && !indicatorSet.has(key)
    );
    const sectors = buildSectorDefinitions(baseSectors, riskCandidates);
    const sectorSeries = Object.fromEntries(
      sectors.map((sector) => [sector.name, seriesFromKeys(priceMap, sector.tickers)])
    );
    const riskSeries = averageSeriesList(Object.values(sectorSeries));

    const bucketSeries = {
      safe: safeSeries,
      risk: riskSeries,
      hedge: hedgeSeries,
    };

    const indicatorSeries = Object.fromEntries(
      INDICATORS.map((key) => [key, seriesFromKeys(priceMap, [key])])
    );

    safeValueEl.textContent = formatPct(bucketSeries.safe.Q3);
    riskValueEl.textContent = formatPct(bucketSeries.risk.Q3);
    hedgeValueEl.textContent = formatPct(bucketSeries.hedge.Q3);

    updateCharts(bucketSeries, indicatorSeries, sectorSeries, sectors);
    renderErrors(priceMap, keys);

    setStatus(payload.asOf ? `업데이트: ${payload.asOf}` : "");
    setWarning(payload.meta && payload.meta.warnings ? payload.meta.warnings.join(", ") : "");
  } catch (error) {
    setStatus("데이터 로딩 실패");
    setError(error.message || "데이터를 불러오지 못했습니다.");
  }
};

const params = new URLSearchParams(window.location.search);
const initialDate = params.get("date");
const isValidDate = initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate);
const today = new Date().toISOString().slice(0, 10);

const state = {
  page: params.get("page") === "2" ? 2 : 1,
  date: isValidDate ? initialDate : today,
};

dateInput.value = state.date;
applyButton.addEventListener("click", () => {
  state.date = dateInput.value || today;
  updateQuery(state);
  loadData();
});

renderView();
loadData();
