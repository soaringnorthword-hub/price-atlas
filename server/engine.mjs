// Multi-source price fusion.
// Comparable only when city, product, variant, month and basis all match.
// Pipeline: weight x recency decay -> MAD outlier removal -> weighted mean,
// weighted quantile interval, confidence score.

/** Weighted median; resists outliers far better than a weighted mean. */
export function weightedMedian(items) {
  if (!items.length) return NaN;
  const total = items.reduce((s, i) => s + i.w, 0);
  if (total <= 0) return NaN;
  let acc = 0;
  for (const it of items) {
    acc += it.w;
    if (acc >= total / 2) return it.v;
  }
  return items[items.length - 1].v;
}

/** Weighted quantile (q in [0,1]); items must be sorted ascending by v. */
export function weightedQuantile(items, q) {
  if (!items.length) return NaN;
  const total = items.reduce((s, i) => s + i.w, 0);
  if (total <= 0) return NaN;
  const target = total * q;
  let acc = 0;
  for (const it of items) {
    acc += it.w;
    if (acc >= target) return it.v;
  }
  return items[items.length - 1].v;
}

function weightedStats(items) {
  const total = items.reduce((s, i) => s + i.w, 0);
  const mean = items.reduce((s, i) => s + i.v * i.w, 0) / total;
  const varr = items.reduce((s, i) => s + i.w * (i.v - mean) ** 2, 0) / total;
  return { mean, sd: Math.sqrt(varr), wsum: total };
}

/**
 * 融合一组观测值
 * @param rows [{ priceCny, tier, sourceId, sourceName, org, ageDays, native:{currency, rate} }]
 * @param tierWeights {A:1,B:0.9,...} 前端可覆盖；为 0 即剔除该层级
 * @param opts { maxMadFactor: 3.5, halfLifeDays: 180 }
 */
export function fuse(rows, tierWeights = null, opts = {}) {
  const { maxMadFactor = 3.5, halfLifeDays = 240 } = opts;
  const items = [];
  for (const r of rows) {
    const w = Number(tierWeights?.[r.tier] ?? r.defaultWeight ?? 0);
    if (!(w > 0)) continue;
    if (!Number.isFinite(r.priceCny) || r.priceCny <= 0) continue;
    // Recency decay: older quotes count for less, but never drop to zero.
    const recency = Math.pow(0.5, Math.max(0, r.ageDays || 0) / halfLifeDays);
    items.push({ v: r.priceCny, w: w * (0.55 + 0.45 * recency), row: r, recency });
  }
  if (!items.length) return null;
  items.sort((a, b) => a.v - b.v);

  const med0 = weightedMedian(items);
  const devs = items.map((i) => ({ v: Math.abs(i.v - med0), w: i.w })).sort((a, b) => a.v - b.v);
  const mad = weightedMedian(devs);
  // Floor the threshold at 5% of the median. With only 4-5 sources the raw MAD
  // collapses and ordinary tier spread starts looking like an outlier.
  const threshold = Math.max(maxMadFactor * 1.4826 * mad, 0.05 * med0);
  const kept = items.filter((i) => Math.abs(i.v - med0) <= threshold);
  const rejected = items.filter((i) => Math.abs(i.v - med0) > threshold);
  const pool = kept.length ? kept : items;

  // Weighted mean rather than median: tier gaps are systematic, so a median jumps
  // in whole steps depending on which tier happens to sit in the middle.
  const { mean, sd, wsum } = weightedStats(pool);
  const value = mean;
  const low = weightedQuantile(pool, 0.25);
  const high = weightedQuantile(pool, 0.75);
  const cv = mean > 0 ? sd / mean : 0;

  const maxAge = Math.max(...pool.map((i) => i.row.ageDays || 0), 0);
  const recencyScore = Math.max(0, 1 - maxAge / 45);
  // Cross-source agreement is unobservable with a single source; score it at 0.4.
  const agreement = pool.length === 1 ? 0.4 : 1 - Math.min(1, cv / 0.24);

  const conf = Math.max(
    0.05,
    Math.min(
      0.96,
      0.18 + 0.4 * Math.min(1, wsum / 2.6) + 0.24 * agreement + 0.18 * recencyScore,
    ),
  );

  return {
    value,
    low,
    high,
    spread: value > 0 ? (high - low) / value : 0,
    n: rows.length,
    nUsed: pool.length,
    nRejected: rejected.length,
    wsum: Number(wsum.toFixed(3)),
    cv: Number(cv.toFixed(4)),
    confidence: Number(conf.toFixed(3)),
    contributors: pool
      .slice()
      .sort((a, b) => b.w - a.w)
      .map((i) => ({
        sourceId: i.row.sourceId,
        sourceName: i.row.sourceName,
        org: i.row.org,
        tier: i.row.tier,
        weight: Number(i.w.toFixed(3)),
        rawWeight: i.row.defaultWeight,
        priceCny: Number(i.v.toFixed(4)),
        ageDays: i.row.ageDays,
        deviation: Number(((i.v - value) / value).toFixed(4)),
        recency: Number(i.recency.toFixed(3)),
      })),
    rejected: rejected.map((i) => ({
      sourceId: i.row.sourceId,
      sourceName: i.row.sourceName,
      tier: i.row.tier,
      priceCny: Number(i.v.toFixed(4)),
      deviation: Number(((i.v - value) / value).toFixed(4)),
    })),
  };
}

/** Confidence buckets used by the UI. */
export function confLevel(conf) {
  if (conf >= 0.8) return { key: 'high', label: '高置信', color: '#0e8f7e' };
  if (conf >= 0.6) return { key: 'mid', label: '中置信', color: '#c1873b' };
  if (conf >= 0.4) return { key: 'low', label: '低置信', color: '#b7563f' };
  return { key: 'weak', label: '单源/弱证据', color: '#8a929c' };
}

export function fmtMoney(v, currency = 'CNY') {
  const abs = Math.abs(v);
  const digits = abs >= 1000 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : abs >= 0.01 ? 3 : 5;
  const sym = { CNY: '¥', USD: '$', EUR: '€', GBP: '£', JPY: '¥', HKD: 'HK$', TWD: 'NT$', KRW: '₩' }[currency] || '';
  return `${sym}${v.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
