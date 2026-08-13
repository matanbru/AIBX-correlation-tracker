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

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const sleep = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));
const getUserAgent = () => process.env.SEC_USER_AGENT;

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

const tagFacts = (facts, tags) => {
  const namespaces = ['us-gaap', 'ifrs-full'];
  for (const tag of tags) {
    for (const namespace of namespaces) {
      const fact = facts[namespace]?.[tag];
      if (!fact) continue;
      const units = fact.units?.USD || fact.units?.EUR || fact.units?.shares || fact.units?.pure;
      if (Array.isArray(units)) return units;
    }
  }
  return [];
};

const latestQuarterlyValues = (facts, tags) => {
  const rows = tagFacts(facts, tags)
    .filter(row => row.form === '10-Q' || row.form === '10-K')
    .filter(row => row.fy && row.fp && /^Q[1-4]|FY$/.test(row.fp))
    .sort((a, b) => String(b.end).localeCompare(String(a.end)));
  const seen = new Set();
  return rows.filter(row => {
    const key = `${row.end}:${row.fp}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 4);
};

const valueAt = (facts, tags, key) => {
  const row = latestQuarterlyValues(facts, tags)[0];
  return row?.val == null ? null : Number((Number(row.val) / 1_000_000_000).toFixed(2));
};

const periodRows = (facts, tags) => latestQuarterlyValues(facts, tags).map(row => ({
  quarter: row.end,
  value: Number((Number(row.val) / 1_000_000_000).toFixed(2))
}));

const buildAccounting = (facts) => {
  const revenue = periodRows(facts, ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet']);
  const grossProfit = periodRows(facts, ['GrossProfit']);
  const operatingIncome = periodRows(facts, ['OperatingIncomeLoss', 'OperatingProfitLoss']);
  const netIncome = periodRows(facts, ['NetIncomeLoss', 'ProfitLoss']);
  const ebitda = periodRows(facts, ['EarningsBeforeInterestTaxesDepreciationAndAmortization']);
  const balanceTags = {
    cash: ['CashAndCashEquivalentsAtCarryingValue', 'CashAndCashEquivalents'],
    currentAssets: ['AssetsCurrent', 'CurrentAssets'],
    currentLiabilities: ['LiabilitiesCurrent', 'CurrentLiabilities'],
    longTermDebt: ['LongTermDebtNoncurrent', 'LongTermDebtAndFinanceLeaseObligationsNoncurrent'],
    totalAssets: ['Assets'],
    totalLiabilities: ['Liabilities'],
    shareholdersEquity: ['StockholdersEquity', 'Equity']
  };
  const dates = [...new Set(Object.values(balanceTags).flatMap(tags => latestQuarterlyValues(facts, tags).map(row => row.end)))].sort().reverse().slice(0, 4);
  const balanceSheet = dates.map(date => {
    const row = { quarter: date };
    for (const [field, tags] of Object.entries(balanceTags)) {
      const units = tagFacts(facts, tags);
      const value = units.find(item => item.end === date);
      row[field] = value?.val == null ? null : Number((Number(value.val) / 1_000_000_000).toFixed(2));
    }
    return row;
  });
  const incomeByDate = dates.map(quarter => ({
    quarter,
    revenue: revenue.find(row => row.quarter === quarter)?.value ?? null,
    grossProfit: grossProfit.find(row => row.quarter === quarter)?.value ?? null,
    operatingIncome: operatingIncome.find(row => row.quarter === quarter)?.value ?? null,
    netIncome: netIncome.find(row => row.quarter === quarter)?.value ?? null,
    ebitda: ebitda.find(row => row.quarter === quarter)?.value ?? null
  }));

  return {
    reportingPeriod: 'Last 4 reported quarters',
    dataSource: 'SEC Company Facts XBRL API',
    fetchedAt: new Date().toISOString(),
    dataStatus: incomeByDate.length || balanceSheet.length ? 'available' : 'unavailable',
    incomeStatement: incomeByDate,
    balanceSheet
  };
};

const fetchCompanyFundamentals = async (symbol, cik) => {
  const factsPayload = await requestJson(`${SEC_BASE}/api/xbrl/companyfacts/CIK${String(cik).padStart(10, '0')}.json`);
  return buildAccounting(factsPayload.facts);
};

const backfillFundamentals = async (tickers) => {
  const tickerPayload = await requestJson(SEC_TICKERS_URL);
  const tickerMap = Object.values(tickerPayload).reduce((map, item) => {
    map[item.ticker.toUpperCase()] = item.cik_str;
    return map;
  }, {});
  const fundamentals = loadFundamentalsFromDisk();

  for (const symbol of tickers) {
    if (fundamentals[symbol]?.dataStatus === 'available') continue;
    try {
      const cik = SEC_CIK_ALIASES[symbol] || tickerMap[symbol];
      if (!cik) throw new Error('No SEC CIK found; this company may not file U.S. SEC XBRL data');
      fundamentals[symbol] = await fetchCompanyFundamentals(symbol, cik);
      console.log(`${symbol}: SEC fundamentals fetched`);
    } catch (error) {
      fundamentals[symbol] = {
        reportingPeriod: 'Unavailable',
        dataSource: 'SEC Company Facts XBRL API',
        dataStatus: 'unavailable',
        lastError: error.message,
        incomeStatement: [],
        balanceSheet: []
      };
      console.error(`${symbol}: ${error.message}`);
    }
    saveFundamentalsToDisk(fundamentals);
    await sleep(REQUEST_DELAY_MS);
  }
  return fundamentals;
};

export default { loadFundamentalsFromDisk, saveFundamentalsToDisk, fetchCompanyFundamentals, backfillFundamentals };
