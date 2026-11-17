import { useMemo } from 'react';
import type { BasisView, PriceRow } from '../lib/api';
import { fmtByBasis, pickValue } from '../lib/format';

interface Props {
  rows: PriceRow[];
  currency: 'CNY' | 'USD';
  unit: string;
  basis: BasisView;
  selectedCity: string | null;
  onSelectCity: (id: string) => void;
}

export default function GlobalRank({ rows, currency, unit, basis, selectedCity, onSelectCity }: Props) {
  const { intl, cn, cnMedian, intlMedian, top, max } = useMemo(() => {
    const usable = rows.filter((r) => pickValue(r, basis) != null);
    const intlRows = usable.filter((r) => r.scope === 'INTL');
    const cnRows = usable.filter((r) => r.scope === 'CN');
    const med = (arr: PriceRow[]) => {
      if (!arr.length) return 0;
      const v = arr.map((r) => pickValue(r, basis) as number).sort((a, b) => a - b);
      return v[Math.floor(v.length / 2)];
    };
    const cnMed = med(cnRows);
    const topRows = intlRows
      .slice()
      .sort((a, b) => (pickValue(b, basis) as number) - (pickValue(a, basis) as number))
      .slice(0, 16);
    return {
      intl: intlRows,
      cn: cnRows,
      cnMedian: cnMed,
      intlMedian: med(intlRows),
      top: topRows,
      max: Math.max(...topRows.map((r) => pickValue(r, basis) as number), cnMed),
    };
  }, [rows, basis]);

  const ratio = cnMedian > 0 ? intlMedian / cnMedian : 0;
  const cnCheapest = useMemo(
    () =>
      cn
        .slice()
        .sort((a, b) => (pickValue(a, basis) as number) - (pickValue(b, basis) as number))
        .slice(0, 5),
    [cn, basis],
  );
  const fmt = (v: number) => fmtByBasis(v, basis, currency);
  const suf = basis === 'markup' ? '' : `/${unit}`;

  return (
    <div className="panel" style={{ minHeight: 0 }}>
      <div className="panel-head">
        全球城市排行
        <span className="tag">海外 {intl.length} 城 · 按{basis === 'markup' ? '溢价' : '价格'}降序</span>
      </div>
      <div className="panel-body" style={{ padding: '10px 12px' }}>
        <div className="stat-row">
          <div className="st">
            <div className="k">中国 {cn.length} 城中位</div>
            <div className="v">{fmt(cnMedian)}<span style={{ fontSize: 10, color: 'var(--ink-4)', fontWeight: 400 }}>{suf}</span></div>
          </div>
          <div className="st">
            <div className="k">海外 {intl.length} 城中位</div>
            <div className="v">{fmt(intlMedian)}<span style={{ fontSize: 10, color: 'var(--ink-4)', fontWeight: 400 }}>{suf}</span></div>
          </div>
          <div className="st">
            <div className="k">海外 / 中国</div>
            <div className="v" style={{ color: ratio >= 1 ? 'var(--up)' : 'var(--down)' }}>{ratio.toFixed(2)}×</div>
          </div>
        </div>

        <div className="sec-title">最贵的 16 座海外城市</div>
        {top.map((r, i) => {
          const v = pickValue(r, basis) as number;
          const w = max > 0 ? (v / max) * 100 : 0;
          const on = r.cityId === selectedCity;
          return (
            <div
              key={r.cityId}
              onClick={() => onSelectCity(r.cityId)}
              style={{
                display: 'grid', gridTemplateColumns: '16px 118px 1fr 78px', gap: 8,
                alignItems: 'center', padding: '4px 4px', borderRadius: 6, cursor: 'pointer',
                background: on ? 'var(--brand-soft)' : undefined,
              }}
            >
              <span style={{ color: 'var(--ink-3)', fontSize: 10, fontFamily: 'var(--mono)' }}>{i + 1}</span>
              <span style={{ fontSize: 11.5, fontWeight: on ? 650 : 500, color: on ? 'var(--brand)' : 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.name}
                <span style={{ color: 'var(--ink-3)', fontWeight: 400, fontSize: 9.5, marginLeft: 4 }}>{r.country}</span>
              </span>
              <div style={{ height: 12, background: '#eef0f4', overflow: 'hidden' }}>
                <i style={{ display: 'block', height: '100%', width: `${w}%`, background: 'linear-gradient(90deg,#e3c9c5,#b42318)', }} />
              </div>
              <span className="num" style={{ textAlign: 'right', fontSize: 11.5, fontWeight: 600 }}>{fmt(v)}</span>
            </div>
          );
        })}

        <div className="sec-title" style={{ marginTop: 14 }}>中国最低的 5 城（同商品）</div>
        {cnCheapest.map((r) => (
          <div
            key={r.cityId}
            onClick={() => onSelectCity(r.cityId)}
            style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 4px', fontSize: 11.5, cursor: 'pointer' }}
          >
            <span style={{ color: 'var(--ink-2)' }}>{r.fullName}</span>
            <span className="num" style={{ fontWeight: 600 }}>{fmt(pickValue(r, basis) as number)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
