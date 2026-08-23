const enrichCompanyAccounting = (company, priceData = [], accounting = null) => {
  const realMetrics = accounting?.metrics || {};
  const sharesOutstandingMillions = realMetrics.sharesOutstandingMillions;
  const sharesOutstanding = sharesOutstandingMillions == null ? null : sharesOutstandingMillions * 1_000_000;

  const alignedSeries = priceData && Array.isArray(priceData) && priceData.length > 0 ? priceData : [];
  const latestPrice = alignedSeries.length > 0 ? alignedSeries[alignedSeries.length - 1].adjustedClose : null;
  const latestChange = alignedSeries.length > 1
    ? Number((((alignedSeries[alignedSeries.length - 1].adjustedClose - alignedSeries[alignedSeries.length - 2].adjustedClose) / alignedSeries[alignedSeries.length - 2].adjustedClose) * 100).toFixed(2))
    : null;

  return {
    ...company,
    price: latestPrice,
    change: latestChange,
    sharesOutstanding,
    metrics: {
      ...realMetrics,
      marketCap: latestPrice != null && sharesOutstandingMillions != null
        ? Number((latestPrice * sharesOutstandingMillions / 1000).toFixed(2))
        : null,
      sharesOutstanding: sharesOutstandingMillions
    },
    priceHistory: alignedSeries,
    dailyAdjustedClose: alignedSeries.map(point => ({
      date: point.date,
      adjustedClose: point.adjustedClose,
      close: point.close,
      timestamp: point.timestamp
    })),
    marketData: {
      sharesOutstanding,
      adjustmentMethod: 'Twelve Data daily adjusted close',
      dataStatus: alignedSeries.length > 0 ? 'available' : 'unavailable',
      snapshotTime: '16:00 ET',
      dateCoverage: alignedSeries.length,
      dateIndex: alignedSeries.map(point => point.date),
      dataSource: 'Twelve Data API',
      lastUpdate: alignedSeries.length > 0 ? alignedSeries[alignedSeries.length - 1].date : 'N/A'
    },
    accounting: accounting || {
      reportingPeriod: 'Unavailable',
      dataSource: 'Twelve Data fundamentals API',
      dataStatus: 'unavailable',
      incomeStatement: [],
      balanceSheet: []
    }
  };
};

const syncDatabasePrices = (db, pricesCache = {}, fundamentalsCache = {}) => {
  if (!db) return;

  const dbCompanies = [...(db.companies || []), ...(db.opportunityCompanies || [])];
  dbCompanies.forEach(company => {
    const history = pricesCache[company.symbol] || [];
    const refreshedCompany = enrichCompanyAccounting(company, history, fundamentalsCache[company.symbol]);
    Object.assign(company, refreshedCompany);
  });

  return db;
};

export { enrichCompanyAccounting, syncDatabasePrices };
export default { enrichCompanyAccounting, syncDatabasePrices };
