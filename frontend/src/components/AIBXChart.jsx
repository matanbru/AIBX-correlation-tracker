import React, { useMemo, useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  BarChart,
  Bar
} from 'recharts';

const mean = (arr) => arr.reduce((sum, value) => sum + value, 0) / arr.length;
const calculateReturns = (prices, logReturns = true) => {
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    const previous = prices[i - 1];
    const current = prices[i];
    if (!Number.isFinite(previous) || !Number.isFinite(current) || previous <= 0) continue;
    returns.push(logReturns ? Math.log(current / previous) : (current - previous) / previous);
  }
  return returns;
};

const marketCapWeights = (marketCaps) => {
  const total = Object.values(marketCaps).reduce((sum, value) => sum + Number(value || 0), 0);
  if (!total) {
    return Object.fromEntries(Object.keys(marketCaps).map((ticker) => [ticker, 1 / Object.keys(marketCaps).length]));
  }
  return Object.fromEntries(
    Object.entries(marketCaps).map(([ticker, value]) => [ticker, Number(value || 0) / total])
  );
};

const basketReturns = (companyReturns, weights) => {
  const tickers = Object.keys(companyReturns);
  if (!tickers.length) return [];
  const length = companyReturns[tickers[0]].length;
  const basket = new Array(length).fill(0);

  for (const ticker of tickers) {
    const weight = weights[ticker] || 0;
    const series = companyReturns[ticker] || [];
    for (let i = 0; i < length; i++) {
      basket[i] += weight * (series[i] || 0);
    }
  }

  return basket;
};

const correlation = (seriesA, seriesB) => {
  const meanA = mean(seriesA);
  const meanB = mean(seriesB);
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;

  for (let i = 0; i < seriesA.length; i++) {
    const diffA = seriesA[i] - meanA;
    const diffB = seriesB[i] - meanB;
    covariance += diffA * diffB;
    varianceA += diffA * diffA;
    varianceB += diffB * diffB;
  }

  if (varianceA === 0 || varianceB === 0) return 0;
  return covariance / Math.sqrt(varianceA * varianceB);
};

const rollingBeta = (seriesA, seriesB, windowSize) => {
  const results = [];
  for (let i = windowSize; i <= seriesA.length; i++) {
    const windowA = seriesA.slice(i - windowSize, i);
    const windowB = seriesB.slice(i - windowSize, i);
    const meanA = mean(windowA);
    const meanB = mean(windowB);
    let covariance = 0;
    let varianceB = 0;

    for (let j = 0; j < windowA.length; j++) {
      covariance += (windowA[j] - meanA) * (windowB[j] - meanB);
      varianceB += (windowB[j] - meanB) ** 2;
    }

    const beta = varianceB === 0 ? 0 : covariance / varianceB;
    const r = correlation(windowA, windowB);
    results.push({
      date: null,
      beta: Number(beta.toFixed(4)),
      alpha: Number((meanA - beta * meanB).toFixed(4)),
      r2: Number((r * r).toFixed(4))
    });
  }
  return results;
};

const getSeriesSnapshot = (company) => {
  const rawSeries = company.dailyAdjustedClose || company.priceHistory || [];
  if (!Array.isArray(rawSeries) || rawSeries.length === 0) return { dates: [], values: [] };

  const alignedSeries = rawSeries.map((point) => ({
    date: point.date || new Date(point.timestamp).toISOString().slice(0, 10),
    value: Number(point.adjustedClose ?? point.close ?? point.price ?? company.price ?? 0)
  }));

  return {
    dates: alignedSeries.map((point) => point.date),
    values: alignedSeries.map((point) => point.value)
  };
};

const crossCorrelation = (basketReturnSeries, companyReturnSeries, maxLag, minimumOverlap) => {
  const results = [];

  for (let k = -maxLag; k <= maxLag; k++) {
    let basketSlice, companySlice;

    if (k >= 0) {
      basketSlice = basketReturnSeries.slice(0, basketReturnSeries.length - k);
      companySlice = companyReturnSeries.slice(k);
    } else {
      const absK = -k;
      basketSlice = basketReturnSeries.slice(absK);
      companySlice = companyReturnSeries.slice(0, companyReturnSeries.length - absK);
    }

    results.push({
      lag: k,
      correlation: basketSlice.length >= minimumOverlap ? correlation(basketSlice, companySlice) : 0
    });
  }

  return results;
};

function AIBXChart({ company, companies = [] }) {
  const [windowSize, setWindowSize] = React.useState(60);
  const [refreshKey, setRefreshKey] = useState(0);

  // Daily refresh at midnight
  useEffect(() => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const timeUntilMidnight = tomorrow.getTime() - now.getTime();
    
    const timer = setTimeout(() => {
      setRefreshKey((prev) => prev + 1);
      // Then set interval for every 24 hours
      const dailyRefresh = setInterval(() => {
        setRefreshKey((prev) => prev + 1);
      }, 24 * 60 * 60 * 1000);
      return () => clearInterval(dailyRefresh);
    }, timeUntilMidnight);

    return () => clearTimeout(timer);
  }, []);

  const { chartData, lagData } = useMemo(() => {
    if (!company || !companies.length) return { chartData: [], lagData: [] };

    const validCompanies = companies
      .filter((entry) => {
        if (entry.symbol === company.symbol) return false;
        const series = entry.dailyAdjustedClose || entry.priceHistory || [];
        return Array.isArray(series) && series.length >= 90;
      })
      .sort((entryA, entryB) => (
        Number(entryB.metrics?.marketCap ?? entryB.marketCap ?? 0) -
        Number(entryA.metrics?.marketCap ?? entryA.marketCap ?? 0)
      ))
      .slice(0, 10);

    if (!validCompanies.length) return { chartData: [], lagData: [] };

    const companySeries = getSeriesSnapshot(company);
    const companyReturns = calculateReturns(companySeries.values);

    const companyMap = {};
    validCompanies.forEach((entry) => {
      const snapshot = getSeriesSnapshot(entry);
      companyMap[entry.symbol] = snapshot.values;
    });

    const returnsMap = Object.fromEntries(
      Object.entries(companyMap).map(([symbol, values]) => [symbol, calculateReturns(values)])
    );

    const weights = marketCapWeights(
      Object.fromEntries(
        validCompanies.map((entry) => [entry.symbol, Number(entry.metrics?.marketCap ?? entry.marketCap ?? 1)])
      )
    );

    console.info('[AIBX correlation] benchmark basket', {
      targetTicker: company.symbol,
      benchmark: 'AIBXL',
      benchmarkTickers: validCompanies.map((entry) => entry.symbol),
      benchmarkWeights: weights,
      windowSize
    });

    const basketSeries = basketReturns(returnsMap, weights);
    const betaSeries = rollingBeta(companyReturns, basketSeries, windowSize);

    const beta = betaSeries.map((point, index) => ({
      date: companySeries.dates[index + windowSize],
      beta: point.beta,
      alpha: point.alpha,
      r2: point.r2
    })).filter((entry) => entry.date);

    // Measure lead/lag on the same trailing window selected for beta.
    const lagWindowBasket = basketSeries.slice(-windowSize);
    const lagWindowCompany = companyReturns.slice(-windowSize);
    const lagMax = Math.min(30, Math.max(1, Math.floor(windowSize / 2)));
    const minimumOverlap = windowSize - lagMax;
    const lag = crossCorrelation(lagWindowBasket, lagWindowCompany, lagMax, minimumOverlap).map((point) => ({
      lag: point.lag,
      correlation: Number(point.correlation.toFixed(4))
    }));

    return { chartData: beta, lagData: lag };
  }, [company, companies, windowSize, refreshKey]);

  const latestPoint = chartData[chartData.length - 1] || null;
  const strongestLag = lagData.length > 0
    ? lagData.reduce((best, curr) => 
        Math.abs(curr.correlation) > Math.abs(best.correlation) ? curr : best
      )
    : null;
  const lagRange = lagData.length > 0
    ? Math.max(...lagData.map((point) => Math.abs(point.lag)))
    : 0;
  const strongestLagIsEdge = strongestLag && Math.abs(strongestLag.lag) === lagRange;

  if (!chartData.length) {
    return <div className="chart-empty">No AIBXL benchmark data available for {company?.symbol || 'this company'}.</div>;
  }

  return (
    <div className="aibx-chart-wrap">
      <div className="aibx-toolbar">
        <div className="aibx-metrics">
          <span className="aibx-tag">{windowSize}D beta</span>
          <strong>{latestPoint.beta.toFixed(3)}</strong>
          <span className="aibx-sub">R² {latestPoint.r2.toFixed(3)}</span>
        </div>

        <div className="aibx-window-controls">
          {[30, 60, 90].map((option) => (
            <button
              key={option}
              type="button"
              className={windowSize === option ? 'aibx-window-button active' : 'aibx-window-button'}
              onClick={() => setWindowSize(option)}
            >
              {option}D
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" minTickGap={20} tickFormatter={(value) => value.slice(5)} />
          <YAxis domain={[-1.5, 2.5]} tickFormatter={(value) => value.toFixed(1)} />
          <Tooltip
            formatter={(value) => Number(value).toFixed(3)}
            labelFormatter={(label) => `Date: ${label}`}
          />
          <ReferenceLine y={1} stroke="#94a3b8" strokeDasharray="4 4" />
          <Line type="monotone" dataKey="beta" stroke="#0066cc" strokeWidth={2.5} dot={false} name={`${company.symbol} vs AIBXL`} />
        </LineChart>
      </ResponsiveContainer>

      {/* Lag Correlation Section */}
      <div className="aibx-lag-section">
        <div className="aibx-lag-header">
          <h4>Lead/Lag Analysis (±{lagRange}D lag test)</h4>
          {strongestLag && (
            <div className="aibx-lag-summary">
              <span className="aibx-lag-label">Strongest correlation:</span>
              <span className="aibx-lag-value">{strongestLag.correlation.toFixed(3)}</span>
              <span className="aibx-lag-lag">
                {strongestLag.lag > 0
                  ? `Basket leads by ${strongestLag.lag}D`
                  : strongestLag.lag < 0
                  ? `${company.symbol} leads by ${Math.abs(strongestLag.lag)}D`
                  : 'No lead/lag'}
              </span>
            </div>
          )}
          {strongestLagIsEdge && (
            <p className="aibx-lag-warning">
              Peak is at the tested range edge; interpret this short-window result cautiously.
            </p>
          )}
        </div>

        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={lagData} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="lag" minTickGap={5} tickFormatter={(value) => `${value}D`} />
            <YAxis domain={[-1, 1]} />
            <Tooltip
              formatter={(value) => Number(value).toFixed(3)}
              labelFormatter={(label) => `Lag: ${label} days`}
            />
            <ReferenceLine y={0} stroke="#94a3b8" />
            <Bar dataKey="correlation" fill="#10b981" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default AIBXChart;
