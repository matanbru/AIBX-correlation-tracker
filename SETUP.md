# AI Stock Tracker - Quick Start Guide

## 🎯 One-Command Setup

### For Windows Users (PowerShell)

```powershell
# Backend setup
cd backend
npm install
cp .env.example .env
npm run seed
npm run fetch-prices
npm run dev

# In another terminal, Frontend setup
cd frontend
npm install
cp .env.example .env
npm run dev
```

### For Mac/Linux Users

```bash
# Backend setup
cd backend
npm install
cp .env.example .env
npm run seed
npm run fetch-prices
npm run dev

# In another terminal, Frontend setup
cd frontend
npm install
cp .env.example .env
npm run dev
```

## 📋 Pre-requisites Checklist

- [ ] Node.js v16+ installed (`node --version`)
- [ ] MongoDB installed locally OR MongoDB Atlas account
- [ ] npm installed (`npm --version`)
- [ ] Port 5000 is available (backend)
- [ ] Port 5173 is available (frontend)

## 🚀 Detailed Setup Steps

### Step 1: Start MongoDB

**Local MongoDB:**
```bash
# Windows
mongod

# Mac (if installed via Homebrew)
brew services start mongodb-community

# Linux
sudo systemctl start mongod
```

**Or use MongoDB Atlas** (cloud):
1. Create account at https://www.mongodb.com/cloud/atlas
2. Create a cluster and get connection string
3. Update `MONGODB_URI` in `backend/.env`

### Step 2: Backend Setup

```bash
cd ai-stock-tracker/backend
npm install
```

Create `backend/.env`:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/ai-stock-tracker
JWT_SECRET=your-secret-key-change-in-production
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

**Seed initial data:**
```bash
npm run seed           # Loads 10 AI companies
npm run fetch-prices  # Adds mock price data
```

**Start server:**
```bash
npm run dev
```

You should see: `Server running on http://localhost:5000`

### Step 3: Frontend Setup

In a new terminal:
```bash
cd ai-stock-tracker/frontend
npm install
```

Create `frontend/.env`:
```env
VITE_API_URL=http://localhost:5000/api
```

**Start dev server:**
```bash
npm run dev
```

The app will open automatically at `http://localhost:5173`

## ✅ Verify Setup

1. **Backend Health Check**: Visit http://localhost:5000/api/health
   Should return: `{"status":"OK","timestamp":"..."}`

2. **Companies Endpoint**: Visit http://localhost:5000/api/companies
   Should return JSON array of companies

3. **Frontend**: http://localhost:5173
   Should show "AI Stock Tracker" with company list

## 🔧 Troubleshooting

### MongoDB Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:27017
```
**Solution**: Start MongoDB service
- Windows: `mongod` in PowerShell
- Mac: `brew services start mongodb-community`

### Port Already in Use
```
Error: listen EADDRINUSE :::5000
```
**Solution**: Kill process or use different port
```bash
# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Mac/Linux
lsof -i :5000
kill -9 <PID>
```

### CORS Errors
Check that `CORS_ORIGIN` in `backend/.env` matches frontend URL

### npm install issues
Try clearing npm cache:
```bash
npm cache clean --force
rm -rf node_modules
npm install
```

## 📱 Features to Try

1. **Search Companies**: Type "NVDA" in search bar
2. **View Details**: Click on company name to see charts
3. **Top Gainers**: Click "Top Gainers" tab
4. **Create Watchlist**: (Login required - feature in progress)

## 🔗 API Testing

Use Postman or curl:

```bash
# Get all companies
curl http://localhost:5000/api/companies

# Get company by symbol
curl http://localhost:5000/api/companies/symbol/NVDA

# Get latest prices
curl http://localhost:5000/api/prices/current

# Get price history
curl http://localhost:5000/api/prices/NVDA/history?days=30

# Top gainers
curl http://localhost:5000/api/prices/gainers/top

# Register user
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"user1","email":"user@example.com","password":"password123"}'
```

## 📚 Documentation

- [Full README](./README.md)
- API Endpoints: See README.md - "📡 API Endpoints" section
- Database Schema: See README.md - "📊 Database Schema" section

## 🎓 Learning Resources

- Express.js: https://expressjs.com/
- MongoDB: https://docs.mongodb.com/
- React: https://react.dev/
- Vite: https://vitejs.dev/

## 🚀 Next Steps

1. ✅ Explore the codebase
2. ✅ Customize company data in `scripts/seedCompanies.js`
3. ✅ Add real stock API integration
4. ✅ Deploy to production

Happy tracking! 🚀
