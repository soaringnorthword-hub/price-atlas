import type { TierKey } from '../lib/api';
import { TIER_COLOR } from '../lib/format';

interface Props {
  tierOrder: TierKey[];
  tiers: Record<TierKey, { key: TierKey; label: string; weight: number; color: string; desc: string }>;
  weights: Record<TierKey, number>;
  onChange: (w: Record<TierKey, number>) => void;
  onClose: () => void;
  stats: Record<TierKey, number>;
}

const LABEL: Record<TierKey, string> = {
  A: '政府法定统计',
  B: '交易所定价',
  C: '国际组织',
  D: '持牌数据商',
  E: '零售渠道',
  F: '众包',
};

export default function WeightPopover({ tierOrder, tiers, weights, onChange, onClose, stats }: Props) {
  const set = (t: TierKey, v: number) => onChange({ ...weights, [t]: v });
  return (
    <div className="popover">
      <div className="pop-title">数据源权威性权重</div>
      <div className="pop-desc">
        融合价 = 同城同品的多源报价按「层级权重 × 时效衰减」加权平均，偏离中位 3.5×MAD 的离群源先行剔除。拖动即可看到结论如何漂移。
      </div>
      {tierOrder.map((t) => (
        <div className={`w-row${weights[t] <= 0 ? ' off' : ''}`} key={t}>
          <span className="tier-chip" style={{ background: TIER_COLOR[t] }}>{t}</span>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--ink-2)' }}>
              <span>{LABEL[t]}</span>
              <span style={{ color: 'var(--ink-3)' }}>{stats[t]} 源</span>
            </div>
            <input
              type="range"
              min={0}
              max={1.2}
              step={0.05}
              value={weights[t]}
              onChange={(e) => set(t, Number(e.target.value))}
            />
          </div>
          <span className="val">{weights[t].toFixed(2)}</span>
        </div>
      ))}
      <div className="w-actions">
        <button
          className="btn"
          onClick={() => {
            const next = { ...weights };
            tierOrder.forEach((t) => (next[t] = next[t] > 0 ? 0 : tiers[t].weight));
            onChange(next);
          }}
        >
          全部开/关
        </button>
        <button
          className="btn primary"
          onClick={() => {
            const next = { ...weights };
            tierOrder.forEach((t) => (next[t] = tiers[t].weight));
            onChange(next);
          }}
        >
          恢复默认
        </button>
      </div>
      <div style={{ marginTop: 8, textAlign: 'right' }}>
        <button className="btn" style={{ height: 26 }} onClick={onClose}>关闭</button>
      </div>
    </div>
  );
}
