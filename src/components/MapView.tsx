import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import type { BasisView, PriceRow } from '../lib/api';
import { PROV_TO_GEO, divergeColor, money, pickValue, provFill } from '../lib/format';
import { IconReset } from './icons';

interface Props {
  rows: PriceRow[];
  selectedCity: string | null;
  onSelectCity: (id: string) => void;
  currency: 'CNY' | 'USD';
  unit: string;
  basis: BasisView;
}

// Major cities keep their labels while the map is zoomed out.
const KEY_CITIES = new Set([
  '北京', '上海', '广州', '深圳', '天津', '重庆', '成都', '杭州', '武汉', '西安', '南京',
  '郑州', '长沙', '沈阳', '青岛', '宁波', '昆明', '合肥', '福州', '厦门', '济南', '大连',
  '哈尔滨', '长春', '石家庄', '太原', '南昌', '南宁', '贵阳', '兰州', '乌鲁木齐',
  '呼和浩特', '银川', '西宁', '拉萨', '海口', '三亚', '中国香港', '中国澳门', '台北',
]);

let geoPromise: Promise<any> | null = null;
function loadGeo() {
  if (!geoPromise) geoPromise = fetch('/geo/china.json').then((r) => r.json());
  return geoPromise;
}

// Diverging normalisation around the median: negative = cheaper, positive = dearer.
function divergeNorm(values: number[]) {
  const sorted = values.slice().sort((a, b) => a - b);
  if (!sorted.length) return { norm: () => 0, med: 0, min: 0, max: 0 };
  const med = sorted[Math.floor(sorted.length / 2)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  // Half-width = 85th percentile of |v - median|, so a single extreme city
  // saturates instead of flattening every other city to the mid colour.
  const dev = sorted.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
  const q85 = dev[Math.floor(dev.length * 0.85)] || Math.max(med - min, max - med) || 1;
  // Floor it at 4% of the median: for products with genuinely small regional
  // spread the map should read pale, not amplify 1% noise into full red/blue.
  const span = Math.max(q85, Math.abs(med) * 0.04, 1e-9);
  return { norm: (v: number) => Math.max(-1, Math.min(1, (v - med) / span)), med, min, max };
}

export default function MapView({ rows, selectedCity, onSelectCity, currency, unit, basis }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(true);

  useEffect(() => {
    let alive = true;
    loadGeo()
      .then((geo) => {
        if (!alive) return;
        echarts.registerMap('china', geo);
        setReady(true);
      })
      .catch((e) => setErr(String(e)));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!boxRef.current) return;
    const chart = echarts.init(boxRef.current, undefined, { renderer: 'canvas' });
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(boxRef.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  const cnRows = useMemo(
    () => rows.filter((r) => r.scope === 'CN' && pickValue(r, basis) != null),
    [rows, basis],
  );

  const { scatter, provData, vmin, vmax, vmed } = useMemo(() => {
    const vals = cnRows.map((r) => pickValue(r, basis) as number);
    const { norm, med, min, max } = divergeNorm(vals);

    const scatter = cnRows.map((r) => {
      const v = pickValue(r, basis) as number;
      const t = norm(v);
      const on = r.cityId === selectedCity;
      const key = KEY_CITIES.has(r.name);
      return {
        name: r.name,
        value: [r.lng, r.lat, v],
        cityId: r.cityId,
        row: r,
        symbolSize: on ? 14 : key ? 7.5 : 6,
        itemStyle: {
          color: divergeColor(t),
          borderColor: on ? '#0f172a' : 'rgba(255,255,255,.92)',
          borderWidth: on ? 1.8 : key ? 1 : 0.7,
          shadowBlur: on ? 10 : 0,
          shadowColor: 'rgba(15,23,42,.4)',
        },
        label: {
          show: showLabels,
          formatter: r.name,
          position: 'right',
          distance: 3,
          fontSize: key ? 10 : 8.5,
          fontWeight: key || on ? 650 : 400,
          color: on ? '#0f172a' : key ? '#3f4d63' : '#6b7a90',
          textBorderColor: 'rgba(255,255,255,.95)',
          textBorderWidth: 2.6,
        },
        z: on ? 12 : key ? 8 : 6,
      };
    });

    // Province averages are computed client-side against the active basis.
    const pm = new Map<string, { sum: number; w: number; count: number }>();
    for (const r of cnRows) {
      if (!r.province) continue;
      const v = pickValue(r, basis) as number;
      const q = basis === 'markup' ? r.retail : r[basis];
      const w = q?.confidence ?? 0.5;
      const cur = pm.get(r.province) || { sum: 0, w: 0, count: 0 };
      cur.sum += v * w;
      cur.w += w;
      cur.count += 1;
      pm.set(r.province, cur);
    }
    const provVals = [...pm.values()].map((x) => x.sum / x.w);
    const pnorm = divergeNorm(provVals).norm;
    const provData = [...pm.entries()].map(([province, x]) => {
      const value = x.sum / x.w;
      return {
        name: PROV_TO_GEO[province] || province,
        value: Number(value.toFixed(2)),
        raw: { province, value, cities: x.count },
        itemStyle: { areaColor: provFill(pnorm(value)) },
      };
    });

    return { scatter, provData, vmin: min, vmax: max, vmed: med };
  }, [cnRows, basis, selectedCity, showLabels]);

  const fmtVal = (v: number) => (basis === 'markup' ? `${v.toFixed(1)}%` : `${money(v, currency)}`);
  const basisLabel = basis === 'markup' ? '零售溢价' : basis === 'retail' ? '零售价' : '批发价';

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !ready) return;
    chart.off('click');
    chart.setOption(
      {
        backgroundColor: 'transparent',
        animationDuration: 240,
        tooltip: {
          trigger: 'item',
          backgroundColor: 'rgba(255,255,255,.98)',
          borderColor: '#e3e6eb',
          borderWidth: 1,
          padding: [8, 10],
          textStyle: { color: '#0f172a', fontSize: 11.5 },
          extraCssText: 'box-shadow:0 6px 22px rgba(15,23,42,.12);border-radius:8px;',
          formatter: (p: any) => {
            if (p.seriesType === 'scatter') {
              const r: PriceRow = p.data.row;
              const ret = r.retail ? money(r.retail.cny, currency) : '—';
              const who = r.wholesale ? money(r.wholesale.cny, currency) : '—';
              return `<div style="font-weight:650;font-size:12.5px;margin-bottom:4px">${r.fullName}</div>
                <div style="display:grid;grid-template-columns:auto auto;gap:1px 10px;font-size:11px">
                  <span style="color:#b45309">零售</span><b style="text-align:right">${ret} /${unit}</b>
                  <span style="color:#0f766e">批发</span><b style="text-align:right">${who} /${unit}</b>
                  <span style="color:#8b95a5">溢价</span><span style="text-align:right">${r.markupPct != null ? r.markupPct.toFixed(1) + '%' : '—'}</span>
                </div>
                <div style="color:#8b95a5;font-size:10px;margin-top:4px">置信 ${r.retail ? (r.retail.confidence * 100).toFixed(0) : '—'}% · 零售源 ${r.retail?.n ?? 0} / 批发源 ${r.wholesale?.n ?? 0}</div>`;
            }
            if (p.seriesType === 'map' && p.data?.raw) {
              const it = p.data.raw;
              return `<div style="font-weight:650">${it.province}</div>
                <div style="margin-top:2px">省级均值 <b>${fmtVal(it.value)}</b></div>
                <div style="color:#8b95a5;font-size:10px;margin-top:2px">${it.cities} 市</div>`;
            }
            return '';
          },
        },
        geo: {
          map: 'china',
          roam: true,
          zoom: 1.56,
          center: [104.4, 36.0],
          scaleLimit: { min: 0.9, max: 9 },
          itemStyle: { areaColor: '#f7f9fb', borderColor: '#c9d1dc', borderWidth: 0.8 },
          regions: provData.map((p) => ({ name: p.name, itemStyle: { areaColor: p.itemStyle.areaColor } })),
          emphasis: {
            itemStyle: { areaColor: '#eef2ff' },
            label: { show: true, color: '#1d4ed8', fontSize: 10, fontWeight: 600 },
          },
          select: { disabled: true },
          label: { show: false },
        },
        series: [
          { name: '省级均价', type: 'map', geoIndex: 0, data: provData, tooltip: { show: true } },
          {
            name: '城市均价',
            type: 'scatter',
            coordinateSystem: 'geo',
            data: scatter,
            tooltip: { show: true },
            emphasis: { scale: 1.35 },
            labelLayout: { hideOverlap: true, moveOverlap: 'shiftY' },
            progressive: 0,
          },
        ],
      },
      { notMerge: true },
    );

    chart.on('click', (p: any) => {
      if (p.seriesType === 'scatter' && p.data?.cityId) onSelectCity(p.data.cityId);
    });
  }, [ready, scatter, provData, currency, unit, selectedCity, onSelectCity, basis, showLabels]);

  if (err) return <div className="map-wrap"><div className="empty">地图加载失败：{err}</div></div>;

  return (
    <div className="map-wrap">
      <div className="map-toolbar">
        <button className={`btn${showLabels ? ' primary' : ''}`} onClick={() => setShowLabels((v) => !v)}>
          城市名
        </button>
        <button
          className="btn"
          onClick={() => chartRef.current?.setOption({ geo: { zoom: 1.56, center: [104.4, 36.0] } })}
        >
          <IconReset /> 重置
        </button>
      </div>

      <div ref={boxRef} className="map-canvas" />
      {!ready && <div className="loading">地图边界加载中…</div>}

      <div className="legend" style={{ left: 10, top: 10, right: 'auto', bottom: 'auto' }}>
        <div style={{ fontWeight: 600, color: 'var(--ink-2)' }}>
          {basisLabel}
          <span style={{ color: 'var(--ink-4)', fontWeight: 400, marginLeft: 5 }}>中位 {fmtVal(vmed)}</span>
        </div>
        <div
          className="bar"
          style={{ width: 148, margin: '4px 0 2px', background: 'linear-gradient(90deg, rgb(26,86,196), rgb(150,160,175), rgb(180,35,24))' }}
        />
        <div className="ends" style={{ width: 148 }}>
          <span>便宜</span>
          <span>贵</span>
        </div>
        <div style={{ color: 'var(--ink-4)', marginTop: 2 }}>{scatter.length} 城 · 区块 = 省级均值</div>
      </div>

      <div className="map-note">
        点色：低于中位偏蓝、高于中位偏红；放大后显示更多城市名
        <br />
        行政边界：DataV.GeoAtlas（源出高德行政区划），含台湾省、香港及澳门特别行政区、南海诸岛
      </div>
    </div>
  );
}
