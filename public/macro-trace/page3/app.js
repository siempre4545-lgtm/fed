const dateInput = document.getElementById("dateInput");
const applyButton = document.getElementById("applyButton");
const statusEl = document.getElementById("status");
const warningEl = document.getElementById("warning");
const errorEl = document.getElementById("error");
const tableBody = document.getElementById("tableBody");
const baseHeader = document.getElementById("baseHeader");
const day1Header = document.getElementById("day1Header");
const day4Header = document.getElementById("day4Header");

const formatValue = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  const rounded =
    Math.abs(value) >= 100 ? value.toFixed(2) : Math.abs(value) >= 1 ? value.toFixed(3) : value.toFixed(4);
  return Number(rounded).toLocaleString("en-US");
};

const formatChangePct = (baseValue, nextValue) => {
  if (
    baseValue === null ||
    baseValue === undefined ||
    nextValue === null ||
    nextValue === undefined ||
    Number.isNaN(baseValue) ||
    Number.isNaN(nextValue) ||
    baseValue === 0
  ) {
    return "";
  }
  const changePct = ((nextValue - baseValue) / Math.abs(baseValue)) * 100;
  const sign = changePct > 0 ? "+" : "";
  return `(${sign}${changePct.toFixed(2)}%)`;
};

const getSignClass = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "value-neutral";
  if (value > 0) return "value-positive";
  if (value < 0) return "value-negative";
  return "value-neutral";
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

const parseYmd = (ymd) => {
  const [year, month, day] = ymd.split("-").map((v) => Number(v));
  return new Date(year, month - 1, day);
};

const toYmd = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDays = (ymd, days) => {
  const date = parseYmd(ymd);
  date.setDate(date.getDate() + days);
  return toYmd(date);
};

const getRecentThursday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = day >= 4 ? day - 4 : day + 3;
  date.setDate(date.getDate() - diff);
  return toYmd(date);
};

const getThursdayFor = (ymd) => {
  const date = parseYmd(ymd);
  const day = date.getDay();
  const diff = day >= 4 ? day - 4 : day + 3;
  date.setDate(date.getDate() - diff);
  return toYmd(date);
};

const getDebugMode = () => {
  try {
    return new URLSearchParams(window.location.search).get("debug") === "1";
  } catch {
    return false;
  }
};

const renderTable = (rows, date, day1Date, day4Date, day1Map, day4Map, day4Future, debugMode) => {
  tableBody.innerHTML = "";
  baseHeader.textContent = date ? `${date} (목)` : "값";
  day1Header.textContent = day1Date ? `${day1Date} (Day+1·금)` : "Day+1(금)";
  day4Header.textContent = day4Date ? `${day4Date} (Day+4·월)` : "Day+4(월)";

  const theadRow = tableBody.closest("table").querySelector("thead tr");
  const hasDebugCol = theadRow.querySelector("th.debug-col");
  if (debugMode && !hasDebugCol) {
    const th = document.createElement("th");
    th.className = "debug-col";
    th.textContent = "날짜(개발용)";
    theadRow.appendChild(th);
  } else if (!debugMode && hasDebugCol) {
    hasDebugCol.remove();
  }

  const colCount = debugMode ? 6 : 5;
  let currentGroup = null;
  rows.forEach((row) => {
    if (row.group !== currentGroup) {
      currentGroup = row.group;
      const groupRow = document.createElement("tr");
      groupRow.className = "group-row";
      groupRow.innerHTML = `<td colspan="${colCount}">${row.group}</td>`;
      tableBody.appendChild(groupRow);
    }

    const day1Row = day1Map.get(row.key);
    const day4Row = day4Future ? null : day4Map.get(row.key);
    const baseValue = row.status === "ok" ? row.value : null;
    const day1Value = day1Row && day1Row.status === "ok" ? day1Row.value : null;
    const day4Value = day4Row && day4Row.status === "ok" ? day4Row.value : null;
    const day1Change = formatChangePct(baseValue, day1Value);
    const day4Change = day4Future ? "" : formatChangePct(baseValue, day4Value);
    const day1Class = getSignClass(
      baseValue !== null && day1Value !== null ? day1Value - baseValue : null
    );
    const day4Class = day4Future
      ? "value-na"
      : getSignClass(baseValue !== null && day4Value !== null ? day4Value - baseValue : null);

    const tr = document.createElement("tr");
    const valueText = row.status === "ok" ? formatValue(row.value) : "N/A";
    const isFallback = row.status === "ok" && (row.fetchMode === "latest_before" || row.fetchMode === "fallback");
    const dateLabel = isFallback && row.valueDate ? `(${row.valueDate})` : (isFallback && !row.valueDate ? "날짜 미표기" : null);
    const metaText = row.error ? row.error : dateLabel ? dateLabel : row.source ? row.source : "";
    const valueClass = row.status === "ok" ? getSignClass(row.value) : "value-na";
    const day1Fallback = day1Row && day1Row.status === "ok" && (day1Row.fetchMode === "latest_before" || day1Row.fetchMode === "fallback");
    const day1Meta = day1Row
      ? (day1Row.error ? day1Row.error : day1Fallback && day1Row.valueDate ? `(${day1Row.valueDate})` : day1Fallback && !day1Row.valueDate ? "날짜 미표기" : day1Row.source)
      : "";
    const day4Fallback = day4Row && day4Row.status === "ok" && (day4Row.fetchMode === "latest_before" || day4Row.fetchMode === "fallback");
    const day4Meta = day4Future
      ? "미발표"
      : day4Row
        ? (day4Row.error ? day4Row.error : day4Fallback && day4Row.valueDate ? `(${day4Row.valueDate})` : day4Fallback && !day4Row.valueDate ? "날짜 미표기" : day4Row.source)
        : "";

    let cells = `
      <td>${row.group}</td>
      <td>${row.label}</td>
      <td class="${valueClass}">
        ${valueText}
        ${metaText ? `<span class="value-meta">${metaText}</span>` : ""}
      </td>
      <td class="${day1Value === null ? "value-na" : day1Class}">
        ${day1Value === null ? "N/A" : `${formatValue(day1Value)} ${day1Change}`}
        ${day1Meta ? `<span class="value-meta">${day1Meta}</span>` : ""}
      </td>
      <td class="${day4Value === null ? "value-na" : day4Class}">
        ${day4Future ? "미발표" : day4Value === null ? "N/A" : `${formatValue(day4Value)} ${day4Change}`}
        ${day4Meta ? `<span class="value-meta">${day4Meta}</span>` : ""}
      </td>
    `;
    if (debugMode) {
      const vd = row.valueDate != null ? row.valueDate : "—";
      const reason = row.reasonIfMismatch ? ` (${row.reasonIfMismatch})` : "";
      cells += `<td class="value-meta debug-col">${vd}${reason}</td>`;
    }
    tr.innerHTML = cells;
    tableBody.appendChild(tr);
  });
};

const fetchTable = async (date) => {
  const response = await fetch(`/api/macro-trace/table?date=${encodeURIComponent(date)}`);
  if (!response.ok) {
    throw new Error(`API 오류 (${response.status})`);
  }
  const payload = await response.json();
  if (!payload.ok) {
    throw new Error(payload.error || "데이터를 불러오지 못했습니다.");
  }
  return payload;
};

/** 응답의 selectedDate가 요청한 날짜와 일치하는지 검사. 불일치 시 해당 응답 폐기 */
const validatePayloadDate = (payload, requestedDate) => {
  const respDate = payload.selectedDate || payload.date;
  return respDate === requestedDate;
};

const loadData = async () => {
  setStatus("데이터 로딩 중...");
  setError("");
  setWarning("");
  try {
    const selected = dateInput.value || getRecentThursday();
    const thursday = getThursdayFor(selected);
    const dateAdjusted = selected !== thursday;
    if (dateAdjusted) {
      dateInput.value = thursday;
    }

    const day1Date = addDays(thursday, 1);
    const day4Date = addDays(thursday, 4);
    const todayYmd = toYmd(new Date());
    const day4Future = day4Date > todayYmd;

    let basePayload = await fetchTable(thursday);
    if (!validatePayloadDate(basePayload, thursday)) {
      setWarning("선택한 날짜와 서버 응답 날짜가 다릅니다. 캐시를 우회해 다시 조회합니다.");
      basePayload = await fetchTable(thursday);
    }
    let day1Payload = await fetchTable(day1Date).catch(() => null);
    if (day1Payload && !validatePayloadDate(day1Payload, day1Date)) {
      day1Payload = null;
    }
    let day4Payload = day4Future ? null : await fetchTable(day4Date).catch(() => null);
    if (day4Payload && !validatePayloadDate(day4Payload, day4Date)) {
      day4Payload = null;
    }

    const baseRows = basePayload.rows || [];
    const day1Rows = day1Payload?.rows || [];
    const day4Rows = day4Payload?.rows || [];

    const day1Map = new Map(day1Rows.map((row) => [row.key, row]));
    const day4Map = new Map(day4Rows.map((row) => [row.key, row]));

    const displayDate = basePayload.selectedDate || basePayload.date || thursday;
    const debugMode = getDebugMode();
    renderTable(
      baseRows,
      displayDate,
      day1Date,
      day4Date,
      day1Map,
      day4Map,
      day4Future,
      debugMode
    );
    setStatus(displayDate ? `업데이트: ${displayDate}` : "");

    const naCount = baseRows.filter((r) => r.status === "na").length;
    const warnings = [];
    if (dateAdjusted) warnings.push("목요일만 조회 가능합니다. 가장 최근 목요일로 변경했습니다.");
    if (naCount > 0) warnings.push(`선택일 스냅샷이 없는 지표 수: ${naCount}개 (정상: 해당일 데이터 없으면 N/A)`);
    if (basePayload.meta?.warnings?.length) warnings.push(...basePayload.meta.warnings);
    if (!day1Payload) warnings.push("Day+1 데이터를 불러오지 못했습니다.");
    if (!day4Payload && !day4Future) warnings.push("Day+4 데이터를 불러오지 못했습니다.");
    setWarning(warnings.length ? warnings.join(", ") : "");
  } catch (error) {
    setStatus("데이터 로딩 실패");
    setError(error.message || "데이터를 불러오지 못했습니다.");
  }
};

const initialDate = getRecentThursday();
dateInput.value = initialDate;
applyButton.addEventListener("click", loadData);
loadData();
