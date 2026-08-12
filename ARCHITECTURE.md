# AI Stock Tracker - Project Tree & Architecture

## 📦 Complete Project Structure

```
ai-stock-tracker/
│
├── 📄 README.md                 # Comprehensive project documentation
├── 📄 SETUP.md                  # Quick start and troubleshooting guide
├── 📄 .gitignore                # Git ignore rules
│
├── 📁 backend/                  # Node.js/Express API Server
│   │
│   ├── 📄 index.js              # Main server entry point
│   ├── 📄 package.json          # Dependencies & scripts
│   ├── 📄 .env.example          # Environment template
│   │
│   ├── 📁 models/               # MongoDB Schemas
│   │   ├── Company.js           # Company information & AI ranking
│   │   ├── Price.js             # Historical price data
│   │   ├── User.js              # User accounts
│   │   └── Watchlist.js         # User watchlists
│   │
│   ├── 📁 routes/               # API Endpoints
│   │   ├── companies.js         # Company CRUD operations
│   │   ├── prices.js            # Price data & analytics
│   │   ├── watchlist.js         # Watchlist management
│   │   └── auth.js              # User authentication
│   │
│   └── 📁 scripts/              # Data Management
│       ├── seedCompanies.js     # Load initial AI companies
│       └── fetchPrices.js       # Update stock prices
│
└── 📁 frontend/                 # React + Vite Frontend
    │
    ├── 📄 index.html            # HTML template
    ├── 📄 package.json          # Dependencies & scripts
    ├── 📄 vite.config.js        # Build configuration
    ├── 📄 .env.example          # Environment template
    │
    └── 📁 src/                  # React Application
        │
        ├── 📄 main.jsx          # React entry point
        ├── 📄 App.jsx           # Main component & routing
        ├── 📄 App.css           # Global styles
        │
        └── 📁 components/       # Reusable Components
            ├── SearchBar.jsx    # Company search
            ├── CompanyTable.jsx # Companies listing with prices
            ├── PriceChart.jsx   # Price trend visualization
            └── TopMovers.jsx    # Top gainers/losers
```

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                      │
│              http://localhost:5173                       │
│  ┌──────────────────────────────────────────────────┐   │
│  │  App.jsx (Main Component)                        │   │
│  │  ├─ SearchBar (Find companies)                   │   │
│  │  ├─ CompanyTable (View all companies)            │   │
│  │  ├─ PriceChart (Visualization)                   │   │
│  │  └─ TopMovers (Market trends)                    │   │
│  └──────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────┘
                     │ REST API + WebSocket
                     │ (Axios + Socket.IO)
┌────────────────────┴────────────────────────────────────┐
│                    BACKEND (Express)                     │
│              http://localhost:5000                       │
│  ┌──────────────────────────────────────────────────┐   │
│  │ API Routes                                       │   │
│  │ ├─ /api/companies (CRUD)                         │   │
│  │ ├─ /api/prices (Price data)                      │   │
│  │ ├─ /api/watchlist (User lists)                   │   │
│  │ └─ /api/auth (Login/Register)                    │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ WebSocket Server (Socket.IO)                     │   │
│  │ └─ Real-time price updates                       │   │
│  └──────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────┘
                     │ Database Queries
                     │ (Mongoose ORM)
┌────────────────────┴────────────────────────────────────┐
│                    DATABASE (MongoDB)                    │
│          mongodb://localhost:27017                       │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Collections:                                     │   │
│  │ ├─ companies (100+ AI firms)                     │   │
│  │ ├─ prices (Historical data)                      │   │
│  │ ├─ users (Accounts)                              │   │
│  │ └─ watchlists (User preferences)                 │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

## 📊 Database Schema Relationships

```
User (1) ──────────────── (1) Watchlist
         │                      │
         │                      ├─→ (Many) Companies
         │                      │
         └──────────────────────┘
         
Company (1) ──────────────── (Many) Prices
```

## 🔗 API Endpoints Summary

### Companies
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/companies` | List all companies |
| GET | `/api/companies/:id` | Get single company |
| GET | `/api/companies/symbol/:symbol` | Search by symbol |
| POST | `/api/companies` | Create company |
| PUT | `/api/companies/:id` | Update company |

### Prices
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/prices/current` | Latest prices |
| GET | `/api/prices/:symbol/latest` | Company latest price |
| GET | `/api/prices/:symbol/history` | Price history |
| GET | `/api/prices/gainers/top` | Top gainers |
| GET | `/api/prices/losers/top` | Top losers |
| POST | `/api/prices` | Add price data |

### Watchlist
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/watchlist/:userId` | Get watchlist |
| POST | `/api/watchlist/:userId/add` | Add company |
| POST | `/api/watchlist/:userId/remove` | Remove company |
| PUT | `/api/watchlist/:userId/notifications` | Update settings |

### Authentication
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login user |

## 🎯 Data Flow Example

### Viewing Companies with Real-Time Prices:
1. User loads frontend → React queries `/api/companies`
2. Backend retrieves companies from MongoDB
3. Frontend displays companies, queries `/api/prices/current`
4. Real-time prices update via WebSocket connection
5. Charts built using historical price data

### Adding to Watchlist:
1. User clicks "Add to Watchlist"
2. Frontend sends POST to `/api/watchlist/:userId/add`
3. Backend validates user and company
4. Updates watchlist in MongoDB
5. Returns updated watchlist to frontend
6. Frontend shows confirmation

## 💾 File Sizes Overview

| Component | Size | Purpose |
|-----------|------|---------|
| Backend | ~35KB | API server + scripts |
| Frontend | ~25KB | React app + components |
| Docs | ~15KB | README + SETUP guides |
| **Total** | **~75KB** | Complete project |

## 🔐 Security Features

- ✅ Password hashing (bcryptjs)
- ✅ JWT authentication
- ✅ CORS protection
- ✅ Environment variables for secrets
- ✅ Input validation on all endpoints

## 📈 Performance Optimizations

- ✅ Indexed MongoDB queries
- ✅ Pagination for large datasets
- ✅ Efficient WebSocket updates
- ✅ Lean queries for database
- ✅ Aggregation pipeline for analytics

## 🚀 Deployment Readiness

The project is ready for production deployment:
- ✅ Environment configuration separated
- ✅ Error handling implemented
- ✅ CORS properly configured
- ✅ Database indexing optimized
- ✅ Build scripts for both frontend and backend
- ✅ .gitignore for version control
