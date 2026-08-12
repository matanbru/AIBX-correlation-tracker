import mongoose from 'mongoose';
import axios from 'axios';
import dotenv from 'dotenv';
import Company from '../models/Company.js';
import Price from '../models/Price.js';

dotenv.config();

// Mock price data for demo purposes
const mockPrices = {
  'NVDA': { price: 445.23, change: 2.5, high: 448.50, low: 442.10 },
  'MSFT': { price: 378.91, change: 1.2, high: 380.00, low: 377.50 },
  'GOOGL': { price: 138.42, change: -0.8, high: 139.50, low: 137.80 },
  'AMZN': { price: 178.32, change: 0.5, high: 179.00, low: 177.80 },
  'META': { price: 345.67, change: 1.8, high: 347.20, low: 343.50 },
  'TSLA': { price: 267.89, change: 2.1, high: 270.00, low: 266.50 },
  'JPM': { price: 184.52, change: 0.3, high: 185.00, low: 183.80 },
  'V': { price: 267.34, change: 0.9, high: 268.50, low: 266.20 },
  'PYPL': { price: 71.45, change: 1.2, high: 72.00, low: 71.00 },
  'ORCL': { price: 142.18, change: 0.7, high: 143.00, low: 141.50 }
};

async function fetchPrices() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-stock-tracker');
    console.log('Connected to MongoDB');

    const companies = await Company.find();
    console.log(`Found ${companies.length} companies`);

    for (const company of companies) {
      try {
        const mockData = mockPrices[company.symbol] || {
          price: Math.random() * 500 + 50,
          change: (Math.random() - 0.5) * 5,
          high: 0,
          low: 0
        };

        const priceData = new Price({
          companyId: company._id,
          symbol: company.symbol,
          price: mockData.price,
          close: mockData.price,
          high: mockData.high || mockData.price * 1.02,
          low: mockData.low || mockData.price * 0.98,
          changePercent: mockData.change,
          volume: Math.floor(Math.random() * 100000000)
        });

        await priceData.save();
        console.log(`Updated price for ${company.symbol}: $${mockData.price.toFixed(2)}`);
      } catch (error) {
        console.error(`Error processing ${company.symbol}:`, error.message);
      }
    }

    console.log('Price fetch completed!');
  } catch (error) {
    console.error('Fetch error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

fetchPrices();
