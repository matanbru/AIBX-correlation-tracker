import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';

const toSeries = (company) => {
  const rawSeries = company.dailyAdjustedClose || company.priceHistory || [];
  if (!Array.isArray(rawSeries)) return new Map();

  return new Map(
    rawSeries
      .map((point) => [
        point.date || new Date(point.timestamp).toISOString().slice(0, 10),
        Number(point.adjustedClose ?? point.close ?? point.price)
      ])
      .filter(([, value]) => Number.isFinite(value) && value > 0)
  );
};

const simpleReturn = (currentPrice, previousPrice) => (
  (currentPrice - previousPrice) / previousPrice
);

const weightedBasket = (companies) => {
  const seriesBySymbol = new Map(companies.map((company) => [company.symbol, toSeries(company)]));
  const dates = [...seriesBySymbol.values()].reduce((sharedDates, series) => {
    if (sharedDates === null) return new Set(series.keys());
    return new Set([...sharedDates].filter((date) => series.has(date)));
  }, null);

  const sortedDates = [...(dates || [])].sort();
  if (sortedDates.length < 2) return [];

  const totalMarketCap = companies.reduce(
    (sum, company) => sum + Number(company.metrics?.marketCap ?? company.marketCap ?? 0),
    0
  );
  const weights = new Map(
    companies.map((company) => {
      const marketCap = Number(company.metrics?.marketCap ?? company.marketCap ?? 0);
      return [company.symbol, totalMarketCap > 0 ? marketCap / totalMarketCap : 1 / companies.length];
    })
  );

  let previousLevel = 100;

  return sortedDates.map((date, index) => {
    const dailyReturn = index === 0
      ? 0
      : companies.reduce((basketReturn, company) => {
          const series = seriesBySymbol.get(company.symbol);
          const previous = series.get(sortedDates[index - 1]);
          const current = series.get(date);
          return basketReturn + weights.get(company.symbol) * simpleReturn(current, previous);
        }, 0);
    const level = index === 0 ? 100 : previousLevel * (1 + dailyReturn);
    previousLevel = level;

    return {
      date,
      level: Number(level.toFixed(2)),
      dailyReturn: Number((dailyReturn * 100).toFixed(3))
    };
  });
};

const getWeights = (companies) => {
  const totalMarketCap = companies.reduce(
    (sum, company) => sum + Number(company.metrics?.marketCap ?? company.marketCap ?? 0),
    0
  );

  return companies
    .map((company) => {
      const marketCap = Number(company.metrics?.marketCap ?? company.marketCap ?? 0);
      return {
        ...company,
        weight: totalMarketCap > 0 ? marketCap / totalMarketCap : 1 / companies.length
      };
    })
    .sort((companyA, companyB) => companyB.weight - companyA.weight);
};

function AIBXLChart({ companies = [], onSelectCompany }) {
  const basketCompanies = useMemo(
    () => companies
      .filter((company) => (
        Array.isArray(company.dailyAdjustedClose || company.priceHistory) &&
        (company.dailyAdjustedClose || company.priceHistory).length >= 2
      ))
      .sort((companyA, companyB) => (
        Number(companyB.metrics?.marketCap ?? companyB.marketCap ?? 0) -
        Number(companyA.metrics?.marketCap ?? companyA.marketCap ?? 0)
      ))
      .slice(0, 10),
    [companies]
  );
  const chartData = useMemo(
    () => weightedBasket(basketCompanies),
    [basketCompanies]
  );
  const constituents = useMemo(() => getWeights(basketCompanies), [basketCompanies]);
  const latest = chartData[chartData.length - 1];
  const first = chartData[0];
  const totalReturn = first && latest ? ((latest.level / first.level) - 1) * 100 : null;

  if (!chartData.length) {
    return (
      <section className="aibxl-panel">
        <div className="aibxl-header">
          <div>
            <h3>AIBXL</h3>
            <p>Largest AI-company basket index</p>
          </div>
        </div>
        <div className="chart-empty">AIBXL data is unavailable until real price histories are loaded.</div>
      </section>
    );
  }

  return (
    <section className="aibxl-panel">
      <div className="aibxl-header">
        <div>
          <h3>AIBXL</h3>
          <p>Market-cap-weighted basket of the 10 largest AI companies, rebased to 100</p>
        </div>
        <div className="aibxl-metrics">
          <span>Index level <strong>{latest.level.toFixed(2)}</strong></span>
          <span className={totalReturn >= 0 ? 'positive' : 'negative'}>
            {totalReturn >= 0 ? '+' : ''}{totalReturn.toFixed(2)}% since start
          </span>
        </div>
      </div>
      <div className="aibxl-disclosure">
        Current top-10 composition and weights are applied across the full price history; historical market-cap rebalancing is unavailable.
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 10, right: 14, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" minTickGap={28} tickFormatter={(value) => value.slice(5)} />
          <YAxis domain={['auto', 'auto']} tickFormatter={(value) => value.toFixed(0)} />
          <Tooltip
            formatter={(value, name) => name === 'level' ? [Number(value).toFixed(2), 'AIBXL level'] : [`${Number(value).toFixed(3)}%`, 'Daily return']}
            labelFormatter={(label) => `Date: ${label}`}
          />
          <Line type="monotone" dataKey="level" stroke="#0f766e" strokeWidth={3} dot={false} name="AIBXL level" />
        </LineChart>
      </ResponsiveContainer>
      <div className="aibxl-constituents">
        <h4>AIBXL constituents</h4>
        <div className="aibxl-constituent-list">
          {constituents.map((company) => (
            <button
              className="aibxl-constituent"
              key={company.symbol}
              type="button"
              onClick={() => onSelectCompany?.(company)}
            >
              <span>
                <strong>{company.symbol}</strong>
                <small>{company.name}</small>
              </span>
              <b>{(company.weight * 100).toFixed(2)}%</b>
            </button>
          ))}
        </div>
      </div>
      <div className="aibxl-footnote">
        {constituents.length} largest companies included using shared real trading dates from Twelve Data.
      </div>
    </section>
  );
}

export default AIBXLChart;
