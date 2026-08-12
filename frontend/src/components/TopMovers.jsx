import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

function TopMovers({ type = 'gainers' }) {
  const [movers, setMovers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMovers();
  }, [type]);

  const fetchMovers = async () => {
    try {
      setLoading(true);
      const endpoint = type === 'gainers' ? 'gainers/top' : 'losers/top';
      const response = await axios.get(`${API_URL}/prices/${endpoint}?limit=10`);
      setMovers(response.data);
    } catch (error) {
      console.error('Error fetching top movers:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading top {type}...</div>;

  return (
    <div className="top-movers">
      {movers.map(mover => (
        <div key={mover.symbol} className="mover-card">
          <div className="mover-symbol">{mover.symbol}</div>
          <div className="mover-price">${mover.price.toFixed(2)}</div>
          <div className={`mover-change ${mover.changePercent >= 0 ? 'positive' : 'negative'}`}>
            {mover.changePercent >= 0 ? '+' : ''}{mover.changePercent.toFixed(2)}%
          </div>
        </div>
      ))}
    </div>
  );
}

export default TopMovers;
