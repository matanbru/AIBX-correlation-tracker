import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server as SocketIOServer } from 'socket.io';
import http from 'http';
import priceDataService from './services/priceDataService.js';
import fundamentalsDataService from './services/fundamentalsDataService.js';

dotenv.config();

const quarterlyLabels = ['Q2 2026', 'Q1 2026', 'Q4 2025', 'Q3 2025'];

// ============================================================================
// PRICE DATA INITIALIZATION
// ============================================================================

let pricesCache = {};
let fundamentalsCache = {};
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
    pricesInitialized = true;
    
    console.log('\n✅ Price initialization complete\n');
  } catch (error) {
    console.error('\n❌ FATAL: Price initialization failed:', error.message);
    console.error('\nPlease check:');
    console.error('  1. TWELVE_DATA_API_KEY is set in backend/.env');
    console.error('  2. Your API key is valid (sign up at https://twelvedata.com)');
    console.error('  3. Network connectivity to api.twelvedata.com');
    console.error('\nThe server will not start without real price data.\n');
    process.exit(1);
  }
};

const scheduleDailyRefresh = () => {
  const now = new Date();
  const next4_05PM = new Date(now);
  next4_05PM.setHours(16, 5, 0, 0); // 4:05 PM ET (after market close)
  
  if (next4_05PM <= now) {
    next4_05PM.setDate(next4_05PM.getDate() + 1);
  }
  
  const msUntilRefresh = next4_05PM.getTime() - now.getTime();
  console.log(`⏰ Next price refresh scheduled: ${next4_05PM.toLocaleString()}`);
  
  setTimeout(async () => {
    try {
      const allTickers = [...companiesRawData, ...opportunityCompaniesRawData]
        .map(company => company.symbol);
      pricesCache = await priceDataService.refreshLatestPrices(allTickers);
      syncDatabasePrices();
      io.emit('live-prices', {
        companies: [...db.companies, ...db.opportunityCompanies],
        timestamp: new Date()
      });
    } catch (error) {
      console.error('❌ Daily refresh failed:', error.message);
    }
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

  return {
    ...company,
    price: latestPrice,
    change: latestChange,
    sharesOutstanding,
    metrics: {
      ...realMetrics,
      marketCap: latestPrice != null && sharesOutstandingMillions != null
        ? Number((latestPrice * sharesOutstandingMillions / 1000).toFixed(2))
        : null,
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
      adjustmentMethod: 'Twelve Data daily adjusted close',
      dataStatus: alignedSeries.length > 0 ? 'available' : 'unavailable',
      snapshotTime: '16:00 ET',
      dateCoverage: alignedSeries.length,
      dateIndex: alignedSeries.map(point => point.date),
      dataSource: 'Twelve Data API',
      lastUpdate: alignedSeries.length > 0 ? alignedSeries[alignedSeries.length - 1].date : 'N/A'
    },
    accounting: accounting || {
      reportingPeriod: 'Unavailable',
      dataSource: 'Twelve Data fundamentals API',
      dataStatus: 'unavailable',
      incomeStatement: [],
      balanceSheet: []
    }
  };
};

// In-memory database storage
// ============================================================================
// RAW COMPANY DATA (before price enrichment)
// ============================================================================

const companiesRawData = [
    {
      _id: '1', rank: 1, symbol: 'NVDA', name: 'NVIDIA Corporation', price: 445.23, change: 2.5, founded: 1993,
      headquarters: 'Santa Clara, CA', description: 'Leading AI chip manufacturer', aiProducts: ['CUDA', 'GPUs', 'AI Infrastructure'],
      metrics: {
        marketCap: 2940, revenueTtm: 128.5, revenueGrowth: 78.4, grossMargin: 75.3, operatingMargin: 58.6,
        freeCashFlow: 56.7, debtToEquity: 0.39, currentRatio: 3.8, peRatio: 58.2, cashBalance: 28.9, capex: 6.1
      },
      macroContext: {
        inflationSensitivity: 'Low to moderate', interestRateSensitivity: 'Moderate', demandCycle: 'AI infrastructure buildout',
        supplyChainRisk: 'Semi-conductor dependency and hyperscaler procurement cycles', aiDemand: 'Very high'
      },
      patternSignals: [
        { label: 'Historical pattern', description: 'Periods of rapid AI-capex expansion often coincide with strong institutional demand for semiconductor supply chains.' },
        { label: 'Macro theory', description: 'When productivity gains accelerate, capex-heavy suppliers often outperform in the early phase of adoption, before broad-based earnings catch up.' }
      ]
    },
    {
      _id: '2', rank: 2, symbol: 'MSFT', name: 'Microsoft', price: 378.91, change: 1.2, founded: 1975,
      headquarters: 'Redmond, WA', description: 'AI integration in enterprise software', aiProducts: ['Copilot', 'Azure AI', 'ChatGPT'],
      metrics: {
        marketCap: 3120, revenueTtm: 245.1, revenueGrowth: 15.2, grossMargin: 69.8, operatingMargin: 42.6,
        freeCashFlow: 78.5, debtToEquity: 0.46, currentRatio: 1.9, peRatio: 35.4, cashBalance: 51.4, capex: 12.7
      },
      macroContext: {
        inflationSensitivity: 'Low', interestRateSensitivity: 'Low', demandCycle: 'Enterprise software renewal cycles',
        supplyChainRisk: 'Low software execution risk', aiDemand: 'Very high'
      },
      patternSignals: [
        { label: 'Historical pattern', description: 'Large enterprise software platforms tend to benefit when AI improves workflow productivity and increases software attachment rates.' },
        { label: 'Macro theory', description: 'In inflationary periods, software with recurring revenue and operating leverage often remains resilient because costs are relatively predictable.' }
      ]
    },
    {
      _id: '3', rank: 3, symbol: 'GOOGL', name: 'Alphabet (Google)', price: 138.42, change: -0.8, founded: 1998,
      headquarters: 'Mountain View, CA', description: 'AI research and development', aiProducts: ['Gemini', 'Bard', 'TensorFlow'],
      metrics: {
        marketCap: 1885, revenueTtm: 338.2, revenueGrowth: 13.4, grossMargin: 57.8, operatingMargin: 29.6,
        freeCashFlow: 53.1, debtToEquity: 0.14, currentRatio: 2.1, peRatio: 22.3, cashBalance: 27.8, capex: 10.4
      },
      macroContext: {
        inflationSensitivity: 'Low', interestRateSensitivity: 'Low to moderate', demandCycle: 'Digital ad demand and cloud consumption',
        supplyChainRisk: 'Low', aiDemand: 'High'
      },
      patternSignals: [
        { label: 'Historical pattern', description: 'Search and advertising platforms often respond to digital ad demand elasticity more than pure AI adoption alone.' },
        { label: 'Macro theory', description: 'When consumer spending slows, ad-driven businesses can experience margin pressure even while AI monetisation improves gradually.' }
      ]
    },
    {
      _id: '4', rank: 4, symbol: 'AMZN', name: 'Amazon', price: 178.32, change: 0.5, founded: 1994,
      headquarters: 'Seattle, WA', description: 'AI for cloud and retail', aiProducts: ['AWS AI', 'Alexa', 'ML Services'],
      metrics: {
        marketCap: 2030, revenueTtm: 637.7, revenueGrowth: 11.6, grossMargin: 48.2, operatingMargin: 10.8,
        freeCashFlow: 52.9, debtToEquity: 0.58, currentRatio: 1.1, peRatio: 37.6, cashBalance: 64.8, capex: 35.9
      },
      macroContext: {
        inflationSensitivity: 'Moderate', interestRateSensitivity: 'Moderate', demandCycle: 'Consumer demand and cloud efficiency',
        supplyChainRisk: 'Moderate to high', aiDemand: 'High'
      },
      patternSignals: [
        { label: 'Historical pattern', description: 'Cloud and logistics-heavy businesses often show delayed benefit from AI productivity gains when retail demand is soft.' },
        { label: 'Macro theory', description: 'Higher rates can pressure net margins for consumer-driven models, while AI can improve efficiency over time.' }
      ]
    },
    {
      _id: '5', rank: 5, symbol: 'META', name: 'Meta Platforms', price: 345.67, change: 1.8, founded: 2004,
      headquarters: 'Menlo Park, CA', description: 'AI for social media and metaverse', aiProducts: ['Llama', 'Content AI', 'Recommendations'],
      metrics: {
        marketCap: 953, revenueTtm: 164.8, revenueGrowth: 17.9, grossMargin: 81.6, operatingMargin: 37.8,
        freeCashFlow: 27.9, debtToEquity: 0.08, currentRatio: 2.2, peRatio: 26.1, cashBalance: 43.7, capex: 11.3
      },
      macroContext: {
        inflationSensitivity: 'Low', interestRateSensitivity: 'Low', demandCycle: 'Advertising and engagement demand',
        supplyChainRisk: 'Low', aiDemand: 'High'
      },
      patternSignals: [
        { label: 'Historical pattern', description: 'Large digital ad platforms often benefit when engagement and monetisation increase faster than cost inflation.' },
        { label: 'Macro theory', description: 'In lower-rate environments with strong digital spending, high-margin platform businesses can expand operating leverage sharply.' }
      ]
    },
    {
      _id: '6', rank: 6, symbol: 'TSLA', name: 'Tesla', price: 267.89, change: 2.1, founded: 2003,
      headquarters: 'Austin, TX', description: 'AI for autonomous vehicles', aiProducts: ['Autopilot', 'Dojo', 'Neural Networks'],
      metrics: {
        marketCap: 831, revenueTtm: 98.6, revenueGrowth: 2.1, grossMargin: 17.8, operatingMargin: 7.4,
        freeCashFlow: 4.9, debtToEquity: 0.51, currentRatio: 1.7, peRatio: 62.8, cashBalance: 29.1, capex: 7.4
      },
      macroContext: {
        inflationSensitivity: 'Moderate', interestRateSensitivity: 'High', demandCycle: 'Vehicle demand and EV adoption',
        supplyChainRisk: 'High', aiDemand: 'Moderate to high'
      },
      patternSignals: [
        { label: 'Historical pattern', description: 'Automotive cycles frequently cause large swings in production volumes, demand, and margins even when AI capabilities improve.' },
        { label: 'Macro theory', description: 'Higher financing costs and slower consumer spending can reduce vehicle demand, while AI features may support long-term product differentiation.' }
      ]
    },
    {
      _id: '7', rank: 7, symbol: 'AMD', name: 'Advanced Micro Devices', price: 169.8, change: 1.9, founded: 1969,
      headquarters: 'Santa Clara, CA', description: 'AI computing and data center processors', aiProducts: ['MI300', 'EPYC', 'AI Accelerators'],
      metrics: {
        marketCap: 321, revenueTtm: 25.8, revenueGrowth: 19.6, grossMargin: 54.6, operatingMargin: 12.6,
        freeCashFlow: 5.9, debtToEquity: 0.14, currentRatio: 2.5, peRatio: 48.7, cashBalance: 6.7, capex: 2.9
      },
      macroContext: {
        inflationSensitivity: 'Moderate', interestRateSensitivity: 'Moderate', demandCycle: 'Compute demand and server refresh cycles',
        supplyChainRisk: 'Moderate', aiDemand: 'Very high'
      },
      patternSignals: [
        { label: 'Historical pattern', description: 'Semiconductor cycles often accelerate when enterprise infrastructure spending broadens after a period of underinvestment.' },
        { label: 'Macro theory', description: 'In technology capex cycles, component suppliers can benefit as digital infrastructure spending expands faster than general GDP.' }
      ]
    },
    {
      _id: '8', rank: 8, symbol: 'CRM', name: 'Salesforce', price: 264.5, change: 0.7, founded: 1999,
      headquarters: 'San Francisco, CA', description: 'AI in customer relationship management', aiProducts: ['Einstein AI', 'Data Cloud', 'Analytics'],
      metrics: {
        marketCap: 275, revenueTtm: 34.9, revenueGrowth: 10.2, grossMargin: 76.2, operatingMargin: 21.9,
        freeCashFlow: 8.7, debtToEquity: 0.18, currentRatio: 1.1, peRatio: 36.1, cashBalance: 11.6, capex: 1.7
      },
      macroContext: {
        inflationSensitivity: 'Low', interestRateSensitivity: 'Low', demandCycle: 'Enterprise software spend and digital transformation',
        supplyChainRisk: 'Low', aiDemand: 'High'
      },
      patternSignals: [
        { label: 'Historical pattern', description: 'CRM vendors often gain from productivity-enhancing AI features as enterprise buyers look for measurable efficiency gains.' },
        { label: 'Macro theory', description: 'In uncertain macro conditions, software that improves workflow efficiency can still attract spending even when broader IT budgets are constrained.' }
      ]
    },
    {
      _id: '9', rank: 9, symbol: 'SAP', name: 'SAP SE', price: 195.4, change: -0.4, founded: 1972,
      headquarters: 'Walldorf, Germany', description: 'AI in enterprise software and cloud services', aiProducts: ['SAP Joule', 'Business AI', 'Cloud ERP'],
      metrics: {
        marketCap: 377, revenueTtm: 39.8, revenueGrowth: 11.3, grossMargin: 71.9, operatingMargin: 25.5,
        freeCashFlow: 7.4, debtToEquity: 0.25, currentRatio: 1.4, peRatio: 32.8, cashBalance: 4.2, capex: 1.4
      },
      macroContext: {
        inflationSensitivity: 'Low', interestRateSensitivity: 'Low', demandCycle: 'ERP modernisation and cloud transitions',
        supplyChainRisk: 'Low', aiDemand: 'High'
      },
      patternSignals: [
        { label: 'Historical pattern', description: 'Legacy enterprise suites often show strong durability during periods of slower GDP growth because of essential software demand.' },
        { label: 'Macro theory', description: 'When economic uncertainty rises, companies prefer productivity platforms that improve process efficiency without major demand assumptions.' }
      ]
    },
    {
      _id: '10', rank: 10, symbol: 'IBM', name: 'IBM', price: 170.2, change: 0.9, founded: 1911,
      headquarters: 'Armonk, NY', description: 'AI in enterprise platforms and infrastructure', aiProducts: ['Watsonx', 'Hybrid Cloud', 'Automation'],
      metrics: {
        marketCap: 176, revenueTtm: 62.8, revenueGrowth: 4.2, grossMargin: 57.4, operatingMargin: 18.9,
        freeCashFlow: 9.7, debtToEquity: 1.9, currentRatio: 1.1, peRatio: 28.7, cashBalance: 14.6, capex: 3.9
      },
      macroContext: {
        inflationSensitivity: 'Low', interestRateSensitivity: 'Low', demandCycle: 'Enterprise IT spending and hybrid cloud',
        supplyChainRisk: 'Low', aiDemand: 'Moderate'
      },
      patternSignals: [
        { label: 'Historical pattern', description: 'Legacy infrastructure vendors often lag during fast AI cycles but maintain balance in defensive enterprise spending environments.' },
        { label: 'Macro theory', description: 'Defensive technology names tend to benefit when broad risk appetite is weak but businesses still need mission-critical infrastructure.' }
      ]
    },
    {
      _id: '11', rank: 11, symbol: 'JPM', name: 'JPMorgan Chase', price: 184.52, change: 0.3, founded: 1799,
      headquarters: 'New York, NY', description: 'AI for finance', aiProducts: ['COIN', 'ML Platforms'],
      metrics: {
        marketCap: 802, revenueTtm: 160.4, revenueGrowth: 9.8, grossMargin: 56.2, operatingMargin: 34.9,
        freeCashFlow: 20.4, debtToEquity: 1.2, currentRatio: 0.9, peRatio: 11.5, cashBalance: 83.1, capex: 3.2
      },
      macroContext: {
        inflationSensitivity: 'Moderate', interestRateSensitivity: 'High', demandCycle: 'Credit demand and interest-rate environment',
        supplyChainRisk: 'Low', aiDemand: 'Moderate'
      },
      patternSignals: [
        { label: 'Historical pattern', description: 'Banks often benefit when rates support wider lending spreads, while AI helps improve operating productivity.' },
        { label: 'Macro theory', description: 'Financial institutions are highly sensitive to the shape of the yield curve and credit conditions, which can dominate fundamentals.' }
      ]
    },
    {
      _id: '12', rank: 12, symbol: 'V', name: 'Visa Inc.', price: 267.34, change: 0.9, founded: 1958,
      headquarters: 'San Mateo, CA', description: 'AI for payment systems', aiProducts: ['Fraud Detection', 'Analytics'],
      metrics: {
        marketCap: 568, revenueTtm: 35.1, revenueGrowth: 9.2, grossMargin: 62.1, operatingMargin: 59.9,
        freeCashFlow: 12.3, debtToEquity: 0.52, currentRatio: 1.4, peRatio: 30.1, cashBalance: 11.4, capex: 1.5
      },
      macroContext: {
        inflationSensitivity: 'Low', interestRateSensitivity: 'Low', demandCycle: 'Consumer spend and payment volume',
        supplyChainRisk: 'Low', aiDemand: 'Moderate'
      },
      patternSignals: [
        { label: 'Historical pattern', description: 'Payment networks typically perform well when consumer spending remains resilient, even if AI adds incremental operating efficiency.' },
        { label: 'Macro theory', description: 'Network effects and recurring transaction fees can make payments businesses less cyclical than consumer retail itself.' }
      ]
    },
    {
      _id: '13', rank: 13, symbol: 'PYPL', name: 'PayPal Holdings', price: 71.45, change: 1.2, founded: 1998,
      headquarters: 'San Jose, CA', description: 'AI for fintech', aiProducts: ['ML Fraud Detection', 'Risk Management'],
      metrics: {
        marketCap: 77, revenueTtm: 31.1, revenueGrowth: 8.3, grossMargin: 86.5, operatingMargin: 18.5,
        freeCashFlow: 4.8, debtToEquity: 0.44, currentRatio: 1.1, peRatio: 19.6, cashBalance: 11.9, capex: 1.0
      },
      macroContext: {
        inflationSensitivity: 'Moderate', interestRateSensitivity: 'Moderate', demandCycle: 'Consumer and merchant transaction volume',
        supplyChainRisk: 'Low', aiDemand: 'Moderate'
      },
      patternSignals: [
        { label: 'Historical pattern', description: 'Payment and fintech names can underperform when consumer spending slows, even if AI helps reduce fraud and improve underwriting.' },
        { label: 'Macro theory', description: 'Higher rates can affect transaction growth and consumer credit availability, which tends to matter more than incremental AI features in the short run.' }
      ]
    },
    {
      _id: '14', rank: 14, symbol: 'ORCL', name: 'Oracle Corporation', price: 142.18, change: 0.7, founded: 1977,
      headquarters: 'Austin, TX', description: 'AI in enterprise databases', aiProducts: ['Oracle AI', 'ML Cloud'],
      metrics: {
        marketCap: 441, revenueTtm: 55.4, revenueGrowth: 11.7, grossMargin: 79.1, operatingMargin: 36.2,
        freeCashFlow: 15.4, debtToEquity: 0.74, currentRatio: 1.6, peRatio: 35.2, cashBalance: 11.9, capex: 4.8
      },
      macroContext: {
        inflationSensitivity: 'Low', interestRateSensitivity: 'Low', demandCycle: 'Enterprise data, security and database spending',
        supplyChainRisk: 'Low', aiDemand: 'High'
      },
      patternSignals: [
        { label: 'Historical pattern', description: 'Enterprise database and cloud providers often see more consistent demand than consumer technology during slower economic periods.' },
        { label: 'Macro theory', description: 'When companies prioritise operational resilience and data governance, durable infrastructure vendors may hold up better than fast-growth software names.' }
      ]
    },
    {
      _id: '15', rank: 15, symbol: 'SHOP', name: 'Shopify', price: 78.6, change: 1.1, founded: 2006,
      headquarters: 'Ottawa, Canada', description: 'AI in commerce and merchant tools', aiProducts: ['Shopify Magic', 'AI Storefront', 'Search'],
      metrics: {
        marketCap: 94, revenueTtm: 9.4, revenueGrowth: 25.7, grossMargin: 51.4, operatingMargin: 15.3,
        freeCashFlow: 2.3, debtToEquity: 0.16, currentRatio: 6.8, peRatio: 46.9, cashBalance: 6.7, capex: 0.8
      },
      macroContext: {
        inflationSensitivity: 'Moderate', interestRateSensitivity: 'Moderate', demandCycle: 'Small business digital commerce',
        supplyChainRisk: 'Low to moderate', aiDemand: 'High'
      },
      patternSignals: [
        { label: 'Historical pattern', description: 'SMB software platforms often benefit from AI features when merchant spending grows and small businesses digitise more operations.' },
        { label: 'Macro theory', description: 'Lower inflation and stable consumer spending can widen adoption, while higher costs can delay investment in new digital tools.' }
      ]
    }
  ];

const opportunityCompaniesRawData = [
    {
      _id: 'opp-1', rank: 1, symbol: 'C3AI', name: 'C3.ai', price: 24.8, change: 2.6, founded: 2009,
      headquarters: 'Redwood City, CA', description: 'Enterprise AI software platform for predictive analytics and industrial applications', aiProducts: ['Enterprise AI Suite', 'Predictive Ops', 'AI Applications'],
      metrics: { marketCap: 4.6, revenueTtm: 0.8, revenueGrowth: 17.4, grossMargin: 63.5, operatingMargin: 0.8, freeCashFlow: 0.1, debtToEquity: 0.51, currentRatio: 2.3, peRatio: 32.5, cashBalance: 0.8, capex: 0.1 },
      macroContext: { inflationSensitivity: 'Low', interestRateSensitivity: 'Moderate', demandCycle: 'Enterprise AI deployment and industrial automation', supplyChainRisk: 'Low', aiDemand: 'High' },
      patternSignals: [{ label: 'Historical pattern', description: 'Enterprise AI software names often benefit when pilots mature into production deployments across operations and analytics teams.' }, { label: 'Macro theory', description: 'As AI becomes a productivity tool rather than a theoretical concept, adoption tends to follow operational ROI and lower-risk use cases.' }]
    },
    {
      _id: 'opp-2', rank: 2, symbol: 'PATH', name: 'UiPath', price: 18.4, change: 1.2, founded: 2005,
      headquarters: 'New York, NY', description: 'Automation platform using AI to streamline enterprise workflows', aiProducts: ['Automation Cloud', 'AI Copilot', 'Document Understanding'],
      metrics: { marketCap: 8.2, revenueTtm: 1.5, revenueGrowth: 8.1, grossMargin: 83.1, operatingMargin: 7.4, freeCashFlow: 0.6, debtToEquity: 0.18, currentRatio: 2.1, peRatio: 29.6, cashBalance: 1.2, capex: 0.1 },
      macroContext: { inflationSensitivity: 'Low', interestRateSensitivity: 'Moderate', demandCycle: 'Workflow automation and digital operations', supplyChainRisk: 'Low', aiDemand: 'High' },
      patternSignals: [{ label: 'Historical pattern', description: 'Automation platforms often gain as businesses seek productivity gains without large hiring or restructuring programs.' }, { label: 'Macro theory', description: 'When labour costs rise and operational complexity grows, workflow automation becomes a scaling lever rather than a discretionary investment.' }]
    },
    {
      _id: 'opp-3', rank: 3, symbol: 'SOUN', name: 'SoundHound AI', price: 8.95, change: 4.3, founded: 2005,
      headquarters: 'Santa Clara, CA', description: 'Voice AI and conversational intelligence platform', aiProducts: ['Voice AI', 'Speech Recognition', 'Agentic Commerce'],
      metrics: { marketCap: 3.1, revenueTtm: 0.2, revenueGrowth: 35.8, grossMargin: 47.2, operatingMargin: -19.2, freeCashFlow: -0.1, debtToEquity: 0.18, currentRatio: 2.8, peRatio: 42.7, cashBalance: 0.3, capex: 0.1 },
      macroContext: { inflationSensitivity: 'Low', interestRateSensitivity: 'Moderate', demandCycle: 'Voice commerce and customer service automation', supplyChainRisk: 'Low', aiDemand: 'Very high' },
      patternSignals: [{ label: 'Historical pattern', description: 'Voice AI businesses often undergo sharp reratings when the market identifies a large addressable use-case and early commercial traction.' }, { label: 'Macro theory', description: 'When AI makes customer interaction cheaper and more scalable, early movers in voice and conversational systems can see rapid adoption curves.' }]
    },
    {
      _id: 'opp-4', rank: 4, symbol: 'BBAI', name: 'BigBear.ai', price: 5.18, change: 2.1, founded: 2019,
      headquarters: 'Columbia, MD', description: 'AI analytics and decision-support software for government and enterprise use cases', aiProducts: ['AI Decision Intelligence', 'Data Fusion', 'Predictive Analytics'],
      metrics: { marketCap: 1.1, revenueTtm: 0.2, revenueGrowth: 22.7, grossMargin: 32.4, operatingMargin: -11.5, freeCashFlow: -0.1, debtToEquity: 0.25, currentRatio: 1.8, peRatio: 38.6, cashBalance: 0.2, capex: 0.0 },
      macroContext: { inflationSensitivity: 'Low', interestRateSensitivity: 'Moderate', demandCycle: 'Government AI security and decision support', supplyChainRisk: 'Low', aiDemand: 'Moderate' },
      patternSignals: [{ label: 'Historical pattern', description: 'Government and defense-linked AI providers can see distinct demand waves when agencies accelerate digital transformation programs.' }, { label: 'Macro theory', description: 'Public-sector procurement often trails private adoption, but once budgets unlock, the resulting contracts can create sustained demand.' }]
    },
    {
      _id: 'opp-5', rank: 5, symbol: 'APP', name: 'AppLovin', price: 282.5, change: 1.7, founded: 2012,
      headquarters: 'Palo Alto, CA', description: 'AI-driven mobile advertising and software platform', aiProducts: ['AXON', 'AdTech AI', 'Consumer Apps'],
      metrics: { marketCap: 117, revenueTtm: 4.8, revenueGrowth: 22.1, grossMargin: 74.9, operatingMargin: 36.4, freeCashFlow: 2.6, debtToEquity: 0.13, currentRatio: 3.2, peRatio: 41.2, cashBalance: 3.4, capex: 0.5 },
      macroContext: { inflationSensitivity: 'Low', interestRateSensitivity: 'Moderate', demandCycle: 'Digital ads and app monetisation', supplyChainRisk: 'Low', aiDemand: 'High' },
      patternSignals: [{ label: 'Historical pattern', description: 'AI-driven ad-tech businesses often re-rate sharply when their algorithms improve monetisation and monetisable engagement.' }, { label: 'Macro theory', description: 'The most scalable ad platforms benefit when AI lifts conversion efficiency faster than ad spend expands.' }]
    },
    {
      _id: 'opp-6', rank: 6, symbol: 'PD', name: 'PagerDuty', price: 21.6, change: 0.9, founded: 2009,
      headquarters: 'San Francisco, CA', description: 'AI-enabled incident response and digital operations platform', aiProducts: ['AIOps', 'Ops Cloud', 'Incident Intelligence'],
      metrics: { marketCap: 2.8, revenueTtm: 0.6, revenueGrowth: 10.4, grossMargin: 78.7, operatingMargin: 6.5, freeCashFlow: 0.2, debtToEquity: 0.15, currentRatio: 2.4, peRatio: 28.1, cashBalance: 0.8, capex: 0.1 },
      macroContext: { inflationSensitivity: 'Low', interestRateSensitivity: 'Moderate', demandCycle: 'IT resilience and operational tooling', supplyChainRisk: 'Low', aiDemand: 'Moderate' },
      patternSignals: [{ label: 'Historical pattern', description: 'Operations software often gains from increased automation and resilience budgets during uncertain macro periods.' }, { label: 'Macro theory', description: 'The value of digital operations tools tends to rise when organisations focus on uptime and risk reduction instead of pure growth spending.' }]
    },
    {
      _id: 'opp-7', rank: 7, symbol: 'UPST', name: 'Upstart', price: 52.1, change: 2.4, founded: 2012,
      headquarters: 'San Mateo, CA', description: 'AI lending platform for consumer credit decisions', aiProducts: ['AI Lending Model', 'Banking Analytics', 'Risk Assessment'],
      metrics: { marketCap: 5.9, revenueTtm: 1.1, revenueGrowth: 13.4, grossMargin: 65.1, operatingMargin: 0.4, freeCashFlow: 0.2, debtToEquity: 1.1, currentRatio: 1.3, peRatio: 26.7, cashBalance: 0.9, capex: 0.1 },
      macroContext: { inflationSensitivity: 'Moderate', interestRateSensitivity: 'High', demandCycle: 'Consumer credit and AI risk underwriting', supplyChainRisk: 'Moderate', aiDemand: 'High' },
      patternSignals: [{ label: 'Historical pattern', description: 'Fintech models with AI underwriting can be highly sensitive to rates and credit conditions, but can re-rate when borrowing demand stabilises.' }, { label: 'Macro theory', description: 'AI improves underwriting precision, but macro credit conditions often remain the dominant driver of near-term performance.' }]
    },
    {
      _id: 'opp-8', rank: 8, symbol: 'S', name: 'SentinelOne', price: 28.4, change: 1.6, founded: 2013,
      headquarters: 'Mountain View, CA', description: 'AI-driven endpoint security and threat detection platform', aiProducts: ['Singularity', 'XDR', 'Autonomous Security'],
      metrics: { marketCap: 9.7, revenueTtm: 0.8, revenueGrowth: 29.4, grossMargin: 77.1, operatingMargin: 6.3, freeCashFlow: 0.3, debtToEquity: 0.1, currentRatio: 1.9, peRatio: 45.2, cashBalance: 1.0, capex: 0.1 },
      macroContext: { inflationSensitivity: 'Low', interestRateSensitivity: 'Moderate', demandCycle: 'Cybersecurity and autonomous protection', supplyChainRisk: 'Low', aiDemand: 'Very high' },
      patternSignals: [{ label: 'Historical pattern', description: 'Cybersecurity vendors with AI automation often perform strongly when enterprises prioritise breach prevention and operational resilience.' }, { label: 'Macro theory', description: 'Defensive infrastructure is often more resilient in uncertain markets because the cost of an incident exceeds the cost of prevention.' }]
    },
    {
      _id: 'opp-9', rank: 9, symbol: 'MDB', name: 'MongoDB', price: 315.0, change: 1.3, founded: 2007,
      headquarters: 'New York, NY', description: 'Database platform for modern application workloads', aiProducts: ['Atlas AI', 'Search', 'Data Platform'],
      metrics: { marketCap: 31, revenueTtm: 1.7, revenueGrowth: 18.2, grossMargin: 81.4, operatingMargin: 5.6, freeCashFlow: 0.5, debtToEquity: 0.02, currentRatio: 5.7, peRatio: 54.4, cashBalance: 1.6, capex: 0.2 },
      macroContext: { inflationSensitivity: 'Low', interestRateSensitivity: 'Moderate', demandCycle: 'Developer tooling and app modernization', supplyChainRisk: 'Low', aiDemand: 'High' },
      patternSignals: [{ label: 'Historical pattern', description: 'Developer tooling platforms often benefit when application modernization accelerates under digital transformation programs.' }, { label: 'Macro theory', description: 'Infrastructure software with recurring usage tends to reward adoption efficiency more than incremental GDP growth.' }]
    },
    {
      _id: 'opp-10', rank: 10, symbol: 'DDOG', name: 'Datadog', price: 119.8, change: 0.8, founded: 2010,
      headquarters: 'New York, NY', description: 'Monitoring and observability for cloud-native systems', aiProducts: ['AI Observability', 'Security', 'Monitoring'],
      metrics: { marketCap: 48, revenueTtm: 2.8, revenueGrowth: 24.3, grossMargin: 79.1, operatingMargin: 18.1, freeCashFlow: 0.9, debtToEquity: 0.03, currentRatio: 2.0, peRatio: 45.5, cashBalance: 2.2, capex: 0.3 },
      macroContext: { inflationSensitivity: 'Low', interestRateSensitivity: 'Moderate', demandCycle: 'Cloud operations and reliability spend', supplyChainRisk: 'Low', aiDemand: 'Very high' },
      patternSignals: [{ label: 'Historical pattern', description: 'Monitoring and observability firms perform well when digital infrastructure complexity rises faster than traditional IT budgets.' }, { label: 'Macro theory', description: 'As cloud complexity grows, observability becomes a core operational cost rather than discretionary software spend.' }]
    }
  ];

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
import watchlistRoutes from './routes/watchlist.js';
import authRoutes from './routes/auth.js';

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Make db available to routes
app.use((req, res, next) => {
  req.db = db;
  next();
});

console.log('✓ In-memory database initialized with 20 AI companies');

// Routes
app.use('/api/companies', companiesRoutes);
app.use('/api/prices', pricesRoutes);
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

const syncDatabasePrices = () => {
  [...db.companies, ...db.opportunityCompanies].forEach(company => {
    const history = pricesCache[company.symbol] || [];
    const refreshedCompany = enrichCompanyAccounting(company, history);
    Object.assign(company, refreshedCompany);
    const refreshError = priceDataService.getLatestPriceErrors()[company.symbol];
    if (refreshError && history.length > 0) {
      company.marketData.dataStatus = 'stale';
      company.marketData.lastError = refreshError;
    }
  });
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

  // Step 3: Schedule daily refresh
  scheduleDailyRefresh();

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
  
✓ Live price updates use the daily Twelve Data refresh
✓ WebSocket connection active on port ${PORT}
✓ Real price data loaded: ${db.companies.length} companies with historical prices

Ready to connect frontend at http://localhost:5173
  `);
  });
})();

export default app;
