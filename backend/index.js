import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server as SocketIOServer } from 'socket.io';
import http from 'http';
import fs from 'fs';
import priceDataService from './services/priceDataService.js';
import fundamentalsDataService from './services/secFundamentalsDataService.js';
import yieldsDataService from './services/yieldsDataService.js';

dotenv.config();

// ============================================================================
// PRICE DATA INITIALIZATION
// ============================================================================

let pricesCache = {};
let fundamentalsCache = {};
let yieldsCache = {};
let pricesInitialized = false;

const initializePriceData = async () => {
  try {
    const allTickers = [...companiesRawData, ...opportunityCompaniesRawData]
      .map(company => company.symbol);
    
    console.log('\n========================================');
    console.log('🔧 Initializing Real Price Data');
    console.log('========================================');
    
    pricesCache = priceDataService.loadPricesFromDisk();
    fundamentalsCache = fundamentalsDataService.loadFundamentalsFromDisk();
    yieldsCache = yieldsDataService.loadYieldsFromDisk();

    const hasProviderKey = Boolean(process.env.FINNHUB_API_KEY || process.env.TWELVE_DATA_API_KEY);
    const hasCachedPrices = Object.keys(pricesCache || {}).length > 0;

    if (!hasProviderKey && !hasCachedPrices) {
      throw new Error('No market data source is available. Add FINNHUB_API_KEY or TWELVE_DATA_API_KEY to backend/.env.');
    }

    if (!hasProviderKey && hasCachedPrices) {
      console.warn('\n⚠️ No live market API key is configured. Starting with cached data only.');
      console.warn('   Add FINNHUB_API_KEY to backend/.env to resume live updates.\n');
    }

    pricesInitialized = true;
    
    console.log('\n✅ Price initialization complete\n');
  } catch (error) {
    console.error('\n❌ FATAL: Price initialization failed:', error.message);
    console.error('\nPlease check:');
    console.error('  1. FINNHUB_API_KEY or TWELVE_DATA_API_KEY is set in backend/.env');
    console.error('  2. Your API key is valid');
    console.error('  3. Network connectivity to the selected market API');
    console.error('\nThe server will attempt to continue with cached data if available.\n');
    pricesCache = priceDataService.loadPricesFromDisk();
    fundamentalsCache = fundamentalsDataService.loadFundamentalsFromDisk();
    yieldsCache = yieldsDataService.loadYieldsFromDisk();
    pricesInitialized = true;
  }
};

const REFRESH_TIME_ZONE = 'America/New_York';
const REFRESH_MINUTE_OF_DAY = 16 * 60 + 10; // 4:10 PM ET, shortly after the US market close
const FUNDAMENTALS_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const easternClock = (date) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: REFRESH_TIME_ZONE, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(date).map(part => [part.type, part.value])
  );
  return { weekday: parts.weekday, minuteOfDay: Number(parts.hour) * 60 + Number(parts.minute) };
};

// Finds the next weekday 4:10 PM US Eastern time, whatever time zone the server runs in.
const nextRefreshTime = (from = new Date()) => {
  const candidate = new Date(Math.floor(from.getTime() / 60000) * 60000 + 60000);
  for (let step = 0; step < 8 * 24 * 60; step += 1) {
    const { weekday, minuteOfDay } = easternClock(candidate);
    if (minuteOfDay === REFRESH_MINUTE_OF_DAY && weekday !== 'Sat' && weekday !== 'Sun') return candidate;
    candidate.setTime(candidate.getTime() + 60000);
  }
  return new Date(from.getTime() + 24 * 60 * 60 * 1000);
};

const allTickers = () => [...companiesRawData, ...opportunityCompaniesRawData].map(company => company.symbol);

const fundamentalsAreStale = () => {
  const records = Object.values(fundamentalsCache || {});
  if (!records.length) return true;
  return records.some(record => !record.fetchedAt || Date.now() - new Date(record.fetchedAt).getTime() > FUNDAMENTALS_MAX_AGE_MS);
};

const broadcastPrices = () => {
  syncDatabasePrices();
  io.emit('live-prices', {
    companies: [...db.companies, ...db.opportunityCompanies],
    timestamp: new Date()
  });
};

// Refreshes every external data source. Each step is independent so one failure does not block the rest.
const refreshAllData = async () => {
  const tickers = allTickers();

  try {
    if (fundamentalsAreStale()) {
      fundamentalsCache = await fundamentalsDataService.backfillFundamentals(tickers);
      broadcastPrices();
    }
  } catch (error) {
    console.error('❌ SEC fundamentals refresh failed:', error.message);
  }

  try {
    yieldsCache = await yieldsDataService.refreshYields();
  } catch (error) {
    console.error('❌ Yield refresh failed:', error.message);
  }

  try {
    pricesCache = await priceDataService.refreshLatestPrices(tickers);
    broadcastPrices();
  } catch (error) {
    console.error('❌ Price refresh failed:', error.message);
  }
};

const scheduleDailyRefresh = () => {
  const nextRefresh = nextRefreshTime();
  const msUntilRefresh = nextRefresh.getTime() - Date.now();
  console.log(`⏰ Next data refresh scheduled: ${nextRefresh.toLocaleString()} (4:10 PM US Eastern)`);

  setTimeout(async () => {
    await refreshAllData();
    scheduleDailyRefresh();
  }, msUntilRefresh);
};

const enrichCompanyAccounting = (company, priceData = [], accounting = null) => {
  const realMetrics = accounting?.metrics || {};
  const sharesOutstandingMillions = realMetrics.sharesOutstandingMillions;
  const sharesOutstanding = sharesOutstandingMillions == null ? null : sharesOutstandingMillions * 1_000_000;
  
  // Use real price data if available, otherwise empty array (error state)
  const alignedSeries = priceData && Array.isArray(priceData) && priceData.length > 0 
    ? priceData 
    : [];
  const latestPrice = alignedSeries.length > 0
    ? alignedSeries[alignedSeries.length - 1].adjustedClose
    : null;
  const latestChange = alignedSeries.length > 1
    ? Number((((alignedSeries[alignedSeries.length - 1].adjustedClose - alignedSeries[alignedSeries.length - 2].adjustedClose) / alignedSeries[alignedSeries.length - 2].adjustedClose) * 100).toFixed(2))
    : null;

  const marketCap = latestPrice != null && sharesOutstandingMillions != null
    ? Number((latestPrice * sharesOutstandingMillions / 1000).toFixed(2))
    : null;
  const epsTtm = realMetrics.epsTtm;
  const netIncomeTtm = realMetrics.netIncomeTtm;
  let peRatio = null;
  if (latestPrice != null && epsTtm > 0) {
    peRatio = Number((latestPrice / epsTtm).toFixed(1));
  } else if (marketCap != null && netIncomeTtm > 0) {
    peRatio = Number((marketCap / netIncomeTtm).toFixed(1));
  }

  return {
    ...company,
    price: latestPrice,
    change: latestChange,
    sharesOutstanding,
    metrics: {
      ...realMetrics,
      marketCap,
      peRatio,
      sharesOutstanding: sharesOutstandingMillions
    },
    priceHistory: alignedSeries,
    dailyAdjustedClose: alignedSeries.map(point => ({
      date: point.date,
      adjustedClose: point.adjustedClose,
      close: point.close,
      timestamp: point.timestamp
    })),
    marketData: {
      sharesOutstanding,
      adjustmentMethod: 'Twelve Data daily close',
      dataStatus: alignedSeries.length > 0 ? 'available' : 'unavailable',
      snapshotTime: '16:00 ET',
      dateCoverage: alignedSeries.length,
      dateIndex: alignedSeries.map(point => point.date),
      dataSource: 'Twelve Data API',
      lastUpdate: alignedSeries.length > 0 ? alignedSeries[alignedSeries.length - 1].date : 'N/A'
    },
    accounting: accounting || {
      reportingPeriod: 'Unavailable',
      dataSource: 'SEC Company Facts XBRL API',
      dataStatus: 'unavailable',
      incomeStatement: [],
      balanceSheet: []
    }
  };
};

// ============================================================================
// COMPANY PROFILES
// Descriptive data only (name, HQ, products, macro context). Prices, metrics
// and rank are filled in from live sources by enrichCompanyAccounting().
// ============================================================================

const companyProfiles = JSON.parse(
  fs.readFileSync(new URL('./data/companyProfiles.json', import.meta.url), 'utf8')
);
const companiesRawData = companyProfiles.companies;
const opportunityCompaniesRawData = companyProfiles.opportunityCompanies;

/**
 * Setup database after prices are loaded
 * Enriches raw company data with real price data
 */
const setupDatabase = () => {
  if (!pricesInitialized) {
    throw new Error('❌ Prices not initialized. Call initializePriceData() before setupDatabase()');
  }

  return {
    companies: companiesRawData.map(company => 
      enrichCompanyAccounting(company, pricesCache[company.symbol] || [], fundamentalsCache[company.symbol])
    ),
    opportunityCompanies: opportunityCompaniesRawData.map(company => 
      enrichCompanyAccounting(company, pricesCache[company.symbol] || [], fundamentalsCache[company.symbol])
    ),
    prices: [],
    users: [],
    watchlists: []
  };
};

let db = {};

// Import routes
import companiesRoutes from './routes/companies.js';
import pricesRoutes from './routes/prices.js';
import yieldsRoutes from './routes/yields.js';
import currencyRoutes from './routes/currency.js';
import watchlistRoutes from './routes/watchlist.js';
import authRoutes from './routes/auth.js';

const app = express();
const server = http.createServer(app);
// One list of allowed origins, used by both the API and the live-update socket.
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];

const io = new SocketIOServer(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Make db available to routes
app.use((req, res, next) => {
  req.db = db;
  next();
});

console.log('✓ In-memory database initialized');

// Routes
app.use('/api/companies', companiesRoutes);
app.use('/api/prices', pricesRoutes);
app.use('/api/yields', yieldsRoutes);
app.use('/api/currency', currencyRoutes);
app.use('/api/watchlist', watchlistRoutes);
app.use('/api/auth', authRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// WebSocket connection for real-time price updates
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
  
  // Subscribe to price updates for specific companies
  socket.on('subscribe-prices', (companyIds) => {
    socket.join(`prices-${companyIds.join('-')}`);
  });
});

// Store io instance for use in routes
app.locals.io = io;

const rankByMarketCap = (companies) => {
  [...companies]
    .sort((a, b) => (b.metrics?.marketCap ?? -1) - (a.metrics?.marketCap ?? -1))
    .forEach((company, index) => { company.rank = index + 1; });
};

const syncDatabasePrices = () => {
  const companies = [...(db.companies || []), ...(db.opportunityCompanies || [])];
  companies.forEach(company => {
    const history = pricesCache[company.symbol] || [];
    const refreshedCompany = enrichCompanyAccounting(company, history, fundamentalsCache[company.symbol]);
    Object.assign(company, refreshedCompany);
    const refreshError = priceDataService.getLatestPriceErrors()[company.symbol];
    if (refreshError && history.length > 0) {
      company.marketData.dataStatus = 'stale';
      company.marketData.lastError = refreshError;
    }
  });
  rankByMarketCap(db.companies || []);
  rankByMarketCap(db.opportunityCompanies || []);
};

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 5000;

// Start server with async initialization
(async () => {
  // Step 1: Load or fetch real price data
  await initializePriceData();

  // Step 2: Initialize database with enriched company data
  db = setupDatabase();
  rankByMarketCap(db.companies);
  rankByMarketCap(db.opportunityCompanies);

  // Step 3: Schedule daily refresh and refresh stale data in the background now
  scheduleDailyRefresh();
  refreshAllData();

  // Step 4: Start listening
  server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════╗
║   🤖 AI Stock Tracker - Backend Server Started     ║
╚════════════════════════════════════════════════════╝

✓ Server running on http://localhost:${PORT}
✓ API endpoints ready:
  - GET  /api/companies
  - GET  /api/prices/current
  - POST /api/auth/register
  - POST /api/auth/login
  
✓ Data refreshes at startup and daily after the US market close
✓ WebSocket connection active on port ${PORT}
✓ Real price data loaded: ${db.companies.length} companies with historical prices

Ready to connect frontend at http://localhost:5173
  `);
  });
})();

export default app;
