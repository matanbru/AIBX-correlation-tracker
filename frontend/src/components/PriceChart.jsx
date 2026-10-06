import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const RANGE_OPTIONS = [7, 30, 90, 180, 365];

const formatPrice = (value) => (Number.isFinite(Number(value)) && value !== null ? `$${Number(value).toFixed(2)}` : 'N/A');

function PriceChart({ symbol }) {
  const [data, setData] = useState([]);
  const [peerData, setPeerData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(30);

  useEffect(() => {
    fetchHistory();
    fetchPeers();
  }, [symbol, range]);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/prices/${symbol}/history?days=${range}`);
      const chartData = response.data.map(price => ({
        date: new Date(price.timestamp).toLocaleDateString(),
        price: price.price
      }));
      setData(chartData);
    } catch (error) {
      console.error('Error fetching price history:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPeers = async () => {
    try {
      const response = await axios.get(`${API_URL}/prices/${symbol}/peers`);
      setPeerData(response.data.peers || []);
    } catch (error) {
      console.error('Error fetching peer data:', error);
    }
  };

  const normalizedPeerData = peerData.map(peer => ({
    symbol: peer.symbol,
    values: peer.series.map(point => ({
      date: new Date(point.date).toLocaleDateString(),
      price: point.price,
      peer: peer.symbol
    }))
  }));

  if (loading) return <div className="chart-container">Loading chart...</div>;

  return (
    <div className="chart-container">
      <div className="chart-header-row">
        <h3>{symbol} price history</h3>
        <div className="range-controls">
          {RANGE_OPTIONS.map(option => (
            <button
              key={option}
              className={range === option ? 'range-button active' : 'range-button'}
              onClick={() => setRange(option)}
            >
              {option}D
            </button>
          ))}
        </div>
      </div>

      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" minTickGap={20} />
            <YAxis
              domain={[(min) => Math.floor(min * 0.97), (max) => Math.ceil(max * 1.03)]}
              tickFormatter={(value) => `$${Number(value).toFixed(0)}`}
              width={60}
            />
            <Tooltip formatter={formatPrice} />
            <Legend />
            <Line type="monotone" dataKey="price" stroke="#0066cc" name={symbol} strokeWidth={2.5} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <p>No chart data available</p>
      )}

      {normalizedPeerData.length > 0 && (
        <div className="peer-chart-section">
          <h4>Peer comparison in the same sector</h4>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={normalizedPeerData[0]?.values || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" minTickGap={20} />
              <YAxis />
              <Tooltip formatter={formatPrice} />
              <Legend />
              <Line type="monotone" dataKey="price" stroke="#0066cc" name={symbol} />
              {normalizedPeerData.map(peer => (
                <Line
                  key={peer.symbol}
                  type="monotone"
                  data={peer.values}
                  dataKey="price"
                  stroke={peer.symbol === 'NVDA' ? '#28a745' : peer.symbol === 'AMD' ? '#ff9f1c' : '#6c757d'}
                  name={peer.symbol}
                  dot={false}
                  opacity={0.8}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default PriceChart;
