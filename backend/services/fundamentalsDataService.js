import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data');
const FUNDAMENTALS_FILE = path.join(DATA_DIR, 'fundamentals.json');
const API_BASE = 'https://api.twelvedata.com';
const REQUEST_DELAY_MS = 8000;
const MAX_RETRIES = 2;

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const sleep = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));
const getApiKey = () => process.env.TWELVE_DATA_API_KEY;

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

const fetchJson = async (url) => {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${data.message || response.statusText}`);
  }
  if (data.status === 'error') {
    throw new Error(data.message || 'Twelve Data fundamentals request failed');
  }
  return data;
};

const fetchWithRetries = async (operation, label) => {
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt > MAX_RETRIES) throw error;
      console.warn(`${label} failed: ${error.message}; retrying in ${REQUEST_DELAY_MS / 1000}s`);
      await sleep(REQUEST_DELAY_MS);
    }
  }
};

const getRows = (payload, key) => {
  const rows = payload?.[key] || payload?.data || [];
  return Array.isArray(rows) ? rows : [];
};

const numberValue = (row, keys) => {
  for (const key of keys) {
    const value = Number(row?.[key]);
    if (Number.isFinite(value)) return Number(value.toFixed(2));
  }
  return null;
};

const quarterLabel = (row) => row?.fiscal_date || row?.fiscal_period || row?.period || row?.date || null;

const fetchCompanyFundamentals = async (symbol) => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('TWELVE_DATA_API_KEY environment variable is not set');

  const params = `symbol=${encodeURIComponent(symbol)}&period=quarter&outputsize=4&apikey=${apiKey}`;
  const [incomePayload, balancePayload] = await Promise.all([
    fetchWithRetries(() => fetchJson(`${API_BASE}/income_statement?${params}`), `${symbol} income statement`),
    fetchWithRetries(() => fetchJson(`${API_BASE}/balance_sheet?${params}`), `${symbol} balance sheet`)
  ]);

  const incomeRows = getRows(incomePayload, 'income_statement');
  const balanceRows = getRows(balancePayload, 'balance_sheet');
  if (!incomeRows.length && !balanceRows.length) {
    throw new Error('Twelve Data returned no quarterly fundamentals');
  }

  const incomeStatement = incomeRows.map(row => ({
    quarter: quarterLabel(row),
    revenue: numberValue(row, ['total_revenue', 'revenue']),
    grossProfit: numberValue(row, ['gross_profit']),
    operatingIncome: numberValue(row, ['operating_income']),
    netIncome: numberValue(row, ['net_income', 'net_income_common_stockholders']),
    ebitda: numberValue(row, ['ebitda'])
  }));

  const balanceSheet = balanceRows.map(row => ({
    quarter: quarterLabel(row),
    cash: numberValue(row, ['cash_and_equivalents', 'cash_and_short_term_investments', 'cash']),
    currentAssets: numberValue(row, ['total_current_assets']),
    currentLiabilities: numberValue(row, ['total_current_liabilities']),
    longTermDebt: numberValue(row, ['long_term_debt', 'long_term_debt_and_capital_lease_obligation']),
    totalAssets: numberValue(row, ['total_assets']),
    totalLiabilities: numberValue(row, ['total_liabilities']),
    shareholdersEquity: numberValue(row, ['shareholders_equity', 'total_shareholders_equity'])
  }));

  return {
    reportingPeriod: 'Last 4 reported quarters',
    dataSource: 'Twelve Data fundamentals API',
    fetchedAt: new Date().toISOString(),
    incomeStatement,
    balanceSheet
  };
};

const backfillFundamentals = async (tickers) => {
  const fundamentals = loadFundamentalsFromDisk();
  const missing = tickers.filter(symbol => !fundamentals[symbol]?.incomeStatement?.length && !fundamentals[symbol]?.balanceSheet?.length);
  if (!missing.length) {
    console.log('All quarterly fundamentals already cached.');
    return fundamentals;
  }

  console.log(`Fetching real quarterly fundamentals for ${missing.length} companies.`);
  for (let index = 0; index < missing.length; index += 1) {
    const symbol = missing[index];
    try {
      fundamentals[symbol] = await fetchCompanyFundamentals(symbol);
      console.log(`  ${symbol}: fetched quarterly fundamentals`);
      saveFundamentalsToDisk(fundamentals);
    } catch (error) {
      fundamentals[symbol] = {
        reportingPeriod: 'Unavailable',
        dataSource: 'Twelve Data fundamentals API',
        dataStatus: 'unavailable',
        lastError: error.message,
        incomeStatement: [],
        balanceSheet: []
      };
      console.error(`  ${symbol}: ${error.message}`);
      saveFundamentalsToDisk(fundamentals);
    }
    if (index < missing.length - 1) await sleep(REQUEST_DELAY_MS);
  }
  return fundamentals;
};

export default {
  loadFundamentalsFromDisk,
  saveFundamentalsToDisk,
  fetchCompanyFundamentals,
  backfillFundamentals
};
