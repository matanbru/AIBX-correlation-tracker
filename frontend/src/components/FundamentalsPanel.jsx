import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

const formatBillions = (value) => value == null ? 'Unavailable' : `$${Number(value).toFixed(2)}B`;
const formatPercent = (value) => value == null ? 'Unavailable' : `${Number(value).toFixed(2)}%`;
const formatRatio = (value) => value == null ? 'Unavailable' : Number(value).toFixed(2);
const formatShares = (value) => value == null ? 'Unavailable' : `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}M`;

const STAT_CARDS = [
  { key: 'revenueTtm', label: 'Revenue TTM', format: formatBillions },
  { key: 'revenueGrowth', label: 'Revenue growth', format: formatPercent },
  { key: 'grossMargin', label: 'Gross margin', format: formatPercent },
  { key: 'operatingMargin', label: 'Operating margin', format: formatPercent },
  { key: 'cashBalance', label: 'Cash balance', format: formatBillions },
  { key: 'debtToEquity', label: 'Debt-to-equity', format: formatRatio },
  { key: 'currentRatio', label: 'Current ratio', format: formatRatio },
  { key: 'sharesOutstandingMillions', label: 'Shares outstanding', format: formatShares }
];

function FundamentalsPanel({ company, onSelectCompany }) {
  const accounting = company?.accounting;
  const metrics = accounting?.metrics || {};

  const trendData = useMemo(() => {
    const quarters = accounting?.incomeStatement || [];
    return quarters
      .slice()
      .reverse()
      .map((row) => ({
        quarter: row.quarter,
        revenue: row.revenue,
        operatingMargin: row.revenue && row.operatingIncome != null
          ? Number(((row.operatingIncome / row.revenue) * 100).toFixed(2))
          : null
      }));
  }, [accounting]);

  return (
    <section className="fundamentals-panel">
      <div className="fundamentals-header">
        <div>
          <h3>Fundamentals</h3>
          <p>{company?.symbol} accounting data from the SEC Company Facts XBRL API</p>
        </div>
        {onSelectCompany && (
          <button
            type="button"
            className="fundamentals-profile-button"
            onClick={() => onSelectCompany(company)}
          >
            Open profile
          </button>
        )}
      </div>

      <div className="fundamentals-stat-grid">
        {STAT_CARDS.map((card) => (
          <div className="fundamentals-stat-card" key={card.key}>
            <span>{card.label}</span>
            <strong>{card.format(metrics[card.key])}</strong>
          </div>
        ))}
      </div>

      <p className="fundamentals-note">
        Free cash flow and P/E ratio are not currently available from the SEC data source.
      </p>

      {trendData.length >= 2 ? (
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={trendData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="quarter" minTickGap={16} />
            <YAxis yAxisId="revenue" tickFormatter={(value) => `$${value}B`} />
            <YAxis yAxisId="margin" orientation="right" tickFormatter={(value) => `${value}%`} />
            <Tooltip
              formatter={(value, name) => name === 'Revenue' ? `$${Number(value).toFixed(2)}B` : `${Number(value).toFixed(2)}%`}
              labelFormatter={(label) => `Quarter: ${label}`}
            />
            <Legend />
            <Bar yAxisId="revenue" dataKey="revenue" fill="#2563eb" name="Revenue" />
            <Line yAxisId="margin" type="monotone" dataKey="operatingMargin" stroke="#c2410c" strokeWidth={2.5} dot={{ r: 3 }} name="Operating margin" />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <div className="chart-empty">Not enough quarterly history for a revenue/margin trend chart.</div>
      )}
    </section>
  );
}

export default FundamentalsPanel;
