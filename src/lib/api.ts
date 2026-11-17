export type TierKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type BasisKey = 'retail' | 'wholesale';
export type BasisView = BasisKey | 'markup';

export interface ProductLite {
  id: string;
  name: string;
  variant: string;
  unit: string;
  base: number;
  markup: number;
}
export interface Sub {
  id: string;
  name: string;
  unit: string;
  base: number;
  products: ProductLite[];
}
export interface Cat {
  id: string;
  name: string;
  elast: number;
  markup: number;
  subs: Sub[];
}
export interface Domain {
  id: string;
  name: string;
  categories: Cat[];
}
export interface City {
  id: string;
  name: string;
  fullName: string;
  country: string;
  province: string | null;
  lng: number;
  lat: number;
  pli: number;
  currency: string;
  fx: number;
  scope: 'CN' | 'INTL';
}
export interface Source {
  id: string;
  name: string;
  org: string;
  tier: TierKey;
  scope: string;
  basis: BasisKey;
  basisLabel: string;
  domains: string[];
  license: string;
  freq: string;
  url: string | null;
  weight: number;
  tierLabel: string;
}
export interface Tier {
  key: TierKey;
  label: string;
  weight: number;
  color: string;
  desc: string;
}
export interface MetaStats {
  domains: number;
  categories: number;
  subspecies: number;
  products: number;
  units: number;
  cities: { total: number; cn: number; intl: number; provinces: number; countries: number };
  sources: { total: number; byTier: Record<TierKey, number>; byBasis: { wholesale: number; retail: number }; cn: number; intl: number };
  priceCells: number;
  monthCount: number;
}
export interface Meta {
  version: string;
  asOf: string;
  months: { idx: number; key: string; label: string; short: string }[];
  basis: Record<BasisKey, { key: BasisKey; label: string; short: string; color: string; desc: string }>;
  domains: Domain[];
  cities: City[];
  sources: Source[];
  tiers: Record<TierKey, Tier>;
  tierOrder: TierKey[];
  stats: MetaStats;
}

export interface Contributor {
  sourceId: string;
  sourceName: string;
  org: string;
  tier: TierKey;
  weight: number;
  rawWeight: number;
  priceCny: number;
  ageDays: number;
  deviation: number;
  recency: number;
}
export interface RejectedSource {
  sourceId: string;
  sourceName: string;
  tier: TierKey;
  priceCny: number;
  deviation: number;
}

export interface BasisQuote {
  basis: BasisKey;
  cny: number;
  low: number;
  high: number;
  native: number;
  nativeLow: number;
  nativeHigh: number;
  n: number;
  nUsed: number;
  nRejected: number;
  confidence: number;
  spread: number;
  contributors?: Contributor[];
  rejected?: RejectedSource[];
}

export interface PriceRow {
  cityId: string;
  name: string;
  fullName: string;
  country: string;
  province: string | null;
  scope: 'CN' | 'INTL';
  lng: number;
  lat: number;
  currency: string;
  fx: number;
  retail: BasisQuote | null;
  wholesale: BasisQuote | null;
  markupPct: number | null;
}

export interface CellResult extends PriceRow {
  pli: number;
  month: string;
  monthLabel: string;
  product: string;
  unit: string;
  markup: number;
  baseRetail: number;
  baseWholesale: number;
}

export interface BasisSummary {
  count: number;
  median: number;
  mean: number;
  min: number;
  max: number;
  ratio: number;
  avgConfidence: number;
  avgSources: number;
  minCity: string;
  maxCity: string;
}

export interface PricesResp {
  product: {
    id: string;
    name: string;
    unit: string;
    catName: string;
    domainName: string;
    catId: string;
    base: number;
    markup: number;
    baseWholesale: number;
  };
  month: { key: string; label: string };
  summary: {
    retail: BasisSummary | null;
    wholesale: BasisSummary | null;
    markup: { count: number; median: number; min: number; max: number } | null;
  };
  provinces: {
    retail: { province: string; value: number; min: number; max: number; cities: number }[];
    wholesale: { province: string; value: number; min: number; max: number; cities: number }[];
  };
  rows: PriceRow[];
}

export interface SeriesResp {
  product: { id: string; name: string; unit: string };
  city: City;
  basis: BasisKey;
  points: { key: string; label: string; short: string; cny: number; native: number; confidence: number }[];
}

export function weightsQuery(w: Record<TierKey, number>) {
  return (['A', 'B', 'C', 'D', 'E', 'F'] as TierKey[]).map((t) => (w[t] ?? 0).toFixed(2)).join(',');
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return (await res.json()) as T;
}

export const api = {
  meta: () => get<Meta>('/api/meta'),
  prices: (product: string, w: Record<TierKey, number>, month?: number) =>
    get<PricesResp>(
      `/api/prices?product=${encodeURIComponent(product)}&w=${weightsQuery(w)}${month != null ? `&month=${month}` : ''}`,
    ),
  cell: (product: string, city: string, w: Record<TierKey, number>) =>
    get<CellResult>(`/api/cell?product=${encodeURIComponent(product)}&city=${encodeURIComponent(city)}&w=${weightsQuery(w)}`),
  series: (product: string, city: string, w: Record<TierKey, number>, basis: BasisKey) =>
    get<SeriesResp>(
      `/api/series?product=${encodeURIComponent(product)}&city=${encodeURIComponent(city)}&w=${weightsQuery(w)}&basis=${basis}`,
    ),
  search: (q: string) =>
    get<{ rows: { id: string; name: string; unit: string; catName: string; domainName: string }[] }>(
      `/api/search?q=${encodeURIComponent(q)}`,
    ),
  liveCoverage: () => get<LiveCoverage>('/api/live/coverage'),
  liveSeries: (product: string) => get<LiveSeries>(`/api/live/series?product=${encodeURIComponent(product)}`),
};

/* ---------- official feed ---------- */
export interface LivePoint {
  date: string;
  value: number;
}
export interface LiveForecast {
  value: number;
  low: number;
  high: number;
  changePct: number;
  slopePerDayPct: number;
  windowDays: number;
  confidence: number;
  method: string;
}
export interface LiveSeries {
  productId: string;
  source: string;
  sourceName: string;
  sourceUrl: string;
  basis: 'wholesale';
  unit: string;
  fetchedAt: string;
  latestDate: string;
  points: LivePoint[];
  forecast: LiveForecast | null;
}
export interface LiveCoverage {
  available: boolean;
  sourceName?: string;
  sourceUrl?: string;
  fetchedAt?: string;
  latest?: string;
  days?: number;
  basis?: string;
  products: { id: string; label: string; points: number; last: number; date: string }[];
}
