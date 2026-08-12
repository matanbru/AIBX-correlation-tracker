import mongoose from 'mongoose';

const priceSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  symbol: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  open: Number,
  high: Number,
  low: Number,
  close: Number,
  volume: Number,
  previousClose: Number,
  change: Number,
  changePercent: Number,
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Create compound index for efficient queries
priceSchema.index({ symbol: 1, timestamp: -1 });

export default mongoose.model('Price', priceSchema);
