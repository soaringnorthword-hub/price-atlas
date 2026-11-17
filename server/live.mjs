// Official wholesale price feed: Ministry of Agriculture and Rural Affairs daily report.
// Endpoint: POST https://pfsc.agri.cn/api/FarmDaily/list (public, no auth)
// Basis: national wholesale market price, daily, CNY per kilogram.
// Fetch -> parse -> cache to disk. Runtime reads the cache, so an upstream outage
// never breaks the page.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, 'data', 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'agri-daily.json');

const API = 'https://pfsc.agri.cn/api/FarmDaily/list';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

/** Feed variety name -> product id in our catalogue (all wholesale). */
const NAME_TO_PRODUCT = {
  猪肉: { id: 'd0c2s0v0', label: '白条猪' },
  牛肉: { id: 'd0c2s2v0', label: '黄牛肉' },
  羊肉: { id: 'd0c2s3v0', label: '羊肉' },
  白条鸡: { id: 'd0c2s4v0', label: '白条鸡' },
  鸡蛋: { id: 'd0c2s5v0', label: '鸡蛋' },
  鲫鱼: { id: 'd0c3s1v0', label: '鲫鱼' },
  鲤鱼: { id: 'd0c3s2v0', label: '鲤鱼' },
  大带鱼: { id: 'd0c3s4v0', label: '带鱼(冷冻)' },
  带鱼: { id: 'd0c3s4v0', label: '带鱼(冷冻)' },
  草鱼: { id: 'd0c3s0v0', label: '草鱼' },
  白鲢鱼: { id: null, label: '白鲢鱼' },
};

/** Pull "variety + price" pairs out of a free-text sentence. */
function parseSentence(text) {
  const out = {};
  for (const seg of String(text || '').split(/[；;。]/)) {
    const m = seg.match(/([\u4e00-\u9fa5]{2,10}?)(?:平均价格为|平均价为|均价为|价格为)?(\d+(?:\.\d+)?)元\/(?:公斤|千克)/);
    if (!m) continue;
    let name = m[1].replace(/^(全国|其中|重点监测的\d+种)/, '');
    if (name.includes('蔬菜')) name = '蔬菜均价';
    else if (name.includes('水果')) name = '水果均价';
    // Strip a leading classifier such as the character for "kind".
    name = name.replace(/^种/, '');
    out[name] = Number(m[2]);
  }
  return out;
}

/** Wholesale price index published in the header paragraph. */
function parseIndex(text) {
  const m = String(text || '').match(/200指数[^0-9]{0,6}(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

function parseRow(row) {
  // The index lives inside the wordJson string, not in a top-level field.
  let wj = {};
  try {
    wj = JSON.parse(row.wordJson || '{}');
  } catch {
    wj = {};
  }
  const items = {
    ...parseSentence(row.animalConclusion),
    ...parseSentence(row.aquaticConclusion),
    ...parseSentence(row.vegetablesConclusion),
    ...parseSentence(row.fruitsConclusion),
  };
  return {
    date: String(row.daylyDate || '').slice(0, 10),
    index: parseIndex(wj.topdata),
    items,
    raw: {
      topdata: wj.topdata || '',
      animal: row.animalConclusion || '',
      aquatic: row.aquaticConclusion || '',
      vegetable: row.vegetablesConclusion || '',
      fruit: row.fruitsConclusion || '',
    },
  };
}

/** Fetch upstream; throws on failure so the caller can fall back to cache. */
export async function fetchLive(days = 120) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': UA,
      Referer: 'https://pfsc.agri.cn/',
    },
    body: JSON.stringify({ pageNum: 1, pageSize: days }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.code !== 200) throw new Error(json.message || 'upstream error');
  const rows = (json.content?.list || []).map(parseRow).filter((r) => r.date);
  rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  return rows;
}

function ensureDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

export function readCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(rows) {
  ensureDir();
  const payload = {
    source: 'moa_daily',
    sourceName: '农业农村部 全国农产品批发市场价格日报',
    sourceUrl: 'https://pfsc.agri.cn/',
    basis: 'wholesale',
    unit: 'kg',
    fetchedAt: new Date().toISOString(),
    latest: rows.length ? rows[rows.length - 1].date : null,
    count: rows.length,
    rows,
  };
  fs.writeFileSync(CACHE_FILE, JSON.stringify(payload), 'utf8');
  return payload;
}

/** Refresh on boot; keep the previous cache if the fetch fails. */
export async function refreshLive(days = 120) {
  try {
    const rows = await fetchLive(days);
    if (!rows.length) throw new Error('empty');
    return writeCache(rows);
  } catch (err) {
    const cached = readCache();
    console.warn(`[live] fetch failed (${err.message}); using cache: ${cached?.latest ?? 'none'}`);
    return cached;
  }
}

/* ---------------- series and forecast ---------------- */

/** Official series for one product (wholesale, CNY/kg). */
export function liveSeries(productId) {
  const cache = readCache();
  if (!cache) return null;
  const names = Object.entries(NAME_TO_PRODUCT)
    .filter(([, v]) => v.id === productId)
    .map(([n]) => n);
  if (!names.length) return null;
  const points = [];
  for (const r of cache.rows) {
    for (const n of names) {
      const v = r.items?.[n];
      if (v != null) {
        points.push({ date: r.date, value: v });
        break;
      }
    }
  }
  if (points.length < 10) return null;
  return {
    productId,
    source: cache.source,
    sourceName: cache.sourceName,
    sourceUrl: cache.sourceUrl,
    basis: cache.basis,
    unit: cache.unit,
    fetchedAt: cache.fetchedAt,
    latestDate: points[points.length - 1].date,
    points,
  };
}

/**
 * Log-linear trend extrapolation: next-month mean of a 30-day window plus an 80%
 * interval. Deliberately simple and explainable.
 */
export function forecastNextMonth(points, { window = 60 } = {}) {
  if (!points || points.length < 20) return null;
  const tail = points.slice(-window);
  const n = tail.length;
  const ys = tail.map((p) => Math.log(p.value));
  const xs = tail.map((_, i) => i);
  const mx = (n - 1) / 2;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const b = sxx ? sxy / sxx : 0;
  const a = my - b * mx;
  // residual standard error
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const fit = a + b * xs[i];
    sse += (ys[i] - fit) ** 2;
  }
  const sigma = Math.sqrt(sse / Math.max(1, n - 2));
  // midpoint of the next 30 days
  const tMid = n - 1 + 15;
  const yhat = a + b * tMid;
  const half = 1.2816 * sigma; // 80% interval
  const value = Math.exp(yhat);
  const low = Math.exp(yhat - half);
  const high = Math.exp(yhat + half);
  const last = tail[n - 1].value;
  return {
    value: Number(value.toFixed(4)),
    low: Number(low.toFixed(4)),
    high: Number(high.toFixed(4)),
    changePct: Number((((value - last) / last) * 100).toFixed(2)),
    slopePerDayPct: Number(((Math.exp(b) - 1) * 100).toFixed(4)),
    windowDays: n,
    confidence: Number((Math.max(0.2, Math.min(0.95, 1 - sigma * 4)).toFixed(2))),
    method: '对数线性趋势外推（近 60 日）',
  };
}

/** Latest official quote per product, used to anchor the price level. */
export function liveAnchor() {
  const cache = readCache();
  if (!cache) return {};
  const out = {};
  const seen = new Set();
  for (const [, meta] of Object.entries(NAME_TO_PRODUCT)) {
    if (!meta.id || seen.has(meta.id)) continue;
    const s = liveSeries(meta.id);
    if (s) {
      seen.add(meta.id);
      out[meta.id] = {
        value: s.points[s.points.length - 1].value,
        date: s.latestDate,
      };
    }
  }
  return out;
}

/** Which products currently have an official series. */
export function liveCoverage() {
  const cache = readCache();
  if (!cache) return { available: false, fetchedAt: null, latest: null, products: [] };
  const seen = new Set();
  const products = [];
  for (const [, meta] of Object.entries(NAME_TO_PRODUCT)) {
    if (!meta.id || seen.has(meta.id)) continue;
    const s = liveSeries(meta.id);
    if (s) {
      seen.add(meta.id);
      products.push({
        id: meta.id,
        label: meta.label,
        points: s.points.length,
        last: s.points[s.points.length - 1].value,
        date: s.latestDate,
      });
    }
  }
  return {
    available: true,
    sourceName: cache.sourceName,
    sourceUrl: cache.sourceUrl,
    basis: cache.basis,
    fetchedAt: cache.fetchedAt,
    latest: cache.latest,
    days: cache.count,
    products,
  };
}
