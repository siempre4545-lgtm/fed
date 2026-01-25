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

const renderTable = (rows, date, day1Date, day4Date, day1Map, day4Map) => {
  tableBody.innerHTML = "";
  baseHeader.textContent = date ? `${date} (목)` : "값";
  day1Header.textContent = day1Date ? `${day1Date} (Day+1·금)` : "Day+1(금)";
  day4Header.textContent = day4Date ? `${day4Date} (Day+4·월)` : "Day+4(월)";

  let currentGroup = null;
  rows.forEach((row) => {
    if (row.group !== currentGroup) {
      currentGroup = row.group;
      const groupRow = document.createElement("tr");
      groupRow.className = "group-row";
      groupRow.innerHTML = `<td colspan="5">${row.group}</td>`;
      tableBody.appendChild(groupRow);
    }

    const day1Row = day1Map.get(row.key);
    const day4Row = day4Map.get(row.key);
    const baseValue = row.status === "ok" ? row.value : null;
    const day1Value = day1Row && day1Row.status === "ok" ? day1Row.value : null;
    const day4Value = day4Row && day4Row.status === "ok" ? day4Row.value : null;
    const day1Change = formatChangePct(baseValue, day1Value);
    const day4Change = formatChangePct(baseValue, day4Value);
    const day1Class = getSignClass(
      baseValue !== null && day1Value !== null ? day1Value - baseValue : null
    );
    const day4Class = getSignClass(
      baseValue !== null && day4Value !== null ? day4Value - baseValue : null
    );

    const tr = document.createElement("tr");
    const valueText = row.status === "ok" ? formatValue(row.value) : "N/A";
    const metaText = row.error ? row.error : row.source ? row.source : "";
    const valueClass = row.status === "ok" ? getSignClass(row.value) : "value-na";
    const day1Meta = day1Row ? (day1Row.error ? day1Row.error : day1Row.source) : "";
    const day4Meta = day4Row ? (day4Row.error ? day4Row.error : day4Row.source) : "";

    tr.innerHTML = `
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
        ${day4Value === null ? "N/A" : `${formatValue(day4Value)} ${day4Change}`}
        ${day4Meta ? `<span class="value-meta">${day4Meta}</span>` : ""}
      </td>
    `;
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

    const [basePayload, day1Payload, day4Payload] = await Promise.all([
      fetchTable(thursday),
      fetchTable(day1Date).catch(() => null),
      fetchTable(day4Date).catch(() => null),
    ]);

    const baseRows = basePayload.rows || [];
    const day1Rows = day1Payload?.rows || [];
    const day4Rows = day4Payload?.rows || [];

    const day1Map = new Map(day1Rows.map((row) => [row.key, row]));
    const day4Map = new Map(day4Rows.map((row) => [row.key, row]));

    renderTable(baseRows, basePayload.date || thursday, day1Date, day4Date, day1Map, day4Map);
    setStatus(basePayload.date ? `업데이트: ${basePayload.date}` : "");
    const warnings = [];
    if (dateAdjusted) warnings.push("목요일만 조회 가능합니다. 가장 최근 목요일로 변경했습니다.");
    if (basePayload.meta?.warnings?.length) warnings.push(...basePayload.meta.warnings);
    if (!day1Payload) warnings.push("Day+1 데이터를 불러오지 못했습니다.");
    if (!day4Payload) warnings.push("Day+4 데이터를 불러오지 못했습니다.");
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
