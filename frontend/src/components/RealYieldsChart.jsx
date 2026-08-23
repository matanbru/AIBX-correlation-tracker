import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const ranges = ['1y', '3y', '5y'];

const YieldLineChart = ({ title, data, color }) => (
  <section className="real-yields-panel">
    <div className="real-yields-panel-header">
      <div><h3>{title}</h3><p>Daily TIPS-derived real yield</p></div>
      <strong>{data.at(-1)?.value?.toFixed(2) ?? 'N/A'}%</strong>
    </div>
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 10, right: 14, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" minTickGap={28} tickFormatter={(value) => value.slice(5)} />
        <YAxis domain={['auto', 'auto']} tickFormatter={(value) => `${value.toFixed(1)}%`} />
        <Tooltip formatter={(value) => [`${Number(value).toFixed(2)}%`, 'Real yield']} labelFormatter={(label) => `Date: ${label}`} />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  </section>
);

function RealYieldsChart() {
  const [range, setRange] = useState('1y');
  const [tenYear, setTenYear] = useState([]);
  const [thirtyYear, setThirtyYear] = useState([]);
  const [correlation, setCorrelation] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setError('');
    Promise.all([
      axios.get(`${API_URL}/yields/real`, { params: { series: '10y', range } }),
      axios.get(`${API_URL}/yields/real`, { params: { series: '30y', range } }),
      axios.get(`${API_URL}/yields/correlation`, { params: { series: '10y', range } })
    ]).then(([tenResponse, thirtyResponse, correlationResponse]) => {
      if (!active) return;
      setTenYear(tenResponse.data.data);
      setThirtyYear(thirtyResponse.data.data);
      setCorrelation(correlationResponse.data.data);
    }).catch((requestError) => {
      if (active) setError(requestError.response?.data?.error || 'Unable to load Treasury yield data.');
    });
    return () => { active = false; };
  }, [range]);

  if (error) return <div className="chart-empty">{error}</div>;

  return (
    <div className="real-yields-tab">
      <div className="panel-header real-yields-heading">
        <div><h3>Real Treasury Yields</h3><span>FRED TIPS-derived yields and their 30-day relationship with AIBXL returns</span></div>
        <div className="aibxl-correlation-window-controls">
          {ranges.map((option) => <button key={option} type="button" className={range === option ? 'aibxl-correlation-window-button active' : 'aibxl-correlation-window-button'} onClick={() => setRange(option)}>{option}</button>)}
        </div>
      </div>
      <YieldLineChart title="10-Year Real Yield" data={tenYear} color="#0f766e" />
      <YieldLineChart title="30-Year Real Yield" data={thirtyYear} color="#2563eb" />
      <section className="real-yields-panel">
        <div className="real-yields-panel-header"><div><h3>10-Year Real Yield vs AIBXL</h3><p>30-trading-day rolling correlation: daily yield change and basket log return</p></div><strong>{correlation.at(-1)?.correlation?.toFixed(3) ?? 'N/A'}</strong></div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={correlation} margin={{ top: 10, right: 14, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" minTickGap={28} tickFormatter={(value) => value.slice(5)} /><YAxis domain={[-1, 1]} /><Tooltip formatter={(value) => Number(value).toFixed(3)} labelFormatter={(label) => `Date: ${label}`} />
            <Line type="monotone" dataKey="correlation" stroke="#d97706" strokeWidth={2.5} dot={false} name="Correlation" />
          </LineChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
}

export default RealYieldsChart;