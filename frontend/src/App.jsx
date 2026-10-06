import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import CompanyTable from './components/CompanyTable';
import SearchBar from './components/SearchBar';
import PriceChart from './components/PriceChart';
import TopMovers from './components/TopMovers';
import AIBXLCorrelationChart from './components/AIBXChart';
import AIBXLChart from './components/AIBXLChart';
import MomentumVolatilityChart from './components/MomentumVolatilityChart';
import PerformanceVsAIBXL from './components/PerformanceVsAIBXL';
import FundamentalsPanel from './components/FundamentalsPanel';
import RealYieldsChart from './components/RealYieldsChart';
import CurrencyStrengthChart from './components/CurrencyStrengthChart';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

const formatBillions = (value) => value == null ? 'Unavailable' : `$${Number(value).toFixed(2)}B`;

function App() {
  const [companies, setCompanies] = useState([]);
  const [opportunityCompanies, setOpportunityCompanies] = useState([]);
  const [filteredCompanies, setFilteredCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [currentTab, setCurrentTab] = useState('overview');
  const [socket, setSocket] = useState(null);
  const [lastRefreshInfo, setLastRefreshInfo] = useState({
    status: 'idle',
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null
  });

  const openCompanyProfile = (company) => {
    setSelectedCompany(company);
    setCurrentTab('overview');
  };

  const aibxlCompanies = companies
    .slice()
    .sort((companyA, companyB) => (
      Number(companyB.metrics?.marketCap ?? companyB.marketCap ?? 0) -
      Number(companyA.metrics?.marketCap ?? companyA.marketCap ?? 0)
    ))
    .slice(0, 10);
  const momentumCompanies = [...aibxlCompanies, ...opportunityCompanies];

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
    fetchRefreshStatus();
    const statusRefreshTimer = setInterval(fetchRefreshStatus, 60000);
    return () => clearInterval(statusRefreshTimer);
  }, []);

  const fetchRefreshStatus = async () => {
    try {
      const response = await axios.get(`${API_URL}/prices/refresh-status`);
      setLastRefreshInfo(response.data);
    } catch (error) {
      console.error('Error fetching refresh status:', error);
    }
  };

  const triggerManualRefresh = async () => {
    try {
      const response = await axios.post(`${API_URL}/prices/refresh-now`);
      setLastRefreshInfo(response.data.lastRefresh || { status: 'success' });
      await fetchCompanies();
    } catch (error) {
      console.error('Error triggering manual refresh:', error);
      setLastRefreshInfo((prev) => ({ ...prev, status: 'failed', lastError: error.message }));
    }
  };

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
        <p>Track share prices of {companies.length + opportunityCompanies.length || ''} AI development companies</p>
        <p style={{ marginTop: '8px', opacity: 0.9 }}>
          Data refresh: {lastRefreshInfo.status === 'success' ? 'Up to date' : lastRefreshInfo.status === 'partial' ? 'Partially refreshed' : lastRefreshInfo.status === 'running' ? 'Refreshing…' : 'Needs attention'}
          {lastRefreshInfo.lastSuccessAt ? ` • Last updated ${new Date(lastRefreshInfo.lastSuccessAt).toLocaleString()}` : ''}
          {lastRefreshInfo.lastError ? ` • ${lastRefreshInfo.lastError}` : ''}
        </p>
        <button
          type="button"
          onClick={triggerManualRefresh}
          style={{ marginTop: '10px', padding: '8px 14px', borderRadius: '8px', border: '1px solid #0f766e', background: '#0f766e', color: '#fff', cursor: 'pointer' }}
        >
          Refresh now
        </button>
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
          className={`tab ${currentTab === 'aibxlCorrelation' ? 'active' : ''}`}
          onClick={() => setCurrentTab('aibxlCorrelation')}
        >
          AIBXL Correlation
        </button>
        <button
          className={`tab ${currentTab === 'momentumVolatility' ? 'active' : ''}`}
          onClick={() => setCurrentTab('momentumVolatility')}
        >
          Momentum &amp; Volatility
        </button>
        <button
          className={`tab ${currentTab === 'fundamentals' ? 'active' : ''}`}
          onClick={() => setCurrentTab('fundamentals')}
        >
          Fundamentals
        </button>
        <button
          className={`tab ${currentTab === 'realYields' ? 'active' : ''}`}
          onClick={() => setCurrentTab('realYields')}
        >
          Real Yields
        </button>
        <button
          className={`tab ${currentTab === 'currencyStrength' ? 'active' : ''}`}
          onClick={() => setCurrentTab('currencyStrength')}
        >
          Currency Strength
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
                    <span>
                      {selectedCompany.price == null ? 'Unavailable' : `$${selectedCompany.price.toFixed(2)}`}
                      {selectedCompany.marketData?.dataStatus === 'stale' && <span className="stale-badge">Stale</span>}
                    </span>
                  </div>
                  <div className="detail-item">
                    <label>Change:</label>
                    <span style={{ color: selectedCompany.change >= 0 ? '#28a745' : '#dc3545' }}>
                      {selectedCompany.change == null ? 'N/A' : `${selectedCompany.change >= 0 ? '+' : ''}${selectedCompany.change.toFixed(2)}%`}
                    </span>
                  </div>
                </div>

                <div className="metrics-section">
                  <h3>Financial profile</h3>
                  <div className="metric-grid">
                    <div className="metric-card"><span>Market cap</span><strong>{selectedCompany.metrics?.marketCap == null ? 'Unavailable' : `$${selectedCompany.metrics.marketCap}B`}</strong></div>
                    <div className="metric-card"><span>Revenue TTM</span><strong>{selectedCompany.metrics?.revenueTtm == null ? 'Unavailable' : `$${selectedCompany.metrics.revenueTtm}B`}</strong></div>
                    <div className="metric-card"><span>Revenue growth</span><strong>{selectedCompany.metrics?.revenueGrowth == null ? 'Unavailable' : `${selectedCompany.metrics.revenueGrowth}%`}</strong></div>
                    <div className="metric-card"><span>Gross margin</span><strong>{selectedCompany.metrics?.grossMargin == null ? 'Unavailable' : `${selectedCompany.metrics.grossMargin}%`}</strong></div>
                    <div className="metric-card"><span>Operating margin</span><strong>{selectedCompany.metrics?.operatingMargin == null ? 'Unavailable' : `${selectedCompany.metrics.operatingMargin}%`}</strong></div>
                    <div className="metric-card"><span>Free cash flow</span><strong>{selectedCompany.metrics?.freeCashFlow == null ? 'Unavailable' : `$${selectedCompany.metrics.freeCashFlow}B`}</strong></div>
                    <div className="metric-card"><span>Debt-to-equity</span><strong>{selectedCompany.metrics?.debtToEquity == null ? 'Unavailable' : selectedCompany.metrics.debtToEquity}</strong></div>
                    <div className="metric-card"><span>Current ratio</span><strong>{selectedCompany.metrics?.currentRatio == null ? 'Unavailable' : selectedCompany.metrics.currentRatio}</strong></div>
                    <div className="metric-card"><span>P/E ratio</span><strong>{selectedCompany.metrics?.peRatio == null ? 'Unavailable' : selectedCompany.metrics.peRatio > 200 ? 'N/M (>200)' : selectedCompany.metrics.peRatio}</strong></div>
                    <div className="metric-card"><span>Cash balance</span><strong>{selectedCompany.metrics?.cashBalance == null ? 'Unavailable' : `$${selectedCompany.metrics.cashBalance}B`}</strong></div>
                  </div>
                </div>

                <div className="accounting-section">
                  <h3>Quarterly accounting data</h3>
                  {selectedCompany.accounting?.dataStatus === 'unavailable' || (
                    !selectedCompany.accounting?.incomeStatement?.length &&
                    !selectedCompany.accounting?.balanceSheet?.length
                  ) ? (
                    <div className="chart-empty">
                      Quarterly accounting data is unavailable until Twelve Data fundamentals are fetched.
                    </div>
                  ) : (
                  <div className="accounting-grid">
                    <div className="statement-panel">
                      <h4>Statement of profit and loss</h4>
                      <div className="table-wrap">
                        <table className="statement-table">
                          <thead>
                            <tr>
                              <th>Quarter</th>
                              <th>Revenue</th>
                              <th>Gross profit</th>
                              <th>Operating income</th>
                              <th>Net income</th>
                              <th>EBITDA</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(selectedCompany.accounting?.incomeStatement || []).map((row) => (
                              <tr key={row.quarter}>
                                <td>{row.quarter}</td>
                                <td>{formatBillions(row.revenue)}</td>
                                <td>{formatBillions(row.grossProfit)}</td>
                                <td>{formatBillions(row.operatingIncome)}</td>
                                <td>{formatBillions(row.netIncome)}</td>
                                <td>{formatBillions(row.ebitda)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="statement-panel">
                      <h4>Balance sheet</h4>
                      <div className="table-wrap">
                        <table className="statement-table">
                          <thead>
                            <tr>
                              <th>Quarter</th>
                              <th>Cash</th>
                              <th>Current assets</th>
                              <th>Current liabilities</th>
                              <th>Debt</th>
                              <th>Shareholders' equity</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(selectedCompany.accounting?.balanceSheet || []).map((row) => (
                              <tr key={row.quarter}>
                                <td>{row.quarter}</td>
                                <td>{formatBillions(row.cash)}</td>
                                <td>{formatBillions(row.currentAssets)}</td>
                                <td>{formatBillions(row.currentLiabilities)}</td>
                                <td>{formatBillions(row.longTermDebt)}</td>
                                <td>{formatBillions(row.shareholdersEquity)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                  )}
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

                <PriceChart symbol={selectedCompany.symbol} />
                <AIBXLChart companies={companies} onSelectCompany={openCompanyProfile} />
                <PerformanceVsAIBXL company={selectedCompany} companies={companies} />
                {opportunityCompanies.some((company) => company.symbol === selectedCompany.symbol) && (
                  <AIBXLCorrelationChart company={selectedCompany} companies={companies} />
                )}
                <MomentumVolatilityChart company={selectedCompany} onSelectCompany={openCompanyProfile} />
                <FundamentalsPanel company={selectedCompany} />
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

        {currentTab === 'aibxlCorrelation' && (
          <div className="aibxl-correlation-tab">
            <div className="panel-header aibxl-correlation-header">
              <h3>AIBXL Correlation</h3>
              <span>Basket influence by emerging company</span>
            </div>

            {opportunityCompanies.length > 0 ? (
              <>
                <AIBXLChart companies={companies} onSelectCompany={openCompanyProfile} />
                <div className="aibxl-correlation-grid">
                  {opportunityCompanies.map((company) => (
                    <div key={company.symbol} className="aibxl-correlation-card">
                      <div className="aibxl-correlation-card-header">
                        <div>
                          <h4>{company.name}</h4>
                          <span>{company.symbol}</span>
                        </div>
                        <button
                          type="button"
                          className="aibxl-correlation-profile-button"
                          onClick={() => openCompanyProfile(company)}
                        >
                          Open profile
                        </button>
                      </div>
                      <AIBXLCorrelationChart company={company} companies={companies} />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="loading">Loading AIBXL Correlation data...</div>
            )}
          </div>
        )}

        {currentTab === 'momentumVolatility' && (
          <div className="momentum-volatility-tab">
            <div className="panel-header">
              <h3>Momentum &amp; Volatility</h3>
              <span>Real price-history momentum and volatility for AIBXL constituents and smaller AIBX companies</span>
            </div>
            {momentumCompanies.length > 0 ? (
              <div className="momentum-volatility-grid">
                {momentumCompanies.map((company) => (
                  <MomentumVolatilityChart company={company} onSelectCompany={openCompanyProfile} key={company.symbol} />
                ))}
              </div>
            ) : (
              <div className="loading">Loading Momentum &amp; Volatility data...</div>
            )}
          </div>
        )}

        {currentTab === 'fundamentals' && (
          <div className="fundamentals-tab">
            <div className="panel-header">
              <h3>Fundamentals</h3>
              <span>SEC-derived accounting data for AIBXL constituents and smaller AIBX companies</span>
            </div>
            {momentumCompanies.length > 0 ? (
              <div className="fundamentals-grid">
                {momentumCompanies.map((company) => (
                  <FundamentalsPanel company={company} onSelectCompany={openCompanyProfile} key={company.symbol} />
                ))}
              </div>
            ) : (
              <div className="loading">Loading Fundamentals data...</div>
            )}
          </div>
        )}

        {currentTab === 'realYields' && <RealYieldsChart />}

        {currentTab === 'currencyStrength' && <CurrencyStrengthChart />}

      </main>

      <footer className="footer">
        <p>AI Stock Tracker &middot; Prices: Twelve Data (daily closes) &middot; Fundamentals: SEC EDGAR &middot; Yields: FRED &middot; FX: Frankfurter (ECB). For research and education only; not investment advice.</p>
      </footer>
    </div>
  );
}

export default App;
