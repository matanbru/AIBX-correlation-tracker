# 🚀 AI Stock Tracker - No Database Setup

Everything is **ready to run**! No MongoDB, no installation needed beyond Node.js.

## ⚡ Quick Start (2 Commands)

### Terminal 1: Start Backend
```powershell
cd "c:\Users\student\Desktop\Ideas\ai-stock-tracker\backend"
npm run dev
```

**Expected output:**
```
╔════════════════════════════════════════════════════╗
║   🤖 AI Stock Tracker - Backend Server Started     ║
╚════════════════════════════════════════════════════╝

✓ Server running on http://localhost:5000
✓ Live price updates enabled (every 5 seconds)
✓ WebSocket connection active
```

### Terminal 2: Start Frontend
```powershell
cd "c:\Users\student\Desktop\Ideas\ai-stock-tracker\frontend"
npm run dev
```

**Expected output:**
```
Local:   http://localhost:5173
```

Browser will **open automatically** at http://localhost:5173 🎉

---

## 🎯 What's Happening

### Backend (Node.js + Express)
- ✅ 10 AI companies loaded in memory
- ✅ API endpoints ready (`/api/companies`, `/api/prices`, etc.)
- ✅ **Live price updates every 5 seconds** via WebSocket
- ✅ Prices fluctuate randomly (-2% to +2% each update)
- ✅ No database needed - all data in RAM

### Frontend (React + Vite)
- ✅ Connects to backend via WebSocket
- ✅ Receives live price updates
- ✅ Real-time price changes displayed immediately
- ✅ Interactive charts, search, watchlist features

---

## 📊 Live Features

### Real-Time Updates
Watch prices change **every 5 seconds**:
- Green = Price UP
- Red = Price DOWN
- Percentage changes calculated live

### Company List
Browse 10 AI companies:
1. NVIDIA (NVDA)
2. Microsoft (MSFT)
3. Alphabet/Google (GOOGL)
4. Amazon (AMZN)
5. Meta (META)
6. Tesla (TSLA)
7. JPMorgan Chase (JPM)
8. Visa (V)
9. PayPal (PYPL)
10. Oracle (ORCL)

### Search & Filter
Type in search bar to filter companies instantly

### Price Charts
Click company to see 30-day historical price trends

### Top Gainers/Losers
View companies with biggest price changes

### Watchlist
Add/remove companies to personal watchlist

---

## 🔌 API Endpoints

All available at `http://localhost:5000/api/`:

```
GET    /companies              - List all companies
GET    /companies/:id          - Get company details
GET    /prices/current         - Get latest prices
GET    /prices/:symbol/history - Get price history
GET    /prices/gainers/top     - Top gainers
GET    /prices/losers/top      - Top losers
POST   /auth/register          - Create account
POST   /auth/login             - Login
```

---

## 🆘 Troubleshooting

**❌ Frontend can't connect to backend:**
- Make sure backend is running first (`npm run dev` in backend folder)
- Check that port 5000 is not blocked

**❌ Port already in use:**
- Stop other processes or change port in `.env`

**❌ npm install fails:**
- Run `npm cache clean --force`
- Delete `node_modules` folder
- Run `npm install` again

---

## 🎬 How It Works

```
┌─────────────────────┐
│  Frontend (React)   │
│  Port: 5173        │
│ ┌─────────────────┐ │
│ │ Live Prices     │ │
│ │ Charts          │ │
│ │ Watchlist       │ │
│ └────────┬────────┘ │
└────────┬─────────────┘
         │ WebSocket
         │ (Real-time updates)
         │
┌────────┴─────────────┐
│ Backend (Node.js)   │
│ Port: 5000          │
│ ┌─────────────────┐ │
│ │ Companies Data  │ │
│ │ Price Updates   │ │
│ │ Live Events     │ │
│ └─────────────────┘ │
└─────────────────────┘
```

**Every 5 seconds:**
1. Backend updates all prices randomly
2. Backend broadcasts new prices via WebSocket
3. Frontend receives update
4. Frontend displays new prices instantly
5. User sees real-time price changes

---

## ✨ Features Currently Working

✅ **Live Price Updates** - Prices change every 5 seconds
✅ **Real-Time Charts** - See price history and trends
✅ **Search** - Find companies by name or symbol
✅ **Top Gainers/Losers** - View market leaders/losers
✅ **Company Details** - Full company information
✅ **Watchlist** - Add/remove favorites (in memory)
✅ **Responsive Design** - Works on desktop & mobile

---

## 🚀 Future Enhancements

- Add real stock data API (Alpha Vantage, IEX)
- Persistent database (MongoDB Atlas)
- User authentication & accounts
- Email price alerts
- Advanced analytics
- Mobile app

---

## 📝 Notes

- Data resets when backend stops (in-memory storage)
- Prices are simulated (random fluctuations)
- To persist data, add MongoDB later
- To use real prices, add stock API key later

---

**Ready to go!** Start both servers and watch the prices flow! 📈📉
