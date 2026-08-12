# AI Stock Tracker Platform

A full-stack web application that tracks share prices of the top 100 companies in AI development. Features real-time price updates, comprehensive company information, price history charts, and personalized watchlists.

## 📋 Features

- **Company Directory**: Browse and search 100+ leading AI development companies
- **Real-Time Prices**: Live stock price updates via WebSocket
- **Price History Charts**: 30-day price trends with high/low indicators
- **Top Movers**: View daily top gainers and losers
- **Watchlist**: Create personalized watchlists with price alerts
- **User Authentication**: Secure login and registration
- **Responsive Design**: Works seamlessly on desktop and mobile devices

## 🏗️ Project Structure

```
ai-stock-tracker/
├── backend/                 # Node.js/Express backend
│   ├── models/             # MongoDB schemas
│   ├── routes/             # API endpoints
│   ├── scripts/            # Data seeding and fetching
│   ├── index.js           # Main server file
│   ├── package.json       # Backend dependencies
│   └── .env.example       # Environment variables template
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── App.jsx       # Main app component
│   │   ├── App.css       # Styling
│   │   └── main.jsx      # Entry point
│   ├── index.html        # HTML template
│   ├── vite.config.js    # Vite configuration
│   ├── package.json      # Frontend dependencies
│   └── .env.example      # Environment variables template
└── README.md             # This file
```

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v16 or higher)
- **MongoDB** (local or Atlas)
- **npm** or **yarn**

### 1. Setup Backend

```bash
cd backend
npm install
```

Create a `.env` file based on `.env.example`:
```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/ai-stock-tracker
JWT_SECRET=your-secret-key-change-in-production
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

Seed the database with AI companies:
```bash
npm run seed
```

Fetch initial price data:
```bash
npm run fetch-prices
```

Start the backend server:
```bash
npm run dev
```

The backend will be available at `http://localhost:5000`

### 2. Setup Frontend

```bash
cd frontend
npm install
```

Create a `.env` file based on `.env.example`:
```
VITE_API_URL=http://localhost:5000/api
```

Start the development server:
```bash
npm run dev
```

The frontend will open at `http://localhost:5173`

## 📡 API Endpoints

### Companies
- `GET /api/companies` - Get all companies (paginated)
- `GET /api/companies/:id` - Get company by ID
- `GET /api/companies/symbol/:symbol` - Get company by stock symbol
- `GET /api/companies/search/:query` - Search companies
- `POST /api/companies` - Create company (admin)
- `PUT /api/companies/:id` - Update company (admin)

### Prices
- `GET /api/prices/current` - Get latest prices for all companies
- `GET /api/prices/:symbol/latest` - Get latest price for a company
- `GET /api/prices/:symbol/history?days=30` - Get price history
- `GET /api/prices/gainers/top?limit=10` - Get top gainers
- `GET /api/prices/losers/top?limit=10` - Get top losers
- `POST /api/prices` - Add/update price (backend job)

### Watchlist
- `GET /api/watchlist/:userId` - Get user's watchlist
- `POST /api/watchlist/:userId/add` - Add company to watchlist
- `POST /api/watchlist/:userId/remove` - Remove company from watchlist
- `PUT /api/watchlist/:userId/notifications` - Update notification settings

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

## 🔌 WebSocket Events

Real-time price updates are available via Socket.IO:

```javascript
// Client-side
import io from 'socket.io-client';

const socket = io('http://localhost:5000');

// Subscribe to price updates
socket.emit('subscribe-prices', ['NVDA', 'MSFT', 'GOOGL']);

// Listen for updates
socket.on('price-update', (data) => {
  console.log(`${data.symbol}: $${data.price}`);
});
```

## 📊 Database Schema

### Company
```javascript
{
  symbol: String (unique),
  name: String,
  sector: String,
  description: String,
  founded: Number,
  headquarters: String,
  website: String,
  logo: String,
  rank: Number,
  aiProducts: [String]
}
```

### Price
```javascript
{
  companyId: ObjectId,
  symbol: String,
  price: Number,
  open: Number,
  high: Number,
  low: Number,
  close: Number,
  volume: Number,
  changePercent: Number,
  timestamp: Date
}
```

### User
```javascript
{
  username: String (unique),
  email: String (unique),
  password: String (hashed),
  createdAt: Date
}
```

### Watchlist
```javascript
{
  userId: ObjectId,
  companies: [{
    companyId: ObjectId,
    symbol: String,
    addedAt: Date
  }],
  notifications: {
    enabled: Boolean,
    priceThreshold: Number,
    emailNotifications: Boolean
  }
}
```

## 🔧 Environment Variables

### Backend (.env)
```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/ai-stock-tracker
JWT_SECRET=your-secret-key-here
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
ALPHA_VANTAGE_API_KEY=optional-for-real-data
IEX_API_KEY=optional-for-real-data
```

### Frontend (.env)
```
VITE_API_URL=http://localhost:5000/api
```

## 🚀 Deployment

### Frontend Deployment (Vercel, Netlify)
```bash
cd frontend
npm run build
# Deploy the 'dist' folder
```

### Backend Deployment (Heroku, Render)
```bash
cd backend
npm install
# Set environment variables on platform
# Push to platform
```

## 📝 Future Enhancements

- [ ] Integration with real stock price APIs (Alpha Vantage, IEX Cloud)
- [ ] Email and push notifications for price alerts
- [ ] Advanced filtering and sorting options
- [ ] Portfolio tracking and performance analytics
- [ ] Social features (sharing watchlists, comments)
- [ ] Historical comparison tools
- [ ] Machine learning price predictions
- [ ] Mobile app (React Native)

## 🤝 Contributing

Feel free to fork this project and submit pull requests for any improvements.

## 📄 License

MIT License - see LICENSE file for details

## 📧 Support

For issues, questions, or suggestions, please open an issue on GitHub.

---

**Last Updated**: August 2024
