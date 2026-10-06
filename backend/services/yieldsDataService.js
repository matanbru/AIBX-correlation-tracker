import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data');
const YIELDS_FILE = path.join(DATA_DIR, 'yields.json');
const API_BASE = 'https://api.stlouisfed.org/fred/series/observations';

export const YIELD_SERIES = {
  '10y': 'DFII10',
  '30y': 'DFII30',
  nominal10y: 'DGS10',
  nominal30y: 'DGS30',
  breakeven10y: 'T10YIE'
};

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const getApiKey = () => process.env.FRED_API_KEY;
const CSV_BASE = 'https://fred.stlouisfed.org/graph/fredgraph.csv';
const START_DATE = '2020-01-01';

const loadYieldsFromDisk = () => {
  if (!fs.existsSync(YIELDS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(YIELDS_FILE, 'utf8'));
  } catch (error) {
    console.error('Error reading yields.json:', error.message);
    return {};
  }
};

const saveYieldsToDisk = (yields) => {
  fs.writeFileSync(YIELDS_FILE, JSON.stringify(yields, null, 2), 'utf8');
  console.log(`Yields saved to ${YIELDS_FILE}`);
};

// FRED publishes the same series as a public CSV, so no API key is required.
const fetchSeriesCsv = async (seriesId) => {
  const response = await fetch(`${CSV_BASE}?id=${seriesId}&cosd=${START_DATE}`);
  if (!response.ok) throw new Error(`FRED CSV HTTP ${response.status} for ${seriesId}`);
  const lines = (await response.text()).trim().split(/\r?\n/).slice(1);
  return lines
    .map((line) => {
      const [date, value] = line.split(',');
      return { date, value: value && value.trim() !== '.' ? Number(value) : NaN };
    })
    .filter((observation) => observation.date && Number.isFinite(observation.value));
};

const fetchSeries = async (seriesId) => {
  const apiKey = getApiKey();
  if (!apiKey) return fetchSeriesCsv(seriesId);

  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: 'json',
    observation_start: START_DATE,
    sort_order: 'asc'
  });
  const response = await fetch(`${API_BASE}?${params}`);
  const data = await response.json();
  if (!response.ok || data.error_code) {
    throw new Error(data.error_message || `FRED HTTP ${response.status}`);
  }

  return (data.observations || [])
    .map((observation) => ({ date: observation.date, value: observation.value && observation.value !== '.' ? Number(observation.value) : NaN }))
    .filter((observation) => observation.date && Number.isFinite(observation.value));
};

const refreshYields = async () => {
  const yields = loadYieldsFromDisk();
  const entries = await Promise.all(
    Object.entries(YIELD_SERIES).map(async ([key, seriesId]) => [key, await fetchSeries(seriesId)])
  );
  entries.forEach(([key, values]) => { yields[key] = values; });
  yields.updatedAt = new Date().toISOString();
  saveYieldsToDisk(yields);
  return yields;
};

const rangeStart = (range) => {
  const now = new Date();
  const years = { '1y': 1, '3y': 3, '5y': 5 }[range] || 1;
  now.setFullYear(now.getFullYear() - years);
  return now.toISOString().slice(0, 10);
};

const getSeries = (series, range = '1y') => {
  const yields = loadYieldsFromDisk();
  const values = yields[series] || [];
  return values.filter((point) => point.date >= rangeStart(range));
};

export default {
  loadYieldsFromDisk,
  saveYieldsToDisk,
  refreshYields,
  getSeries
};