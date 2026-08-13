import dotenv from 'dotenv';
import fundamentalsDataService from '../services/secFundamentalsDataService.js';

dotenv.config();

const tickers = [
  'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AMD', 'CRM', 'SAP', 'IBM',
  'JPM', 'V', 'PYPL', 'ORCL', 'SHOP', 'C3AI', 'PATH', 'SOUN', 'BBAI', 'APP',
  'PD', 'UPST', 'S', 'MDB', 'DDOG'
];

const fundamentals = await fundamentalsDataService.backfillFundamentals(tickers);
const completed = tickers.filter(symbol => (
  fundamentals[symbol]?.incomeStatement?.length || fundamentals[symbol]?.balanceSheet?.length
));

console.log(`Real fundamentals backfill finished: ${completed.length}/${tickers.length} companies.`);
if (completed.length !== tickers.length) process.exitCode = 1;