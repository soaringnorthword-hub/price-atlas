import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { LiveSeries } from '../lib/api';
import { money } from '../lib/format';

interface Props {
  live: LiveSeries;
  currency: 'CNY' | 'USD';
  unit: string;
  days?: number;
}

export default function LiveTrendChart({ live, currency, unit, days = 120 }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!box.current) return;
    const c = echarts.init(box.current, undefined, { renderer: 'canvas' });
    chart.current = c;
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(box.current);
    return () => {
      ro.disconnect();
      c.dispose();
    };
  }, []);

  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const pts = live.points.slice(-days);
    const f = live.forecast;
    const conv = (v: number) => (currency === 'USD' ? v / 7.15 : v);

    const cats = pts.map((p) => p.date.slice(5));
    const actual = pts.map((p) => conv(p.value));
    const fcX = f ? [cats.length - 1, cats.length] : [];
    const fcY = f ? [actual[actual.length - 1], conv(f.value)] : [];
    if (f) cats.push('预测');

    const allVals = [...actual, ...(f ? [conv(f.low), conv(f.high)] : [])];
    const min = Math.min(...allVals);
    const max = Math.max(...allVals);
    const pad = (max - min) * 0.35 || max * 0.04;

    c.setOption(
      {
        animation: false,
        grid: { left: 4, right: 46, top: 12, bottom: 20 },
        tooltip: {
          trigger: 'axis',
          backgroundColor: 'rgba(255,255,255,.97)',
          borderColor: '#e3e6eb',
          textStyle: { fontSize: 11, color: '#0f172a' },
          formatter: (ps: any[]) => {
            const p = ps.find((x) => x.seriesName === '实际');
            const q = ps.find((x) => x.seriesName === '预测');
            if (!p && !q) return '';
            const title = ps[0].axisValue === '预测' ? `下月预测（${f?.method ?? ''}）` : ps[0].axisValue;
            let html = `${title}<br/>`;
            if (p) html += `实际 <b>${money(p.value, currency)}</b> /${unit}<br/>`;
            if (q && f) {
              html += `预测 <b>${money(q.value, currency)}</b> /${unit}<br/>`;
              html += `<span style="color:#8b95a5">80% 区间 ${money(f.low, currency)}–${money(f.high, currency)}</span>`;
            }
            return html;
          },
        },
        xAxis: {
          type: 'category',
          data: cats,
          boundaryGap: false,
          axisLine: { lineStyle: { color: '#e6e9ee' } },
          axisTick: { show: false },
          axisLabel: { fontSize: 9, color: '#9aa3b0', interval: Math.max(1, Math.floor(cats.length / 6)) },
        },
        yAxis: {
          type: 'value',
          min: min - pad,
          max: max + pad,
          scale: true,
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: '#f0f2f5' } },
          axisLabel: { fontSize: 9, color: '#9aa3b0', formatter: (v: number) => money(v, currency, { compact: true }) },
        },
        series: [
          {
            name: '实际',
            type: 'line',
            data: actual,
            showSymbol: false,
            lineStyle: { width: 1.8, color: '#1a56c4' },
            itemStyle: { color: '#1a56c4' },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(26,86,196,.16)' },
                { offset: 1, color: 'rgba(26,86,196,0)' },
              ]),
            },
            markArea: f
              ? {
                  silent: true,
                  itemStyle: { color: 'rgba(180,35,24,.10)' },
                  label: { show: false },
                  data: [
                    [
                      { xAxis: cats.length - 1.4, yAxis: conv(f.low) },
                      { xAxis: cats.length + 0.2, yAxis: conv(f.high) },
                    ],
                  ],
                }
              : undefined,
          },
          {
            name: '预测',
            type: 'line',
            data: [null, ...new Array(cats.length - 2).fill(null), ...fcY],
            showSymbol: true,
            symbol: 'circle',
            symbolSize: 6,
            lineStyle: { width: 1.6, color: '#b42318', type: 'dashed' },
            itemStyle: { color: '#b42318', borderColor: '#fff', borderWidth: 1.5 },
            z: 5,
          },
        ],
      },
      { notMerge: true },
    );
  }, [live, currency, unit, days]);

  return <div ref={box} style={{ width: '100%', height: 148 }} />;
}
