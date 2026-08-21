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
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const formatBillions = (value) => value == null ? 'Unavailable' : `$${Number(value).toFixed(2)}B`;

const patternFormula = {
  base: 50,
  revenueGrowth: 0.45,
  grossMargin: 0.24,
  operatingMargin: 0.17,
  freeCashFlow: 0.11,
  aiDemand: 0.18,
  rateSensitivity: -0.1,
  debtToEquity: -0.08,
  peRatio: -0.09,
  currentRatio: 0.06,
  marketCap: 0.04
};

const calculatePatternScore = (company) => {
  if (!company) return 0;

  const metrics = company.metrics || {};
  const macro = company.macroContext || {};

  const revenueGrowth = Number(metrics.revenueGrowth || 0);
  const grossMargin = Number(metrics.grossMargin || 0);
  const operatingMargin = Number(metrics.operatingMargin || 0);
  const freeCashFlow = Number(metrics.freeCashFlow || 0);
  const debtToEquity = Number(metrics.debtToEquity || 0);
  const peRatio = Number(metrics.peRatio || 0);
  const currentRatio = Number(metrics.currentRatio || 0);
  const marketCap = Number(metrics.marketCap || 0);
  const aiDemand = String(macro.aiDemand || '').toLowerCase();
  const rateSensitivity = String(macro.interestRateSensitivity || '').toLowerCase();

  const revenueScore = clamp((revenueGrowth / 2) * patternFormula.revenueGrowth, 0, 18);
  const grossMarginScore = clamp((grossMargin / 2) * patternFormula.grossMargin, 0, 12);
  const operatingMarginScore = clamp((operatingMargin / 2) * patternFormula.operatingMargin, 0, 9);
  const cashFlowScore = clamp((freeCashFlow / 2) * patternFormula.freeCashFlow, 0, 6);
  const marketCapScore = clamp((marketCap / 10) * patternFormula.marketCap, 0, 4);
  const liquidityScore = clamp((currentRatio / 2) * patternFormula.currentRatio, 0, 4);

  const aiDemandScore = aiDemand.includes('very high') ? 12 : aiDemand.includes('high') ? 8 : 4;
  const rateRisk = rateSensitivity.includes('high') ? 8 : rateSensitivity.includes('moderate') ? 4 : 0;
  const leveragePenalty = debtToEquity > 1 ? 10 : debtToEquity > 0.5 ? 6 : 2;
  const valuationPenalty = peRatio > 60 ? 11 : peRatio > 45 ? 7 : 2;

  let score = patternFormula.base + revenueScore + grossMarginScore + operatingMarginScore + cashFlowScore + marketCapScore + liquidityScore + aiDemandScore;
  score -= rateRisk + leveragePenalty + valuationPenalty;
  score = clamp(Math.round(score), 0, 100);

  return score;
};

const buildCompanyCommentary = (company) => {
  if (!company) {
    return {
      summary: 'No company profile available.',
      range: 'Not enough information for a forward view.',
      insights: [],
      score: 0,
      direction: 'N/A',
      catalysts: [],
      risks: [],
      simplePatterns: []
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
  const currentRatio = Number(metrics.currentRatio || 0);
  const marketCap = Number(metrics.marketCap || 0);
  const aiDemand = String(macro.aiDemand || '').toLowerCase();
  const rateSensitivity = String(macro.interestRateSensitivity || '').toLowerCase();
  const demandCycle = String(macro.demandCycle || '').toLowerCase();

  const score = calculatePatternScore(company);

  const direction = score >= 75 ? 'Bullish' : score >= 60 ? 'Constructive' : score >= 45 ? 'Neutral' : 'Cautious';

  const simplePatterns = [
    revenueGrowth > 20
      ? 'Revenue acceleration has historically been a precursor to stronger share-price momentum when the company maintains high gross margin.'
      : 'Growth is moderate, so the stock is more dependent on operating leverage and execution than on a broad revenue surprise.',
    grossMargin > 70
      ? 'High gross margin suggests the company is monetising AI demand efficiently, which often supports premium valuation and better price resilience.'
      : 'Margin quality is useful but not yet powerful enough to fully offset heavier operating costs or a weaker pricing environment.',
    aiDemand.includes('very high')
      ? 'AI demand is unusually strong, which tends to widen the earnings runway when infrastructure and enterprise adoption expand.'
      : 'The company remains exposed to normal enterprise adoption curves, so price moves may be more dependent on execution and capital allocation.'
  ];

  const catalysts = [];
  if (revenueGrowth > 20) catalysts.push('Revenue acceleration pattern: premium software and infrastructure names often rally when growth remains above 20% and AI demand continues to broaden.');
  if (grossMargin > 70) catalysts.push('Margin expansion cycle: companies with high software-like margins can sustain valuation uplift as AI monetisation scales.');
  if (demandCycle.includes('enterprise') || demandCycle.includes('cloud') || demandCycle.includes('infrastructure')) catalysts.push('Enterprise AI conversion pattern: as projects move from pilot testing to deployment, proven infrastructure providers often see stronger follow-through pricing.');
  if (aiDemand.includes('very high')) catalysts.push('Demand-led pricing cycle: the strongest AI names usually benefit from a compound effect where demand growth, usage intensity, and capital expenditure all move together.');
  if (!catalysts.length) catalysts.push('The company is more dependent on execution and timing than a clean AI demand surge, so price momentum may be less persistent.');

  const risks = [];
  if (rateSensitivity.includes('high')) risks.push('Higher-rate sensitivity can compress valuation multiples even when revenue growth remains healthy, especially in capital-intensive AI plays.');
  if (debtToEquity > 1) risks.push('Leverage creates more vulnerability if AI spending slows or if the company needs to fund continued expansion internally.');
  if (peRatio > 50) risks.push('A premium valuation can limit upside unless revenue and margin expansion materially exceed expectations.');
  if (currentRatio < 1.5) risks.push('Weaker liquidity can make pricing more fragile when operating costs or capital requirements rise unexpectedly.');
  if (!risks.length) risks.push('The profile is relatively balanced, but valuation and execution still matter because AI leadership can shift quickly in crowded sectors.');

  const expectedReturn = Math.max(8, Math.min(32, Math.round(score / 3.2)));

  const rangeLow = Math.max(6, Math.min(Math.round(expectedReturn * 0.7), 22));
  const rangeHigh = Math.max(rangeLow + 4, Math.min(Math.round(expectedReturn * 1.15), 36));

  const summary = `The pattern recognition model suggests ${company.name} is currently ${direction.toLowerCase()} because the company combines ${revenueGrowth}% revenue growth, ${grossMargin}% gross margin, and ${aiDemand.includes('very high') ? 'very strong' : 'meaningful'} AI demand with ${debtToEquity <= 0.5 ? 'a relatively healthy balance sheet' : 'a more levered capital structure'}. In similar AI cycles, names with this mix have often seen price strength when enterprise deployment follows early experimentation.`;

  const insights = [
    `${company.name} shows the classic revenue-to-price pattern: when growth stays above 20% and margins remain elevated, the market typically rewards sustained customer adoption before earnings fully catch up.`,
    `The balance of ${operatingMargin}% operating margin and ${freeCashFlow}B free cash flow suggests the firm is more likely to convert AI demand into cash generation rather than simply expanding cost structure.`,
    `The most advanced pattern in this sector is not just strong revenue; it is the combination of AI demand, margin quality, and rate sensitivity. Companies that can grow without sacrificing operating leverage often outperform during the next phase of AI infrastructure expansion.`,
    `The key risk is valuation discipline: a company can be fundamentally attractive but still struggle if its price is priced for perfection before the next revenue milestone arrives.`
  ];

  const currentPrice = Number.isFinite(Number(company.price)) ? Number(company.price) : null;
  const scenarios = [
    {
      label: 'Bull case',
      returnPct: Math.max(12, Math.min(40, Math.round(score / 2.3))),
      description: 'Demand broadens quickly, enterprise adoption accelerates, and AI monetisation compounds faster than expected.',
      price: currentPrice === null ? null : (currentPrice * (1 + Math.max(12, Math.min(40, Math.round(score / 2.3))) / 100)).toFixed(2)
    },
    {
      label: 'Base case',
      returnPct: Math.max(6, Math.min(22, Math.round(score / 4))),
      description: 'Revenue momentum remains healthy while the company executes on AI projects without major disruption.',
      price: currentPrice === null ? null : (currentPrice * (1 + Math.max(6, Math.min(22, Math.round(score / 4))) / 100)).toFixed(2)
    },
    {
      label: 'Bear case',
      returnPct: Math.max(-18, Math.min(-4, -Math.round(score / 7))),
      description: 'AI demand stays uneven, valuations compress, or enterprise deployment slows before revenue converts to cash.',
      price: currentPrice === null ? null : (currentPrice * (1 + Math.max(-18, Math.min(-4, -Math.round(score / 7))) / 100)).toFixed(2)
    }
  ];

  return {
    summary,
    range: `${rangeLow}% to ${rangeHigh}% over the next 12 months, with the range widening if AI demand remains strong and funding conditions stay stable`,
    insights,
    score,
    direction,
    catalysts,
    risks,
    simplePatterns,
    scenarios
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

  const sectorUniverse = [...companies, ...opportunityCompanies];
  const sectorSnapshot = sectorUniverse.length
    ? {
        avgRevenueGrowth: sectorUniverse.reduce((sum, company) => sum + Number(company.metrics?.revenueGrowth || 0), 0) / sectorUniverse.length,
        avgGrossMargin: sectorUniverse.reduce((sum, company) => sum + Number(company.metrics?.grossMargin || 0), 0) / sectorUniverse.length,
        avgOperatingMargin: sectorUniverse.reduce((sum, company) => sum + Number(company.metrics?.operatingMargin || 0), 0) / sectorUniverse.length,
        avgPeRatio: sectorUniverse.reduce((sum, company) => sum + Number(company.metrics?.peRatio || 0), 0) / sectorUniverse.length,
        avgPriceChange: sectorUniverse.reduce((sum, company) => sum + Number(company.change || 0), 0) / sectorUniverse.length,
        avgMarketCap: sectorUniverse.reduce((sum, company) => sum + Number(company.metrics?.marketCap || 0), 0) / sectorUniverse.length,
      }
    : {
        avgRevenueGrowth: 0,
        avgGrossMargin: 0,
        avgOperatingMargin: 0,
        avgPeRatio: 0,
        avgPriceChange: 0,
        avgMarketCap: 0,
      };

  return (
    <div className="App">
      <header className="header">
        <h1>🤖 AI Stock Tracker</h1>
        <p>Track share prices of the top 100 AI development companies</p>
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
                    <div className="metric-card"><span>P/E ratio</span><strong>{selectedCompany.metrics?.peRatio == null ? 'Unavailable' : selectedCompany.metrics.peRatio}</strong></div>
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
