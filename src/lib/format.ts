import type { BasisKey, BasisQuote, BasisView, PriceRow, TierKey } from './api';

export const USD_CNY = 7.15;

export const TIER_COLOR: Record<TierKey, string> = {
  A: '#1d4ed8',
  B: '#0e8f7e',
  C: '#5a62c9',
  D: '#c1873b',
  E: '#8d6bbd',
  F: '#8a929c',
};

export const PROV_TO_GEO: Record<string, string> = {
  北京: '北京市',
  天津: '天津市',
  河北: '河北省',
  山西: '山西省',
  内蒙古: '内蒙古自治区',
  辽宁: '辽宁省',
  吉林: '吉林省',
  黑龙江: '黑龙江省',
  上海: '上海市',
  江苏: '江苏省',
  浙江: '浙江省',
  安徽: '安徽省',
  福建: '福建省',
  江西: '江西省',
  山东: '山东省',
  河南: '河南省',
  湖北: '湖北省',
  湖南: '湖南省',
  广东: '广东省',
  广西: '广西壮族自治区',
  海南: '海南省',
  重庆: '重庆市',
  四川: '四川省',
  贵州: '贵州省',
  云南: '云南省',
  西藏: '西藏自治区',
  陕西: '陕西省',
  甘肃: '甘肃省',
  青海: '青海省',
  宁夏: '宁夏回族自治区',
  新疆: '新疆维吾尔自治区',
  中国台湾: '台湾省',
  中国香港: '香港特别行政区',
  中国澳门: '澳门特别行政区',
};

function digitsOf(abs: number) {
  if (abs >= 10000) return 0;
  if (abs >= 1000) return 0;
  if (abs >= 100) return 1;
  if (abs >= 10) return 1;
  if (abs >= 1) return 2;
  if (abs >= 0.1) return 3;
  if (abs >= 0.01) return 4;
  return 6;
}

export function money(v: number, currency: 'CNY' | 'USD' = 'CNY', opts: { compact?: boolean; digits?: number } = {}) {
  if (v == null || !Number.isFinite(v)) return '—';
  const val = currency === 'USD' ? v / USD_CNY : v;
  const sym = currency === 'USD' ? '$' : '¥';
  const d = opts.digits != null ? opts.digits : opts.compact && Math.abs(val) >= 1000 ? 0 : digitsOf(Math.abs(val));
  const s = val.toLocaleString('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d });
  return `${sym}${s}`;
}

export function moneyNoSym(v: number, currency: 'CNY' | 'USD' = 'CNY') {
  if (v == null || !Number.isFinite(v)) return '—';
  const val = currency === 'USD' ? v / USD_CNY : v;
  return val.toLocaleString('zh-CN', { minimumFractionDigits: digitsOf(Math.abs(val)), maximumFractionDigits: digitsOf(Math.abs(val)) });
}

export function signedPct(v: number, d = 1) {
  if (v == null || !Number.isFinite(v)) return '—';
  const s = v > 0 ? '+' : '';
  return `${s}${v.toFixed(d)}%`;
}

export function confMeta(conf: number) {
  if (conf >= 0.8) return { label: '高置信', color: '#0e8f7e', bg: '#e9f6f3', key: 'high' as const };
  if (conf >= 0.6) return { label: '中置信', color: '#b45309', bg: '#fdf4e7', key: 'mid' as const };
  if (conf >= 0.4) return { label: '低置信', color: '#b7563f', bg: '#fbeee9', key: 'low' as const };
  return { label: '弱证据', color: '#6b7280', bg: '#f1f3f6', key: 'weak' as const };
}

export function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

/** Sequential ramp for price level; higher reads warmer. */
export function priceColor(t: number) {
  // Darkened overall so points stay legible on pale province fills.
  const stops: [number, [number, number, number]][] = [
    [0, [10, 108, 100]],
    [0.34, [62, 152, 140]],
    [0.55, [92, 104, 124]],
    [0.75, [198, 121, 57]],
    [1, [150, 45, 22]],
  ];
  const x = clamp(t, 0, 1);
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [p0, c0] = stops[i - 1];
      const [p1, c1] = stops[i];
      const k = (x - p0) / (p1 - p0 || 1);
      const c = c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  return 'rgb(178,66,32)';
}


/* ---------- basis helpers ---------- */
export const BASIS_META: Record<BasisKey, { label: string; short: string; color: string; desc: string }> = {
  retail: { label: '零售价', short: '零', color: '#b45309', desc: '消费者实际支付的终端挂牌价' },
  wholesale: { label: '批发价', short: '批', color: '#0f766e', desc: '出厂/批发市场/交易所大额成交价' },
};

export function pickQuote(row: PriceRow, basis: BasisView): BasisQuote | null {
  if (basis === 'markup') return null;
  return row[basis];
}

/** Value under the active basis, or null when that basis has no data. */
export function pickValue(row: PriceRow, basis: BasisView): number | null {
  if (basis === 'markup') return row.retail && row.wholesale ? row.markupPct : null;
  return row[basis]?.cny ?? null;
}

export function unitSuffix(basis: BasisView, unit: string) {
  return basis === 'markup' ? '%' : unit;
}

/** Format by basis: markup as a percentage, everything else as money. */
export function fmtByBasis(v: number, basis: BasisView, currency: 'CNY' | 'USD') {
  if (v == null || !Number.isFinite(v)) return '—';
  return basis === 'markup' ? `${v.toFixed(1)}%` : money(v, currency);
}

/** Unit suffix for the active basis. */
export function basisUnit(basis: BasisView, unit: string) {
  return basis === 'markup' ? '溢价' : unit;
}

/**
 * Diverging ramp around the median: below reads blue, above reads red.
 * t in [-1, 1]; lighten blends towards white for province fills.
 */
export function divergeColor(t: number, lighten = 0) {
  const x = clamp(t, -1, 1);
  const neg: [number, number, number] = [26, 86, 196];
  const pos: [number, number, number] = [180, 35, 24];
  // Not white at the midpoint: a white dot on a white map simply disappears.
  const mid: [number, number, number] = [150, 160, 175];
  const end = x < 0 ? neg : pos;
  const k = Math.abs(x) * (1 - lighten);
  const c = mid.map((m, i) => Math.round(m + (end[i] - m) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Province fill: near-white at the median, low saturation at the extremes. */
export function provFill(t: number) {
  const x = clamp(t, -1, 1);
  const base: [number, number, number] = [248, 249, 251];
  const end: [number, number, number] = x < 0 ? [26, 86, 196] : [180, 35, 24];
  const k = 0.5 * Math.pow(Math.abs(x), 0.72);
  const c = base.map((b, i) => Math.round(b + (end[i] - b) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
