import React, { useMemo } from 'react';
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
import { buildAIBXLSeries, getAIBXLCompanies } from './AIBXLChart';

const HORIZONS = [1, 5, 10, 20];

const simpleReturn = (current, previous) => {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return (current - previous) / previous;
};

const getPriceMap = (company) => new Map(
  (company.dailyAdjustedClose || company.priceHistory || [])
    .map((point) => [point.date || new Date(point.timestamp).toISOString().slice(0, 10), Number(point.adjustedClose ?? point.close ?? point.price)])
    .filter(([, price]) => Number.isFinite(price) && price > 0)
);

const getHorizonReturn = (values, horizon) => {
  if (values.length <= horizon) return null;
  return simpleReturn(values.at(-1), values[values.length - 1 - horizon]);
};

const formatPercent = (value) => value == null ? 'N/A' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;

function PerformanceVsAIBXL({ company, companies = [] }) {
  const { comparisonCards, chartData } = useMemo(() => {
    const basketCompanies = getAIBXLCompanies(companies);
    const basketSeries = buildAIBXLSeries(basketCompanies);
    if (!basketSeries.length) return { comparisonCards: [], chartData: [] };

    const companyPrices = getPriceMap(company);
    const sharedDates = basketSeries.map((point) => point.date).filter((date) => companyPrices.has(date));
    const companyValues = sharedDates.map((date) => companyPrices.get(date));
    const basketLevels = sharedDates.map((date) => basketSeries.find((point) => point.date === date)?.level);
    const companyReturn = horizon => getHorizonReturn(companyValues, horizon);
    const basketReturn = horizon => getHorizonReturn(basketLevels, horizon);
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
    const firstCompany = companyValues[0];
    const firstBasket = basketLevels[0];
    const chart = sharedDates.map((date, index) => ({
      date,
      company: firstCompany > 0 ? Number((((companyValues[index] / firstCompany) - 1) * 100).toFixed(2)) : null,
      basket: firstBasket > 0 ? Number((((basketLevels[index] / firstBasket) - 1) * 100).toFixed(2)) : null
    }));
    const sinceStartCompany = companyValues.length > 1 ? (companyValues.at(-1) / firstCompany) - 1 : null;
    const sinceStartBasket = basketLevels.length > 1 ? (basketLevels.at(-1) / firstBasket) - 1 : null;
    cards.push({
      label: 'Since start',
      company: sinceStartCompany,
      basket: sinceStartBasket,
      difference: sinceStartCompany == null || sinceStartBasket == null ? null : sinceStartCompany - sinceStartBasket
    });
    return { comparisonCards: cards, chartData: chart };
  }, [company, companies]);

  if (!chartData.length) {
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
    </section>
  );
}

export default PerformanceVsAIBXL;