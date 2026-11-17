// Price query layer: quote generation, fusion, time series, ranking.
//
// Two bases, kept strictly apart:
//   retail    = base x city factor (channel sensitivity 1.15) x season x residual
//   wholesale = retail / (1 + category markup), city sensitivity 0.72
// A source only ever feeds the basis it is registered under.
import { PRODUCTS, PRODUCT_MAP, SUBCAT_MAP, DOMAINS, CATEGORIES, SUBSPECIES, STATS } from './data/taxonomy.mjs';
import { CITIES, CITY_MAP, COUNTRIES, CITY_STATS } from './data/cities.mjs';
import { SOURCES, SOURCE_MAP, DOMAIN_SOURCES, TIERS, TIER_ORDER, SOURCE_STATS, BASIS } from './data/sources.mjs';
import { fuse } from './engine.mjs';
import { liveAnchor } from './live.mjs';

/* ---------- deterministic PRNG ---------- */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rnd) {
  const u = Math.max(1e-9, rnd());
  const v = Math.max(1e-9, rnd());
  // Truncated at +/-2 sigma so one extreme quote cannot drag a whole city average
  return Math.max(-2, Math.min(2, Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)));
}

/* ---------- month axis ---------- */
const AS_OF = Date.UTC(2026, 10, 16);
export const MONTHS = [];
for (let k = 11; k >= 0; k--) {
  const d = new Date(Date.UTC(2026, 10 - k, 1));
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  MONTHS.push({
    idx: 11 - k,
    key: `${y}-${String(m).padStart(2, '0')}`,
    label: `${y}年${m}月`,
    short: `${m}月`,
    ageDays: Math.round((AS_OF - d.getTime()) / 86400000) + 15,
  });
}
export const LATEST = MONTHS[MONTHS.length - 1].idx;
export const LATEST_LABEL = MONTHS[MONTHS.length - 1].label;

/* ---------- source coverage by tier ---------- */
const COVERAGE = { A: 0.97, B: 0.95, C: 0.9, D: 0.78, E: 0.56, F: 0.28 };
const POOL_CACHE = new Map();
function sourcePool(domainKey, scope, basis) {
  const key = `${domainKey}|${scope}|${basis}`;
  if (!POOL_CACHE.has(key)) {
    const ids = DOMAIN_SOURCES[domainKey]?.[scope] ?? [];
    const pool = ids
      .map((id) => SOURCE_MAP.get(id))
      .filter((s) => s && s.basis === basis)
      .sort((a, b) => TIERS[b.tier].weight - TIERS[a.tier].weight);
    POOL_CACHE.set(key, pool);
  }
  return POOL_CACHE.get(key);
}

/* ---------- price baseline ---------- */
const BIAS_CACHE = new Map();
function productBias(p) {
  if (!BIAS_CACHE.has(p.id)) {
    BIAS_CACHE.set(p.id, 0.94 + 0.12 * mulberry32(fnv1a(p.id))());
  }
  return BIAS_CACHE.get(p.id);
}

// Official quotes used as anchors; memoised for 10 minutes to avoid disk reads.
let ANCHOR_CACHE = { at: 0, map: {} };
function anchors() {
  const now = Date.now();
  if (now - ANCHOR_CACHE.at > 600000) {
    try {
      ANCHOR_CACHE = { at: now, map: liveAnchor() };
    } catch {
      ANCHOR_CACHE = { at: now, map: {} };
    }
  }
  return ANCHOR_CACHE.map;
}

function trendAt(p, mIdx) {
  const phase = ((fnv1a(p.subId) % 100) / 100) * Math.PI * 2;
  const amp = 0.028 + (fnv1a(p.catId) % 28) / 1000;
  const drift = (((fnv1a(p.subId + 'd') % 200) - 100) / 10000) * mIdx;
  return 1 + amp * Math.sin(phase + mIdx * 0.55) + drift;
}

function baseline(p, city, mIdx, basis) {
  // Products with an official quote are anchored to it; the rest use the reference price.
  const anchor = anchors()[p.id];
  const retailBase = anchor ? anchor.value * (1 + p.markup) : p.base * p.mult;
  // wholesale = retail / (1 + markup)
  const base = basis === 'retail' ? retailBase : retailBase / (1 + p.markup);
  // Retail tracks local cost of living far more closely than wholesale does.
  const sensitivity = basis === 'retail' ? 1.15 : 0.72;
  let f = 1 + p.elast * sensitivity * p.goodsBias * (city.pli - 1);
  if (city.agri && (p.domainKey === 'food' || p.domainKey === 'agri')) {
    f *= 1 + city.agri * p.elast * sensitivity;
  }
  if (p.family === 'durable') f *= 1 - 0.028 * Math.max(0, city.pli - 1);
  const jitter = 1 + ((fnv1a(p.id + city.id) % 2000) - 1000) / 100000;
  // With an anchor, normalise the seasonal term at the current month and drop the
  // product-level offset, so this month matches the official quote exactly.
  const trend = anchor ? trendAt(p, mIdx) / trendAt(p, LATEST) : trendAt(p, mIdx);
  const pb = anchor ? 1 : productBias(p);
  return base * f * jitter * trend * pb;
}

/* ---------- source quotes, sampled per basis ---------- */
function observations(p, city, mIdx, basis) {
  const t = baseline(p, city, mIdx, basis);
  const pool = sourcePool(p.domainKey, city.scope, basis);
  const rows = [];
  if (!pool.length) return rows;
  const pick = mulberry32(fnv1a(`${p.id}|${city.id}|${mIdx}|${basis}`));
  const perTier = {};
  for (let i = 0; i < pool.length; i++) {
    const src = pool[i];
    if ((perTier[src.tier] || 0) >= 2) continue;
    // The top tier always reports: statutory statistics cover every city.
    if (i > 0 && pick() > COVERAGE[src.tier]) continue;
    perTier[src.tier] = (perTier[src.tier] || 0) + 1;
    const rnd = mulberry32(fnv1a(`${src.id}|${city.id}|${p.id}|${mIdx}`));
    const price = t * src.bias * (1 + gauss(rnd) * src.sigma);
    rows.push({
      sourceId: src.id,
      sourceName: src.name,
      org: src.org,
      tier: src.tier,
      basis,
      defaultWeight: src.weight,
      priceCny: Math.max(price, t * 0.05),
      ageDays: MONTHS[mIdx].ageDays + Math.round(rnd() * 6),
      url: src.url,
    });
    if (rows.length >= 4) break;
  }
  if (!rows.length) {
    const src = pool[0];
    const rnd = mulberry32(fnv1a(`fallback|${src.id}|${city.id}|${p.id}|${mIdx}`));
    rows.push({
      sourceId: src.id, sourceName: src.name, org: src.org, tier: src.tier, basis,
      defaultWeight: src.weight,
      priceCny: t * src.bias * (1 + gauss(rnd) * src.sigma),
      ageDays: MONTHS[mIdx].ageDays,
      url: src.url,
    });
  }
  return rows;
}

/* ---------- weight parsing ---------- */
export function parseWeights(q) {
  if (!q || typeof q !== 'string') return null;
  const parts = q.split(',').map((x) => Number(x.trim()));
  if (parts.length !== TIER_ORDER.length || parts.some((x) => !Number.isFinite(x))) return null;
  const w = {};
  TIER_ORDER.forEach((t, i) => (w[t] = Math.max(0, Math.min(1.5, parts[i]))));
  return w;
}
export function weightsKey(w) {
  if (!w) return 'default';
  return TIER_ORDER.map((t) => w[t].toFixed(2)).join('_');
}

/* ---------- single-basis fusion ---------- */
function fuseBasis(p, city, mIdx, basis, w) {
  const rows = observations(p, city, mIdx, basis);
  const res = fuse(rows, w);
  if (!res) return null;
  return {
    basis,
    cny: Number(res.value.toFixed(4)),
    low: Number(res.low.toFixed(4)),
    high: Number(res.high.toFixed(4)),
    native: Number((res.value / city.fx).toFixed(4)),
    nativeLow: Number((res.low / city.fx).toFixed(4)),
    nativeHigh: Number((res.high / city.fx).toFixed(4)),
    n: res.n,
    nUsed: res.nUsed,
    nRejected: res.nRejected,
    confidence: res.confidence,
    spread: Number((res.spread * 100).toFixed(2)),
    cv: res.cv,
    contributors: res.contributors,
    rejected: res.rejected,
  };
}

/* ---------- cell result, both bases ---------- */
const CELL_CACHE = new Map();
export function cell(p, city, mIdx, w) {
  const key = `${p.id}|${city.id}|${mIdx}|${weightsKey(w)}`;
  const hit = CELL_CACHE.get(key);
  if (hit) return hit;
  const retail = fuseBasis(p, city, mIdx, 'retail', w);
  const wholesale = fuseBasis(p, city, mIdx, 'wholesale', w);
  const primary = retail || wholesale;
  const out = primary
    ? {
        cityId: city.id,
        name: city.name,
        fullName: city.fullName,
        country: city.country,
        province: city.province,
        scope: city.scope,
        lng: city.lng,
        lat: city.lat,
        pli: city.pli,
        currency: city.currency,
        fx: city.fx,
        retail,
        wholesale,
        // Flat fields kept for compatibility; fall back to wholesale when retail is absent.
        cny: primary.cny,
        low: primary.low,
        high: primary.high,
        native: primary.native,
        n: primary.n,
        confidence: primary.confidence,
        spread: primary.spread,
        markupPct:
          retail && wholesale && wholesale.cny > 0
            ? Number((((retail.cny - wholesale.cny) / wholesale.cny) * 100).toFixed(2))
            : null,
        month: MONTHS[mIdx].key,
        monthLabel: MONTHS[mIdx].label,
      }
    : null;
  if (CELL_CACHE.size > 40000) CELL_CACHE.clear();
  CELL_CACHE.set(key, out);
  return out;
}

/* ---------- public queries ---------- */
export function productCityFrame(productId, { month = LATEST, weights = null, scope = 'all' } = {}) {
  const p = PRODUCT_MAP.get(productId);
  if (!p) return null;
  const mIdx = Math.max(0, Math.min(LATEST, Number(month)));
  const rows = [];
  for (const city of CITIES) {
    if (scope === 'CN' && city.scope !== 'CN') continue;
    if (scope === 'INTL' && city.scope !== 'INTL') continue;
    const c = cell(p, city, mIdx, weights);
    if (c) rows.push(c);
  }
  return { product: p, month: MONTHS[mIdx], rows };
}

export function provinceAggregate(rows, basis = 'retail') {
  const map = new Map();
  for (const r of rows) {
    if (r.scope !== 'CN' || !r.province) continue;
    const b = r[basis];
    if (!b) continue;
    const cur = map.get(r.province) || { sum: 0, w: 0, count: 0, min: Infinity, max: -Infinity };
    cur.sum += b.cny * b.confidence;
    cur.w += b.confidence;
    cur.count += 1;
    cur.min = Math.min(cur.min, b.cny);
    cur.max = Math.max(cur.max, b.cny);
    map.set(r.province, cur);
  }
  return [...map.entries()].map(([province, v]) => ({
    province,
    value: Number((v.sum / v.w).toFixed(4)),
    min: Number(v.min.toFixed(2)),
    max: Number(v.max.toFixed(2)),
    cities: v.count,
  }));
}

export function series(productId, cityId, { weights = null, months = 12, basis = 'retail' } = {}) {
  const p = PRODUCT_MAP.get(productId);
  const city = CITY_MAP.get(cityId);
  if (!p || !city) return null;
  const points = [];
  for (const m of MONTHS.slice(-months)) {
    const c = cell(p, city, m.idx, weights);
    const b = c?.[basis];
    if (b) points.push({ key: m.key, label: m.label, short: m.short, cny: b.cny, native: b.native, confidence: b.confidence });
  }
  return { product: p, city, points, basis };
}

export function compareCities(productId, cityIds, { month = LATEST, weights = null, basis = 'retail' } = {}) {
  const p = PRODUCT_MAP.get(productId);
  if (!p) return null;
  const mIdx = Math.max(0, Math.min(LATEST, Number(month)));
  const rows = cityIds
    .map((id) => CITY_MAP.get(id))
    .filter(Boolean)
    .map((city) => cell(p, city, mIdx, weights))
    .filter((r) => r && r[basis]);
  const base = rows.reduce((s, r) => s + r[basis].cny, 0) / (rows.length || 1);
  return {
    product: p,
    month: MONTHS[mIdx],
    basis,
    rows: rows.map((r) => ({ ...r, vsMean: Number((((r[basis].cny - base) / base) * 100).toFixed(2)) })),
  };
}

export function rankCities(productId, { month = LATEST, weights = null, order = 'desc', limit = 15, scope = 'all', basis = 'retail' } = {}) {
  const frame = productCityFrame(productId, { month, weights, scope });
  if (!frame) return null;
  const sorted = frame.rows
    .filter((r) => r[basis] && r[basis].confidence > 0)
    .sort((a, b) => (order === 'desc' ? b[basis].cny - a[basis].cny : a[basis].cny - b[basis].cny));
  return {
    product: frame.product,
    month: frame.month,
    basis,
    rows: sorted.slice(0, limit).map((r) => ({ ...r, cny: r[basis].cny, confidence: r[basis].confidence, n: r[basis].n })),
    total: sorted.length,
  };
}

/* ---------- metadata ---------- */
export function meta() {
  return {
    version: '1.2.0',
    asOf: LATEST_LABEL,
    months: MONTHS,
    basis: BASIS,
    domains: DOMAINS.map((d) => ({
      id: d.id,
      name: d.name,
      categories: d.categories.map((c) => ({
        id: c.id,
        name: c.name,
        elast: c.elast,
        markup: c.markup,
        subs: c.subs.map((s) => ({
          id: s.id,
          name: s.name,
          unit: s.unit,
          base: s.base,
          products: s.products.map((p) => ({
            id: p.id,
            name: p.name,
            variant: p.variant,
            unit: p.unit,
            base: Number((p.base * p.mult).toFixed(4)),
            markup: p.markup,
          })),
        })),
      })),
    })),
    cities: CITIES.map((c) => ({
      id: c.id, name: c.name, fullName: c.fullName, country: c.country,
      province: c.province, lng: c.lng, lat: c.lat, pli: c.pli,
      currency: c.currency, fx: c.fx, scope: c.scope,
    })),
    sources: SOURCES,
    tiers: TIERS,
    tierOrder: TIER_ORDER,
    stats: {
      ...STATS,
      cities: CITY_STATS,
      sources: SOURCE_STATS,
      priceCells: STATS.products * CITIES.length * MONTHS.length,
      monthCount: MONTHS.length,
    },
  };
}

export function searchProducts(q, limit = 40) {
  const kw = String(q || '').trim().toLowerCase();
  if (!kw) return [];
  const scored = [];
  for (const p of PRODUCTS) {
    const hay = `${p.name} ${p.subName} ${p.catName} ${p.domainName}`.toLowerCase();
    let score = -1;
    if (p.name.toLowerCase() === kw) score = 100;
    else if (p.subName.toLowerCase() === kw) score = 90;
    else if (p.name.toLowerCase().startsWith(kw)) score = 80;
    else if (p.subName.toLowerCase().startsWith(kw)) score = 70;
    else if (hay.includes(kw)) score = 40;
    if (score > 0) scored.push({ score, p });
  }
  scored.sort((a, b) => b.score - a.score || a.p.name.length - b.p.name.length);
  return scored.slice(0, limit).map(({ p }) => ({
    id: p.id, name: p.name, unit: p.unit, catName: p.catName, domainName: p.domainName, catId: p.catId,
  }));
}

// Internal probe for the self-test. Not exposed over HTTP.
export const probe = { baseline, observations };
