const dateInput = document.getElementById("dateInput");
const applyButton = document.getElementById("applyButton");
const statusEl = document.getElementById("status");
const warningEl = document.getElementById("warning");
const errorEl = document.getElementById("error");
const tableBody = document.getElementById("tableBody");
const valueHeader = document.getElementById("valueHeader");

const formatValue = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  const rounded =
    Math.abs(value) >= 100 ? value.toFixed(2) : Math.abs(value) >= 1 ? value.toFixed(3) : value.toFixed(4);
  return Number(rounded).toLocaleString("en-US");
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

const getRecentThursday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = day >= 4 ? day - 4 : day + 3;
  date.setDate(date.getDate() - diff);
  return date.toISOString().slice(0, 10);
};

const renderTable = (rows, date) => {
  tableBody.innerHTML = "";
  valueHeader.textContent = date ? `${date}` : "값";

  let currentGroup = null;
  rows.forEach((row) => {
    if (row.group !== currentGroup) {
      currentGroup = row.group;
      const groupRow = document.createElement("tr");
      groupRow.className = "group-row";
      groupRow.innerHTML = `<td colspan="3">${row.group}</td>`;
      tableBody.appendChild(groupRow);
    }

    const tr = document.createElement("tr");
    const valueText = row.status === "ok" ? formatValue(row.value) : "N/A";
    const metaText = row.error ? row.error : row.source ? row.source : "";
    const valueClass = row.status === "ok" ? "" : "value-na";

    tr.innerHTML = `
      <td>${row.group}</td>
      <td>${row.label}</td>
      <td class="${valueClass}">
        ${valueText}
        ${metaText ? `<span class="value-meta">${metaText}</span>` : ""}
      </td>
    `;
    tableBody.appendChild(tr);
  });
};

const loadData = async () => {
  setStatus("데이터 로딩 중...");
  setError("");
  setWarning("");
  try {
    const date = dateInput.value;
    const response = await fetch(`/api/macro-trace/table?date=${encodeURIComponent(date)}`);
    if (!response.ok) {
      throw new Error(`API 오류 (${response.status})`);
    }
    const payload = await response.json();
    if (!payload.ok) {
      throw new Error(payload.error || "데이터를 불러오지 못했습니다.");
    }
    renderTable(payload.rows || [], payload.date || date);
    setStatus(payload.date ? `업데이트: ${payload.date}` : "");
    setWarning(payload.meta && payload.meta.warnings ? payload.meta.warnings.join(", ") : "");
  } catch (error) {
    setStatus("데이터 로딩 실패");
    setError(error.message || "데이터를 불러오지 못했습니다.");
  }
};

const initialDate = getRecentThursday();
dateInput.value = initialDate;
applyButton.addEventListener("click", loadData);
loadData();
