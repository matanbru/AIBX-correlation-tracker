import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

function CompanyTable({ companies, onSelectCompany }) {
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPrices();
  }, []);

  const fetchPrices = async () => {
    try {
      const response = await axios.get(`${API_URL}/prices/current`);
      const priceMap = {};
      response.data.forEach(price => {
        priceMap[price.symbol] = price;
      });
      setPrices(priceMap);
    } catch (error) {
      console.error('Error fetching prices:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price) => {
    return `$${price.toFixed(2)}`;
  };

  const formatChange = (change) => {
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}%`;
  };

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Company</th>
            <th>Symbol</th>
            <th>Price</th>
            <th>Change</th>
            <th>Market Cap</th>
            <th>Rev Growth</th>
            <th>Operating Margin</th>
            <th>Founded</th>
          </tr>
        </thead>
        <tbody>
          {companies.map(company => {
            const price = prices[company.symbol];
            return (
              <tr
                key={company._id}
                className="clickable-row"
                onClick={() => onSelectCompany(company)}
              >
                <td>#{company.rank}</td>
                <td>
                  <strong>{company.name}</strong>
                </td>
                <td>{company.symbol}</td>
                <td className="price">
                  {price?.price == null ? 'Unavailable' : formatPrice(price.price)}
                  {price?.dataStatus === 'stale' && <span className="stale-badge">Stale</span>}
                </td>
                <td>
                  <span className={`change ${(price?.changePercent || 0) >= 0 ? 'positive' : 'negative'}`}>
                    {price?.changePercent == null ? 'N/A' : formatChange(price.changePercent)}
                  </span>
                </td>
                <td>${company.metrics?.marketCap ?? 0}B</td>
                <td>{company.metrics?.revenueGrowth ?? 0}%</td>
                <td>{company.metrics?.operatingMargin ?? 0}%</td>
                <td>{company.founded}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {companies.length === 0 && (
        <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
          No companies found. Try a different search.
        </div>
      )}
    </div>
  );
}

export default CompanyTable;
