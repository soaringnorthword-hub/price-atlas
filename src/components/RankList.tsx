import { useMemo } from 'react';
import type { BasisView, PriceRow } from '../lib/api';
import { fmtByBasis, pickValue } from '../lib/format';

interface Props {
  rows: PriceRow[];
  provinces: { province: string; value: number; cities: number }[];
  currency: 'CNY' | 'USD';
  unit: string;
  basis: BasisView;
  selectedCity: string | null;
  onSelect: (id: string) => void;
  onAdd: (id: string) => void;
  mode: 'city' | 'prov';
}

export default function RankList({
  rows,
  provinces,
  currency,
  unit,
  basis,
  selectedCity,
  onSelect,
  onAdd,
  mode,
}: Props) {
  const cn = useMemo(
    () => rows.filter((r) => r.scope === 'CN' && pickValue(r, basis) != null),
    [rows, basis],
  );
  const sorted = useMemo(
    () => cn.slice().sort((a, b) => (pickValue(b, basis) as number) - (pickValue(a, basis) as number)),
    [cn, basis],
  );
  const top = sorted.slice(0, 12);
  const bottom = sorted.slice(-12).reverse();
  const provTop = useMemo(() => provinces.slice().sort((a, b) => b.value - a.value).slice(0, 12), [provinces]);
  // Colour against the national median, not "top row red, everything else green".
  const mid = sorted.length ? (pickValue(sorted[Math.floor(sorted.length / 2)], basis) as number) : 0;

  const Row = ({ r, i }: { r: PriceRow; i: number }) => {
    const v = pickValue(r, basis) as number;
    const hot = mid > 0 && v > mid * 1.03;
    const cold = mid > 0 && v < mid * 0.97;
    return (
      <div
        className={`rank-row${r.cityId === selectedCity ? ' on' : ''}`}
        onClick={() => onSelect(r.cityId)}
        onDoubleClick={() => onAdd(r.cityId)}
        title="单击查看详情，双击加入对比"
      >
        <span className="no">{i + 1}</span>
        <span className="nm">
          {r.name}
          {r.province && r.province !== r.name && <span className="prov">{r.province}</span>}
        </span>
        <span className={`pv ${hot ? 'up' : cold ? 'down' : ''}`}>
          {fmtByBasis(v, basis, currency)}
          {basis !== 'markup' && <small>/{unit}</small>}
        </span>
      </div>
    );
  };

  return (
    <div>
      {mode === 'city' ? (
        <>
          <div className="sec-title" style={{ padding: '8px 11px 2px', marginBottom: 0 }}>
            最贵 12 城 <span className="hint">双击加入对比</span>
          </div>
          <div className="rank">{top.map((r, i) => <Row key={r.cityId} r={r} i={i} />)}</div>
          <div className="sec-title" style={{ padding: '10px 11px 2px', marginBottom: 0 }}>最便宜 12 城</div>
          <div className="rank">{bottom.map((r, i) => <Row key={r.cityId} r={r} i={i} />)}</div>
        </>
      ) : (
        <div className="rank" style={{ paddingTop: 4 }}>
          {provTop.map((p, i) => (
            <div className="rank-row" key={p.province} style={{ cursor: 'default' }}>
              <span className="no">{i + 1}</span>
              <span className="nm">
                {p.province}
                <span className="prov">{p.cities} 市</span>
              </span>
              <span className="pv">
                {fmtByBasis(p.value, basis, currency)}
                {basis !== 'markup' && <small>/{unit}</small>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
