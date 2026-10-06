import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data');
const PRICES_FILE = path.join(DATA_DIR, 'prices.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const API_BASE = 'https://finnhub.io/api/v1';
const REQUEST_DELAY_MS = 8000;
const BATCH_DELAY_MS = 60000;
const MAX_BATCH_SIZE = 8;
const MAX_RETRIES = 2;
const API_SYMBOL_ALIASES = {
  C3AI: 'AI'
};
const latestPriceErrors = {};
const lastRefreshInfo = {
  status: 'idle',
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastError: null,
  tickersChecked: 0,
  tickersUpdated: 0
};

const normalizeApiKey = (value) => {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase().includes('your-') || trimmed.toLowerCase().includes('example')) {
    return '';
  }
  return trimmed;
};

const getApiKey = () => normalizeApiKey(process.env.FINNHUB_API_KEY) || normalizeApiKey(process.env.TWELVE_DATA_API_KEY);

// A daily bar is only final once the US market has closed (4 PM ET) on that date.
const isSessionComplete = (dateString) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date()).map(part => [part.type, part.value])
  );
  const todayET = `${parts.year}-${parts.month}-${parts.day}`;
  if (dateString < todayET) return true;
  if (dateString > todayET) return false;
  return Number(parts.hour) >= 17;
};

const getLastRefreshInfo = () => ({
  ...lastRefreshInfo,
  lastAttemptAt: lastRefreshInfo.lastAttemptAt ? new Date(lastRefreshInfo.lastAttemptAt).toISOString() : null,
  lastSuccessAt: lastRefreshInfo.lastSuccessAt ? new Date(lastRefreshInfo.lastSuccessAt).toISOString() : null
});

/**
 * Sleep utility for throttling API requests (free tier safety)
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const fetchJson = async (url) => {
  const response = await fetch(url);
  const contentType = response.headers.get('content-type') || '';
  const raw = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof raw === 'object' ? (raw.message || raw.error || response.statusText) : raw || response.statusText;
    throw new Error(`HTTP ${response.status}: ${message}`);
  }

  if (raw && typeof raw === 'object' && raw.error) {
    throw new Error(raw.error);
  }

  return raw;
};

const toPricePoints = (data, symbol) => {
  if (data && Array.isArray(data.t) && Array.isArray(data.c)) {
    const timestamps = data.t || [];
    const closes = data.c || [];
    const volumes = data.v || [];

    if (!timestamps.length) {
      throw new Error(`No price data returned for ${symbol}`);
    }

    return timestamps
      .map((timestamp, index) => {
        const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
        const close = Number(closes[index]);
        return {
          date,
          adjustedClose: Number.isFinite(close) ? close : 0,
          close: Number.isFinite(close) ? close : 0,
          timestamp: `${date}T16:00:00Z`,
          volume: Number(volumes[index] || 0)
        };
      })
      .filter(point => Number.isFinite(point.adjustedClose))
      .reverse();
  }

  if (!data || data.status !== 'ok') {
    const message = data?.message || data?.error || `No data returned for ${symbol}`;
    throw new Error(message);
  }

  if (!data.values || data.values.length === 0) {
    throw new Error(`No price data returned for ${symbol}`);
  }

  return data.values
    .slice()
    .reverse()
    .map((point) => ({
      date: point.datetime,
      adjustedClose: Number(point.close),
      close: Number(point.close),
      timestamp: `${point.datetime}T16:00:00Z`,
      volume: point.volume ? Number(point.volume) : 0
    }));
};

const fetchWithRetries = async (operation, label) => {
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt > MAX_RETRIES) {
        throw error;
      }

      console.warn(`      ⚠️ ${label} attempt ${attempt} failed: ${error.message}`);
      console.warn(`         Retrying in ${REQUEST_DELAY_MS / 1000}s...`);
      await sleep(REQUEST_DELAY_MS);
    }
  }
};

/**
 * Loads prices from persistent JSON storage
 */
const loadPricesFromDisk = () => {
  if (fs.existsSync(PRICES_FILE)) {
    try {
      const raw = fs.readFileSync(PRICES_FILE, 'utf-8');
      return JSON.parse(raw);
    } catch (error) {
      console.error('❌ Error reading prices.json:', error);
      return {};
    }
  }
  return {};
};

/**
 * Saves prices to persistent JSON storage
 */
const savePricesToDisk = (pricesMap) => {
  try {
    fs.writeFileSync(PRICES_FILE, JSON.stringify(pricesMap, null, 2), 'utf-8');
    console.log(`✓ Prices saved to ${PRICES_FILE}`);
  } catch (error) {
    console.error('❌ Error writing prices.json:', error);
    throw error;
  }
};

/**
 * Fetches 1 year of daily adjusted close prices from Twelve Data
 * Returns array of { date, adjustedClose, close, timestamp, volume }
 * Throws error if API fails
 */
const fetchHistoricalPrices = async (symbol, outputSize = 250) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('FINNHUB_API_KEY or TWELVE_DATA_API_KEY environment variable is not set. Please add it to backend/.env');
  }

  const apiSymbol = API_SYMBOL_ALIASES[symbol] || symbol;
  const to = Math.floor(Date.now() / 1000);
  const from = to - Math.max(outputSize, 30) * 86400;

  const provider = process.env.FINNHUB_API_KEY ? 'finnhub' : 'twelvedata';
  let url = '';

  if (provider === 'finnhub') {
    url = `${API_BASE}/stock/candle?symbol=${encodeURIComponent(apiSymbol)}&resolution=D&from=${from}&to=${to}&token=${apiKey}`;
  } else {
    url = `${'https://api.twelvedata.com'}/time_series?symbol=${encodeURIComponent(apiSymbol)}&interval=1day&outputsize=${outputSize}&apikey=${apiKey}`;
  }

  try {
    return toPricePoints(await fetchJson(url), symbol);
  } catch (error) {
    throw new Error(`${provider === 'finnhub' ? 'Finnhub' : 'Twelve Data'} API failed for ${symbol}: ${error.message}`);
  }
};

const fetchHistoricalPricesBatch = async (symbols, outputSize = 250) => {
  const pricesBySymbol = {};
  const failures = [];

  for (const symbol of symbols) {
    try {
      pricesBySymbol[symbol] = await fetchHistoricalPrices(symbol, outputSize);
    } catch (error) {
      failures.push({ symbol, error: error.message });
    }
  }

  return { pricesBySymbol, failures };
};

/**
 * Fetches latest day's price
 */
const fetchLatestPrice = async (symbol) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    const errorMessage = 'FINNHUB_API_KEY or TWELVE_DATA_API_KEY environment variable is not set';
    latestPriceErrors[symbol] = errorMessage;
    lastRefreshInfo.status = 'failed';
    lastRefreshInfo.lastError = errorMessage;
    lastRefreshInfo.lastAttemptAt = new Date().toISOString();
    console.error(`⚠️  Could not fetch latest price for ${symbol}:`, errorMessage);
    return null;
  }

  const apiSymbol = API_SYMBOL_ALIASES[symbol] || symbol;
  const provider = normalizeApiKey(process.env.FINNHUB_API_KEY) ? 'finnhub' : 'twelvedata';
  const url = provider === 'finnhub'
    ? `${API_BASE}/quote?symbol=${encodeURIComponent(apiSymbol)}&token=${apiKey}`
    : `${'https://api.twelvedata.com'}/time_series?symbol=${encodeURIComponent(apiSymbol)}&interval=1day&outputsize=5&apikey=${apiKey}`;

  try {
    const bars = await fetchWithRetries(async () => {
      const data = await fetchJson(url);

      if (provider === 'finnhub') {
        if (!Number.isFinite(data?.c)) {
          throw new Error(`No current price data returned for ${symbol}`);
        }
        const date = new Date().toISOString().slice(0, 10);
        return [{
          date,
          close: Number(data.c),
          datetime: date,
          volume: Number(data.v || 0),
          timestamp: `${date}T16:00:00Z`
        }];
      }

      if (data.status !== 'ok' || !data.values || data.values.length === 0) {
        throw new Error(`No current price data returned for ${symbol}`);
      }

      return data.values;
    }, `latest price ${symbol}`);

    delete latestPriceErrors[symbol];
    return bars
      .filter(bar => isSessionComplete(bar.datetime))
      .map(bar => ({
        date: bar.datetime,
        adjustedClose: Number(bar.close),
        close: Number(bar.close),
        timestamp: `${bar.datetime}T16:00:00Z`,
        volume: bar.volume ? Number(bar.volume) : 0
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    latestPriceErrors[symbol] = error.message;
    lastRefreshInfo.status = 'failed';
    lastRefreshInfo.lastError = `${symbol}: ${error.message}`;
    lastRefreshInfo.lastAttemptAt = new Date().toISOString();
    console.error(`⚠️  Could not fetch latest price for ${symbol}:`, error.message);
    return null;
  }
};

/**
 * Main function: ONE-TIME BACKFILL
 * Fetches full 1-year history for all missing tickers
 * Returns: { symbol: [prices...], ...}
 * Per-company failures are tracked but don't block others
 */
const backfillPrices = async (tickers) => {
  const pricesMap = loadPricesFromDisk();
  const missingTickers = tickers.filter((symbol) => !pricesMap[symbol] || pricesMap[symbol].length === 0);

  if (missingTickers.length === 0) {
    console.log('✅ All prices already cached, skipping backfill');
    return pricesMap;
  }

  console.log(`\n📥 BACKFILL: Fetching 1-year history for ${missingTickers.length} companies`);
  const batches = [];
  for (let index = 0; index < missingTickers.length; index += MAX_BATCH_SIZE) {
    batches.push(missingTickers.slice(index, index + MAX_BATCH_SIZE));
  }

  console.log(`   API usage: ${missingTickers.length} symbols in ${batches.length} batch request(s)`);
  console.log(`   Free-tier batch size: ${MAX_BATCH_SIZE} symbols/request`);
  console.log(`   Delay between batches: ${BATCH_DELAY_MS / 1000}s; individual/retry delay: ${REQUEST_DELAY_MS / 1000}s\n`);

  const results = { succeeded: [], failed: [] };

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex];
    try {
      console.log(`   [batch ${batchIndex + 1}/${batches.length}] Fetching ${batch.length} symbols...`);
      const batchResult = await fetchWithRetries(
        () => fetchHistoricalPricesBatch(batch, 250),
        `Batch ${batchIndex + 1}`
      );

      Object.entries(batchResult.pricesBySymbol).forEach(([symbol, prices]) => {
        pricesMap[symbol] = prices;
        results.succeeded.push(symbol);
        console.log(`      ✓ ${symbol}: ${prices.length} days`);
      });
      results.failed.push(...batchResult.failures);

      // Checkpoint after every batch so an interruption resumes from disk.
      savePricesToDisk(pricesMap);
      if (batchIndex < batches.length - 1) {
        await sleep(BATCH_DELAY_MS);
      }
    } catch (error) {
      console.error(`      ✗ Batch failed: ${error.message}`);
      // Fall back to individual requests when the account/API does not support batching.
      for (let symbolIndex = 0; symbolIndex < batch.length; symbolIndex += 1) {
        const symbol = batch[symbolIndex];
        try {
          console.log(`      [fallback ${symbolIndex + 1}/${batch.length}] Fetching ${symbol}...`);
          const prices = await fetchWithRetries(
            () => fetchHistoricalPrices(symbol, 250),
            symbol
          );
          pricesMap[symbol] = prices;
          results.succeeded.push(symbol);
          savePricesToDisk(pricesMap);
          console.log(`         ✓ ${prices.length} days`);
        } catch (fallbackError) {
          results.failed.push({ symbol, error: fallbackError.message });
          console.error(`         ✗ ${fallbackError.message}`);
        }
        if (symbolIndex < batch.length - 1) {
          await sleep(REQUEST_DELAY_MS);
        }
      }
    }
  }

  console.log(`\n✅ Backfill complete: ${results.succeeded.length} succeeded, ${results.failed.length} failed`);

  if (results.failed.length > 0) {
    console.log('\n⚠️  Failed tickers (will show "data unavailable" in dashboard):');
    results.failed.forEach(({ symbol, error }) => {
      console.log(`   • ${symbol}: ${error}`);
    });
    console.log('\n💡 Restarting the server retries only missing tickers; successful data remains in prices.json');
  }

  // Save whatever we managed to fetch
  savePricesToDisk(pricesMap);

  return pricesMap;
};

/**
 * DAILY REFRESH: fetch latest day for each ticker and append
 * Per-company failures don't block others
 */
const refreshLatestPrices = async (tickers) => {
  const pricesMap = loadPricesFromDisk();
  let updated = false;

  lastRefreshInfo.status = 'running';
  lastRefreshInfo.lastAttemptAt = new Date().toISOString();
  lastRefreshInfo.lastError = null;
  lastRefreshInfo.tickersChecked = tickers.length;
  lastRefreshInfo.tickersUpdated = 0;

  console.log(`\n🔄 Daily refresh at ${new Date().toISOString()}`);

  for (const symbol of tickers) {
    if (!pricesMap[symbol] || pricesMap[symbol].length === 0) {
      console.log(`   ⚠️  ${symbol}: no cached data (run backfill first)`);
      continue;
    }

    const latestBars = await fetchLatestPrice(symbol);
    if (!latestBars) {
      console.log(`   ⚠️  ${symbol}: no new data available`);
      continue;
    }

    // Upsert by date so a bar saved earlier from an unfinished session gets corrected.
    const series = pricesMap[symbol];
    let changed = 0;
    for (const bar of latestBars) {
      const index = series.findIndex(point => point.date === bar.date);
      if (index === -1) {
        series.push(bar);
        changed += 1;
      } else if (series[index].close !== bar.close) {
        series[index] = bar;
        changed += 1;
      }
    }
    series.sort((a, b) => a.date.localeCompare(b.date));

    if (changed === 0) {
      console.log(`   ✓ ${symbol}: already up to date`);
    } else {
      updated = true;
      lastRefreshInfo.tickersUpdated += 1;
      console.log(`   ✓ ${symbol}: ${changed} bar(s) added or corrected`);
    }

    if (symbol !== tickers[tickers.length - 1]) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  if (updated) {
    savePricesToDisk(pricesMap);
    lastRefreshInfo.lastSuccessAt = new Date().toISOString();
    lastRefreshInfo.status = Object.keys(latestPriceErrors).length > 0 ? 'partial' : 'success';
    lastRefreshInfo.lastError = Object.keys(latestPriceErrors).length > 0
      ? 'Some symbols failed to refresh; see console logs.'
      : null;
  } else {
    lastRefreshInfo.lastSuccessAt = new Date().toISOString();
    lastRefreshInfo.status = Object.keys(latestPriceErrors).length > 0 ? 'failed' : 'success';
    lastRefreshInfo.lastError = Object.keys(latestPriceErrors).length > 0
      ? 'No new data appended. Latest refresh attempts failed.'
      : null;
  }

  return pricesMap;
};

export { getLastRefreshInfo };

export default {
  loadPricesFromDisk,
  savePricesToDisk,
  fetchHistoricalPrices,
  fetchLatestPrice,
  backfillPrices,
  refreshLatestPrices,
  getLatestPriceErrors: () => ({ ...latestPriceErrors }),
  getLastRefreshInfo
};
