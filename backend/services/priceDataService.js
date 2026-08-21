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

const API_BASE = 'https://api.twelvedata.com';
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

const getApiKey = () => process.env.TWELVE_DATA_API_KEY;

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
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${data.message || response.statusText}`);
  }

  return data;
};

const toPricePoints = (data, symbol) => {
  if (!data || data.status !== 'ok') {
    throw new Error(data?.message || `No data returned for ${symbol}`);
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
    throw new Error('TWELVE_DATA_API_KEY environment variable is not set. Please add it to .env');
  }

  const apiSymbol = API_SYMBOL_ALIASES[symbol] || symbol;
  const url = `${API_BASE}/time_series?symbol=${encodeURIComponent(apiSymbol)}&interval=1day&outputsize=${outputSize}&apikey=${apiKey}`;

  try {
    return toPricePoints(await fetchJson(url), symbol);
  } catch (error) {
    throw new Error(`Twelve Data API failed for ${symbol}: ${error.message}`);
  }
};

const fetchHistoricalPricesBatch = async (symbols, outputSize = 250) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('TWELVE_DATA_API_KEY environment variable is not set. Please add it to .env');
  }

  const symbolList = symbols.map((symbol) => API_SYMBOL_ALIASES[symbol] || symbol).join(',');
  const url = `${API_BASE}/time_series?symbol=${encodeURIComponent(symbolList)}&interval=1day&outputsize=${outputSize}&apikey=${apiKey}`;
  const data = await fetchJson(url);

  // Twelve Data may return the normal single-symbol shape when a one-symbol
  // batch is requested, or a symbol-keyed object for a multi-symbol batch.
  if (symbols.length === 1 && data?.status === 'ok') {
    return { pricesBySymbol: { [symbols[0]]: toPricePoints(data, symbols[0]) }, failures: [] };
  }

  if (!data || data.status || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(data?.message || 'Batch response did not contain per-symbol results');
  }

  const pricesBySymbol = {};
  const failures = [];
  symbols.forEach((symbol) => {
    try {
      const apiSymbol = API_SYMBOL_ALIASES[symbol] || symbol;
      pricesBySymbol[symbol] = toPricePoints(data[apiSymbol], symbol);
    } catch (error) {
      failures.push({ symbol, error: error.message });
    }
  });

  return { pricesBySymbol, failures };
};

/**
 * Fetches latest day's price
 */
const fetchLatestPrice = async (symbol) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    const errorMessage = 'TWELVE_DATA_API_KEY environment variable is not set';
    latestPriceErrors[symbol] = errorMessage;
    lastRefreshInfo.status = 'failed';
    lastRefreshInfo.lastError = errorMessage;
    lastRefreshInfo.lastAttemptAt = new Date().toISOString();
    console.error(`⚠️  Could not fetch latest price for ${symbol}:`, errorMessage);
    return null;
  }

  const apiSymbol = API_SYMBOL_ALIASES[symbol] || symbol;
  const url = `${API_BASE}/time_series?symbol=${encodeURIComponent(apiSymbol)}&interval=1day&outputsize=1&apikey=${apiKey}`;

  try {
    const latest = await fetchWithRetries(async () => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.status !== 'ok' || !data.values || data.values.length === 0) {
        throw new Error(`No current price data returned for ${symbol}`);
      }

      return data.values[0];
    }, `latest price ${symbol}`);

    delete latestPriceErrors[symbol];
    return {
      date: latest.datetime,
      adjustedClose: Number(latest.close),
      close: Number(latest.close),
      timestamp: `${latest.datetime}T16:00:00Z`,
      volume: latest.volume ? Number(latest.volume) : 0
    };
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

    const latest = await fetchLatestPrice(symbol);
    if (!latest) {
      console.log(`   ⚠️  ${symbol}: no new data available`);
      continue;
    }

    const lastDate = pricesMap[symbol][pricesMap[symbol].length - 1]?.date;
    if (latest.date === lastDate) {
      console.log(`   ✓ ${symbol}: already up to date`);
    } else {
      pricesMap[symbol].push(latest);
      updated = true;
      lastRefreshInfo.tickersUpdated += 1;
      console.log(`   ✓ ${symbol}: added ${latest.date}`);
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
