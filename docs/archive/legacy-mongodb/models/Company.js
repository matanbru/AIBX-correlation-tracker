import mongoose from 'mongoose';

const companySchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  name: {
    type: String,
    required: true
  },
  sector: {
    type: String,
    default: 'AI Development'
  },
  description: String,
  founded: Number,
  headquarters: String,
  website: String,
  logo: String,
  marketCap: Number,
  employees: Number,
  aiProducts: [String],
  rank: Number, // Rank among top 100 AI companies
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('Company', companySchema);
