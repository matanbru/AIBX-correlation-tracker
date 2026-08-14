# AIBXL Correlation Audit Evidence

Date of audit: 2026-08-13

This document records the raw evidence used to review AIBXL and its per-company AIBXL Correlation calculations after real Twelve Data price histories were loaded.

## 1. Toggle Bug: Raw Output

Test company: `C3AI`

AIBXL benchmark tickers:

```text
MSFT, NVDA, AMZN, GOOGL, META, TSLA, JPM, V, ORCL, SAP
```

Actual strongest-correlation output:

| Window | Strongest correlation | Lag |
|---|---:|---:|
| 30D | 0.6377 | +14D |
| 60D | 0.4916 | 0D |
| 90D | 0.4735 | 0D |

Raw diagnostic output:

```json
{"company":"C3AI","windowSize":30,"strongestCorrelation":0.6377,"strongestLag":14}
{"company":"C3AI","windowSize":60,"strongestCorrelation":0.4916,"strongestLag":0}
{"company":"C3AI","windowSize":90,"strongestCorrelation":0.4735,"strongestLag":0}
```

The values and lag positions differ across all three windows.

## 2. Lag Window

The lag chart uses the same selected `windowSize` as the 30D/60D/90D toggle. It does not use a separate fixed full-history window.

Actual calculation:

```js
const lagWindowBasket = basketSeries.slice(-windowSize);
const lagWindowCompany = companyReturns.slice(-windowSize);
```

The lag calculation is inside the same `useMemo` dependency scope:

```js
}, [company, companies, windowSize, refreshKey]);
```

Current lag ranges and minimum overlap:

```text
30D: +/-15D, minimum 15 overlapping observations (30 - 15)
60D: +/-30D, minimum 30 overlapping observations (60 - 30)
90D: +/-30D, minimum 60 overlapping observations (90 - 30)
```

## 3. Basket Autocorrelation

The original `autoCorrelation()` function is no longer present in the source, so the diagnostic was rerun with the equivalent Pearson self-correlation calculation on the current AIBXL basket's real log returns.

Full raw output:

```json
[
  {"lag":1,"correlation":0.1109},
  {"lag":2,"correlation":0.0098},
  {"lag":3,"correlation":0.0423},
  {"lag":4,"correlation":-0.0324},
  {"lag":5,"correlation":0.1155},
  {"lag":6,"correlation":-0.1300},
  {"lag":7,"correlation":-0.1103},
  {"lag":8,"correlation":0.0040},
  {"lag":9,"correlation":-0.0695},
  {"lag":10,"correlation":0.1564},
  {"lag":11,"correlation":-0.0051},
  {"lag":12,"correlation":-0.0175},
  {"lag":13,"correlation":-0.0699},
  {"lag":14,"correlation":-0.0834},
  {"lag":15,"correlation":0.0405}
]
```

The C3AI, PATH, and SOUN pages use the same AIBXL benchmark basket, so their basket autocorrelation table is identical.

## 4. Synthetic-Code Search

Search patterns:

```text
randomDrift
structuralBias
buildAlignedPriceSeries
mockPrices
generateRandomPrice
```

Search scope:

```text
ai-stock-tracker/**
```

Search result:

```text
No matches found
```

The standalone `demo.html` random-price generator was also deleted. Remaining `Math.random()` references found previously were from the compiled React runtime, not market-data code.

## 5. Date Alignment

Raw output for every tracked company:

```text
NVDA: 250 dates (2025-08-15 -> 2026-08-13)
MSFT: 250 dates (2025-08-15 -> 2026-08-13)
GOOGL: 250 dates (2025-08-15 -> 2026-08-13)
AMZN: 250 dates (2025-08-15 -> 2026-08-13)
META: 250 dates (2025-08-15 -> 2026-08-13)
TSLA: 250 dates (2025-08-15 -> 2026-08-13)
AMD: 250 dates (2025-08-15 -> 2026-08-13)
CRM: 250 dates (2025-08-15 -> 2026-08-13)
SAP: 250 dates (2025-08-15 -> 2026-08-13)
IBM: 250 dates (2025-08-15 -> 2026-08-13)
JPM: 250 dates (2025-08-15 -> 2026-08-13)
V: 250 dates (2025-08-15 -> 2026-08-13)
PYPL: 250 dates (2025-08-15 -> 2026-08-13)
ORCL: 250 dates (2025-08-15 -> 2026-08-13)
SHOP: 250 dates (2025-08-15 -> 2026-08-13)
C3AI: 250 dates (2025-08-15 -> 2026-08-13)
PATH: 250 dates (2025-08-15 -> 2026-08-13)
SOUN: 250 dates (2025-08-15 -> 2026-08-13)
BBAI: 250 dates (2025-08-15 -> 2026-08-13)
APP: 250 dates (2025-08-15 -> 2026-08-13)
PD: 250 dates (2025-08-15 -> 2026-08-13)
UPST: 250 dates (2025-08-15 -> 2026-08-13)
S: 250 dates (2025-08-15 -> 2026-08-13)
MDB: 250 dates (2025-08-15 -> 2026-08-13)
DDOG: 250 dates (2025-08-15 -> 2026-08-13)
```

Exact alignment result:

```text
PASS all 25 exact date arrays
```

## 6. Error Handling: Actual UI Behavior

### No cached history

Backend enrichment sets:

```js
price: null
change: null
dataStatus: 'unavailable'
```

The company table renders:

```jsx
price?.price == null ? 'Unavailable' : formatPrice(price.price)
```

The change column renders:

```jsx
price?.changePercent == null ? 'N/A' : formatChange(price.changePercent)
```

The company profile renders:

```text
Price: Unavailable
Change: N/A
```

The price chart renders:

```text
No chart data available
```

The AIBXL Correlation chart renders:

```text
No AIBXL benchmark data available for [ticker].
```

### Failed refresh with cached history

The backend retains the last successful real value and marks the company:

```js
dataStatus: 'stale'
lastError: '[Twelve Data error message]'
```

Price endpoints return the last actual source timestamp. Live example:

```text
price=224.86
status=available
lastUpdate=2026-08-13
timestamp=2026-08-13T16:00:00Z
```

The company table and company profile now show a visible `Stale` badge when `dataStatus === 'stale'`. The backend preserves `lastError`, and the timestamp is the last actual market observation rather than the current request time.

## Validation

Backend syntax checks passed for:

```text
backend/index.js
backend/routes/prices.js
backend/services/priceDataService.js
```

Frontend production build passed:

```text
vite v5.4.21 building for production...
✓ 917 modules transformed.
✓ built successfully
```
