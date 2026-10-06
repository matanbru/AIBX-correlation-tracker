import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data');
const FUNDAMENTALS_FILE = path.join(DATA_DIR, 'fundamentals.json');
const SEC_BASE = 'https://data.sec.gov';
const SEC_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const REQUEST_DELAY_MS = 250;
const SEC_CIK_ALIASES = {
  SAP: '0001000184',
  C3AI: '0001577526'
};
// Companies that report in a currency other than USD or file annual-only reports cannot be
// combined with USD share prices, so only their share count is used.
const SHARE_COUNT_ONLY = new Set(['SAP']);
const REPORT_FORMS = new Set(['10-Q', '10-K', '10-K/A', '10-Q/A', '20-F', '40-F']);
const DAY_MS = 86_400_000;
const QUARTER_DAYS = 91.3;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const sleep = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));
const getUserAgent = () => process.env.SEC_USER_AGENT;
const daysBetween = (start, end) => Math.round((new Date(end) - new Date(start)) / DAY_MS);
const toBillions = (value) => (value == null ? null : Number((value / 1_000_000_000).toFixed(3)));
const round = (value, digits = 2) => (value == null || !Number.isFinite(value) ? null : Number(value.toFixed(digits)));

const requestJson = async (url) => {
  const userAgent = getUserAgent();
  if (!userAgent) {
    throw new Error('SEC_USER_AGENT is not set. Add a name and contact email to backend/.env');
  }

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': userAgent
    }
  });
  if (!response.ok) throw new Error(`SEC HTTP ${response.status}: ${response.statusText}`);
  return response.json();
};

const loadFundamentalsFromDisk = () => {
  if (!fs.existsSync(FUNDAMENTALS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(FUNDAMENTALS_FILE, 'utf8'));
  } catch (error) {
    console.error('Error reading fundamentals.json:', error.message);
    return {};
  }
};

const saveFundamentalsToDisk = (fundamentals) => {
  fs.writeFileSync(FUNDAMENTALS_FILE, JSON.stringify(fundamentals, null, 2), 'utf8');
  console.log(`Fundamentals saved to ${FUNDAMENTALS_FILE}`);
};

/**
 * Collects the filed facts for the first tags that have data. Tags are listed in priority order;
 * a period reported under more than one tag keeps the higher-priority tag. When the same period
 * was filed more than once (restatements), the most recently filed value wins.
 */
const collectRows = (facts, tags, unit) => {
  const byPeriod = new Map();
  for (const tag of tags) {
    const tagRows = new Map();
    for (const namespace of ['us-gaap', 'ifrs-full']) {
      for (const row of facts[namespace]?.[tag]?.units?.[unit] || []) {
        if (!REPORT_FORMS.has(row.form) || !row.end || !Number.isFinite(Number(row.val))) continue;
        const key = `${row.start || ''}|${row.end}`;
        const existing = tagRows.get(key);
        if (!existing || String(row.filed) > String(existing.filed)) tagRows.set(key, row);
      }
    }
    for (const [key, row] of tagRows) {
      if (!byPeriod.has(key)) byPeriod.set(key, row);
    }
  }
  return [...byPeriod.values()];
};

/**
 * Turns reported flow values (income statement / cash flow) into single-quarter values.
 * 10-Q cash-flow items are year-to-date and Q4 only exists inside the 10-K annual total, so
 * discrete quarters are derived by differencing cumulative periods that share a start date.
 */
const discreteQuarters = (rows) => {
  const withDuration = rows
    .filter(row => row.start)
    .map(row => ({ ...row, days: daysBetween(row.start, row.end), value: Number(row.val) }));

  const quarters = new Map();
  withDuration
    .filter(row => Math.abs(row.days - QUARTER_DAYS) <= 15)
    .forEach(row => quarters.set(row.end, row.value));

  const byStart = new Map();
  withDuration.forEach(row => {
    const length = Math.round(row.days / QUARTER_DAYS);
    if (length < 2 || length > 4 || Math.abs(row.days - length * QUARTER_DAYS) > 15) return;
    if (!byStart.has(row.start)) byStart.set(row.start, {});
    byStart.get(row.start)[length] = row;
  });

  for (const cumulative of byStart.values()) {
    for (const length of [2, 3, 4]) {
      const current = cumulative[length];
      const previous = cumulative[length - 1] || (length === 2 ? null : undefined);
      if (!current || quarters.has(current.end)) continue;
      if (length === 2) {
        // The first quarter shares the fiscal-year start date; look for it as a 3-month fact.
        const first = withDuration.find(row => row.start === current.start && Math.abs(row.days - QUARTER_DAYS) <= 15);
        if (first) quarters.set(current.end, current.value - first.value);
      } else if (previous) {
        quarters.set(current.end, current.value - previous.value);
      }
    }
  }

  return [...quarters.entries()]
    .map(([end, value]) => ({ end, value }))
    .sort((a, b) => b.end.localeCompare(a.end));
};

const trailingTwelveMonths = (quarters, referenceEnd) => {
  const recent = quarters.filter(item => item.end <= referenceEnd).slice(0, 4);
  if (recent.length < 4) return null;
  const span = daysBetween(recent[3].end, recent[0].end);
  if (recent[0].end !== referenceEnd || span < 255 || span > 295) return null;
  return recent.reduce((sum, item) => sum + item.value, 0);
};

const yearAgoQuarter = (quarters, end) => quarters.find(item => Math.abs(daysBetween(item.end, end) - 365) <= 15);

const instantRows = (facts, tags, unit = 'USD') => collectRows(facts, tags, unit).filter(row => !row.start);

const instantAt = (rows, end) => {
  const candidates = rows
    .filter(row => Math.abs(daysBetween(row.end, end)) <= 5)
    .sort((a, b) => Math.abs(daysBetween(a.end, end)) - Math.abs(daysBetween(b.end, end)));
  return candidates.length ? Number(candidates[0].val) : null;
};

/**
 * Cover-page share counts. Multi-class filers (Alphabet, Meta, Visa...) report one fact per class
 * on the same filing, so all classes from the newest filing are added together.
 */
const latestShareCount = (facts, referenceEnd, maxAgeDays = 200) => {
  const anchor = referenceEnd || new Date().toISOString().slice(0, 10);
  const isRecent = (end) => Math.abs(daysBetween(end, anchor)) <= maxAgeDays;

  const weighted = collectRows(facts, ['WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'], 'shares')
    .filter(row => row.start && Math.abs(daysBetween(row.start, row.end) - QUARTER_DAYS) <= 15 && Number(row.val) > 0 && isRecent(row.end))
    .sort((a, b) => b.end.localeCompare(a.end))[0];

  const coverRows = (facts.dei?.EntityCommonStockSharesOutstanding?.units?.shares || [])
    .filter(row => Number(row.val) > 0 && row.end && isRecent(row.end));
  let cover = null;
  if (coverRows.length) {
    const newestEnd = coverRows.map(row => row.end).sort().at(-1);
    const newestFiling = coverRows.filter(row => row.end === newestEnd).map(row => String(row.filed)).sort().at(-1);
    const classes = coverRows.filter(row => row.end === newestEnd && String(row.filed) === newestFiling);
    cover = { value: classes.reduce((sum, row) => sum + Number(row.val), 0), asOf: newestEnd, classes: classes.length, source: 'cover page' };
  }

  // Multi-class filers often omit some classes from the cover-page facts, so a cover count far from
  // the weighted-average count is treated as incomplete.
  const average = weighted
    ? { value: Number(weighted.val), asOf: weighted.end, classes: 1, source: 'weighted-average basic shares' }
    : null;
  if (cover && (!average || Math.abs(cover.value - average.value) / average.value <= 0.15)) return cover;
  return average;
};

const buildAccounting = (facts, symbol) => {
  const flow = (tags, unit = 'USD') => discreteQuarters(collectRows(facts, tags, unit));
  const revenue = flow([
    'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax',
    'Revenues', 'RevenuesNetOfInterestExpense', 'SalesRevenueNet'
  ]);
  const grossProfit = flow(['GrossProfit']);
  const costOfRevenue = flow(['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfServices']);
  const operatingIncome = flow(['OperatingIncomeLoss', 'OperatingProfitLoss']);
  const netIncome = flow(['NetIncomeLoss', 'ProfitLoss']);
  const operatingCashFlow = flow(['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations']);
  const capex = flow(['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets', 'PaymentsForCapitalImprovements']);
  const dilutedEps = flow(['EarningsPerShareDiluted'], 'USD/shares');

  const referenceEnd = revenue[0]?.end || netIncome[0]?.end || null;
  const valueAtEnd = (series, end) => series.find(item => item.end === end)?.value ?? null;
  // Only trust a flow series that has been reported up to the same quarter as revenue.
  const ttm = (series) => (referenceEnd ? trailingTwelveMonths(series, referenceEnd) : null);

  const quarterEnds = revenue.slice(0, 4).map(item => item.end);
  const balanceRows = {
    cash: instantRows(facts, ['CashAndCashEquivalentsAtCarryingValue', 'CashAndCashEquivalents']),
    currentAssets: instantRows(facts, ['AssetsCurrent', 'CurrentAssets']),
    currentLiabilities: instantRows(facts, ['LiabilitiesCurrent', 'CurrentLiabilities']),
    longTermDebtNoncurrent: instantRows(facts, ['LongTermDebtNoncurrent', 'LongTermDebtAndFinanceLeaseObligationsNoncurrent']),
    debtCurrent: instantRows(facts, ['LongTermDebtCurrent', 'DebtCurrent']),
    longTermDebtTotal: instantRows(facts, ['LongTermDebt']),
    totalAssets: instantRows(facts, ['Assets']),
    totalLiabilities: instantRows(facts, ['Liabilities']),
    shareholdersEquity: instantRows(facts, ['StockholdersEquity', 'Equity'])
  };

  const balanceSheet = quarterEnds.map(end => {
    const noncurrentDebt = instantAt(balanceRows.longTermDebtNoncurrent, end);
    const debt = noncurrentDebt != null
      ? noncurrentDebt + (instantAt(balanceRows.debtCurrent, end) ?? 0)
      : instantAt(balanceRows.longTermDebtTotal, end);
    return {
      quarter: end,
      cash: toBillions(instantAt(balanceRows.cash, end)),
      currentAssets: toBillions(instantAt(balanceRows.currentAssets, end)),
      currentLiabilities: toBillions(instantAt(balanceRows.currentLiabilities, end)),
      longTermDebt: toBillions(debt),
      totalAssets: toBillions(instantAt(balanceRows.totalAssets, end)),
      totalLiabilities: toBillions(instantAt(balanceRows.totalLiabilities, end)),
      shareholdersEquity: toBillions(instantAt(balanceRows.shareholdersEquity, end))
    };
  });

  const incomeStatement = quarterEnds.map(end => {
    const revenueValue = valueAtEnd(revenue, end);
    const costValue = valueAtEnd(costOfRevenue, end);
    const grossProfitValue = valueAtEnd(grossProfit, end)
      ?? (revenueValue != null && costValue != null ? revenueValue - costValue : null);
    return {
      quarter: end,
      revenue: toBillions(revenueValue),
      grossProfit: toBillions(grossProfitValue),
      operatingIncome: toBillions(valueAtEnd(operatingIncome, end)),
      netIncome: toBillions(valueAtEnd(netIncome, end)),
      ebitda: null
    };
  });

  const revenueTtm = ttm(revenue);
  const grossProfitTtm = (() => {
    const direct = ttm(grossProfit);
    if (direct != null) return direct;
    const cost = ttm(costOfRevenue);
    return revenueTtm != null && cost != null ? revenueTtm - cost : null;
  })();
  const operatingIncomeTtm = ttm(operatingIncome);
  const netIncomeTtm = ttm(netIncome);
  const operatingCashFlowTtm = ttm(operatingCashFlow);
  const capexTtm = ttm(capex);
  const epsTtm = ttm(dilutedEps);
  const priorYearRevenue = referenceEnd ? yearAgoQuarter(revenue, referenceEnd)?.value : null;
  const latestBalance = balanceSheet[0] || {};
  const shares = latestShareCount(facts, referenceEnd);

  const metrics = {
    sharesOutstandingMillions: shares ? round(shares.value / 1_000_000) : null,
    revenueTtm: toBillions(revenueTtm),
    revenueGrowth: priorYearRevenue ? round(((revenue[0].value - priorYearRevenue) / Math.abs(priorYearRevenue)) * 100) : null,
    grossMargin: revenueTtm && grossProfitTtm != null ? round((grossProfitTtm / revenueTtm) * 100) : null,
    operatingMargin: revenueTtm && operatingIncomeTtm != null ? round((operatingIncomeTtm / revenueTtm) * 100) : null,
    cashBalance: latestBalance.cash ?? null,
    debtToEquity: latestBalance.longTermDebt != null && latestBalance.shareholdersEquity > 0
      ? round(latestBalance.longTermDebt / latestBalance.shareholdersEquity, 3) : null,
    currentRatio: latestBalance.currentAssets != null && latestBalance.currentLiabilities
      ? round(latestBalance.currentAssets / latestBalance.currentLiabilities, 3) : null,
    freeCashFlow: operatingCashFlowTtm != null && capexTtm != null ? toBillions(operatingCashFlowTtm - capexTtm) : null,
    capex: toBillions(capexTtm),
    netIncomeTtm: toBillions(netIncomeTtm),
    epsTtm: round(epsTtm),
    // peRatio and marketCap depend on the live share price and are calculated when the API serves them.
    peRatio: null,
    marketCap: null
  };

  const hasStatements = incomeStatement.length > 0 || balanceSheet.length > 0;
  return {
    reportingPeriod: 'Last 4 reported quarters; ratios use trailing twelve months',
    dataSource: 'SEC Company Facts XBRL API',
    fetchedAt: new Date().toISOString(),
    latestQuarterEnd: referenceEnd,
    sharesAsOf: shares?.asOf || null,
    sharesSource: shares?.source || null,
    dataStatus: hasStatements ? 'available' : 'unavailable',
    metrics,
    incomeStatement,
    balanceSheet
  };
};

const buildShareCountOnly = (facts) => {
  const shares = latestShareCount(facts, null, 460);
  return {
    reportingPeriod: 'Unavailable',
    dataSource: 'SEC Company Facts XBRL API',
    fetchedAt: new Date().toISOString(),
    dataStatus: 'unavailable',
    lastError: 'Reports annually in a non-USD currency (Form 20-F); financial statements are not shown to avoid mixing currencies.',
    sharesAsOf: shares?.asOf || null,
    metrics: { sharesOutstandingMillions: shares ? round(shares.value / 1_000_000) : null },
    incomeStatement: [],
    balanceSheet: []
  };
};

const fetchCompanyFundamentals = async (symbol, cik) => {
  const factsPayload = await requestJson(`${SEC_BASE}/api/xbrl/companyfacts/CIK${String(cik).padStart(10, '0')}.json`);
  return SHARE_COUNT_ONLY.has(symbol)
    ? buildShareCountOnly(factsPayload.facts)
    : buildAccounting(factsPayload.facts, symbol);
};

const backfillFundamentals = async (tickers) => {
  const tickerPayload = await requestJson(SEC_TICKERS_URL);
  const tickerMap = Object.values(tickerPayload).reduce((map, item) => {
    map[item.ticker.toUpperCase()] = item.cik_str;
    return map;
  }, {});
  const fundamentals = loadFundamentalsFromDisk();

  for (const symbol of tickers) {
    try {
      const cik = SEC_CIK_ALIASES[symbol] || tickerMap[symbol];
      if (!cik) throw new Error('No SEC CIK found; this company may not file U.S. SEC XBRL data');
      fundamentals[symbol] = await fetchCompanyFundamentals(symbol, cik);
      console.log(`${symbol}: SEC fundamentals fetched`);
    } catch (error) {
      // Keep the last good record if a refresh fails; only mark unavailable when there is nothing to keep.
      if (fundamentals[symbol]?.dataStatus === 'available') {
        fundamentals[symbol].lastError = `Refresh failed: ${error.message}`;
      } else {
        fundamentals[symbol] = {
          reportingPeriod: 'Unavailable',
          dataSource: 'SEC Company Facts XBRL API',
          dataStatus: 'unavailable',
          lastError: error.message,
          incomeStatement: [],
          balanceSheet: []
        };
      }
      console.error(`${symbol}: ${error.message}`);
    }
    saveFundamentalsToDisk(fundamentals);
    await sleep(REQUEST_DELAY_MS);
  }
  return fundamentals;
};

export default { loadFundamentalsFromDisk, saveFundamentalsToDisk, fetchCompanyFundamentals, backfillFundamentals };
