# AIBX Data Discrepancy Timeline

Date investigated: 2026-08-14

## User-Reported Symptoms

The frontend showed two unexpected behaviors:

1. All AIBXL constituents appeared to have equal 10% weights.
2. All financial-profile accounting information appeared as `Unavailable`.

## Initial Evidence

The persisted data files were checked before restarting anything.

```text
prices.json exists: yes
cached symbols: 25
```

The real price cache contained:

```text
NVDA, MSFT, GOOGL, AMZN, META, TSLA, AMD, CRM, SAP, IBM,
JPM, V, PYPL, ORCL, SHOP, C3AI, PATH, SOUN, BBAI, APP,
PD, UPST, S, MDB, DDOG
```

The SEC fundamentals cache also contained real data:

```text
fundamentals cache available: 24/25
NVDA dataStatus: available
NVDA sharesOutstandingMillions: 24200
NVDA SEC-derived metrics present
```

## Live API Before Restart

The running backend returned:

```text
records: 25
accounting available: 0
live marketCap values: null
live shares values: null
```

This differed from the files on disk. The backend process was therefore not loading the current cache state.

## Why AIBXL Showed 10% Per Company

The AIBXL weighting code intentionally falls back to equal weights when the total market capitalization is zero or unavailable:

```js
const weight = totalMarketCap > 0
  ? marketCap / totalMarketCap
  : 1 / companies.length;
```

With 10 constituents and all live market-cap values missing:

```text
1 / 10 = 0.10 = 10%
```

Therefore, the equal 10% weights were a fallback caused by missing in-memory market-cap values. They did not mean that the real market caps were equal.

## Why Financial Profiles Showed Unavailable

The live backend process was also serving companies with:

```text
accounting.dataStatus = unavailable
```

That happened because the process had been started before the SEC fundamentals cache was loaded or refreshed. The frontend correctly displayed the backend state rather than inventing accounting values.

The SEC cache itself contained 24 available companies, so this was a stale-process problem rather than a data-file deletion problem.

## Recovery Actions

1. Confirmed `prices.json` still contained all 25 real price histories.
2. Confirmed `fundamentals.json` contained SEC-derived data for 24 companies.
3. Stopped the stale Node backend process.
4. Started the current backend from:

```powershell
cd "C:\Users\student\Desktop\Ideas\ai-stock-tracker\backend"
& "C:\Program Files\nodejs\node.exe" index.js
```

5. Verified the restarted live API.

## Live API After Restart

The restarted backend returned:

```text
accounting available: 24/25
NVDA marketCap: 5441.61
```

The live API now loads the SEC cache and derives market capitalization from real price and SEC shares where available.

The current AIBXL top-10 market-cap values are non-equal, so the AIBXL weights are no longer forced to 10% each.

## Current Expected Data State

```text
Real price histories: 25/25 companies
Real current prices: 25/25 companies
SEC-backed accounting: 24/25 companies
SAP quarterly accounting: unavailable
Synthetic price fallback: removed
Synthetic accounting fallback: removed
```

SAP remains unavailable because its SEC data does not provide usable quarterly rows for the current quarterly accounting view.

## Important Operational Lesson

The application uses local JSON caches loaded into backend memory at startup. When `prices.json` or `fundamentals.json` changes, the backend must be restarted before those changes appear in the live API.

A stale backend can therefore show:

- Equal fallback AIBXL weights when current market caps are missing in memory.
- `Unavailable` financial data even though the SEC cache exists on disk.

The recovery procedure is:

```powershell
# Stop the backend with Ctrl+C, then restart it:
cd "C:\Users\student\Desktop\Ideas\ai-stock-tracker\backend"
& "C:\Program Files\nodejs\node.exe" index.js
```

Then verify:

```text
http://localhost:5000/api/health
http://localhost:5000/api/companies?limit=100
```

Frontend:

```text
http://localhost:5173
```

Use `Ctrl + Shift + R` in the browser after restarting the backend if the old frontend state remains visible.

## Complete Test and Correction Log

### Test 1: Price cache existence

Command/check:

```text
Check backend/data/prices.json
```

Result:

```text
prices.json exists: yes
cached symbols: 25
```

Conclusion: real historical price data had not been deleted.

### Test 2: Live company API coverage before correction

Endpoint:

```text
GET http://localhost:5000/api/companies?limit=100
```

Result before restart:

```text
records: 25
accounting available: 0
live marketCap values: null
live shares values: null
```

Conclusion: the running backend process was stale and had not loaded the current disk caches.

### Test 3: SEC cache comparison

Check:

```text
backend/data/fundamentals.json
```

Result:

```text
fundamentals cache available: 24/25
NVDA dataStatus: available
NVDA sharesOutstandingMillions: 24200
NVDA SEC-derived metrics present
```

Conclusion: the disk cache and live backend memory disagreed. This isolated the problem to process state, not missing source data.

### Test 4: AIBXL fallback-weight calculation

The relevant code was:

```js
const weight = totalMarketCap > 0
  ? marketCap / totalMarketCap
  : 1 / companies.length;
```

With missing live market caps:

```text
1 / 10 = 0.10 = 10%
```

Conclusion: equal 10% weights were an intentional fallback. They were not real market-cap weights.

### Correction 1: Restart stale backend

The old Node process on port 5000 was stopped. The current backend was started from the project backend directory:

```powershell
cd "C:\Users\student\Desktop\Ideas\ai-stock-tracker\backend"
& "C:\Program Files\nodejs\node.exe" index.js
```

### Test 5: Live API after correction

Result after restart:

```text
accounting available: 24/25
NVDA marketCap: 5441.61
```

Conclusion: the backend loaded the SEC cache and derived market capitalization correctly. The AIBXL weights were no longer forced to 10% each.

### Test 6: Price-history coverage after correction

Result:

```text
Real price histories: 25/25 companies
Real current prices: 25/25 companies
```

Conclusion: the AIBXL basket and company charts had complete real price inputs.

### Test 7: Frontend availability

Endpoints checked:

```text
http://localhost:5000/api/health -> HTTP 200
http://localhost:5000/api/companies?limit=100 -> HTTP 200
http://localhost:5173 -> HTTP 200
```

Conclusion: the frontend and backend were reachable after the restart.

### Test 8: Current refresh status

The latest Twelve Data refresh attempted to run, but the provider returned network failures:

```text
Could not fetch latest price for NVDA: fetch failed
```

The same behavior occurred for the other companies during that refresh.

This does not delete the cached prices. It means the last real observations remain in place and are marked stale. The UI should show the cached value with a `Stale` badge rather than treating it as current.

## Final Issue Summary

The apparent data loss was caused by a long-running backend process holding old in-memory data. The files on disk still contained the real price and SEC data.

The equal 10% AIBXL weights occurred because the old process had no market-cap values and correctly entered its equal-weight fallback. The unavailable financial profiles occurred for the same reason: the old process had not loaded the SEC fundamentals cache.

After restarting the current backend:

```text
25/25 real price histories loaded
25/25 real current prices loaded
24/25 SEC accounting profiles loaded
NVDA market cap loaded as 5441.61
```

The one remaining accounting exception is SAP, whose SEC data does not provide usable quarterly rows for this view.

## Follow-up Prevention Notes

- Restart the backend after running either real-data backfill command.
- Check `/api/health` and `/api/companies?limit=100` after a restart.
- Treat `dataStatus: stale` as cached real data, not current data.
- Do not delete `prices.json` or `fundamentals.json` to resolve this issue; the files were intact.
- The current backend process must load the disk caches before the frontend can display the latest SEC-derived metrics and AIBXL weights.
