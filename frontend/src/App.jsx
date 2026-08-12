import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import CompanyTable from './components/CompanyTable';
import SearchBar from './components/SearchBar';
import PriceChart from './components/PriceChart';
import TopMovers from './components/TopMovers';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

const buildCompanyCommentary = (company) => {
  if (!company) {
    return {
      summary: 'No company profile available.',
      range: 'Not enough information for a forward view.',
      insights: []
    };
  }

  const metrics = company.metrics || {};
  const macro = company.macroContext || {};
  const revenueGrowth = Number(metrics.revenueGrowth || 0);
  const grossMargin = Number(metrics.grossMargin || 0);
  const operatingMargin = Number(metrics.operatingMargin || 0);
  const freeCashFlow = Number(metrics.freeCashFlow || 0);
  const debtToEquity = Number(metrics.debtToEquity || 0);
  const peRatio = Number(metrics.peRatio || 0);
  const aiDemand = String(macro.aiDemand || '').toLowerCase();
  const rateSensitivity = String(macro.interestRateSensitivity || '').toLowerCase();

  let baseRangeLow = 8;
  let baseRangeHigh = 18;

  if (revenueGrowth > 20) baseRangeLow += 6;
  if (revenueGrowth > 30) baseRangeHigh += 8;
  if (grossMargin > 70) baseRangeLow += 4;
  if (operatingMargin > 20) baseRangeLow += 3;
  if (freeCashFlow > 5) baseRangeLow += 2;
  if (debtToEquity > 1) baseRangeHigh -= 5;
  if (peRatio > 50) baseRangeHigh -= 4;
  if (aiDemand.includes('very high')) baseRangeHigh += 6;
  if (rateSensitivity.includes('high')) baseRangeHigh -= 4;

  const rangeLow = Math.max(5, Math.min(baseRangeLow, 26));
  const rangeHigh = Math.max(rangeLow + 4, Math.min(baseRangeHigh, 38));

  const summary = `Based on ${company.name}'s revenue profile, margin structure, and AI-demand backdrop, the most plausible medium-term pattern is a continued expansion phase as enterprise AI spending broadens, provided operating discipline remains intact.`;

  const insights = [
    `${company.name} is positioned most favourably when AI adoption moves from pilot programmes to production workloads, which historically supports higher valuation multiples in companies with strong gross margin and recurring demand.`,
    `The current mix of ${revenueGrowth}% revenue growth, ${grossMargin}% gross margin, and ${operatingMargin}% operating margin suggests the company is benefiting from operating leverage rather than pure cost-cutting alone.`,
    `The balance sheet and liquidity profile indicate ${debtToEquity <= 0.5 ? 'a relatively healthy capital structure' : 'a more levered profile'}, which matters because AI infrastructure cycles often reward firms that can fund expansion without damaging margins when rates are elevated.`,
    `In similar technology cycles, firms with ${aiDemand.includes('very high') ? 'very strong' : 'solid'} AI demand and durable enterprise relevance tend to hold a stronger forward price pattern even when short-term volatility is elevated.`
  ];

  return {
    summary,
    range: `${rangeLow}% to ${rangeHigh}% over the next 12 months, depending on adoption speed and rate conditions`,
    insights
  };
};

function App() {
  const [companies, setCompanies] = useState([]);
  const [opportunityCompanies, setOpportunityCompanies] = useState([]);
  const [filteredCompanies, setFilteredCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [currentTab, setCurrentTab] = useState('overview');
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // Connect to WebSocket for live updates
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    newSocket.on('live-prices', (data) => {
      setCompanies(data.companies);
      setFilteredCompanies(data.companies);
    });

    newSocket.on('connect_error', (error) => {
      console.log('Connection error:', error.message);
    });

    return () => newSocket.close();
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/companies?limit=100`);
      setCompanies(response.data.companies);
      setOpportunityCompanies(response.data.opportunityCompanies || []);
      setFilteredCompanies(response.data.companies);
    } catch (error) {
      console.error('Error fetching companies:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (query) => {
    if (!query) {
      setFilteredCompanies(companies);
    } else {
      const filtered = companies.filter(company =>
        company.name.toLowerCase().includes(query.toLowerCase()) ||
        company.symbol.toLowerCase().includes(query.toLowerCase())
      );
      setFilteredCompanies(filtered);
    }
  };

  return (
    <div className="App">
      <header className="header">
        <h1>🤖 AI Stock Tracker</h1>
        <p>Track share prices of the top 100 AI development companies</p>
      </header>

      <nav className="nav-tabs">
        <button
          className={`tab ${currentTab === 'overview' ? 'active' : ''}`}
          onClick={() => setCurrentTab('overview')}
        >
          Overview
        </button>
        <button
          className={`tab ${currentTab === 'gainers' ? 'active' : ''}`}
          onClick={() => setCurrentTab('gainers')}
        >
          Top Gainers
        </button>
        <button
          className={`tab ${currentTab === 'watchlist' ? 'active' : ''}`}
          onClick={() => setCurrentTab('watchlist')}
        >
          Watchlist
        </button>
      </nav>

      <main className="main-content">
        {currentTab === 'overview' && (
          <>
            <SearchBar onSearch={handleSearch} />
            {selectedCompany ? (
              <div className="detail-view">
                <button
                  className="back-button"
                  onClick={() => setSelectedCompany(null)}
                >
                  ← Back
                </button>
                <h2>{selectedCompany.name}</h2>
                <div className="detail-grid">
                  <div className="detail-item">
                    <label>Symbol:</label>
                    <span>{selectedCompany.symbol}</span>
                  </div>
                  <div className="detail-item">
                    <label>Founded:</label>
                    <span>{selectedCompany.founded}</span>
                  </div>
                  <div className="detail-item">
                    <label>Headquarters:</label>
                    <span>{selectedCompany.headquarters}</span>
                  </div>
                  <div className="detail-item">
                    <label>Rank:</label>
                    <span>#{selectedCompany.rank}</span>
                  </div>
                  <div className="detail-item">
                    <label>Price:</label>
                    <span>${selectedCompany.price.toFixed(2)}</span>
                  </div>
                  <div className="detail-item">
                    <label>Change:</label>
                    <span style={{ color: selectedCompany.change >= 0 ? '#28a745' : '#dc3545' }}>
                      {selectedCompany.change >= 0 ? '+' : ''}{selectedCompany.change.toFixed(2)}%
                    </span>
                  </div>
                </div>

                <div className="metrics-section">
                  <h3>Financial profile</h3>
                  <div className="metric-grid">
                    <div className="metric-card"><span>Market cap</span><strong>${selectedCompany.metrics?.marketCap ?? 0}B</strong></div>
                    <div className="metric-card"><span>Revenue TTM</span><strong>${selectedCompany.metrics?.revenueTtm ?? 0}B</strong></div>
                    <div className="metric-card"><span>Revenue growth</span><strong>{selectedCompany.metrics?.revenueGrowth ?? 0}%</strong></div>
                    <div className="metric-card"><span>Gross margin</span><strong>{selectedCompany.metrics?.grossMargin ?? 0}%</strong></div>
                    <div className="metric-card"><span>Operating margin</span><strong>{selectedCompany.metrics?.operatingMargin ?? 0}%</strong></div>
                    <div className="metric-card"><span>Free cash flow</span><strong>${selectedCompany.metrics?.freeCashFlow ?? 0}B</strong></div>
                    <div className="metric-card"><span>Debt-to-equity</span><strong>{selectedCompany.metrics?.debtToEquity ?? 0}</strong></div>
                    <div className="metric-card"><span>Current ratio</span><strong>{selectedCompany.metrics?.currentRatio ?? 0}</strong></div>
                    <div className="metric-card"><span>P/E ratio</span><strong>{selectedCompany.metrics?.peRatio ?? 0}</strong></div>
                    <div className="metric-card"><span>Cash balance</span><strong>${selectedCompany.metrics?.cashBalance ?? 0}B</strong></div>
                  </div>
                </div>

                <div className="context-section">
                  <h3>Macro-economic context</h3>
                  <div className="context-grid">
                    <div className="context-card">
                      <span>Inflation sensitivity</span>
                      <strong>{selectedCompany.macroContext?.inflationSensitivity ?? 'Not available'}</strong>
                    </div>
                    <div className="context-card">
                      <span>Interest rate sensitivity</span>
                      <strong>{selectedCompany.macroContext?.interestRateSensitivity ?? 'Not available'}</strong>
                    </div>
                    <div className="context-card">
                      <span>Demand cycle</span>
                      <strong>{selectedCompany.macroContext?.demandCycle ?? 'Not available'}</strong>
                    </div>
                    <div className="context-card">
                      <span>Supply chain risk</span>
                      <strong>{selectedCompany.macroContext?.supplyChainRisk ?? 'Not available'}</strong>
                    </div>
                    <div className="context-card">
                      <span>AI demand</span>
                      <strong>{selectedCompany.macroContext?.aiDemand ?? 'Not available'}</strong>
                    </div>
                  </div>
                </div>

                <div className="context-section">
                  <h3>Pattern references and historical context</h3>
                  <ul className="pattern-list">
                    {(selectedCompany.patternSignals || []).map((signal, index) => (
                      <li key={index}>
                        <strong>{signal.label}:</strong> {signal.description}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="context-section">
                  <h3>Analyst commentary and forward price outlook</h3>
                  <div className="outlook-box">
                    <p className="outlook-summary">
                      {buildCompanyCommentary(selectedCompany).summary}
                    </p>
                    <p className="outlook-range">
                      <strong>Pattern-based outlook:</strong> {buildCompanyCommentary(selectedCompany).range}
                    </p>
                    <ul className="pattern-list">
                      {(buildCompanyCommentary(selectedCompany).insights || []).map((insight, index) => (
                        <li key={index}>{insight}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <PriceChart symbol={selectedCompany.symbol} />
              </div>
            ) : (
              <>
                {loading ? (
                  <div className="loading">Loading companies...</div>
                ) : (
                  <>
                    <div className="panel-header">
                      <h3>Large-cap AI leaders</h3>
                    </div>
                    <CompanyTable
                      companies={filteredCompanies}
                      onSelectCompany={setSelectedCompany}
                    />

                    {opportunityCompanies.length > 0 && (
                      <div className="secondary-panel">
                        <div className="panel-header">
                          <h3>High-potential smaller-cap opportunities</h3>
                          <span>Growth-oriented names with potentially meaningful upside</span>
                        </div>
                        <CompanyTable
                          companies={opportunityCompanies}
                          onSelectCompany={setSelectedCompany}
                        />
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}

        {currentTab === 'gainers' && (
          <TopMovers type="gainers" />
        )}

        {currentTab === 'watchlist' && (
          <div className="watchlist-placeholder">
            <p>Sign in to manage your watchlist</p>
          </div>
        )}
      </main>

      <footer className="footer">
        <p>&copy; 2024 AI Stock Tracker. Real-time data powered by stock APIs.</p>
      </footer>
    </div>
  );
}

export default App;
