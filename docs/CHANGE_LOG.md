# AI Stock Tracker - Complete Change Log

Date compiled: 2026-08-14

This document records the major implementation, data-source, reliability, UI, validation, and GitHub changes made during development.

## 1. Initial Dashboard

- Created a React 18 + Vite frontend.
- Created a Node.js + Express backend.
- Added company tables, search, company profiles, price charts, top movers, tabs, watchlists, authentication routes, and Socket.IO wiring.
- Added the initial large-company universe and smaller-company opportunity universe.
- Added `.gitignore` rules for `.env`, local environment files, `node_modules/`, build outputs, logs, IDE files, and temporary files.
- Confirmed MongoDB was not required for the current runtime architecture; the active application uses in-memory data and local JSON caches.

## 2. Synthetic Price Data Removal

The original backend generated artificial prices with a random walk and structural terms including:

```js
randomDrift
structuralBias
buildAlignedPriceSeries
```

Those generators were removed.

Additional synthetic market-data paths removed:

- Random five-second live price mutation.
- Random historical-price route generation.
- Random peer-comparison series.
- Mock/manual price update behavior.
- The obsolete `fetchPrices.js` mock-price utility.
- The standalone `demo.html` random-price generator.

Current behavior when real price data is missing:

```text
price: null
change: null
dataStatus: unavailable
```

The UI displays `Unavailable`, `N/A`, or an empty-chart message rather than fabricated values.

## 3. Twelve Data Historical Prices

Added `backend/services/priceDataService.js`.

Capabilities:

- Fetches daily historical prices from Twelve Data.
- Stores data in `backend/data/prices.json`.
- Converts API values into the local price-point shape.
- Supports the internal `C3AI` symbol through the Twelve Data `AI` alias.
- Saves after each successful batch or fallback request.
- Resumes from previously saved companies.
- Handles failures per company.
- Does not replace failed data with synthetic values.

Backfill command:

```powershell
cd "C:\Users\student\Desktop\Ideas\ai-stock-tracker\backend"
& "C:\Program Files\nodejs\node.exe" scripts/backfillRealPrices.js
```

Rate-limit handling:

- Batch size: 8 symbols for the free-tier credit limit.
- Delay between batches: 60 seconds.
- Individual fallback/retry delay: 8 seconds.
- Retries are also delayed.

Completed historical backfill:

```text
25/25 companies
250 daily records per company
6,250 total price records
Date range: 2025-08-15 through 2026-08-13
```

## 4. Real-Price Runtime Behavior

- Backend startup loads real prices from `prices.json`.
- The random five-second price timer was removed.
- Daily refresh uses Twelve Data only.
- The latest visible price is taken from the last stored real observation.
- Change percentage is calculated from the last two real observations.
- WebSocket broadcasts occur after a real refresh rather than a random timer.
- Current and latest-price endpoints expose the actual source observation timestamp.
- Manual price writes are disabled.

Example source-derived API data:

```text
price=224.86
status=available
lastUpdate=2026-08-13
timestamp=2026-08-13T16:00:00Z
```

Stale-data behavior:

- If refresh fails but cached history exists, the backend retains the last real value.
- It marks the company `dataStatus: stale`.
- It records `lastError`.
- The UI displays a visible `Stale` badge beside the price.
- If no cached history exists, the company is `Unavailable`.

## 5. AIBXL Basket

Added `frontend/src/components/AIBXLChart.jsx`.

AIBXL behavior:

- Uses the 10 largest companies from the main company universe.
- Sorts by current runtime market capitalization.
- Uses market-cap weights.
- Uses shared real trading dates.
- Starts the index at 100.
- Compounds weighted daily returns.
- Displays index level and total return.
- Shows a constituent list beneath the chart.
- Each constituent is clickable and opens its company profile.

Basket return formula:

```text
companyReturn(i,t) = (price(i,t) - price(i,t-1)) / price(i,t-1)

weight(i) = marketCap(i) / sum(marketCap(j))

basketReturn(t) = sum(weight(i) * companyReturn(i,t))

AIBXL(t) = AIBXL(t-1) * (1 + basketReturn(t))
```

Important current limitation:

- The market-cap weights are derived from real price and SEC shares where available.
- They are not a separate live market-cap API field.
- If shares are unavailable, the market-cap field is unavailable and the company may not rank normally.

## 6. Individual AIBXL Correlation Graphs

Added and updated `frontend/src/components/AIBXChart.jsx` (the file name is retained for compatibility).

- Each smaller-company AIBXL Correlation chart compares the smaller company against the AIBXL top-10 basket.
- The selected smaller company is not included in the AIBXL benchmark.
- Uses real Twelve Data daily price histories.
- Uses log returns:

```text
logReturn(t) = ln(price(t) / price(t-1))
```

- Calculates rolling beta and R-squared.
- Calculates lead/lag correlations.
- Logs the exact benchmark tickers and weights to the browser console.

Console log label:

```text
[AIBXL Correlation] benchmark basket
```

## 7. Window Toggle and Lag Reliability

The 30D/60D/90D toggle now recalculates both beta and lag data through the shared dependency array:

```js
[company, companies, windowSize, refreshKey]
```

The lag chart uses the same trailing window as beta:

```js
const lagWindowBasket = basketSeries.slice(-windowSize);
const lagWindowCompany = companyReturns.slice(-windowSize);
```

Lag reliability controls added:

- Requires at least 20 overlapping observations for a lag to be eligible.
- Computes a two-sided correlation p-value.
- Applies Bonferroni correction using the actual number of lag tests.
- Does not select ineligible edge lags as the strongest result.
- Hides bars that do not meet the minimum overlap requirement.
- Displays an insufficient-evidence warning when no eligible lag survives correction.

For a 30D window:

```text
Total lags tested: 31
Tested range: -15D through +15D
Minimum eligible overlap: 20 observations
Eligible displayed bars: -10D through +10D
Bonferroni alpha: 0.05 / 31 = 0.0016129032
```

The previous DDOG result was:

```text
lag +14D
correlation 0.5429
overlap 16
```

It is now excluded because it does not meet the 20-observation minimum.

Audit after the reliability change:

```text
DDOG best eligible: lag -7D, r=-0.4658, overlap=23, p=0.025082, significant=false
C3AI best eligible: lag -3D, r=0.4481, overlap=27, p=0.019061, significant=false
PATH best eligible: lag -4D, r=0.4822, overlap=26, p=0.012603, significant=false
SOUN best eligible: lag 0D, r=0.4664, overlap=30, p=0.009379, significant=false
```

None of those results survived Bonferroni correction.

## 8. AIBXL Correlation Constituent and Profile Navigation

- Added clickable AIBXL constituent buttons.
- Added `Open profile` buttons to smaller-company AIBXL Correlation cards.
- Clicking a company selects it and switches to the Overview profile.
- Smaller-company profiles show their individual AIBXL Correlation chart against AIBXL.
- Company profiles show price history, AIBXL, and the company-specific AIBXL Correlation chart.

## 9. Quarterly Accounting: Synthetic to SEC

The original `buildQuarterlyAccounting()` function generated estimated values from static inputs. It was removed.

The Twelve Data fundamentals endpoints were tested and returned HTTP 403 because they require a paid plan:

```text
/income_statement is available exclusively with pro or ultra or venture or enterprise plans
/balance_sheet is available exclusively with pro or ultra or venture or enterprise plans
```

A free SEC Company Facts integration was then added.

Files added or changed:

- `backend/services/secFundamentalsDataService.js`
- `backend/scripts/backfillRealFundamentals.js`
- `backend/data/fundamentals.json`
- `backend/.env.example`
- `backend/index.js`
- `frontend/src/App.jsx`

SEC configuration:

```env
SEC_USER_AGENT=AIBX-Dashboard your-email@example.com
```

The active local environment uses the user-provided SEC contact string. It is ignored by Git.

SEC backfill command:

```powershell
cd "C:\Users\student\Desktop\Ideas\ai-stock-tracker\backend"
& "C:\Program Files\nodejs\node.exe" scripts/backfillRealFundamentals.js
```

SEC integration behavior:

- Downloads SEC ticker-to-CIK data.
- Supports explicit CIK aliases for SAP and C3.ai.
- Fetches SEC Company Facts XBRL data.
- Supports `us-gaap` and `ifrs-full` namespaces.
- Maps reported income and balance-sheet tags.
- Converts reported values to billions.
- Saves after each company.
- Marks unsupported or unavailable data explicitly.
- Never estimates missing accounting values.

Current accounting coverage:

```text
24/25 companies have SEC-backed accounting data
SAP is unavailable for the quarterly view
0 synthetic accounting records
```

Current financial-profile field coverage from SEC-derived data:

```text
Revenue TTM: 22/25
Revenue growth: 22/25
Gross margin: 14/25
Operating margin: 21/25
Cash balance: 23/25
Debt-to-equity: 11/25
Current ratio: 22/25
Shares outstanding: 17/25
Free cash flow: 0/25
P/E ratio: 0/25
```

Missing fields display `Unavailable` rather than static values or zeroes.

## 10. Validation and Diagnostics

Repeated validations completed:

- Backend Node syntax checks passed.
- Frontend Vite production builds passed.
- Live backend returned HTTP 200.
- Frontend returned HTTP 200.
- All 25 companies had 250 real price-history records.
- All 25 price series had identical trading-date arrays.
- Date range verified as 2025-08-15 through 2026-08-13.
- Basket autocorrelation was rechecked and showed noisy near-zero values rather than the old synthetic wave.
- Old generator names were searched and removed:

```text
randomDrift
structuralBias
buildAlignedPriceSeries
mockPrices
generateRandomPrice
```

Search result:

```text
No matches found in backend source
```

## 11. GitHub History

Repository:

```text
https://github.com/matanbru/AIBX-correlation-tracker.git
```

Pushed commits:

```text
6589253 Initial commit
638bf48 Use SEC data for quarterly accounting
```

The remote was updated after GitHub reported the repository had moved from:

```text
https://github.com/matanbru/AI-price-tracker.git
```

to:

```text
https://github.com/matanbru/AIBX-correlation-tracker.git
```

Security checks completed:

```text
.env is excluded by .gitignore
node_modules/ is excluded
No actual .env file is tracked
No node_modules/ directory is tracked
```

## 12. Current Working-Tree State

At the time this log was compiled, the following changes were local and had not yet been pushed in a new commit:

```text
M backend/data/fundamentals.json
M backend/index.js
M backend/services/secFundamentalsDataService.js
M frontend/src/App.jsx
M frontend/src/components/AIBXChart.jsx
```

These local changes include:

- SEC-derived financial-profile metric extraction improvements.
- SEC tag and period-alignment fixes.
- Minimum-overlap lag eligibility.
- Correlation p-values.
- Bonferroni correction.
- Hiding statistically ineligible lag bars.
- Reliability warning when no lag survives the correction.

## 13. Current Source-of-Truth Summary

```text
Daily prices: Twelve Data API
Historical price cache: backend/data/prices.json
Quarterly accounting: SEC Company Facts XBRL API where available
Accounting cache: backend/data/fundamentals.json
AIBXL returns: calculated from real prices
AIBXL Correlation beta/correlation: calculated from real returns
Company descriptions: local catalog metadata
AI product descriptions: local catalog metadata
Unsupported financial fields: explicitly Unavailable
Synthetic market-price fallback: removed
Synthetic accounting fallback: removed
```

## 14. AIBXL Methodology Correction - 2026-08-14

The AIBXL index-level calculation was reviewed and corrected so its cross-sectional basket return uses simple returns rather than log returns.

Per-company index return:

```text
simpleReturn(i,t) = (price(i,t) - price(i,t-1)) / price(i,t-1)
```

Daily basket return:

```text
AIBXL_return(t) = sum(weight(i) * simpleReturn(i,t))
```

Index compounding remains:

```text
AIBXL(t) = AIBXL(t-1) * (1 + AIBXL_return(t))
```

The individual AIBX beta, R-squared, and correlation path continues to use log returns. The simple-return change is isolated to the AIBXL index-level chart.

## 15. Historical Weighting Review - 2026-08-14

The project was checked for historical market-cap and historical shares-outstanding data.

Evidence:

```text
Historical share/market-cap series found: 0
```

The SEC cache contains current/latest shares values where available, but not a time-varying shares or market-cap series for each historical trading date. Therefore, historical monthly rebalancing could not be implemented without adding another historical fundamentals source.

Implemented disclosure on the AIBXL chart:

```text
Current top-10 composition and weights are applied across the full price history; historical market-cap rebalancing is unavailable.
```

This prevents the chart from implying historically rebalanced weights that the available data cannot support.

## 16. Latest AIBXL Correlation Reliability Tests - 2026-08-14

Frontend validation:

```text
Vite production build: passed
917 modules transformed
```

Backend validation:

```text
backend/index.js syntax check: passed
backend/services/secFundamentalsDataService.js syntax check: passed
```

Live data checks:

```text
API records: 25
Records with 250-day history: 25
Records with current price: 25
Frontend HTTP: 200
Stored 250-day histories: 25
```

Current AIBXL top-10 runtime membership from the live API:

```text
NVDA, MSFT, AMZN, TSLA, JPM, AMD, ORCL, SAP, IBM, V
```

Current 90D same-day correlation sanity checks against AIBXL:

```text
C3AI: 0.4349
PATH: 0.2378
SOUN: 0.5322
```

Lag reliability audit after the minimum-overlap and Bonferroni changes:

```text
Bonferroni alpha for 31 tests: 0.0016129032

DDOG best eligible: lag -7D, r=-0.4658, overlap=23, p=0.025082, significant=false
C3AI best eligible: lag -3D, r=0.4481, overlap=27, p=0.019061, significant=false
PATH best eligible: lag -4D, r=0.4822, overlap=26, p=0.012603, significant=false
SOUN best eligible: lag 0D, r=0.4664, overlap=30, p=0.009379, significant=false
```

The former DDOG edge result was excluded:

```text
lag +14D
correlation 0.5429
overlap 16
eligible false
```

Date alignment test:

```text
PASS all 25 exact date arrays
250 dates per company
2025-08-15 through 2026-08-13
```

## 17. Latest Uncommitted Changes

At the time of this update, the latest local changes include:

```text
frontend/src/components/AIBXLChart.jsx
frontend/src/components/AIBXChart.jsx
frontend/src/App.css
AIBXL_FORMULA.md
```

These changes include the simple-return AIBXL correction, historical-weighting disclosure, minimum-overlap and multiple-comparison reliability controls, and documentation updates. They should be committed and pushed when the current review is complete.

## 18. Momentum & Volatility Feature - 2026-08-14

Added a separate top-level `Momentum & Volatility` tab. It does not replace or modify the AIBXL index or AIBXL Correlation tab.

New component:

```text
frontend/src/components/MomentumVolatilityChart.jsx
```

The component uses the existing real Twelve Data daily price history already loaded into each company record.

### Multi-horizon returns

Added simple returns for the following trading-day horizons:

```text
1D
5D
10D
20D
```

Formula:

```text
return_h(t) = (P(t) - P(t-h)) / P(t-h)
```

The results appear as stat cards. Positive values are green, negative values are red, and insufficient history shows `N/A` rather than zero.

### Rolling volatility

Added annualized rolling volatility using daily simple returns and sample standard deviation.

Daily return:

```text
dailyReturn(t) = (P(t) - P(t-1)) / P(t-1)
```

Annualized volatility:

```text
annualizedVolatility = standardDeviation(window) * sqrt(252)
```

Available volatility windows:

```text
10D
20D
30D
```

The component reuses the existing `mean()` helper exported from `AIBXChart.jsx` and adds only the required `stddev()` calculation.

### Volatility regime

The 20D volatility series is compared against its trailing 90-day average:

```text
regimeRatio = currentVolatility20D / mean(last 90 volatility20D values)
```

Regime thresholds:

```text
ratio > 1.5  -> Elevated
ratio < 0.67 -> Quiet
otherwise    -> Normal
```

The regime appears as a colored badge showing the ratio, for example:

```text
Elevated (1.80x normal)
```

### Navigation and profile wiring

Updated:

```text
frontend/src/App.jsx
```

Changes:

- Added the `Momentum & Volatility` navigation tab beside `AIBXL Correlation`.
- Added a Momentum & Volatility panel for each smaller company in the new tab.
- Added the component to every company profile.
- Preserved the existing AIBXL and AIBXL Correlation components unchanged in purpose.

Updated:

```text
frontend/src/App.css
```

Added:

- Responsive Momentum & Volatility grid layout.
- Return stat cards.
- Green/red return states.
- Volatility chart panel styling.
- 10D/20D/30D controls.
- Elevated, Normal, and Quiet regime badge styles.
- Mobile layout rules.

### Edge-case behavior

- No synthetic prices are generated.
- Invalid or non-positive prices are skipped when calculating daily returns.
- Missing horizon history displays `N/A`.
- Missing volatility history displays an unavailable message.
- Regime is omitted when a valid 20D volatility baseline cannot be calculated.

## 19. Momentum & Volatility Validation

Frontend production build:

```text
vite v5.4.21 building for production...
✓ 918 modules transformed.
✓ built in 7.57s
```

Build output:

```text
dist/index.html
dist/assets/index-C60WaKhk.css
dist/assets/index-DWKEjbkL.js
```

The feature uses only existing cached real price histories and introduces no new external data integration.

## 20. Latest Files Changed for Momentum & Volatility

```text
frontend/src/components/MomentumVolatilityChart.jsx
frontend/src/components/AIBXChart.jsx
frontend/src/App.jsx
frontend/src/App.css
```

`AIBXChart.jsx` was updated only to export the existing `mean()` helper for reuse. Its AIBXL Correlation calculations were not replaced by Momentum & Volatility logic.
