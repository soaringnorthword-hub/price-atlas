import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  meta, searchProducts, productCityFrame, provinceAggregate,
  rankCities, compareCities, series, parseWeights, MONTHS, LATEST, cell,
} from './pricing.mjs';
import { refreshLive, liveSeries, liveCoverage, forecastNextMonth } from './live.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const app = express();
const PORT = Number(process.env.PORT || 5178);

const BASES = ['retail', 'wholesale'];
const normBasis = (b) => (BASES.includes(b) ? b : 'retail');

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', req.path.startsWith('/api') ? 'public, max-age=60' : 'no-cache');
  next();
});

const wrap = (fn) => (req, res) => {
  try {
    const out = fn(req);
    if (out === null || out === undefined) return res.status(404).json({ error: 'not_found' });
    res.json(out);
  } catch (err) {
    console.error('[api]', req.path, err);
    res.status(500).json({ error: 'internal', message: String(err?.message || err) });
  }
};

/** Summary for one basis. */
function summarize(rows, basis) {
  const list = rows.filter((r) => r[basis]);
  if (!list.length) return null;
  const v = list.map((r) => r[basis].cny).sort((a, b) => a - b);
  const median = v[Math.floor(v.length / 2)];
  return {
    count: list.length,
    median: Number(median.toFixed(4)),
    mean: Number((v.reduce((s, x) => s + x, 0) / v.length).toFixed(4)),
    min: Number(v[0].toFixed(4)),
    max: Number(v[v.length - 1].toFixed(4)),
    ratio: Number((v[v.length - 1] / v[0]).toFixed(2)),
    avgConfidence: Number((list.reduce((s, r) => s + r[basis].confidence, 0) / list.length).toFixed(3)),
    avgSources: Number((list.reduce((s, r) => s + r[basis].n, 0) / list.length).toFixed(1)),
    minCity: list.reduce((a, b) => (a[basis].cny <= b[basis].cny ? a : b)).name,
    maxCity: list.reduce((a, b) => (a[basis].cny >= b[basis].cny ? a : b)).name,
  };
}

/** Trim to the fields the client actually needs. */
const slim = (b) =>
  b
    ? {
        basis: b.basis,
        cny: b.cny,
        low: b.low,
        high: b.high,
        native: b.native,
        nativeLow: b.nativeLow,
        nativeHigh: b.nativeHigh,
        n: b.n,
        nUsed: b.nUsed,
        nRejected: b.nRejected,
        confidence: b.confidence,
        spread: b.spread,
      }
    : null;

app.get('/api/health', (req, res) => res.json({ ok: true, asOf: MONTHS[LATEST].label, v: '1.2.0', ts: Date.now() }));

/* ---------- official feed ---------- */
app.get('/api/live/coverage', wrap(() => liveCoverage()));

app.get(
  '/api/live/series',
  wrap((req) => {
    const s = liveSeries(String(req.query.product || ''));
    if (!s) return null;
    const f = forecastNextMonth(s.points);
    return { ...s, forecast: f };
  }),
);

app.get('/api/meta', wrap(() => meta()));

app.get('/api/search', wrap((req) => ({ rows: searchProducts(req.query.q, Number(req.query.limit) || 40) })));

app.get(
  '/api/prices',
  wrap((req) => {
    const weights = parseWeights(req.query.w);
    const frame = productCityFrame(String(req.query.product || ''), {
      month: req.query.month ? Number(req.query.month) : LATEST,
      weights,
      scope: req.query.scope || 'all',
    });
    if (!frame) return null;
    const rows = frame.rows;
    const p = frame.product;
    const dual = rows.filter((r) => r.retail && r.wholesale);
    return {
      product: {
        id: p.id, name: p.name, unit: p.unit,
        catName: p.catName, domainName: p.domainName, catId: p.catId,
        base: Number((p.base * p.mult).toFixed(4)),
        markup: p.markup,
        baseWholesale: Number(((p.base * p.mult) / (1 + p.markup)).toFixed(4)),
      },
      month: frame.month,
      summary: {
        retail: summarize(rows, 'retail'),
        wholesale: summarize(rows, 'wholesale'),
        markup: dual.length
          ? {
              count: dual.length,
              median: Number(
                (dual.map((r) => r.markupPct).sort((a, b) => a - b)[Math.floor(dual.length / 2)]).toFixed(2),
              ),
              min: Number(Math.min(...dual.map((r) => r.markupPct)).toFixed(2)),
              max: Number(Math.max(...dual.map((r) => r.markupPct)).toFixed(2)),
            }
          : null,
      },
      provinces: {
        retail: provinceAggregate(rows, 'retail'),
        wholesale: provinceAggregate(rows, 'wholesale'),
      },
      rows: rows.map((r) => ({
        cityId: r.cityId, name: r.name, fullName: r.fullName, country: r.country,
        province: r.province, scope: r.scope, lng: r.lng, lat: r.lat,
        currency: r.currency, fx: r.fx,
        retail: slim(r.retail),
        wholesale: slim(r.wholesale),
        markupPct: r.markupPct,
      })),
    };
  }),
);

app.get(
  '/api/cell',
  wrap((req) => {
    const frame = productCityFrame(String(req.query.product || ''), {
      month: req.query.month ? Number(req.query.month) : LATEST,
      weights: parseWeights(req.query.w),
    });
    if (!frame) return null;
    const city = frame.rows.find((r) => r.cityId === req.query.city);
    if (!city) return null;
    const p = frame.product;
    return {
      ...city,
      product: p.name,
      unit: p.unit,
      markup: p.markup,
      baseRetail: Number((p.base * p.mult).toFixed(4)),
      baseWholesale: Number(((p.base * p.mult) / (1 + p.markup)).toFixed(4)),
    };
  }),
);

app.get(
  '/api/rank',
  wrap((req) =>
    rankCities(String(req.query.product || ''), {
      month: req.query.month ? Number(req.query.month) : LATEST,
      weights: parseWeights(req.query.w),
      order: req.query.order === 'asc' ? 'asc' : 'desc',
      limit: Math.min(60, Number(req.query.limit) || 15),
      scope: req.query.scope || 'all',
      basis: normBasis(req.query.basis),
    }),
  ),
);

app.get(
  '/api/compare',
  wrap((req) => {
    const ids = String(req.query.cities || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!ids.length) return null;
    return compareCities(String(req.query.product || ''), ids, {
      month: req.query.month ? Number(req.query.month) : LATEST,
      weights: parseWeights(req.query.w),
      basis: normBasis(req.query.basis),
    });
  }),
);

app.get(
  '/api/series',
  wrap((req) =>
    series(String(req.query.product || ''), String(req.query.city || ''), {
      weights: parseWeights(req.query.w),
      months: Math.min(12, Number(req.query.months) || 12),
      basis: normBasis(req.query.basis),
    }),
  ),
);

/* static site */
const DIST = path.join(ROOT, 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { maxAge: '1h', index: false }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(DIST, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.type('text/plain; charset=utf-8').send(
      'API 已启动。前端请运行 npm run dev:web（开发）或先 npm run build 后再访问（生产）。',
    );
  });
}

app.listen(PORT, () => {
  const lan = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) lan.push(`http://${a.address}:${PORT}`);
    }
  }
  console.log(`[price-atlas] 本机    http://127.0.0.1:${PORT}`);
  for (const u of lan) console.log(`[price-atlas] 局域网  ${u}`);
  console.log(`[price-atlas] static  ${fs.existsSync(DIST) ? 'dist ✓' : 'dist ✗ (dev mode)'}`);
  console.log('[price-atlas] refreshing official feed in background (falls back to cache)');
  refreshLive(120).then((c) => {
    if (c) console.log(`[price-atlas] 真实行情 ${c.count} 天，最新 ${c.latest}（${c.sourceName}）`);
  });
});
