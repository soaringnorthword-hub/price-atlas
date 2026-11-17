import { useMemo, useState } from 'react';
import type { Domain } from '../lib/api';
import { IconChevron, IconSearch } from './icons';

interface Props {
  domains: Domain[];
  selectedProduct: string;
  onSelect: (productId: string) => void;
  liveIds?: Set<string>;
  stats?: {
    categories: number;
    subspecies: number;
    products: number;
    cities: { total: number; cn: number; intl: number; provinces: number; countries: number };
    sources: { total: number };
    priceCells: number;
  };
}

export default function CategoryTree({ domains, selectedProduct, onSelect, stats, liveIds }: Props) {
  const locate = useMemo(() => {
    for (const d of domains) {
      for (const c of d.categories) {
        for (const s of c.subs) {
          if (s.products.some((p) => p.id === selectedProduct)) return { domainId: d.id, catId: c.id };
        }
      }
    }
    return { domainId: domains[0]?.id, catId: domains[0]?.categories[0]?.id };
  }, [domains, selectedProduct]);

  const [openDomain, setOpenDomain] = useState<string | null>(locate.domainId ?? null);
  const [openCat, setOpenCat] = useState<string | null>(locate.catId ?? null);
  const [q, setQ] = useState('');

  const kw = q.trim();
  const results = useMemo(() => {
    if (!kw) return null;
    const out: { id: string; name: string; cat: string; unit: string }[] = [];
    for (const d of domains) {
      for (const c of d.categories) {
        for (const s of c.subs) {
          for (const p of s.products) {
            if (p.name.includes(kw) || c.name.includes(kw) || d.name.includes(kw)) {
              out.push({ id: p.id, name: p.name, cat: `${d.name}/${c.name}`, unit: p.unit });
              if (out.length >= 80) return out;
            }
          }
        }
      }
    }
    return out;
  }, [domains, kw]);

  const total = (d: Domain) => d.categories.reduce((s, c) => s + c.subs.reduce((n, x) => n + x.products.length, 0), 0);

  return (
    <div className="panel" style={{ minHeight: 0 }}>
      <div className="panel-head">
        商品分类
        <span className="tag">{domains.length} 领域 · {domains.reduce((s, d) => s + d.categories.length, 0)} 品类</span>
      </div>
      <div className="tree-search">
        <div className="search" style={{ maxWidth: '100%' }}>
          <span className="icon"><IconSearch size={12} /></span>
          <input
            placeholder="筛选商品…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>
      <div className="panel-body">
        {results ? (
          <div className="tree">
            {results.length === 0 && <div className="empty">无匹配商品</div>}
            {results.map((r) => (
              <button
                key={r.id}
                className={`prod${r.id === selectedProduct ? ' on' : ''}`}
                style={{ width: '100%', display: 'flex', gap: 6, padding: '6px 8px', borderRadius: 6, fontSize: 11.5, textAlign: 'left', background: r.id === selectedProduct ? 'var(--brand)' : 'transparent', color: r.id === selectedProduct ? '#fff' : 'var(--ink-2)' }}
                onClick={() => onSelect(r.id)}
              >
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                <span style={{ fontSize: 9.5, opacity: 0.65 }}>{r.unit}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="tree">
            {domains.map((d) => {
              const dOpen = openDomain === d.id;
              return (
                <div className="dom" key={d.id}>
                  <button
                    className={`dom-btn${dOpen ? ' open' : ''}`}
                    onClick={() => setOpenDomain(dOpen ? null : d.id)}
                  >
                    <IconChevron open={dOpen} />
                    {d.name}
                    <span className="cnt">{total(d)}</span>
                  </button>
                  {dOpen && (
                    <div className="cats">
                      {d.categories.map((c) => {
                        const cOpen = openCat === c.id;
                        return (
                          <div key={c.id}>
                            <button
                              className={`cat-row${cOpen ? ' active' : ''}`}
                              onClick={() => setOpenCat(cOpen ? null : c.id)}
                            >
                              <IconChevron size={9} open={cOpen} />
                              {c.name}
                            </button>
                            {cOpen && (
                              <div className="subs">
                                {c.subs.map((s) =>
                                  s.products.map((p) => (
                                    <button
                                      key={p.id}
                                      className={`prod${p.id === selectedProduct ? ' on' : ''}`}
                                      onClick={() => onSelect(p.id)}
                                      title={
                                        liveIds?.has(p.id)
                                          ? `${p.name}  有官方实价（农业农村部日更）`
                                          : `${p.name}  基准 ${p.base} 元/${p.unit}（参考值）`
                                      }
                                    >
                                      <span className="pn">
                                        {liveIds?.has(p.id) && <i className="live-dot" />}
                                        {p.name}
                                      </span>
                                      <span className="pu">{p.unit}</span>
                                    </button>
                                  )),
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {stats && (
        <div className="tree-foot">
          <div><b>{stats.subspecies}</b> 子类 · <b>{stats.categories}</b> 品类</div>
          <div><b>{stats.products}</b> 代表商品（每类 3 规格）</div>
          <div><b>{stats.cities.total}</b> 城市 · 中国 {stats.cities.cn} / 海外 {stats.cities.intl}</div>
          <div><b>{stats.sources.total}</b> 数据源 · 6 级权威权重</div>
          {liveIds && liveIds.size > 0 && (
            <div style={{ marginTop: 3 }}><i className="live-dot" /> <b>{liveIds.size}</b> 个品种有官方实价</div>
          )}
        </div>
      )}
    </div>
  );
}
