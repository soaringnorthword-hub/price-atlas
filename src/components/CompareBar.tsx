import type { BasisView, PriceRow } from '../lib/api';
import { fmtByBasis, pickValue, signedPct } from '../lib/format';
import { IconClose } from './icons';

interface Props {
  rows: PriceRow[];
  ids: string[];
  reference: number;
  currency: 'CNY' | 'USD';
  unit: string;
  basis: BasisView;
  onRemove: (id: string) => void;
  onClear: () => void;
  onSelect: (id: string) => void;
}

export default function CompareBar({ rows, ids, reference, currency, unit, basis, onRemove, onClear, onSelect }: Props) {
  const picked = ids
    .map((id) => rows.find((r) => r.cityId === id))
    .filter((r): r is PriceRow => !!r && pickValue(r, basis) != null);

  if (!picked.length) {
    return (
      <div className="bottom">
        <div className="cmp-empty">
          对比栏空 —— 点地图上的城市点或榜单行，把城市加进来（最多 5 个，按当前口径与中位比较）
        </div>
      </div>
    );
  }
  const max = Math.max(...picked.map((r) => pickValue(r, basis) as number), reference);
  return (
    <div className="bottom">
      <div className="cmp-head">
        <b>城市对比</b>
        基准 = 中位
        <br />
        {fmtByBasis(reference, basis, currency)}
        {basis !== 'markup' && `/${unit}`}
      </div>
      <div className="cmp-list">
        {picked.map((r) => {
          const v = pickValue(r, basis) as number;
          const delta = reference > 0 ? ((v - reference) / reference) * 100 : 0;
          return (
            <div className="cmp-card" key={r.cityId} onClick={() => onSelect(r.cityId)} style={{ cursor: 'pointer' }}>
              <div className="cn">
                <span>{r.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(r.cityId);
                  }}
                >
                  <IconClose />
                </button>
              </div>
              <div className="cp num">{fmtByBasis(v, basis, currency)}</div>
              <div className={`cd num ${delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : ''}`}>
                {signedPct(delta, 1)} vs 中位
              </div>
              <div className="cmp-bar">
                <i style={{ width: `${Math.max(4, (v / max) * 100)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flex: 'none' }}>
        <button className="btn" onClick={onClear}>清空</button>
      </div>
    </div>
  );
}
