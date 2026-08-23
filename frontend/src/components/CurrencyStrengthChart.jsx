import React, { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const currencyMeta = {
  GBP: { label: 'GBP', color: '#2563eb' },
  CAD: { label: 'CAD', color: '#16a34a' },
  EUR: { label: 'EUR', color: '#f59e0b' }
};

const CurrencyChartPanel = ({ title, data, dataKey, color }) => (
  <section className="currency-panel">
    <div className="currency-panel-header">
      <div>
        <h3>{title}</h3>
        <p>Daily FX rate, USD base</p>
      </div>
      <strong style={{ color }}>{data.at(-1)?.[dataKey]?.toFixed(4) ?? 'N/A'}</strong>
    </div>
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" minTickGap={24} tickFormatter={(value) => value.slice(5)} />
        <YAxis domain={['dataMin - 0.05', 'dataMax + 0.05']} tickFormatter={(value) => value.toFixed(4)} />
        <Tooltip
          formatter={(value) => [`${Number(value).toFixed(4)}`, currencyMeta[dataKey]?.label || dataKey]}
          labelFormatter={(label) => `Date: ${label}`}
        />
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  </section>
);

function CurrencyStrengthChart() {
  const [data, setData] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const url = `${API_URL}/currency/strength`;

    fetch(url)
      .then((response) => {
        if (!response.ok) {
          return response.json().then((payload) => {
            throw new Error(payload?.error || 'Unable to load currency strength data.');
          });
        }
        return response.json();
      })
      .then((payload) => {
        if (!active) return;
        if (!Array.isArray(payload?.data) || payload.data.length === 0) {
          throw new Error('Currency data was not returned.');
        }

        setData(payload.data);
        setError('');
      })
      .catch((requestError) => {
        if (!active) return;
        setError(requestError.message || 'Unable to load currency data.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <div className="loading">Loading currency strength data...</div>;
  }

  if (error) {
    return <div className="chart-empty">{error}</div>;
  }

  return (
    <div className="currency-strength-tab">
      <div className="panel-header currency-strength-header">
        <div>
          <h3>Currency Strength</h3>
          <span>USD performance against GBP, CAD and EUR over the last 12 months</span>
        </div>
      </div>

      <CurrencyChartPanel title="USD vs GBP" data={data} dataKey="GBP" color="#2563eb" />
      <CurrencyChartPanel title="USD vs CAD" data={data} dataKey="CAD" color="#16a34a" />
      <CurrencyChartPanel title="USD vs EUR" data={data} dataKey="EUR" color="#f59e0b" />
    </div>
  );
}

export default CurrencyStrengthChart;
