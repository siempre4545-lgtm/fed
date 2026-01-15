import * as cheerio from "cheerio";

// H.4.1 HTML 파싱 함수 (fed_report_sh에서 통합)

export function parseH41Html(html: string, selectedDate: string) {
  const $ = cheerio.load(html);
  const logs: any[] = [];

  const overviewTargets = [
    {
      key: "totalAssets",
      tableTitle: "Factors Affecting Reserve Balances of Depository Institutions",
      rowLabel: "Total factors supplying reserve funds",
    },
    {
      key: "securitiesHeld",
      tableTitle: "Factors Affecting Reserve Balances of Depository Institutions",
      rowLabel: "Securities held outright",
    },
    {
      key: "reserveBalances",
      tableTitle:
        "Factors Affecting Reserve Balances of Depository Institutions (continued)",
      rowLabel: "Reserve balances with Federal Reserve Banks",
    },
    {
      key: "tga",
      tableTitle:
        "Factors Affecting Reserve Balances of Depository Institutions (continued)",
      rowLabel: "U.S. Treasury, General Account",
    },
    {
      key: "reverseRepo",
      tableTitle:
        "Factors Affecting Reserve Balances of Depository Institutions (continued)",
      rowLabel: "Reverse repurchase agreements",
    },
    {
      key: "currency",
      tableTitle:
        "Factors Affecting Reserve Balances of Depository Institutions (continued)",
      rowLabel: "Currency in circulation",
    },
  ];

  const overview: any = {};
  const tableCache = new Map();

  for (const target of overviewTargets) {
    const table = getTableByTitle($, tableCache, target.tableTitle);
    if (!table) {
      overview[target.key] = emptyOverviewValue();
      logs.push({
        key: target.key,
        tableTitle: target.tableTitle,
        rowText: null,
        rawValue: null,
        currentValue: null,
        weeklyChange: null,
        yearlyChange: null,
      });
      continue;
    }

    const { rowText, values } = getRowValuesForTable(
      $,
      table,
      target.rowLabel,
      selectedDate
    );

    const entry = calculateOverview(values);
    overview[target.key] = entry;

    logs.push({
      key: target.key,
      tableTitle: target.tableTitle,
      rowText,
      rawValue: values,
      currentValue: entry.current,
      weeklyChange: entry.weeklyChange,
      yearlyChange: entry.yearlyChange,
      weeklyChangePct: entry.weeklyChangePct,
      yearlyChangePct: entry.yearlyChangePct,
    });
  }

  const assetsTable = getTableByTitle(
    $,
    tableCache,
    "Consolidated Statement of Condition of All Federal Reserve Banks"
  );
  const assetRatios = calculateAssetRatios($, assetsTable, selectedDate, logs);
  const factors = calculateFactors(
    $,
    tableCache,
    selectedDate,
    overview,
    logs
  );
  const maturityDistribution = parseMaturityDistribution(
    $,
    tableCache,
    selectedDate,
    logs
  );
  const loansAndSecurities = parseLoansAndSecurities(
    $,
    tableCache,
    selectedDate,
    factors,
    logs
  );
  const financials = parseFinancials(
    $,
    tableCache,
    selectedDate,
    overview,
    factors,
    logs
  );

  logs.forEach((logEntry) => {
    console.log("[H41] 항목 로그", logEntry);
  });

  const summary = buildFactorSummary(factors);

  return {
    overview,
    factors,
    summary,
    maturityDistribution,
    loansAndSecurities,
    financials,
    assetRatios,
    logs,
  };
}

function emptyOverviewValue() {
  return {
    current: null,
    weeklyChange: null,
    weeklyChangePct: null,
    yearlyChange: null,
    yearlyChangePct: null,
    weeklyPrevious: null,
    yearlyPrevious: null,
    sourceDates: {
      currentWeekEnded: null,
      weeklyChangeFrom: null,
      yearlyChangeFrom: null,
    },
  };
}

function normalizeText(value: any): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function normalizeForMatch(value: any): string {
  return normalizeText(value).toLowerCase();
}

function getTableByTitle($: cheerio.CheerioAPI, cache: Map<string, any>, title: string) {
  if (cache.has(title)) {
    return cache.get(title);
  }

  const target = normalizeForMatch(title);
  let found: any = null;
  $("table").each((_, table) => {
    const tableContext = getTableContextText($, table);
    if (!tableContext) return;
    if (normalizeForMatch(tableContext).includes(target)) {
      found = table;
      return false;
    }
  });

  cache.set(title, found);
  return found;
}

function getTableContextText($: cheerio.CheerioAPI, table: any): string | null {
  const parts: string[] = [];
  const caption = normalizeText($(table).find("caption").first().text());
  if (caption) parts.push(caption);

  const ariaLabel = normalizeText($(table).attr("aria-label") || "");
  if (ariaLabel) parts.push(ariaLabel);

  $(table)
    .prevAll()
    .slice(0, 6)
    .each((_, el) => {
      const text = normalizeText($(el).text());
      if (text) parts.push(text);
    });

  $(table)
    .parent()
    .prevAll()
    .slice(0, 6)
    .each((_, el) => {
      const text = normalizeText($(el).text());
      if (text) parts.push(text);
    });

  const combined = normalizeText(parts.join(" | "));
  return combined || null;
}

function getRowValuesForTable($: cheerio.CheerioAPI, table: any, rowLabel: string, selectedDate: string) {
  const { rowText, matchedRow } = findBestRowMatch($, table, rowLabel);

  if (!matchedRow) {
    return {
      rowText: null,
      values: {
        currentRaw: null,
        weeklyChangeRaw: null,
        yearlyChangeRaw: null,
        sourceDates: {
          currentWeekEnded: null,
          weeklyChangeFrom: null,
          yearlyChangeFrom: null,
        },
      },
    };
  }

  const columns = buildColumnDefinitions($, table);
  const columnCount = columns.length;
  const rowValues = extractRowValues($, matchedRow, columnCount);

  const selectedDateObj = parseDateString(selectedDate);
  const selectedDateText = formatFedDate(selectedDateObj);

  const avgColumn = findAverageColumn(columns, selectedDateText, selectedDateObj);
  const changeColumns = findChangeColumns(columns, selectedDateObj);

  const currentRaw = getValueByColumn(rowValues, avgColumn?.index);
  const weeklyRaw = getValueByColumn(rowValues, changeColumns.weekly?.index);
  const yearlyRaw = getValueByColumn(rowValues, changeColumns.yearly?.index);

  return {
    rowText,
    values: {
      currentRaw,
      weeklyChangeRaw: weeklyRaw,
      yearlyChangeRaw: yearlyRaw,
      sourceDates: {
        currentWeekEnded: avgColumn?.dateText || null,
        weeklyChangeFrom: changeColumns.weekly?.dateText || null,
        yearlyChangeFrom: changeColumns.yearly?.dateText || null,
      },
    },
  };
}

function buildColumnDefinitions($: cheerio.CheerioAPI, table: any) {
  const headerRows: any[] = [];
  const theadRows = $(table).find("thead tr");
  if (theadRows.length) {
    theadRows.each((_, row) => headerRows.push(row));
  } else {
    $(table)
      .find("tr")
      .each((_, row) => {
        const ths = $(row).find("th");
        const tds = $(row).find("td");
        if (tds.length && !ths.length) {
          return false;
        }
        if (ths.length || tds.length) {
          headerRows.push(row);
        }
      });
  }

  const columns: any[] = [];
  const rowspanTracker: number[] = [];

  headerRows.forEach((row) => {
    let colIndex = 0;
    const newRowspanColumns = new Set<number>();

    $(row)
      .children("th, td")
      .each((_, cell) => {
        while (rowspanTracker[colIndex] && rowspanTracker[colIndex] > 0) {
          colIndex += 1;
        }

        const colspan = Number($(cell).attr("colspan") || 1);
        const rowspan = Number($(cell).attr("rowspan") || 1);
        const text = normalizeText($(cell).text());

        for (let offset = 0; offset < colspan; offset += 1) {
          const targetIndex = colIndex + offset;
          if (!columns[targetIndex]) {
            columns[targetIndex] = [];
          }
          if (text) {
            columns[targetIndex].push(text);
          }
          if (rowspan > 1) {
            rowspanTracker[targetIndex] =
              (rowspanTracker[targetIndex] || 0) + (rowspan - 1);
            newRowspanColumns.add(targetIndex);
          }
        }

        colIndex += colspan;
      });

    rowspanTracker.forEach((remaining, index) => {
      if (!remaining) return;
      if (newRowspanColumns.has(index)) return;
      rowspanTracker[index] = remaining - 1;
      if (rowspanTracker[index] <= 0) {
        rowspanTracker[index] = 0;
      }
    });
  });

  return columns.map((texts, index) => ({
    index,
    texts,
    mergedText: normalizeText(texts.join(" | ")),
  }));
}

function extractRowValues($: cheerio.CheerioAPI, row: any, columnCount: number) {
  const values: (string | null)[] = new Array(columnCount).fill(null);
  let colIndex = 0;

  $(row)
    .children("th, td")
    .each((cellIndex, cell) => {
      const colspan = Number($(cell).attr("colspan") || 1);
      if (cellIndex === 0) {
        colIndex += colspan;
        return;
      }

      const text = normalizeText($(cell).text());
      for (let offset = 0; offset < colspan; offset += 1) {
        if (colIndex + offset < values.length) {
          values[colIndex + offset] = text;
        }
      }
      colIndex += colspan;
    });

  return values;
}

function findAverageColumn(columns: any[], selectedDateText: string, selectedDateObj: Date) {
  const selectedKey = normalizeForMatch(selectedDateText);
  const avgColumns = columns.filter((col) =>
    col.texts.some((text: string) =>
      normalizeForMatch(text).includes("averages of daily figures")
    )
  );

  const withWeekEnded = avgColumns.filter((col) =>
    col.texts.some((text: string) => normalizeForMatch(text).includes("week ended"))
  );

  let match = withWeekEnded.find((col) =>
    normalizeForMatch(col.mergedText).includes(selectedKey)
  );

  if (!match && withWeekEnded.length) {
    match = pickClosestDateColumn(withWeekEnded, selectedDateObj);
  }

  if (!match && avgColumns.length) {
    match = pickClosestDateColumn(avgColumns, selectedDateObj);
  }

  return buildColumnMeta(match);
}

function findChangeColumns(
  columns: any[],
  selectedDateObj: Date,
  changeLabel: string = "change from week ended"
) {
  const changeColumns = columns.filter((col) =>
    col.texts.some((text: string) =>
      normalizeForMatch(text).includes(changeLabel)
    )
  );

  if (!changeColumns.length) {
    return { weekly: null, yearly: null };
  }

  const parsed = changeColumns
    .map((col) => ({
      col,
      date: parseFedDateFromText(col.mergedText),
    }))
    .filter((entry) => entry.date);

  if (!parsed.length) {
    return { weekly: buildColumnMeta(changeColumns[0]), yearly: null };
  }

  const withDiff = parsed.map((entry) => ({
    ...entry,
    diffDays: Math.abs(daysBetween(entry.date!, selectedDateObj)),
  }));
  withDiff.sort((a, b) => a.diffDays - b.diffDays);

  const weekly = buildColumnMeta(withDiff[0].col, withDiff[0].date!);
  const yearlyCandidate = withDiff[withDiff.length - 1];
  const yearly = buildColumnMeta(yearlyCandidate.col, yearlyCandidate.date!);

  return { weekly, yearly };
}

function buildColumnMeta(column: any, dateObj?: Date) {
  if (!column) return null;
  const date = dateObj || parseFedDateFromText(column.mergedText);
  return {
    index: column.index,
    dateText: date ? formatFedDate(date) : null,
  };
}

function pickClosestDateColumn(columns: any[], selectedDateObj: Date) {
  const candidates = columns
    .map((col) => ({
      col,
      date: parseFedDateFromText(col.mergedText),
    }))
    .filter((entry) => entry.date);

  if (!candidates.length) {
    return columns[0] || null;
  }

  let best = candidates[0];
  let bestDiff = Math.abs(daysBetween(best.date!, selectedDateObj));

  candidates.forEach((candidate) => {
    const diff = Math.abs(daysBetween(candidate.date!, selectedDateObj));
    if (diff < bestDiff) {
      best = candidate;
      bestDiff = diff;
    }
  });

  return best.col;
}

function getValueByColumn(values: (string | null)[], index: number | null | undefined) {
  if (index === null || index === undefined) return null;
  return parseNumericValue(values[index]);
}

function parseNumericValue(text: string | null) {
  if (!text) return null;
  const normalized = normalizeText(text).toLowerCase();
  if (!normalized || normalized === "n.a." || normalized === "na") return null;

  const match = normalized.match(/\d[\d,]*\.?\d*/);
  if (!match) return null;

  let numeric = match[0].replace(/,/g, "");
  let negative = false;
  const firstDigitIndex = normalized.search(/\d/);
  if (firstDigitIndex > 0) {
    const prefix = normalized.slice(0, firstDigitIndex);
    if (/[−–-]/.test(prefix)) {
      negative = true;
    }
  }

  const value = Number(numeric);
  if (Number.isNaN(value)) return null;
  return negative ? -value : value;
}

function calculateOverview(values: any) {
  const current = values.currentRaw ?? null;
  const weeklyChange = values.weeklyChangeRaw ?? null;
  const yearlyChange = values.yearlyChangeRaw ?? null;

  const weeklyPrevious =
    current !== null && weeklyChange !== null ? current - weeklyChange : null;
  const yearlyPrevious =
    current !== null && yearlyChange !== null ? current - yearlyChange : null;

  const weeklyChangePct =
    weeklyPrevious !== null && weeklyPrevious !== 0
      ? (weeklyChange / weeklyPrevious) * 100
      : null;
  const yearlyChangePct =
    yearlyPrevious !== null && yearlyPrevious !== 0
      ? (yearlyChange / yearlyPrevious) * 100
      : null;

  return {
    current,
    weeklyChange,
    weeklyChangePct,
    yearlyChange,
    yearlyChangePct,
    weeklyPrevious,
    yearlyPrevious,
    sourceDates: values.sourceDates,
  };
}

function calculateAssetRatios($: cheerio.CheerioAPI, table: any | null, selectedDate: string, logs: any[]) {
  const emptyResult = {
    totals: {
      totalAssets: null,
      treasury: null,
      mbs: null,
      otherAssets: null,
    },
    ratios: {
      treasury: null,
      mbs: null,
      otherAssets: null,
    },
    sourceDate: null,
  };

  if (!table) {
    return emptyResult;
  }

  const columns = buildColumnDefinitions($, table);
  const selectedDateObj = parseDateString(selectedDate);
  const selectedDateText = formatFedDate(selectedDateObj);
  const selectedColumn = findWednesdayColumn(columns, selectedDateText);
  const columnCount = columns.length;

  const rows = [
    { key: "totalAssets", label: "Total assets" },
    { key: "treasury", label: "U.S. Treasury securities" },
    { key: "mbs", label: "Mortgage-backed securities" },
    { key: "otherAssets", label: "Other assets" },
  ];

  const totals: any = {};
  rows.forEach((row) => {
    const { rowText, value } = getRowValueForColumn(
      $,
      table,
      row.label,
      columnCount,
      selectedColumn?.index ?? null
    );
    totals[row.key] = value;
    logs.push({
      key: `asset_${row.key}`,
      tableTitle: "Consolidated Statement of Condition of All Federal Reserve Banks",
      rowText,
      rawValue: value,
      currentValue: value,
    });
  });

  const totalAssets = totals.totalAssets;
  const ratios =
    totalAssets !== null && totalAssets !== 0
      ? {
          treasury:
            totals.treasury !== null ? totals.treasury / totalAssets : null,
          mbs: totals.mbs !== null ? totals.mbs / totalAssets : null,
          otherAssets:
            totals.otherAssets !== null
              ? totals.otherAssets / totalAssets
              : null,
        }
      : {
          treasury: null,
          mbs: null,
          otherAssets: null,
        };

  return {
    totals,
    ratios,
    sourceDate: selectedColumn?.dateText || null,
  };
}

function findWednesdayColumn(columns: any[], selectedDateText: string) {
  const selectedKey = normalizeForMatch(selectedDateText);
  const wednesdayColumns = columns.filter((col) =>
    col.texts.some((text: string) => normalizeForMatch(text).includes("wednesday"))
  );

  let match = wednesdayColumns.find((col) =>
    normalizeForMatch(col.mergedText).includes(selectedKey)
  );

  if (!match && wednesdayColumns.length) {
    match = wednesdayColumns[0];
  }

  return buildColumnMeta(match);
}

function getRowValueForColumn($: cheerio.CheerioAPI, table: any, rowLabel: string, columnCount: number, columnIndex: number | null) {
  if (columnIndex === null || columnIndex === undefined) {
    return { rowText: null, value: null };
  }

  const { rowText, matchedRow } = findBestRowMatch($, table, rowLabel);

  if (!matchedRow) {
    return { rowText: null, value: null };
  }

  const rowValues = extractRowValues($, matchedRow, columnCount);
  return {
    rowText,
    value: getValueByColumn(rowValues, columnIndex),
  };
}

function calculateFactors($: cheerio.CheerioAPI, tableCache: Map<string, any>, selectedDate: string, overview: any, logs: any[]) {
  const supplyingTargets = [
    {
      key: "reserveBankCredit",
      label: "Reserve Bank credit",
      tableTitle: "Factors Affecting Reserve Balances of Depository Institutions",
    },
    {
      key: "securitiesHeld",
      label: "Securities held outright",
      tableTitle: "Factors Affecting Reserve Balances of Depository Institutions",
    },
    {
      key: "treasurySecurities",
      label: "U.S. Treasury securities",
      tableTitle: "Factors Affecting Reserve Balances of Depository Institutions",
    },
    {
      key: "bills",
      label: "Bills",
      tableTitle: "Factors Affecting Reserve Balances of Depository Institutions",
    },
    {
      key: "notesAndBonds",
      label: "Notes and bonds, nominal",
      tableTitle: "Factors Affecting Reserve Balances of Depository Institutions",
    },
    {
      key: "tips",
      label: "Notes and bonds, inflation-indexed",
      tableTitle: "Factors Affecting Reserve Balances of Depository Institutions",
    },
    {
      key: "mbs",
      label: "Mortgage-backed securities",
      tableTitle: "Factors Affecting Reserve Balances of Depository Institutions",
    },
    {
      key: "repos",
      label: "Repurchase agreements",
      tableTitle: "Factors Affecting Reserve Balances of Depository Institutions",
    },
    {
      key: "loans",
      label: "Loans",
      tableTitle: "Factors Affecting Reserve Balances of Depository Institutions",
    },
    {
      key: "btfp",
      label: "Bank Term Funding Program",
      tableTitle: "Factors Affecting Reserve Balances of Depository Institutions",
    },
    {
      key: "cbSwaps",
      label: "Central bank liquidity swaps",
      tableTitle: "Factors Affecting Reserve Balances of Depository Institutions",
    },
    {
      key: "gold",
      label: "Gold certificate account",
      tableTitle:
        "Consolidated Statement of Condition of All Federal Reserve Banks",
      mode: "statement",
    },
    {
      key: "sdr",
      label: "Coin",
      tableTitle:
        "Consolidated Statement of Condition of All Federal Reserve Banks",
      mode: "statement",
    },
  ];

  const absorbingTargets = [
    {
      key: "currency",
      label: "Currency in circulation",
      tableTitle:
        "Factors Affecting Reserve Balances of Depository Institutions (continued)",
    },
    {
      key: "reverseRepo",
      label: "Reverse repurchase agreements",
      tableTitle:
        "Factors Affecting Reserve Balances of Depository Institutions (continued)",
    },
    {
      key: "deposits",
      label: "Deposits with F.R. Banks, other than reserve balances",
      tableTitle:
        "Factors Affecting Reserve Balances of Depository Institutions (continued)",
    },
    {
      key: "tga",
      label: "U.S. Treasury, General Account",
      tableTitle:
        "Factors Affecting Reserve Balances of Depository Institutions (continued)",
    },
  ];

  const supplying = buildFactorGroup(
    $,
    tableCache,
    supplyingTargets,
    selectedDate,
    logs
  );
  const absorbing = buildFactorGroup(
    $,
    tableCache,
    absorbingTargets,
    selectedDate,
    logs
  );

  const totalAbsorbing = buildFactorEntryByTitle(
    $,
    tableCache,
    "Factors Affecting Reserve Balances of Depository Institutions (continued)",
    "Total factors, other than reserve balances, absorbing reserve funds",
    selectedDate,
    "factors_totalAbsorbing",
    logs
  );

  const totalSupplying = overview.totalAssets || emptyOverviewValue();
  const reserveBalances = overview.reserveBalances || emptyOverviewValue();

  logs.push({
    key: "factors_totalSupplying",
    tableTitle: "Overview: Total assets",
    rowText: "Total factors supplying reserve funds",
    rawValue: null,
    currentValue: totalSupplying.current,
    weeklyChange: totalSupplying.weeklyChange,
    yearlyChange: totalSupplying.yearlyChange,
    weeklyChangePct: totalSupplying.weeklyChangePct,
    yearlyChangePct: totalSupplying.yearlyChangePct,
  });

  logs.push({
    key: "factors_reserveBalances",
    tableTitle: "Overview: Reserve balances",
    rowText: "Reserve balances with Federal Reserve Banks",
    rawValue: null,
    currentValue: reserveBalances.current,
    weeklyChange: reserveBalances.weeklyChange,
    yearlyChange: reserveBalances.yearlyChange,
    weeklyChangePct: reserveBalances.weeklyChangePct,
    yearlyChangePct: reserveBalances.yearlyChangePct,
  });

  return {
    supplying,
    absorbing,
    totals: {
      totalSupplying,
      totalAbsorbing,
      reserveBalances,
    },
  };
}

function buildFactorSummary(factors: any) {
  if (!factors) {
    return { supplying: {}, absorbing: {} };
  }

  const supplying = {
    securitiesHeld: factors.supplying?.securitiesHeld || emptyOverviewValue(),
    repos: factors.supplying?.repos || emptyOverviewValue(),
    loans: factors.supplying?.loans || emptyOverviewValue(),
    cbSwaps: factors.supplying?.cbSwaps || emptyOverviewValue(),
  };

  const absorbing = {
    currency: factors.absorbing?.currency || emptyOverviewValue(),
    reverseRepo: factors.absorbing?.reverseRepo || emptyOverviewValue(),
    deposits: factors.absorbing?.deposits || emptyOverviewValue(),
    tga: factors.absorbing?.tga || emptyOverviewValue(),
  };

  return { supplying, absorbing };
}

function parseMaturityDistribution($: cheerio.CheerioAPI, tableCache: Map<string, any>, selectedDate: string, logs: any[]) {
  const table = getTableByTitle(
    $,
    tableCache,
    "Maturity Distribution of Securities, Loans, and Selected Other Assets and Liabilities"
  );

  const emptyResult = {
    columns: {
      within15: null,
      days16to90: null,
      days91to1y: null,
      years1to5: null,
      years5to10: null,
      years10plus: null,
      total: null,
    },
    rows: {
      treasury: null,
      mbs: null,
    },
    sourceDate: formatFedDate(parseDateString(selectedDate)),
  };

  if (!table) {
    return emptyResult;
  }

  const columns = buildColumnDefinitions($, table);
  const columnIndexes = {
    within15: findColumnIndex(columns, ["within 15", "days"]),
    days16to90: findColumnIndex(columns, ["16", "90 days"]),
    days91to1y: findColumnIndex(columns, ["91 days", "1 year"]),
    years1to5: findColumnIndex(columns, ["over 1 year", "5 years"]),
    years5to10: findColumnIndex(columns, ["over 5", "10 years"]),
    years10plus: findColumnIndex(columns, ["over 10", "years"]),
    total: findColumnIndex(columns, ["all"]),
  };

  const treasury = getMaturityRow(
    $,
    table,
    "U.S. Treasury securities",
    columnIndexes
  );
  const mbs = getMaturityRow(
    $,
    table,
    "Mortgage-backed securities",
    columnIndexes
  );

  logs.push({
    key: "maturity_treasury",
    tableTitle: getTableContextText($, table) || "",
    rowText: treasury.rowText,
    rawValue: treasury.raw,
    currentValue: treasury.values,
  });
  logs.push({
    key: "maturity_mbs",
    tableTitle: getTableContextText($, table) || "",
    rowText: mbs.rowText,
    rawValue: mbs.raw,
    currentValue: mbs.values,
  });

  return {
    columns: columnIndexes,
    rows: {
      treasury: treasury.values,
      mbs: mbs.values,
    },
    sourceDate: formatFedDate(parseDateString(selectedDate)),
  };
}

function parseLoansAndSecurities($: cheerio.CheerioAPI, tableCache: Map<string, any>, selectedDate: string, factors: any, logs: any[]) {
  const loansTableTitle =
    "Factors Affecting Reserve Balances of Depository Institutions";
  const memoTableTitle = "1A. Memorandum Items";

  const primaryCredit = buildFactorEntryByTitle(
    $,
    tableCache,
    loansTableTitle,
    "Primary credit",
    selectedDate,
    "loans_primaryCredit",
    logs
  );

  const totalLoans = buildFactorEntryByTitle(
    $,
    tableCache,
    loansTableTitle,
    "Loans",
    selectedDate,
    "loans_total",
    logs
  );

  const btfp = factors?.supplying?.btfp || emptyOverviewValue();
  logs.push({
    key: "loans_btfp",
    tableTitle: "Factors: Bank Term Funding Program",
    rowText: "Bank Term Funding Program",
    rawValue: null,
    currentValue: btfp.current,
    weeklyChange: btfp.weeklyChange,
    yearlyChange: btfp.yearlyChange,
    weeklyChangePct: btfp.weeklyChangePct,
    yearlyChangePct: btfp.yearlyChangePct,
  });

  const overnight = buildFactorEntryByTitle(
    $,
    tableCache,
    memoTableTitle,
    "Overnight facility",
    selectedDate,
    "securities_overnight",
    logs
  );

  const term = {
    current: 0,
    weeklyChange: 0,
    weeklyChangePct: null,
    yearlyChange: 0,
    yearlyChangePct: null,
    weeklyPrevious: null,
    yearlyPrevious: null,
    sourceDates: {
      currentWeekEnded: null,
      weeklyChangeFrom: null,
      yearlyChangeFrom: null,
    },
  };

  const totalSecurities = {
    current: (overnight.current ?? 0) + (term.current ?? 0),
    weeklyChange: (overnight.weeklyChange ?? 0) + (term.weeklyChange ?? 0),
    weeklyChangePct: null,
    yearlyChange: (overnight.yearlyChange ?? 0) + (term.yearlyChange ?? 0),
    yearlyChangePct: null,
    weeklyPrevious: null,
    yearlyPrevious: null,
    sourceDates: {
      currentWeekEnded: overnight.sourceDates?.currentWeekEnded || null,
      weeklyChangeFrom: overnight.sourceDates?.weeklyChangeFrom || null,
      yearlyChangeFrom: overnight.sourceDates?.yearlyChangeFrom || null,
    },
  };

  return {
    loans: {
      primaryCredit,
      btfp,
      totalLoans,
    },
    securitiesLending: {
      overnight,
      term,
      total: totalSecurities,
    },
  };
}

function parseFinancials(
  $: cheerio.CheerioAPI,
  tableCache: Map<string, any>,
  selectedDate: string,
  overview: any,
  factors: any,
  logs: any[]
) {
  const totalAssets = buildFactorEntryByTitle(
    $,
    tableCache,
    "Consolidated Statement of Condition of All Federal Reserve Banks",
    "Total assets",
    selectedDate,
    "financials_totalAssets",
    logs,
    "statement"
  );

  const totalLiabilities = buildFactorEntryByTitle(
    $,
    tableCache,
    "Consolidated Statement of Condition of All Federal Reserve Banks (continued)",
    "Total liabilities",
    selectedDate,
    "financials_totalLiabilities",
    logs,
    "statement"
  );

  const assets = {
    gold: factors?.supplying?.gold || emptyOverviewValue(),
    sdr: factors?.supplying?.sdr || emptyOverviewValue(),
    securitiesHeld: factors?.supplying?.securitiesHeld || emptyOverviewValue(),
    repos: factors?.supplying?.repos || emptyOverviewValue(),
    cbSwaps: factors?.supplying?.cbSwaps || emptyOverviewValue(),
    totalAssets,
  };

  const liabilities = {
    frNotes: overview?.currency || emptyOverviewValue(),
    reverseRepo: overview?.reverseRepo || emptyOverviewValue(),
    deposits: factors?.absorbing?.deposits || emptyOverviewValue(),
    reserves: overview?.reserveBalances || emptyOverviewValue(),
    tga: overview?.tga || emptyOverviewValue(),
    totalLiabilities,
  };

  return { assets, liabilities };
}

function findColumnIndex(columns: any[], keywords: string | string[]) {
  const terms = Array.isArray(keywords) ? keywords : [keywords];
  const normalizedTerms = terms.map(normalizeForMatch);

  for (const col of columns) {
    const merged = normalizeForMatch(col.mergedText);
    const matches = normalizedTerms.every((term) => merged.includes(term));
    if (matches) {
      return col.index;
    }
  }

  return null;
}

function getMaturityRow($: cheerio.CheerioAPI, table: any, sectionLabel: string, columnIndexes: any) {
  const { rowText, matchedRow } = findHoldingsRowForSection(
    $,
    table,
    sectionLabel
  );
  if (!matchedRow) {
    return { rowText: null, values: null, raw: null };
  }

  const columns = buildColumnDefinitions($, table);
  const rowValues = extractRowValues($, matchedRow, columns.length);

  const values = {
    within15: getValueByColumn(rowValues, columnIndexes.within15),
    days16to90: getValueByColumn(rowValues, columnIndexes.days16to90),
    days91to1y: getValueByColumn(rowValues, columnIndexes.days91to1y),
    years1to5: getValueByColumn(rowValues, columnIndexes.years1to5),
    years5to10: getValueByColumn(rowValues, columnIndexes.years5to10),
    years10plus: getValueByColumn(rowValues, columnIndexes.years10plus),
    total: getValueByColumn(rowValues, columnIndexes.total),
  };

  return {
    rowText,
    values,
    raw: rowValues,
  };
}

function findHoldingsRowForSection($: cheerio.CheerioAPI, table: any, sectionLabel: string) {
  const targetSection = normalizeForMatch(sectionLabel);
  let currentSection: string | null = null;
  let matchedRow: any | null = null;
  let rowText: string | null = null;

  $(table)
    .find("tr")
    .each((_, row) => {
      const firstCell = $(row).children("th, td").first();
      const labelText = normalizeText(firstCell.text());
      if (!labelText) return;

      const normalized = normalizeForMatch(labelText);
      if (normalized.includes(targetSection)) {
        currentSection = sectionLabel;
        return;
      }

      if (normalized === "holdings" && currentSection) {
        matchedRow = row;
        rowText = `${currentSection} | Holdings`;
        return false;
      }
    });

  if (!matchedRow) {
    const fallback = findBestRowMatch($, table, sectionLabel);
    return {
      rowText: fallback.rowText,
      matchedRow: fallback.matchedRow,
    };
  }

  return { rowText, matchedRow };
}

function buildFactorGroup($: cheerio.CheerioAPI, tableCache: Map<string, any>, targets: any[], selectedDate: string, logs: any[]) {
  const group: any = {};
  targets.forEach((target) => {
    const entry = buildFactorEntryByTitle(
      $,
      tableCache,
      target.tableTitle,
      target.label,
      selectedDate,
      target.key,
      logs,
      target.mode
    );
    group[target.key] = entry;
  });
  return group;
}

function buildFactorEntryByTitle(
  $: cheerio.CheerioAPI,
  tableCache: Map<string, any>,
  tableTitle: string,
  label: string,
  selectedDate: string,
  logKey: string,
  logs: any[],
  mode?: string
) {
  const cache = tableCache || new Map();
  const table = getTableByTitleAndRow($, cache, tableTitle, label);
  if (!table) {
    return emptyOverviewValue();
  }
  return buildFactorEntry($, table, label, selectedDate, logKey, logs, mode);
}

function buildFactorEntry(
  $: cheerio.CheerioAPI,
  table: any,
  label: string,
  selectedDate: string,
  logKey: string,
  logs: any[],
  mode?: string
) {
  const useStatement = mode === "statement";
  const { rowText, values } = useStatement
    ? getRowValuesForStatement($, table, label, selectedDate)
    : getRowValuesForTable($, table, label, selectedDate);
  const entry = calculateOverview(values);
  logs.push({
    key: logKey,
    tableTitle: getTableContextText($, table) || "",
    rowText,
    rawValue: values,
    currentValue: entry.current,
    weeklyChange: entry.weeklyChange,
    yearlyChange: entry.yearlyChange,
    weeklyChangePct: entry.weeklyChangePct,
    yearlyChangePct: entry.yearlyChangePct,
  });
  return entry;
}

function getTableByTitleAndRow($: cheerio.CheerioAPI, cache: Map<string, any>, title: string, rowLabel: string) {
  const cacheKey = `${title}::${toLabelList(rowLabel).join("|")}`;
  if (cache && cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const target = normalizeForMatch(title);
  let found: any | null = null;
  $("table").each((_, table) => {
    const context = getTableContextText($, table);
    if (!context) return;
    if (!normalizeForMatch(context).includes(target)) return;
    if (tableHasRow($, table, rowLabel)) {
      found = table;
      return false;
    }
  });

  if (!found) {
    found = getTableByTitle($, cache || new Map(), title);
  }

  if (cache) {
    cache.set(cacheKey, found);
  }

  return found;
}

function tableHasRow($: cheerio.CheerioAPI, table: any, rowLabel: string) {
  const { matchedRow } = findBestRowMatch($, table, rowLabel);
  return Boolean(matchedRow);
}

function getRowValuesForStatement($: cheerio.CheerioAPI, table: any, rowLabel: string, selectedDate: string) {
  const { rowText, matchedRow } = findBestRowMatch($, table, rowLabel);

  if (!matchedRow) {
    return {
      rowText: null,
      values: {
        currentRaw: null,
        weeklyChangeRaw: null,
        yearlyChangeRaw: null,
        sourceDates: {
          currentWeekEnded: null,
          weeklyChangeFrom: null,
          yearlyChangeFrom: null,
        },
      },
    };
  }

  const columns = buildColumnDefinitions($, table);
  const columnCount = columns.length;
  const rowValues = extractRowValues($, matchedRow, columnCount);

  const selectedDateObj = parseDateString(selectedDate);
  const selectedDateText = formatFedDate(selectedDateObj);
  const currentColumn = findWednesdayColumn(columns, selectedDateText);
  const changeColumns = findChangeColumns(
    columns,
    selectedDateObj,
    "change since"
  );

  const currentRaw = getValueByColumn(rowValues, currentColumn?.index);
  const weeklyRaw = getValueByColumn(rowValues, changeColumns.weekly?.index);
  const yearlyRaw = getValueByColumn(rowValues, changeColumns.yearly?.index);

  return {
    rowText,
    values: {
      currentRaw,
      weeklyChangeRaw: weeklyRaw,
      yearlyChangeRaw: yearlyRaw,
      sourceDates: {
        currentWeekEnded: currentColumn?.dateText || null,
        weeklyChangeFrom: changeColumns.weekly?.dateText || null,
        yearlyChangeFrom: changeColumns.yearly?.dateText || null,
      },
    },
  };
}

function toLabelList(label: string | string[]) {
  return Array.isArray(label) ? label : [label];
}

function findBestRowMatch($: cheerio.CheerioAPI, table: any, rowLabel: string | string[]) {
  const labels = toLabelList(rowLabel).map(normalizeForMatch);
  let bestRow: any | null = null;
  let bestText: string | null = null;
  let bestScore = 0;

  $(table)
    .find("tr")
    .each((_, row) => {
      const firstCell = $(row).children("th, td").first();
      const labelText = normalizeText(firstCell.text());
      if (!labelText) return;
      const score = getLabelMatchScore(labelText, labels);
      if (score > bestScore) {
        bestScore = score;
        bestRow = row;
        bestText = labelText;
      }
    });

  return { rowText: bestText, matchedRow: bestRow };
}

function getLabelMatchScore(labelText: string, normalizedLabels: string[]) {
  const normalized = normalizeForMatch(labelText);
  let score = 0;
  normalizedLabels.forEach((target) => {
    if (normalized === target) {
      score = Math.max(score, 3);
    } else if (normalized.startsWith(target)) {
      score = Math.max(score, 2);
    } else if (normalized.includes(target)) {
      score = Math.max(score, 1);
    }
  });
  return score;
}

function parseFedDateFromText(text: string): Date | null {
  const match = String(text || "").match(
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})/i
  );
  if (!match) return null;
  const month = match[1].toLowerCase();
  const day = Number(match[2]);
  const year = Number(match[3]);
  const monthIndexMap: { [key: string]: number } = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    sept: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };
  const monthIndex = monthIndexMap[month];

  if (Number.isNaN(day) || Number.isNaN(year) || monthIndex === undefined) {
    return null;
  }
  return new Date(Date.UTC(year, monthIndex, day));
}

function parseDateString(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map((value) => Number(value));
  return new Date(Date.UTC(year, month - 1, day));
}

function formatFedDate(dateObj: Date): string {
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = monthNames[dateObj.getUTCMonth()];
  const day = dateObj.getUTCDate();
  const year = dateObj.getUTCFullYear();
  return `${month} ${day}, ${year}`;
}

function daysBetween(dateA: Date, dateB: Date): number {
  const ms = dateA.getTime() - dateB.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}
