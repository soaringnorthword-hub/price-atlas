// Data and engine self-test. Run with: npm run check
import { STATS, PRODUCTS, PRODUCT_MAP, SUBSPECIES } from './data/taxonomy.mjs';
import { CITY_STATS, CITIES } from './data/cities.mjs';
import { SOURCE_STATS, TIER_ORDER, SOURCES } from './data/sources.mjs';
import { productCityFrame, parseWeights, rankCities, series, MONTHS, LATEST, probe } from './pricing.mjs';
import { fuse } from './engine.mjs';

let fail = 0;
const ok = (cond, msg, extra = '') => {
  if (!cond) { fail++; console.log(`  FAIL  ${msg} ${extra}`); }
  else console.log(`  ok    ${msg} ${extra}`);
};
const pct = (a, b) => ((a - b) / b) * 100;

console.log('\n=== 1. 分类法 ===');
console.log(`  领域 ${STATS.domains} / 品类 ${STATS.categories} / 子类 ${STATS.subspecies} / 代表商品 ${STATS.products} / 计价单位 ${STATS.units}`);
ok(STATS.domains === 8, '领域 = 8');
ok(STATS.categories >= 45, '品类 ≥ 45');
ok(STATS.subspecies >= 200, '子类 ≥ 200');
ok(STATS.products === STATS.subspecies * 3, '每子类 3 个规格');
ok(PRODUCTS.every((p) => p.base > 0 && p.mult > 0 && p.unit), '所有商品有基准价/系数/单位');
ok(PRODUCTS.every((p) => p.markup > 0), '所有商品有零售加价率');
const ids = new Set(PRODUCTS.map((p) => p.id));
ok(ids.size === PRODUCTS.length, '商品 ID 无重复');

console.log('\n=== 2. 城市表 ===');
console.log(`  合计 ${CITY_STATS.total} 城（中国 ${CITY_STATS.cn} / 海外 ${CITY_STATS.intl}），中国覆盖 ${CITY_STATS.provinces} 个省级行政区，海外 ${CITY_STATS.countries} 国`);
ok(CITY_STATS.cn >= 150, '中国城市 ≥ 150');
ok(CITIES.every((c) => c.lng > -180 && c.lng < 180 && c.lat > -90 && c.lat < 90), '经纬度合法');
ok(CITIES.every((c) => c.pli > 0.25 && c.pli < 2.6), '物价指数在合理区间');
ok(CITIES.find((c) => c.name === '中国香港')?.country === '中国', '中国香港归属中国');
ok(CITIES.filter((c) => c.province === '中国台湾').every((c) => c.country === '中国'), '中国台湾城市归属中国');

console.log('\n=== 3. 数据源与计价口径 ===');
console.log(`  共 ${SOURCE_STATS.total} 源，分层：${TIER_ORDER.map((t) => `${t}=${SOURCE_STATS.byTier[t]}`).join(' ')}（中国 ${SOURCE_STATS.cn} / 海外 ${SOURCE_STATS.intl}）`);
console.log(`  口径：批发 ${SOURCE_STATS.byBasis.wholesale} 源 / 零售 ${SOURCE_STATS.byBasis.retail} 源`);
ok(SOURCES.every((s) => s.basis === 'wholesale' || s.basis === 'retail'), '每个源都有明确口径');
ok(SOURCE_STATS.byBasis.wholesale >= 12 && SOURCE_STATS.byBasis.retail >= 12, '两种口径各 ≥12 个源');
ok(TIER_ORDER.every((t) => SOURCE_STATS.byTier[t] >= 3), '每层级至少 3 个源');

console.log('\n=== 4. 双口径价格（零售 > 批发）===');
const probes = ['d0c0s0v0', 'd0c2s3v1', 'd4c2s0v0', 'd6c1s0v1', 'd2c0s0v0', 'd3c3s0v0'];
for (const id of probes) {
  const p = PRODUCT_MAP.get(id);
  const f = productCityFrame(id, { month: LATEST });
  const bj = f.rows.find((r) => r.name === '北京');
  const dual = f.rows.filter((r) => r.retail && r.wholesale);
  const mk = dual.map((r) => r.markupPct).sort((a, b) => a - b)[Math.floor(dual.length / 2)];
  if (!bj.retail) {
    console.log(`  ${p.name.padEnd(20, ' ')} 无零售监测源 → 仅批发 ¥${bj.wholesale.cny.toFixed(2)}（该品类只存在批发口径）`);
    ok(bj.wholesale.cny > 0 && dual.length === 0, `  ${p.name} 正确降级为单口径`);
    continue;
  }
  console.log(
    `  ${p.name.padEnd(20, ' ')} 零售 ${bj.retail.cny.toFixed(2).padStart(9)} / 批发 ${bj.wholesale.cny.toFixed(2).padStart(9)} 元/${p.unit}` +
      `  溢价 ${mk.toFixed(1)}%（设定 ${(p.markup * 100).toFixed(0)}%）  双口径城市 ${dual.length}/${f.rows.length}`,
  );
  ok(bj.retail.cny > 0 && bj.wholesale.cny > 0, `  ${p.name} 两口径都有值`);
  ok(bj.retail.cny > bj.wholesale.cny, `  ${p.name} 零售 > 批发`);
  ok(Math.abs(pct(bj.retail.cny, bj.wholesale.cny) / 100 - p.markup) < 0.12, `  ${p.name} 溢价率接近品类设定`);
  ok(dual.length / f.rows.length > 0.9, `  ${p.name} 90%+ 城市有双口径`);
}

console.log('\n=== 5. 零售比批发对地区更敏感 ===');
// Compare on the baseline directly: fused values carry sampling noise that would
// dominate a max/min ratio across cities.
for (const id of ['d0c2s3v1', 'd4c2s0v0', 'd6c1s0v1', 'd0c4s2v0']) {
  const p = PRODUCT_MAP.get(id);
  const cn = CITIES.filter((c) => c.scope === 'CN');
  const spread = (b) => {
    const v = cn.map((c) => probe.baseline(p, c, LATEST, b));
    return Math.max(...v) / Math.min(...v);
  };
  const sr = spread('retail');
  const sw = spread('wholesale');
  console.log(`  ${p.name.padEnd(20, ' ')} 基准零售倍差 ${sr.toFixed(3)} / 基准批发倍差 ${sw.toFixed(3)}`);
  ok(sr > sw, `  ${p.name} 零售对地区更敏感`);
}

console.log('\n=== 6. 权重影响（关掉 A 级政府源应改变结果）===');
const pid = 'd0c2s3v1';
const base = productCityFrame(pid, { month: LATEST });
const noA = productCityFrame(pid, { month: LATEST, weights: parseWeights('0,0.9,0.85,0.7,0.55,0.3') });
let moved = 0, confDrop = 0;
for (const r of base.rows.slice(0, 40)) {
  const m = noA.rows.find((x) => x.cityId === r.cityId);
  if (!m || !m.retail || !r.retail) continue;
  if (Math.abs(pct(m.retail.cny, r.retail.cny)) > 0.5) moved++;
  if (m.retail.confidence < r.retail.confidence) confDrop++;
}
ok(moved >= 15, '剔除 A 级源后 ≥15/40 城市零售价变化', `${moved}/40`);
ok(confDrop >= 30, '剔除 A 级源后 ≥30/40 城市置信度下降', `${confDrop}/40`);
const bj2 = base.rows.find((r) => r.name === '北京');
console.log('  北京零售分层报价：' + bj2.retail.contributors.map((c) => `${c.tier}=${c.priceCny.toFixed(0)}`).join(' '));

console.log('\n=== 7. 币种换算 ===');
const ny = base.rows.find((r) => r.name === '纽约');
const bj = base.rows.find((r) => r.name === '北京');
console.log(`  北京零售 ¥${bj.retail.cny} / 纽约 ${ny.currency} ${ny.retail.native}（≈ ¥${ny.retail.cny}），溢价 ${pct(ny.retail.cny, bj.retail.cny).toFixed(0)}%`);
ok(Math.abs(ny.retail.cny - ny.retail.native * ny.fx) < 0.02, '纽约 本币×汇率 = 人民币');
ok(ny.retail.cny > bj.retail.cny * 1.2, '纽约零售价显著高于北京');

console.log('\n=== 8. 序列 / 排名 / 单源 ===');
const s = series(pid, bj.cityId, { basis: 'retail' });
const sw = series(pid, bj.cityId, { basis: 'wholesale' });
ok(s.points.length === 12 && sw.points.length === 12, '两个口径各有 12 个月序列');
ok(sw.points.every((pt, i) => i === 0 || pt.cny < s.points[i].cny), '批发序列每点都低于零售');
const rk = rankCities(pid, { order: 'desc', limit: 10, basis: 'retail' });
ok(rk.rows.length === 10 && rk.rows[0].cny >= rk.rows[9].cny, '零售降序排名正确');
const rkw = rankCities(pid, { order: 'asc', limit: 10, basis: 'wholesale' });
ok(rkw.rows.length === 10 && rkw.rows[0].cny <= rkw.rows[9].cny, '批发升序排名正确');
const single = fuse([{ priceCny: 10, tier: 'F', defaultWeight: 0.3, ageDays: 5, sourceId: 'x', sourceName: 'x', org: 'x' }], null);
ok(single.n === 1 && single.confidence < 0.6, '单源置信度 < 0.6', `conf=${single.confidence}`);

console.log(`\n${fail === 0 ? '✅ 全部通过' : `❌ ${fail} 项失败`}\n`);
process.exit(fail === 0 ? 0 : 1);
