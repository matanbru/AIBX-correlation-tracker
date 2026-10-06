# AI Stock Tracker

A full-stack dashboard that tracks 25 publicly listed AI companies using real market, SEC filing and Federal Reserve data, with the analysis done in the app itself.

It combines daily share prices, company fundamentals derived from SEC filings and US real interest rates. It builds its own market-cap-weighted index of the 10 largest AI companies (AIBXL) and measures how each company moves relative to it.

**Stack:** React 18, Vite, Recharts · Node.js, Express, Socket.IO · Twelve Data, SEC EDGAR, FRED, Frankfurter APIs

---

## Features

| Area | What it shows |
|---|---|
| **Company overview** | 15 large-cap AI leaders and 10 smaller-cap companies, ranked by live market cap, with price, daily change, P/E and a full company profile |
| **Price history** | Daily closing prices over 7 to 365 days, with a peer comparison chart |
| **AIBXL index** | Market-cap-weighted basket of the 10 largest companies, rebased to 100 |
| **AIBXL correlation** | Rolling correlation and beta of each smaller company against AIBXL (30/60/90-day windows), plus a lead/lag test with significance checks |
| **Momentum and volatility** | Daily returns and annualised rolling volatility (10/20/30-day windows) |
| **Fundamentals** | Revenue, margins, free cash flow, capex, debt and EPS from SEC XBRL filings, with quarterly income statement and balance sheet tables |
| **Real yields** | 10- and 30-year TIPS real yields, nominal yields and breakeven inflation, plus the 30-day rolling correlation between real-yield changes and AIBXL returns |
| **Currency strength** | Daily USD exchange rates from the European Central Bank |

Data refreshes automatically at startup and every weekday at 4:10 PM US Eastern, just after the market close. It can also be refreshed manually from the header.

---

## How the data works

| Data | Source | Notes |
|---|---|---|
| Share prices | [Twelve Data](https://twelvedata.com/) `time_series` | Daily closes, 250 trading days per ticker. Today's bar is only saved after the US close, so an intraday price is never stored as a close. |
| Fundamentals | [SEC EDGAR Company Facts](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) (XBRL) | Single-quarter figures are derived from cumulative year-to-date filings. TTM values need four consecutive quarters. |
| Market cap, P/E, rank | Calculated | Market cap = latest close × share count from the latest filing. P/E = price ÷ TTM EPS. Rank is recalculated on every update. |
| Real yields | [FRED](https://fred.stlouisfed.org/) (St. Louis Fed) | TIPS real yields, nominal yields and breakevens. Missing days (holidays) are skipped, not stored as zero. |
| Exchange rates | [Frankfurter](https://www.frankfurter.app/) (ECB reference rates) | Fetched on request. |

**Design principle:** when a figure cannot be calculated reliably, the app shows **N/A** rather than an estimate. Examples are a company with multiple share classes, a loss-making company's P/E, and a foreign filer that reports annually in euros. All such cases are listed in [docs/DATA_ACCURACY_NOTES.md](docs/DATA_ACCURACY_NOTES.md).

---

## Architecture

```
┌────────────────────────┐   REST + WebSocket   ┌────────────────────────────┐
│  React frontend (Vite) │ ◄──────────────────► │  Express API + Socket.IO   │
│  Recharts dashboards   │                      │  in-memory store           │
└────────────────────────┘                      └─────────────┬──────────────┘
                                                              │ scheduled refresh
                                    ┌─────────────────────────┼────────────────────────┐
                                    ▼                         ▼                        ▼
                              Twelve Data               SEC EDGAR XBRL               FRED
                              (prices)                  (fundamentals)              (yields)
                                    └──────────── cached to backend/data/*.json ───────┘
```

- **Backend** (`backend/`): Express serves the API, and Socket.IO pushes updated prices to connected clients after each refresh. The data services in `backend/services/` fetch and validate each source independently, so one failing source doesn't block the others. Results are cached to JSON in `backend/data/`, so the app starts instantly and keeps working offline with the last good data.
- **Frontend** (`frontend/`): React single-page app. The analytics (index construction, correlation, beta, volatility and the lead/lag significance tests) run in the browser on the cached price history.
- **Company profiles** (`backend/data/companyProfiles.json`): descriptive information only (headquarters, products, macro context). Every number shown in the app comes from the live sources above.

```
ai-stock-tracker/
├── backend/
│   ├── index.js              # Server setup, data enrichment, refresh scheduler
│   ├── routes/               # REST endpoints (companies, prices, yields, currency)
│   ├── services/             # Twelve Data, SEC EDGAR and FRED data services
│   ├── scripts/              # One-off backfill scripts
│   ├── data/                 # Cached data and company profiles
│   └── test/
├── frontend/
│   └── src/
│       ├── App.jsx           # Layout, tabs and company profiles
│       └── components/       # Charts and panels
├── docs/                     # Data accuracy notes, changelog, investigations
└── start.bat                 # Starts backend and frontend on Windows
```

---

## Getting started

### Prerequisites
- Node.js 18 or later
- A free [Twelve Data API key](https://twelvedata.com/pricing)

### 1. Configure the backend

```bash
cd backend
npm install
cp .env.example .env
```

Edit `backend/.env`:

```env
TWELVE_DATA_API_KEY=your_key_here
SEC_USER_AGENT=AI-Stock-Tracker your.email@example.com
```

The SEC requires a real contact email in the user agent. FRED and Frankfurter need no key.

### 2. Start the app

On Windows, run `start.bat`. Otherwise, use two terminals:

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm install && npm run dev
```

Open **http://localhost:5173**. The API runs on http://localhost:5000.

Cached data in `backend/data/` lets the dashboard load immediately. A full price refresh takes about 3.5 minutes on the free Twelve Data tier, because it is limited to about 8 requests per minute.

### Run the tests

```bash
cd backend && npm test
```

---

## API

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/companies` | All companies with live price, metrics and profile |
| GET | `/api/companies/symbol/:symbol` | A single company |
| GET | `/api/prices/:symbol/history?days=30` | Daily price history |
| GET | `/api/prices/:symbol/peers` | Peer price series in the same sector |
| GET | `/api/prices/gainers/top` | Top daily gainers |
| GET | `/api/prices/refresh-status` | Status of the last data refresh |
| POST | `/api/prices/refresh-now` | Trigger a manual refresh |
| GET | `/api/yields/real` | Real and nominal Treasury yields, breakevens |
| GET | `/api/yields/correlation` | Rolling correlation of real yields with AIBXL |
| GET | `/api/currency/strength` | USD exchange rates |

---

## Known limitations

- Prices are **daily closes**, not real-time quotes (a limit of the free data tier).
- Some figures are N/A because the filings don't support a reliable value. Examples are Visa's market cap and P/E (multiple share classes) and SAP's financials (annual 20-F filed in euros). See [docs/DATA_ACCURACY_NOTES.md](docs/DATA_ACCURACY_NOTES.md) for the full list.
- Company descriptions and macro context are written by hand, not sourced from data.
- Data is held in memory and JSON files. There is no database or user accounts.

## Roadmap

- Store daily high, low and volume, and add candlestick charts
- Unit tests for the SEC quarterly derivation and the correlation statistics
- Hosted live demo

---

*For research and education only. Nothing in this project is investment advice.*
