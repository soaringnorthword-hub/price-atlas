import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { money } from '../lib/format';

interface Line {
  label: string;
  color: string;
  points: { short: string; cny: number }[];
}

interface Props {
  lines: Line[];
  currency: 'CNY' | 'USD';
  unit: string;
}

export default function TrendChart({ lines, currency, unit }: Props) {
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
    const usable = lines.filter((l) => l.points.length);
    if (!usable.length) {
      c.clear();
      return;
    }
    const all = usable.flatMap((l) => l.points.map((p) => (currency === 'USD' ? p.cny / 7.15 : p.cny)));
    const min = Math.min(...all);
    const max = Math.max(...all);
    const pad = (max - min) * 0.28 || max * 0.04;
    c.setOption(
      {
        color: usable.map((l) => l.color),
        grid: { left: 2, right: 2, top: 18, bottom: 16 },
        legend: {
          show: true,
          top: 0,
          right: 0,
          itemWidth: 8,
          itemHeight: 8,
          icon: 'roundRect',
          textStyle: { fontSize: 9.5, color: '#8b95a5' },
        },
        tooltip: {
          trigger: 'axis',
          backgroundColor: 'rgba(255,255,255,.97)',
          borderColor: '#e3e6eb',
          textStyle: { fontSize: 11, color: '#0f172a' },
          formatter: (ps: any[]) =>
            `${ps[0].axisValue}<br/>` +
            ps
              .map((p) => `<span style="display:inline-block;width:6px;height:6px;border-radius:2px;background:${p.color};margin-right:4px"></span>${p.seriesName} <b>${money(p.value, currency)}</b>`)
              .join('<br/>') +
            ` <span style="color:#8b95a5">/${unit}</span>`,
        },
        xAxis: {
          type: 'category',
          data: usable[0].points.map((p) => p.short),
          axisLine: { lineStyle: { color: '#e6e9ee' } },
          axisTick: { show: false },
          axisLabel: { fontSize: 9, color: '#9aa3b0', interval: 1 },
        },
        yAxis: { type: 'value', min: min - pad, max: max + pad, show: false },
        series: usable.map((l) => ({
          name: l.label,
          type: 'line',
          data: l.points.map((p) => (currency === 'USD' ? p.cny / 7.15 : p.cny)),
          smooth: 0.35,
          symbol: 'circle',
          symbolSize: 3.5,
          lineStyle: { width: 1.7, color: l.color },
          itemStyle: { color: l.color },
        })),
      },
      { notMerge: true },
    );
  }, [lines, currency, unit]);

  return <div ref={box} style={{ width: '100%', height: 96 }} />;
}
