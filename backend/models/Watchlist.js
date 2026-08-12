import mongoose from 'mongoose';

const watchlistSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  companies: [{
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company'
    },
    symbol: String,
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  notifications: {
    enabled: {
      type: Boolean,
      default: true
    },
    priceThreshold: Number, // Alert when price changes by X%
    emailNotifications: Boolean
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('Watchlist', watchlistSchema);
