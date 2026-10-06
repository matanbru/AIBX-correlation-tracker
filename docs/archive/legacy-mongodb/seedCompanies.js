import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Company from '../models/Company.js';

dotenv.config();

const topAICompanies = [
  {
    rank: 1,
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    sector: 'AI Development',
    founded: 1993,
    headquarters: 'Santa Clara, California',
    website: 'https://www.nvidia.com',
    description: 'Leading AI chip manufacturer',
    aiProducts: ['CUDA', 'GPUs', 'AI Infrastructure']
  },
  {
    rank: 2,
    symbol: 'MSFT',
    name: 'Microsoft',
    sector: 'AI Development',
    founded: 1975,
    headquarters: 'Redmond, Washington',
    website: 'https://www.microsoft.com',
    description: 'AI integration in enterprise software',
    aiProducts: ['Copilot', 'Azure AI', 'ChatGPT Integration']
  },
  {
    rank: 3,
    symbol: 'GOOGL',
    name: 'Alphabet (Google)',
    sector: 'AI Development',
    founded: 1998,
    headquarters: 'Mountain View, California',
    website: 'https://www.google.com',
    description: 'AI research and development',
    aiProducts: ['Gemini', 'Bard', 'TensorFlow']
  },
  {
    rank: 4,
    symbol: 'AMZN',
    name: 'Amazon',
    sector: 'AI Development',
    founded: 1994,
    headquarters: 'Seattle, Washington',
    website: 'https://www.amazon.com',
    description: 'AI for cloud and retail',
    aiProducts: ['AWS AI', 'Alexa', 'Machine Learning Services']
  },
  {
    rank: 5,
    symbol: 'META',
    name: 'Meta Platforms',
    sector: 'AI Development',
    founded: 2004,
    headquarters: 'Menlo Park, California',
    website: 'https://www.meta.com',
    description: 'AI for social media and metaverse',
    aiProducts: ['Llama', 'Content AI', 'Recommendation Systems']
  },
  {
    rank: 6,
    symbol: 'TSLA',
    name: 'Tesla',
    sector: 'AI Development',
    founded: 2003,
    headquarters: 'Austin, Texas',
    website: 'https://www.tesla.com',
    description: 'AI for autonomous vehicles',
    aiProducts: ['Autopilot', 'Neural Networks', 'Dojo']
  },
  {
    rank: 7,
    symbol: 'JPM',
    name: 'JPMorgan Chase',
    sector: 'AI Development',
    founded: 1799,
    headquarters: 'New York, New York',
    website: 'https://www.jpmorganchase.com',
    description: 'AI for finance',
    aiProducts: ['COIN', 'Machine Learning Platforms']
  },
  {
    rank: 8,
    symbol: 'V',
    name: 'Visa Inc.',
    sector: 'AI Development',
    founded: 1958,
    headquarters: 'San Mateo, California',
    website: 'https://www.visa.com',
    description: 'AI for payment systems',
    aiProducts: ['Fraud Detection AI', 'Analytics']
  },
  {
    rank: 9,
    symbol: 'PYPL',
    name: 'PayPal Holdings',
    sector: 'AI Development',
    founded: 1998,
    headquarters: 'San Jose, California',
    website: 'https://www.paypal.com',
    description: 'AI for fintech',
    aiProducts: ['ML Fraud Detection', 'Risk Management']
  },
  {
    rank: 10,
    symbol: 'ORCL',
    name: 'Oracle Corporation',
    sector: 'AI Development',
    founded: 1977,
    headquarters: 'Austin, Texas',
    website: 'https://www.oracle.com',
    description: 'AI in enterprise databases',
    aiProducts: ['Oracle AI', 'Machine Learning Cloud']
  }
];

async function seedCompanies() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-stock-tracker');
    console.log('Connected to MongoDB');

    // Clear existing companies
    await Company.deleteMany({});
    console.log('Cleared existing companies');

    // Insert companies
    const inserted = await Company.insertMany(topAICompanies);
    console.log(`Inserted ${inserted.length} companies`);

    console.log('Seed completed successfully!');
  } catch (error) {
    console.error('Seed error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

seedCompanies();
