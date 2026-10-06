# Data Accuracy Notes

Date of changes: 2026-10-06

Goal: every number on the site comes from a live, real source, with nothing static or placeholder.

## Data sources

| Data | Source | Refresh |
|---|---|---|
| Share prices (daily closes) | Twelve Data `time_series` (free key) | Startup + weekdays 4:10 PM US Eastern |
| Fundamentals (revenue, margins, FCF, capex, debt, shares, EPS) | SEC EDGAR Company Facts (XBRL) | Startup if older than 12 h + daily |
| Market cap, P/E, rank | Calculated live: price × SEC share count; price ÷ TTM EPS | Every price update |
| Treasury / real yields, breakeven | FRED public CSV (no key needed; uses `FRED_API_KEY` if set) | Startup + daily |
| Currency strength | Frankfurter (ECB rates) | On request (unchanged) |

The Twelve Data free plan has no fundamentals endpoints (403), so SEC is the only free real source for them.

## Changes made

### Config and data
- `backend/.env`: `FINNHUB_API_KEY` held a placeholder, so the app tried Finnhub and every refresh failed. It is now blank, so Twelve Data is used.
- `backend/data/prices.json`: re-downloaded for all 25 tickers (250 days each, through 2026-10-05). The old file is kept as `backend/data/prices.old.json` for rollback (safe to delete).
- `backend/data/fundamentals.json`: regenerated from SEC (previously stale from 15 Aug and contained wrong values, e.g. NVDA revenue growth -62%).
- `backend/data/yields.json`: refreshed from FRED (previously ended 28 Aug); now ends 2026-10-02.

### Code
- `backend/services/secFundamentalsDataService.js` (rewritten):
  - Single-quarter figures are derived from cumulative (YTD) filings.
  - TTM sums need 4 consecutive quarters.
  - Revenue growth is YoY on the latest quarter.
  - Margins use TTM.
  - Adds free cash flow, capex, TTM net income and TTM EPS.
  - Debt/equity includes the current portion of debt.
  - Share count comes from the filing cover page, falling back to weighted-average shares.
  - Keeps the last good record if a refresh fails.
- `backend/index.js`:
  - Company profiles (name, HQ, products, macro context) moved to `backend/data/companyProfiles.json`. The old hard-coded prices, metrics and ranks (e.g. NVDA at $445) were removed; every number now comes from the live sources.
  - Uses the SEC service (the old Finnhub/Twelve Data fundamentals service is no longer used).
  - P/E is now calculated, and market cap uses the real share count.
  - `rank` is recomputed from live market cap (it was hard-coded).
  - The daily refresh now runs at 4:10 PM New York time. It used the server's local time, which was before the US close for a UK user.
  - Refreshes prices, yields and fundamentals at startup, so the banner no longer sits at "Needs attention".
  - Yields refresh no longer needs a FRED key.
  - Removed misleading text ("20 companies", "Twelve Data fundamentals").
- `backend/services/priceDataService.js`:
  - A Finnhub placeholder key no longer selects the Finnhub provider.
  - Refresh fetches the last 5 bars and corrects existing dates instead of skipping them.
  - Today's bar is saved only after the US market has closed, so no partial intraday price is stored as a close.
- `backend/services/yieldsDataService.js`: FRED CSV fallback; missing values (holidays, ".") are skipped rather than stored as 0.
- `backend/routes/yields.js`: error messages no longer ask for a FRED key.
- `frontend/src/App.jsx`:
  - The subtitle said "top 100 companies"; it now shows the real count (25).
  - P/E above 200 shows "N/M (>200)" on the company card instead of values like 553.
  - Removed unused code that was never shown on the page: the "pattern score", scenario price targets, commentary text and sector averages. The score was a hand-weighted heuristic, not a model.
  - Removed the empty Watchlist tab (there are no user accounts) and replaced the footer with the real data sources.
- `frontend/src/components/PriceChart.jsx`:
  - Y axis is rounded to whole dollars with 3% padding (it used to show unrounded, cut-off labels such as "248.89999").
  - Removed the empty "High" and "Low" lines: `prices.json` only stores daily closes.
  - Tooltips show "N/A" for missing values instead of crashing.
- CORS (`backend/index.js` and `backend/.env`): `CORS_ORIGIN` accepts a comma-separated list (spaces trimmed) and defaults to `http://localhost:5173` and `http://127.0.0.1:5173`. The same list is now used by both the API and the live-update socket (previously the API used `cors()` with no options, which allowed every origin). Note: the Vite dev server only listens on `localhost`, so open the site at `http://localhost:5173`.

### Repository tidy-up
- `README.md` rewritten to describe the app as it actually works (it previously described 100 companies, real-time prices and price alerts).
- Outdated setup guides (`QUICKSTART.md`, `READY_TO_RUN.md`, `SETUP.md`, `MONGODB_SETUP.md`, `ARCHITECTURE.md`, `start-dynamic.bat`) moved to `docs/archive/`.
- Unused MongoDB models and seed script moved to `docs/archive/legacy-mongodb/` (`mongoose` isn't installed and nothing imports them).
- Development investigations (`AIBX_*`) moved to `docs/investigations/`; the change log moved to `docs/CHANGE_LOG.md`.
- `start.bat` now uses paths relative to its own folder and installs dependencies on first run.
- `backend/.env.example` lists only the variables the code reads; added `npm test` to the backend.

## Known limitations (not fixable with free sources)
- **V and PYPL**: SEC's feed doesn't yet include their June-quarter filings, so they show data to 31 Mar 2026. They update automatically once SEC adds them.
- **V market cap and P/E**: shown as N/A. Visa's multiple share classes don't give a reliable share count, and I would rather show N/A than a wrong value.
- **SAP**: files a 20-F in EUR (annual), so financials are not shown. Only the share count is used, for market cap. P/E is N/A.
- **APP**: no standard capex tag in its filings, so FCF/capex are N/A. **MDB**: no EPS, so P/E is N/A. **IBM**: no operating margin. **JPM**: FCF is not meaningful for a bank (N/A).
- Prices are **daily closes**, not real-time ticks, and the free tier is rate limited (~8 requests/minute), so a full refresh takes about 3.5 minutes.
- Loss-making companies show P/E N/A (negative P/E is not meaningful).
- Descriptive text (founded year, HQ, description, AI products, macro commentary and pattern signals) is editorial and static by nature.
- `SEC_USER_AGENT` in `.env` is `AI-Price-Tracker contact@example.com`. It works, but SEC asks for a real contact email, so please replace it with yours.
