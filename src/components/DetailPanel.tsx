import type { BasisQuote, CellResult, LiveSeries } from '../lib/api';
import { BASIS_META, TIER_COLOR, confMeta, money, signedPct } from '../lib/format';
import TrendChart from './TrendChart';
import LiveTrendChart from './LiveTrendChart';

interface Props {
  cell: CellResult | null;
  loading: boolean;
  currency: 'CNY' | 'USD';
  unit: string;
  monthLabel: string;
  seriesRetail: { short: string; cny: number }[];
  seriesWholesale: { short: string; cny: number }[];
  live: LiveSeries | null;
}

function QuoteBlock({
  q,
  currency,
  unit,
  emphasis,
}: {
  q: BasisQuote | null;
  currency: 'CNY' | 'USD';
  unit: string;
  emphasis: boolean;
}) {
  if (!q) {
    return (
      <div className={`dual-col${emphasis ? ' em' : ''}`}>
        <div className="dlabel" style={{ color: 'var(--ink-3)' }}>无公开数据</div>
        <div className="dval" style={{ color: 'var(--ink-3)', fontSize: 20 }}>—</div>
        <div className="dsub">该品类无此口径监测源</div>
      </div>
    );
  }
  const conf = confMeta(q.confidence);
  const nd = q.spread < 1.2 ? (q.cny >= 100 ? 1 : 3) : undefined;
  return (
    <div className={`dual-col${emphasis ? ' em' : ''}`}>
      <div className="dlabel">
        <i style={{ background: BASIS_META[q.basis].color }} />
        {BASIS_META[q.basis].label}
        <span className="est-tag">推算</span>
      </div>
      <div className="dval">
        {money(q.cny, currency)}
        <small>/ {unit}</small>
      </div>
      <div className="dsub">
        区间 {money(q.low, currency, { digits: nd })}–{money(q.high, currency, { digits: nd })}
        <br />
        {q.nUsed}/{q.n} 源 · 置信 {(q.confidence * 100).toFixed(0)}% · 区间宽 {q.spread.toFixed(1)}%
        <span style={{ color: conf.color, marginLeft: 5 }}>{conf.label}</span>
      </div>
    </div>
  );
}

function SourceTable({ q, currency }: { q: BasisQuote | null; currency: 'CNY' | 'USD' }) {
  if (!q) return <div className="empty" style={{ padding: '6px 0', fontSize: 10.5 }}>该口径无可用数据源</div>;
  return (
    <>
      <table className="src-table">
        <thead>
          <tr>
            <th style={{ width: 22 }}>层</th>
            <th>数据源（{BASIS_META[q.basis].label}）</th>
            <th style={{ textAlign: 'right' }}>报价</th>
            <th style={{ textAlign: 'right' }}>权重</th>
            <th style={{ textAlign: 'right' }}>偏离</th>
          </tr>
        </thead>
        <tbody>
          {(q.contributors ?? []).map((c) => (
            <tr key={c.sourceId}>
              <td>
                <span className="tier-chip" style={{ background: TIER_COLOR[c.tier] }}>{c.tier}</span>
              </td>
              <td>
                <div className="name">{c.sourceName}</div>
                <div className="org">{c.org}</div>
              </td>
              <td style={{ textAlign: 'right' }} className="num">{money(c.priceCny, currency)}</td>
              <td style={{ textAlign: 'right' }} className="num">{c.weight.toFixed(2)}</td>
              <td
                style={{ textAlign: 'right' }}
                className={`num dev ${c.deviation > 0.002 ? 'up' : c.deviation < -0.002 ? 'down' : ''}`}
              >
                {signedPct(c.deviation * 100, 1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(q.rejected ?? []).length > 0 && (
        <div className="rejected" style={{ marginTop: 6 }}>
          已剔除 {q.rejected!.length} 条离群报价：
          {q.rejected!.map((r) => `${r.sourceName}（${signedPct(r.deviation * 100, 0)}）`).join('、')}
        </div>
      )}
    </>
  );
}

/** Official quote block: price, day change, next-month forecast, landed budget. */
function LiveSection({ live, currency, unit }: { live: LiveSeries; currency: 'CNY' | 'USD'; unit: string }) {
  const pts = live.points;
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const back30 = pts[Math.max(0, pts.length - 31)];
  const dayPct = prev ? ((last.value - prev.value) / prev.value) * 100 : null;
  const m30Pct = back30 ? ((last.value - back30.value) / back30.value) * 100 : null;
  const f = live.forecast;
  // Landed budget = wholesale x 1.06 freight x 1.02 shrinkage.
  const budget = last.value * 1.06 * 1.02;

  return (
    <div className="sec live-sec">
      <div className="sec-title">
        官方实价 · 批发口径
        <span className="hint">{live.latestDate} · 农业农村部</span>
      </div>

      <div className="live-row">
        <div>
          <div className="dval">
            {money(last.value, currency)}
            <small>/ {unit}</small>
          </div>
          <div className="dsub">
            较上日{' '}
            <b className={dayPct != null && dayPct > 0 ? 'up' : dayPct != null && dayPct < 0 ? 'down' : ''}>
              {dayPct != null ? signedPct(dayPct) : '—'}
            </b>
            {' · '}近 30 日{' '}
            <b className={m30Pct != null && m30Pct > 0 ? 'up' : m30Pct != null && m30Pct < 0 ? 'down' : ''}>
              {m30Pct != null ? signedPct(m30Pct) : '—'}
            </b>
          </div>
        </div>
        {f && (
          <div className="pred">
            <div className="pred-k">下月预测</div>
            <div className="pred-v">
              {money(f.value, currency)}
              <span className={f.changePct >= 0 ? 'up' : 'down'}>{signedPct(f.changePct)}</span>
            </div>
            <div className="pred-s">
              80% 区间 {money(f.low, currency)}–{money(f.high, currency)}
            </div>
          </div>
        )}
      </div>

      <LiveTrendChart live={live} currency={currency} unit={unit} />

      <div className="live-foot">
        <span>到货预算 <b>{money(budget, currency)}/{unit}</b></span>
        <span className="sep">·</span>
        <span>运费 6% + 损耗 2%</span>
        <span className="sep">·</span>
        <span>{pts.length} 天历史</span>
        {f && (
          <>
            <span className="sep">·</span>
            <span>预测法 {f.method}</span>
          </>
        )}
      </div>
      <div className="live-note">
        监测价为全国批发市场均价，不含运费、账期与批量折扣，不能替代供应商报价；预测为统计外推，非承诺价。
      </div>
    </div>
  );
}

export default function DetailPanel({ cell, loading, currency, unit, monthLabel, seriesRetail, seriesWholesale, live }: Props) {
  if (loading && !cell) return <div className="loading">融合计算中…</div>;
  if (!cell) return <div className="empty">选择地图上的城市点或榜单，查看该城多源融合明细。</div>;

  const hasDual = !!cell.retail && !!cell.wholesale;
  const mk = cell.markupPct;

  return (
    <div className="detail">
      <div className="d-head">
        <div>
          <div className="d-city">{cell.fullName}</div>
          <div className="d-sub">
            {cell.scope === 'CN' ? '中国' : cell.country} · 物价指数 {cell.pli.toFixed(2)} · 本币 {cell.currency}
            {cell.currency !== 'CNY' && `（1 ${cell.currency} = ${cell.fx} CNY）`}
          </div>
        </div>
        <span className="badge" style={{ color: '#6b7280', background: '#f1f3f6' }}>{monthLabel}</span>
      </div>

      {live && <LiveSection live={live} currency={currency} unit={unit} />}

      <div className="sec">
        <div className="sec-title">
          {live ? '城市参考价' : '双口径价格'}
          <span className="hint">同城同品，两条独立来源链</span>
        </div>
        <div className="dual" style={{ margin: '0 -12px' }}>
          <QuoteBlock q={cell.retail} currency={currency} unit={unit} emphasis />
          <div className="dual-mid">
            <div className="mk">{mk != null ? `+${mk.toFixed(1)}%` : '—'}</div>
            <div className="mkl">零售溢价</div>
          </div>
          <QuoteBlock q={cell.wholesale} currency={currency} unit={unit} emphasis={!cell.retail} />
        </div>
        {!hasDual && (
          <div
            className="rejected"
            style={{
              margin: '8px 0 0',
              background: 'var(--panel-2)',
              borderColor: 'var(--line)',
              borderLeftColor: 'var(--ink-4)',
              color: 'var(--ink-3)',
            }}
          >
            该品类只有单一口径：
            {cell.retail ? '仅有零售监测源，无公开批发报价' : '仅有批发/交易所报价，零售端无公开监测数据'}。
          </div>
        )}
      </div>

      <div className="sec">
        <div className="sec-title">来源明细 <span className="hint">权重 = 层级基准 × 时效衰减</span></div>
        <SourceTable q={cell.retail} currency={currency} />
        <div style={{ height: 9 }} />
        <SourceTable q={cell.wholesale} currency={currency} />
      </div>

      {!live && (
        <div className="sec">
          <div className="sec-title">近 12 个月双口径走势 <span className="hint">{cell.name}</span></div>
          <TrendChart
            lines={[
              { label: '零售', color: BASIS_META.retail.color, points: seriesRetail },
              { label: '批发', color: BASIS_META.wholesale.color, points: seriesWholesale },
            ]}
            currency={currency}
            unit={unit}
          />
        </div>
      )}
    </div>
  );
}
