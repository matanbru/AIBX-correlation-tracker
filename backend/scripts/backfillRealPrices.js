import dotenv from 'dotenv';
import priceDataService from '../services/priceDataService.js';

dotenv.config();

const tickers = [
  'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AMD', 'CRM', 'SAP', 'IBM',
  'JPM', 'V', 'PYPL', 'ORCL', 'SHOP', 'C3AI', 'PATH', 'SOUN', 'BBAI', 'APP',
  'PD', 'UPST', 'S', 'MDB', 'DDOG'
];

try {
  const prices = await priceDataService.backfillPrices(tickers);
  const completed = tickers.filter(symbol => Array.isArray(prices[symbol]) && prices[symbol].length > 0);
  const missing = tickers.filter(symbol => !completed.includes(symbol));

  console.log(`\nReal-price backfill finished: ${completed.length}/${tickers.length} companies.`);
  if (missing.length > 0) {
    console.log(`Still unavailable: ${missing.join(', ')}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`\nReal-price backfill failed: ${error.message}`);
  process.exitCode = 1;
}
