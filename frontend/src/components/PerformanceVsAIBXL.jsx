import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { buildAIBXLSeries, getAIBXLCompanies, normalizePriceSeries } from './AIBXLChart';

const HORIZONS = [1, 5, 10, 20];
const CHART_WINDOWS = [1, 7, 30, 180];

const simpleReturn = (current, previous) => {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return (current - previous) / previous;
};

const getPriceMap = (company) => new Map(
  normalizePriceSeries(company.dailyAdjustedClose || company.priceHistory || []).map((point) => [point.date, Number(point.value)])
);

const getHorizonReturn = (values, horizon) => {
  if (values.length <= horizon) return null;
  return simpleReturn(values.at(-1), values[values.length - 1 - horizon]);
};

const formatPercent = (value) => value == null ? 'N/A' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;

function PerformanceVsAIBXL({ company, companies = [] }) {
  const [chartWindow, setChartWindow] = useState(30);

  const { comparisonCards, sharedDates, companyValues, basketLevels } = useMemo(() => {
    const basketCompanies = getAIBXLCompanies(companies);
    const basketSeries = buildAIBXLSeries(basketCompanies);
    if (!basketSeries.length) return { comparisonCards: [], sharedDates: [], companyValues: [], basketLevels: [] };

    const companyPrices = getPriceMap(company);
    const dates = basketSeries.map((point) => point.date).filter((date) => companyPrices.has(date));
    const companyVals = dates.map((date) => companyPrices.get(date));
    const basketVals = dates.map((date) => basketSeries.find((point) => point.date === date)?.level);
    const companyReturn = horizon => getHorizonReturn(companyVals, horizon);
    const basketReturn = horizon => getHorizonReturn(basketVals, horizon);
    const cards = HORIZONS.map((horizon) => {
      const companyValue = companyReturn(horizon);
      const basketValue = basketReturn(horizon);
      return {
        label: `${horizon}D`,
        company: companyValue,
        basket: basketValue,
        difference: companyValue == null || basketValue == null ? null : companyValue - basketValue
      };
    });
    const firstCompany = companyVals[0];
    const firstBasket = basketVals[0];
    const sinceStartCompany = companyVals.length > 1 ? (companyVals.at(-1) / firstCompany) - 1 : null;
    const sinceStartBasket = basketVals.length > 1 ? (basketVals.at(-1) / firstBasket) - 1 : null;
    cards.push({
      label: 'Since start',
      company: sinceStartCompany,
      basket: sinceStartBasket,
      difference: sinceStartCompany == null || sinceStartBasket == null ? null : sinceStartCompany - sinceStartBasket
    });
    return { comparisonCards: cards, sharedDates: dates, companyValues: companyVals, basketLevels: basketVals };
  }, [company, companies]);

  const { chartData, windowReturns, insufficientHistory } = useMemo(() => {
    // +1 because an N-day window needs N+1 price points to rebase to 0% at the window's start.
    const pointsNeeded = chartWindow + 1;
    if (sharedDates.length < pointsNeeded) {
      return { chartData: [], windowReturns: null, insufficientHistory: true };
    }

    const dates = sharedDates.slice(-pointsNeeded);
    const companySlice = companyValues.slice(-pointsNeeded);
    const basketSlice = basketLevels.slice(-pointsNeeded);
    const firstCompany = companySlice[0];
    const firstBasket = basketSlice[0];

    const data = dates.map((date, index) => ({
      date,
      company: firstCompany > 0 ? Number((((companySlice[index] / firstCompany) - 1) * 100).toFixed(2)) : null,
      basket: firstBasket > 0 ? Number((((basketSlice[index] / firstBasket) - 1) * 100).toFixed(2)) : null
    }));

    const returns = {
      company: simpleReturn(companySlice.at(-1), firstCompany),
      basket: simpleReturn(basketSlice.at(-1), firstBasket)
    };

    return { chartData: data, windowReturns: returns, insufficientHistory: false };
  }, [sharedDates, companyValues, basketLevels, chartWindow]);

  if (!sharedDates.length) {
    return <section className="performance-aibxl-panel"><div className="chart-empty">Performance vs AIBXL is unavailable for {company?.symbol || 'this company'}.</div></section>;
  }

  return (
    <section className="performance-aibxl-panel">
      <div className="performance-aibxl-header">
        <div>
          <h3>Performance vs AIBXL</h3>
          <p>Raw cumulative performance comparison, not a correlation or beta measure</p>
        </div>
      </div>
      <div className="performance-aibxl-stat-grid">
        {comparisonCards.map((card) => (
          <div className="performance-aibxl-stat" key={card.label}>
            <strong>{card.label}</strong>
            <span>Company <b className={card.company == null ? '' : card.company >= 0 ? 'positive' : 'negative'}>{formatPercent(card.company)}</b></span>
            <span>AIBXL <b className={card.basket == null ? '' : card.basket >= 0 ? 'positive' : 'negative'}>{formatPercent(card.basket)}</b></span>
            <span>Difference <b className={card.difference == null ? '' : card.difference >= 0 ? 'positive' : 'negative'}>{formatPercent(card.difference)}</b></span>
          </div>
        ))}
      </div>

      <div className="performance-aibxl-toolbar">
        <span>Chart window</span>
        <div className="aibxl-correlation-window-controls">
          {CHART_WINDOWS.map((option) => (
            <button
              key={option}
              type="button"
              className={chartWindow === option ? 'aibxl-correlation-window-button active' : 'aibxl-correlation-window-button'}
              onClick={() => setChartWindow(option)}
            >
              {option}D
            </button>
          ))}
        </div>
      </div>

      {insufficientHistory ? (
        <div className="chart-empty">Not enough history for the {chartWindow}D window.</div>
      ) : chartWindow === 1 ? (
        <div className="performance-aibxl-oneday">
          <div className="performance-aibxl-oneday-bar">
            <span>{company.symbol}</span>
            <b className={windowReturns.company == null ? '' : windowReturns.company >= 0 ? 'positive' : 'negative'}>{formatPercent(windowReturns.company)}</b>
          </div>
          <div className="performance-aibxl-oneday-bar">
            <span>AIBXL</span>
            <b className={windowReturns.basket == null ? '' : windowReturns.basket >= 0 ? 'positive' : 'negative'}>{formatPercent(windowReturns.basket)}</b>
          </div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" minTickGap={24} tickFormatter={(value) => value.slice(5)} />
            <YAxis tickFormatter={(value) => `${value.toFixed(0)}%`} />
            <Tooltip formatter={(value) => `${Number(value).toFixed(2)}%`} labelFormatter={(label) => `Date: ${label}`} />
            <Legend />
            <Line type="monotone" dataKey="company" stroke="#2563eb" strokeWidth={2.5} dot={false} name={company.symbol} />
            <Line type="monotone" dataKey="basket" stroke="#0f766e" strokeWidth={2.5} dot={false} name="AIBXL" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}

export default PerformanceVsAIBXL;