import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';
import { mean } from './AIBXChart';

const HORIZONS = [1, 5, 10, 20];
const WINDOWS = [10, 20, 30];
const TRADING_DAYS_PER_YEAR = 252;

const getPrices = (company) => {
  const series = company?.dailyAdjustedClose || company?.priceHistory || [];
  return Array.isArray(series)
    ? series.map((point) => Number(point.adjustedClose ?? point.close ?? point.price))
      .filter((price) => Number.isFinite(price) && price > 0)
    : [];
};

const getDates = (company) => {
  const series = company?.dailyAdjustedClose || company?.priceHistory || [];
  return Array.isArray(series)
    ? series.map((point) => point.date || new Date(point.timestamp).toISOString().slice(0, 10))
    : [];
};

const multiHorizonReturns = (prices, horizons = HORIZONS) => {
  const latest = prices[prices.length - 1];
  const results = {};
  for (const horizon of horizons) {
    if (prices.length <= horizon || !Number.isFinite(latest) || latest <= 0) {
      results[horizon] = null;
      continue;
    }
    const past = prices[prices.length - 1 - horizon];
    results[horizon] = Number.isFinite(past) && past > 0
      ? (latest - past) / past
      : null;
  }
  return results;
};

const simpleReturns = (prices) => {
  const returns = [];
  for (let index = 1; index < prices.length; index += 1) {
    const previous = prices[index - 1];
    const current = prices[index];
    if (!Number.isFinite(previous) || !Number.isFinite(current) || previous <= 0) continue;
    returns.push((current - previous) / previous);
  }
  return returns;
};

const stddev = (values) => {
  if (values.length < 2) return null;
  const average = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
};

const rollingVolatility = (returns, windowSize) => {
  const results = [];
  for (let index = windowSize; index <= returns.length; index += 1) {
    const window = returns.slice(index - windowSize, index);
    const dailyVolatility = stddev(window);
    results.push(dailyVolatility == null ? null : dailyVolatility * Math.sqrt(TRADING_DAYS_PER_YEAR));
  }
  return results;
};

const volatilityRegime = (volatility20) => {
  if (!volatility20.length) return null;
  const current = volatility20[volatility20.length - 1];
  const trailing90 = volatility20.slice(-90);
  const baseline = mean(trailing90);
  if (!Number.isFinite(current) || !Number.isFinite(baseline) || baseline <= 0) return null;

  const ratio = current / baseline;
  let regime = 'Normal';
  if (ratio > 1.5) regime = 'Elevated';
  else if (ratio < 0.67) regime = 'Quiet';
  return { ratio: Number(ratio.toFixed(2)), regime };
};

const formatReturn = (value) => {
  if (value == null) return 'N/A';
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
};

function MomentumVolatilityChart({ company, onSelectCompany }) {
  const [windowSize, setWindowSize] = useState(20);
  const prices = useMemo(() => getPrices(company), [company]);
  const dates = useMemo(() => getDates(company), [company]);
  const returns = useMemo(() => simpleReturns(prices), [prices]);
  const horizonReturns = useMemo(() => multiHorizonReturns(prices), [prices]);
  const volatilityByWindow = useMemo(
    () => Object.fromEntries(WINDOWS.map((window) => [window, rollingVolatility(returns, window)])),
    [returns]
  );
  const volatility = volatilityByWindow[windowSize] || [];
  const volatility20 = volatilityByWindow[20] || [];
  const regime = volatilityRegime(volatility20);
  const chartData = volatility.map((value, index) => ({
    date: dates[index + windowSize] || null,
    volatility: value == null ? null : Number((value * 100).toFixed(2))
  })).filter((point) => point.date && point.volatility != null);

  if (prices.length < 2) {
    return <div className="chart-empty">Momentum &amp; Volatility data unavailable for {company?.symbol || 'this company'}.</div>;
  }

  return (
    <section className="momentum-volatility-panel">
      <div className="momentum-volatility-header">
        <div>
          <h3>Momentum &amp; Volatility</h3>
          <p>{company.symbol} returns and annualized rolling volatility from real price history</p>
        </div>
        {onSelectCompany && (
          <button
            type="button"
            className="momentum-profile-button"
            onClick={() => onSelectCompany(company)}
          >
            Open profile
          </button>
        )}
        {regime && (
          <span className={`volatility-regime volatility-regime-${regime.regime.toLowerCase()}`}>
            {regime.regime} ({regime.ratio.toFixed(2)}x normal)
          </span>
        )}
      </div>

      <div className="momentum-stat-grid">
        {HORIZONS.map((horizon) => {
          const value = horizonReturns[horizon];
          return (
            <div className={`momentum-stat-card ${value == null ? '' : value >= 0 ? 'positive' : 'negative'}`} key={horizon}>
              <span>{horizon}D return</span>
              <strong>{formatReturn(value)}</strong>
            </div>
          );
        })}
      </div>

      <div className="momentum-volatility-toolbar">
        <span>Annualized volatility</span>
        <div className="aibxl-correlation-window-controls">
          {WINDOWS.map((option) => (
            <button
              key={option}
              type="button"
              className={windowSize === option ? 'aibxl-correlation-window-button active' : 'aibxl-correlation-window-button'}
              onClick={() => setWindowSize(option)}
            >
              {option}D
            </button>
          ))}
        </div>
      </div>

      {chartData.length ? (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" minTickGap={24} tickFormatter={(value) => value.slice(5)} />
            <YAxis tickFormatter={(value) => `${value.toFixed(0)}%`} />
            <Tooltip formatter={(value) => `${Number(value).toFixed(2)}%`} labelFormatter={(label) => `Date: ${label}`} />
            <Line type="monotone" dataKey="volatility" stroke="#c2410c" strokeWidth={2.5} dot={false} name={`${windowSize}D annualized volatility`} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="chart-empty">Not enough history for {windowSize}D volatility.</div>
      )}
    </section>
  );
}

export default MomentumVolatilityChart;
