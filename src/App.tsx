import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  type BasisKey,
  type BasisView,
  type CellResult,
  type Meta,
  type LiveCoverage,
  type LiveSeries,
  type PricesResp,
  type SeriesResp,
  type TierKey,
} from './lib/api';
import { BASIS_META, fmtByBasis, pickValue } from './lib/format';
import CategoryTree from './components/CategoryTree';
import MapView from './components/MapView';
import GlobalRank from './components/GlobalRank';
import DetailPanel from './components/DetailPanel';
import RankList from './components/RankList';
import CompareBar from './components/CompareBar';
import WeightPopover from './components/WeightPopover';
import { IconSearch, IconSliders } from './components/icons';

const DEFAULT_WEIGHTS: Record<TierKey, number> = { A: 1, B: 0.9, C: 0.85, D: 0.7, E: 0.55, F: 0.3 };

function useDebounced<T>(v: T, ms: number) {
  const [x, setX] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setX(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return x;
}

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [productId, setProductId] = useState<string>('');
  const [weights, setWeights] = useState<Record<TierKey, number>>(DEFAULT_WEIGHTS);
  const [currency, setCurrency] = useState<'CNY' | 'USD'>('CNY');
  const [scope, setScope] = useState<'CN' | 'GLOBAL'>('CN');
  const [basis, setBasis] = useState<BasisView>('retail');
  const [prices, setPrices] = useState<PricesResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [cell, setCell] = useState<CellResult | null>(null);
  const [serR, setSerR] = useState<SeriesResp | null>(null);
  const [serW, setSerW] = useState<SeriesResp | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [tab, setTab] = useState<'detail' | 'rank' | 'prov'>('detail');
  const [weightOpen, setWeightOpen] = useState(() => window.location.hash.includes('w=1'));
  const [liveCov, setLiveCov] = useState<LiveCoverage | null>(null);
  const [live, setLive] = useState<LiveSeries | null>(null);

  const [q, setQ] = useState('');
  const [hits, setHits] = useState<{ id: string; name: string; catName: string; domainName: string }[]>([]);
  const qDeb = useDebounced(q, 220);
  const boxRef = useRef<HTMLDivElement>(null);

  const dWeights = useDebounced(weights, 220);

  // Deep link: #p=product&s=cn|global&c=city&cur=USD&t=rank|prov&b=retail|wholesale|markup
  const initial = useMemo(() => {
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const b = h.get('b');
    return {
      product: h.get('p'),
      scope: h.get('s') === 'global' ? ('GLOBAL' as const) : h.get('s') === 'cn' ? ('CN' as const) : null,
      city: h.get('c'),
      cur: h.get('cur') === 'USD' ? ('USD' as const) : null,
      tab: h.get('t') === 'rank' ? ('rank' as const) : h.get('t') === 'prov' ? ('prov' as const) : null,
      basis: b === 'wholesale' ? ('wholesale' as const) : b === 'markup' ? ('markup' as const) : b === 'retail' ? ('retail' as const) : null,
    };
  }, []);

  useEffect(() => {
    Promise.all([api.meta(), api.liveCoverage().catch(() => null)])
      .then(([m, cov]) => {
        setMeta(m);
        setLiveCov(cov);
        const ids = new Set(m.cities.map((c) => c.id));
        const allP = new Set<string>();
        m.domains.forEach((d) => d.categories.forEach((c) => c.subs.forEach((s) => s.products.forEach((p) => allP.add(p.id)))));
        // Land on a product that has an official quote, so the first screen shows real data.
        const preferred = cov?.products?.[0]?.id ?? m.domains[0].categories[0].subs[0].products[0].id;
        setProductId(initial.product && allP.has(initial.product) ? initial.product : preferred);
        setSelectedCity(initial.city && ids.has(initial.city) ? initial.city : m.cities[0].id);
        if (initial.scope) setScope(initial.scope);
        if (initial.cur) setCurrency(initial.cur);
        if (initial.tab) setTab(initial.tab);
        if (initial.basis) setBasis(initial.basis);
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!productId) return;
    const h = new URLSearchParams();
    h.set('p', productId);
    h.set('s', scope === 'CN' ? 'cn' : 'global');
    if (selectedCity) h.set('c', selectedCity);
    if (currency === 'USD') h.set('cur', 'USD');
    if (tab !== 'detail') h.set('t', tab);
    if (basis !== 'retail') h.set('b', basis);
    window.history.replaceState(null, '', '#' + h.toString());
  }, [productId, scope, selectedCity, currency, tab, basis]);

  const liveIds = useMemo(() => new Set((liveCov?.products ?? []).map((p) => p.id)), [liveCov]);

  useEffect(() => {
    if (!productId || !liveIds.has(productId)) {
      setLive(null);
      return;
    }
    let alive = true;
    api
      .liveSeries(productId)
      .then((s) => {
        if (alive) setLive(s);
      })
      .catch(() => {
        if (alive) setLive(null);
      });
    return () => {
      alive = false;
    };
  }, [productId, liveIds]);

  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    api
      .prices(productId, dWeights)
      .then(setPrices)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [productId, dWeights]);

  // Degrade to the available basis when a category has no data for the current one.
  useEffect(() => {
    if (!prices) return;
    const s = prices.summary;
    if (basis === 'retail' && !s.retail) setBasis(s.wholesale ? 'wholesale' : 'retail');
    else if (basis === 'wholesale' && !s.wholesale) setBasis(s.retail ? 'retail' : 'wholesale');
    else if (basis === 'markup' && !s.markup) setBasis(s.retail ? 'retail' : 'wholesale');
  }, [prices, basis]);

  useEffect(() => {
    if (!productId || !selectedCity) return;
    let alive = true;
    Promise.all([
      api.cell(productId, selectedCity, dWeights),
      api.series(productId, selectedCity, dWeights, 'retail'),
      api.series(productId, selectedCity, dWeights, 'wholesale'),
    ])
      .then(([c, sr, sw]) => {
        if (!alive) return;
        setCell(c);
        setSerR(sr);
        setSerW(sw);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [productId, selectedCity, dWeights]);

  useEffect(() => {
    if (!qDeb.trim()) {
      setHits([]);
      return;
    }
    api.search(qDeb).then((r) => setHits(r.rows.slice(0, 12))).catch(() => {});
  }, [qDeb]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setHits([]);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const handleSelectCity = useCallback((id: string) => {
    setSelectedCity(id);
    setCompareIds((prev) => (prev.includes(id) ? prev : prev.length >= 5 ? prev : [...prev, id]));
    setTab('detail');
  }, []);

  const rows = prices?.rows ?? [];
  const unit = prices?.product.unit ?? '';

  /** Summary statistics for the current basis and scope. */
  const view = useMemo(() => {
    const pool = (scope === 'CN' ? rows.filter((r) => r.scope === 'CN') : rows).filter((r) => pickValue(r, basis) != null);
    if (!pool.length) return null;
    const sorted = pool.slice().sort((a, b) => (pickValue(a, basis) as number) - (pickValue(b, basis) as number));
    const vals = sorted.map((r) => pickValue(r, basis) as number);
    const mid = vals[Math.floor(vals.length / 2)];
    return {
      count: pool.length,
      median: mid,
      min: vals[0],
      max: vals[vals.length - 1],
      minCity: sorted[0].name,
      maxCity: sorted[sorted.length - 1].name,
      ratio: vals[0] > 0 ? vals[vals.length - 1] / vals[0] : 1,
      avgSources:
        basis === 'markup'
          ? 0
          : pool.reduce((s, r) => s + ((r[basis as BasisKey]?.n ?? 0)), 0) / pool.length,
    };
  }, [rows, scope, basis]);

  /** Province-level aggregation for the current basis. */
  const provAgg = useMemo(() => {
    const m = new Map<string, { sum: number; w: number; count: number }>();
    for (const r of rows) {
      if (r.scope !== 'CN' || !r.province) continue;
      const v = pickValue(r, basis);
      if (v == null) continue;
      const w = (basis === 'markup' ? r.retail?.confidence : r[basis as BasisKey]?.confidence) ?? 0.5;
      const cur = m.get(r.province) || { sum: 0, w: 0, count: 0 };
      cur.sum += v * w;
      cur.w += w;
      cur.count += 1;
      m.set(r.province, cur);
    }
    return [...m.entries()].map(([province, x]) => ({ province, value: x.sum / x.w, cities: x.count }));
  }, [rows, basis]);

  const reference = view?.median ?? 0;
  const fmt = (v: number) => fmtByBasis(v, basis, currency);

  if (error) {
    return (
      <div style={{ padding: 40, fontFamily: 'var(--font)' }}>
        <b>启动失败：</b> {error}
        <div style={{ color: '#8b95a5', marginTop: 8, fontSize: 12 }}>
          请确认后端已启动（npm run start，端口 5178）。
        </div>
      </div>
    );
  }

  if (!meta) return <div className="loading" style={{ paddingTop: 120 }}>加载商品分类与数据源注册表…</div>;

  const basisLabel = basis === 'markup' ? '零售溢价' : BASIS_META[basis].label;

  const crumbDomain = prices?.product.domainName ?? '';
  const crumbCat = prices?.product.catName ?? '';
  const crumbName = prices?.product.name ?? '';

  return (
    <div className="app">
      <header className="header">
        <div className="header-main">
          <div className="brand">
            <div className="brand-mark" />
            <div>
              <div className="brand-title">商品价格图谱</div>
              <div className="brand-sub">PRICE ATLAS</div>
            </div>
          </div>

          <div className="crumb">
            <span>{crumbDomain}</span>
            <span className="sep">/</span>
            <span>{crumbCat}</span>
            <span className="sep">/</span>
            <span className="name"><b>{crumbName}</b></span>
          </div>

          <div className="spacer" />

          <div className="search" ref={boxRef}>
            <span className="icon"><IconSearch /></span>
            <input
              placeholder={`搜索 ${meta.stats.products} 个代表商品`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {hits.length > 0 && (
              <div className="search-pop">
                {hits.map((h) => (
                  <div
                    key={h.id}
                    className="search-item"
                    onClick={() => {
                      setProductId(h.id);
                      setQ('');
                      setHits([]);
                    }}
                  >
                    <b>{h.name}</b>
                    <span>{h.domainName} / {h.catName}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ position: 'relative' }}>
            <button className={`btn${weightOpen ? ' primary' : ''}`} onClick={() => setWeightOpen((v) => !v)}>
              <IconSliders /> 权重
            </button>
            {weightOpen && (
              <>
                <div className="popover-mask" onClick={() => setWeightOpen(false)} />
                <WeightPopover
                  tierOrder={meta.tierOrder}
                  tiers={meta.tiers}
                  weights={weights}
                  onChange={setWeights}
                  onClose={() => setWeightOpen(false)}
                  stats={meta.stats.sources.byTier}
                />
              </>
            )}
          </div>
        </div>

        <div className="header-toolbar">
          <span className="tb-label">计价口径</span>
          <div className="seg">
            <button className={basis === 'retail' ? 'on' : ''} onClick={() => setBasis('retail')}>零售价</button>
            <button className={basis === 'wholesale' ? 'on' : ''} onClick={() => setBasis('wholesale')}>批发价</button>
            <button className={basis === 'markup' ? 'on' : ''} onClick={() => setBasis('markup')}>零售溢价</button>
          </div>
          <span className="tb-sep" />
          <span className="tb-label">范围</span>
          <div className="seg">
            <button className={scope === 'CN' ? 'on' : ''} onClick={() => setScope('CN')}>中国</button>
            <button className={scope === 'GLOBAL' ? 'on' : ''} onClick={() => setScope('GLOBAL')}>全球</button>
          </div>
          <span className="tb-sep" />
          <span className="tb-label">币种</span>
          <div className="seg">
            <button className={currency === 'CNY' ? 'on' : ''} onClick={() => setCurrency('CNY')}>CNY</button>
            <button className={currency === 'USD' ? 'on' : ''} onClick={() => setCurrency('USD')}>USD</button>
          </div>
          <span className="spacer" />
          <span className="tb-note">
            当前口径 {basisLabel} · 观测月份 {prices?.month.label ?? '—'}
          </span>
        </div>
      </header>

      <div className="main">
        <CategoryTree
          domains={meta.domains}
          selectedProduct={productId}
          onSelect={setProductId}
          stats={meta.stats}
          liveIds={liveIds}
        />

        <div className="center">
          <div className="summary">
            <div className="sum-cell main">
              <div className="k">{crumbDomain} / {crumbCat}</div>
              <div className="v" title={crumbName}>
                {crumbName.length > 12 ? crumbName.slice(0, 12) + '…' : crumbName}
                <small>{basis === 'markup' ? '/ 溢价率' : `/ ${unit}`}</small>
              </div>
            </div>
            <div className="sum-cell">
              <div className="k">{scope === 'CN' ? '全国' : '全球'}中位 · {basisLabel}</div>
              <div className="v num">{view ? fmt(view.median) : '—'}</div>
            </div>
            <div className="sum-cell">
              <div className="k">最低 · {view?.minCity ?? '—'}</div>
              <div className="v num down">{view ? fmt(view.min) : '—'}</div>
            </div>
            <div className="sum-cell">
              <div className="k">最高 · {view?.maxCity ?? '—'}</div>
              <div className="v num up">{view ? fmt(view.max) : '—'}</div>
            </div>
            <div className="sum-cell">
              <div className="k">{basis === 'markup' ? '覆盖城市' : '倍差 / 平均源数'}</div>
              <div className="v num">
                {basis === 'markup' ? (
                  <>{view?.count ?? '—'}<small> 城</small></>
                ) : (
                  <>
                    {view ? `${view.ratio.toFixed(2)}×` : '—'}
                    <small>/ {view ? view.avgSources.toFixed(1) : '—'} 源</small>
                  </>
                )}
              </div>
            </div>
          </div>

          {scope === 'CN' ? (
            <MapView
              rows={rows}
              selectedCity={selectedCity}
              onSelectCity={handleSelectCity}
              currency={currency}
              unit={unit}
              basis={basis}
            />
          ) : (
            <GlobalRank
              rows={rows}
              currency={currency}
              unit={unit}
              basis={basis}
              selectedCity={selectedCity}
              onSelectCity={handleSelectCity}
            />
          )}
        </div>

        <div className="panel">
          <div className="panel-head" style={{ padding: 0, gap: 0 }}>
            <div className="tabbar" style={{ flex: 1 }}>
              <button className={tab === 'detail' ? 'on' : ''} onClick={() => setTab('detail')}>双口径详情</button>
              <button className={tab === 'rank' ? 'on' : ''} onClick={() => setTab('rank')}>城市榜</button>
              <button className={tab === 'prov' ? 'on' : ''} onClick={() => setTab('prov')}>省级榜</button>
            </div>
          </div>
          <div className="panel-body">
            {tab === 'detail' ? (
              <DetailPanel
                cell={cell}
                loading={loading}
                currency={currency}
                unit={unit}
                monthLabel={prices?.month.label ?? ''}
                seriesRetail={serR?.points ?? []}
                seriesWholesale={serW?.points ?? []}
                live={live}
              />
            ) : (
              <RankList
                rows={rows}
                provinces={provAgg}
                currency={currency}
                unit={unit}
                basis={basis}
                selectedCity={selectedCity}
                onSelect={handleSelectCity}
                onAdd={(id) => setCompareIds((p) => (p.includes(id) || p.length >= 5 ? p : [...p, id]))}
                mode={tab === 'prov' ? 'prov' : 'city'}
              />
            )}
          </div>
        </div>
      </div>

      <CompareBar
        rows={rows}
        ids={compareIds}
        reference={reference}
        currency={currency}
        unit={unit}
        basis={basis}
        onRemove={(id) => setCompareIds((p) => p.filter((x) => x !== id))}
        onClear={() => setCompareIds([])}
        onSelect={setSelectedCity}
      />

      <footer className="statusbar">
        <span className="st"><i className="dot-ok" />服务正常</span>
        <span className="st">数据截止 <b>{meta.asOf}</b></span>
        <span className="st"><b>{meta.stats.products}</b> 商品 · <b>{meta.stats.cities.total}</b> 城</span>
        <span className="st"><b>{meta.stats.sources.total}</b> 个数据源</span>
        {liveCov?.available && (
          <span className="st">
            <i className="dot-live" />
            真实行情 <b>{liveCov.products.length}</b> 品种 · {liveCov.latest}
          </span>
        )}
        <span className="st">口径 {basisLabel}</span>
        <span className="right">
          全国行情取自农业农村部批发价日报（每日更新）；城市维度为统计推算值，仅供比价参考。
        </span>
      </footer>
    </div>
  );
}
