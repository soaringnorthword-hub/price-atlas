// Source registry: six authority tiers x two pricing bases (wholesale / retail).
// DSL: id|name|org|tier|scope|domains|basis|license|frequency|url

export const TIERS = {
  A: { key: 'A', label: '政府法定统计', weight: 1.0, color: '#1a4fd6', desc: '国家统计/发改/农业农村部等法定调查，口径公开、可复核' },
  B: { key: 'B', label: '交易所官方定价', weight: 0.9, color: '#0e8f7e', desc: '上期所/大商所/LME 等集中交易结算价，连续成交、无报价水分' },
  C: { key: 'C', label: '国际组织机构', weight: 0.85, color: '#5a62c9', desc: '世界银行 ICP、FAO、Eurostat、OECD、EIA，跨国可比但滞后' },
  D: { key: 'D', label: '持牌行业数据商', weight: 0.7, color: '#c1873b', desc: '我的钢铁、SMM、卓创等行业资讯商，样本广但需订阅校验' },
  E: { key: 'E', label: '零售/渠道挂牌', weight: 0.55, color: '#8d6bbd', desc: '电商自营、连锁商超、批发平台、经销商报价，含促销与渠道加价' },
  F: { key: 'F', label: '众包与二手', weight: 0.3, color: '#8a929c', desc: 'Numbeo 等众包提交，样本偏差大，仅作交叉参考' },
};

export const TIER_ORDER = ['A', 'B', 'C', 'D', 'E', 'F'];

export const BASIS = {
  wholesale: { key: 'wholesale', label: '批发价', short: '批', color: '#0f766e', desc: '出厂/批发市场/交易所/集采中选等大额成交口径' },
  retail: { key: 'retail', label: '零售价', short: '零', color: '#b45309', desc: '消费者实际支付的终端挂牌口径（含渠道与税费加价）' },
};

const RAW = `
moa_wholesale|全国农产品批发市场价格信息系统|农业农村部|A|CN|food,agri|wholesale|政府公开信息|日度|http://pfsc.agri.cn/
ndrc_monitor|价格监测中心监测数据|国家发展改革委|A|CN|food,agri,material,health|retail|政府公开信息|周度|https://www.ndrc.gov.cn/
nbs_cpi|居民消费价格调查（CPI 规格品）|国家统计局|A|CN|food,consumer,health,energy|retail|政府公开信息|月度|https://www.stats.gov.cn/
prov_drc|省级价格监测公示|各省发改委|A|CN|food,material,agri|retail|政府公开信息|周度|
mofcom_market|市场运行监测（生活必需品零售价）|商务部|A|CN|food,agri|retail|政府公开信息|周度|https://www.mofcom.gov.cn/
nhsa_tender|药品集中采购中选价|国家医保局|A|CN|health|wholesale|政府公开信息|批次|http://www.nhsa.gov.cn/
nmpa_listed|药品挂网采购价|国家药监局/省级平台|A|CN|health|wholesale|政府公开信息|月度|
cost_info|建设工程造价信息（到场价）|省住建厅造价站|A|CN|material|retail|政府公开信息|月度|
ndrc_oil|成品油最高零售价格|国家发展改革委|A|CN|energy|retail|政府公开信息|调价窗口|https://www.ndrc.gov.cn/
shfe|期货合约结算价|上海期货交易所|B|CN|metal,energy|wholesale|交易所公开行情|日度|https://www.shfe.com.cn/
ine|原油期货结算价|上海国际能源交易中心|B|CN|energy|wholesale|交易所公开行情|日度|https://www.ine.cn/
sge|黄金/白银现货基准价|上海黄金交易所|B|CN|metal|wholesale|交易所公开行情|日度|https://www.sge.com.cn/
dce|农产品期货结算价|大连商品交易所|B|CN|agri,food|wholesale|交易所公开行情|日度|http://www.dce.com.cn/
czce|农产品期货结算价|郑州商品交易所|B|CN|agri,food|wholesale|交易所公开行情|日度|http://www.czce.com.cn/
smm|现货金属报价|上海有色网 SMM|D|CN|metal|wholesale|商业订阅|日度|https://www.smm.cn/
mysteel|钢材现货价格指数|我的钢铁网|D|CN|metal,material|wholesale|商业订阅|日度|https://www.mysteel.com/
ccement|水泥价格指数|中国水泥网|D|CN|material|wholesale|商业订阅|周度|https://www.ccement.com/
oilchem|能化现货报价|隆众资讯|D|CN|energy|wholesale|商业订阅|日度|
oem_msrp|厂商指导价/建议零售价|各品牌厂商|D|CN|industrial,consumer|retail|厂商公开|不定期|
alibaba_1688|1688 批发平台成交价|阿里巴巴|E|CN|consumer,industrial,material,food|wholesale|平台公开页面|实时|https://www.1688.com/
yiwu_index|小商品批发价格指数|义乌市商务局|A|CN|consumer|wholesale|政府公开信息|月度|https://www.ywindex.com/
huaqiangbei|电子元器件批发报价|深圳华强北渠道|E|CN|consumer,industrial|wholesale|渠道询价|周度|
cmtm_index|工程机械市场报价|中国工程机械商贸网|D|CN|industrial|wholesale|商业订阅|月度|
jd_self|自营挂牌价|京东|E|CN|consumer,food,health|retail|平台公开页面|实时|https://www.jd.com/
tmall_flag|旗舰店挂牌价|天猫|E|CN|consumer,food|retail|平台公开页面|实时|https://www.tmall.com/
sams_club|会员店门店价|山姆/开市客|E|CN|food,consumer|retail|门店公开|周度|
pharmacy_chain|连锁药店零售价|老百姓/益丰等|E|CN|health|retail|门店公开|周度|
dealer_quote|经销商终端报价|授权经销商|E|CN|industrial|retail|渠道询价|月度|
numbeo_cn|城市生活成本众包|Numbeo|F|CN|food,consumer|retail|众包提交|月度|https://www.numbeo.com/
wb_icp|国际比较项目价格水平|世界银行|C|INTL|food,consumer,material|retail|公开报告|年度|https://www.worldbank.org/en/programs/icp
fao_giews|食品价格监测|联合国粮农组织|C|INTL|food,agri|wholesale|公开数据|月度|https://www.fao.org/giews/
eurostat|消费者价格与能源价格|欧盟统计局|C|INTL|food,energy,consumer|retail|公开数据|月度|https://ec.europa.eu/eurostat
oecd_prices|价格与购买力平价|OECD|C|INTL|food,energy,material|retail|公开数据|季度|https://data.oecd.org/
eia|能源价格与展望|美国能源信息署|C|INTL|energy|wholesale|公开数据|周度|https://www.eia.gov/
lme|金属期货官方价|伦敦金属交易所|B|INTL|metal|wholesale|交易所公开行情|日度|https://www.lme.com/
cme|农产品期货结算价|芝加哥商品交易所|B|INTL|agri,food|wholesale|交易所公开行情|日度|https://www.cmegroup.com/
ice|糖/咖啡/棉花期货|洲际交易所|B|INTL|agri,food|wholesale|交易所公开行情|日度|https://www.ice.com/
national_stat|各国国家统计局 CPI|各国统计机构|A|INTL|food,consumer,health,energy|retail|政府公开信息|月度|
who_msh|国际药品参考价格|WHO / MSH|C|INTL|health|wholesale|公开报告|年度|https://www.who.int/
alibaba_intl|Alibaba.com 批发报价|阿里巴巴国际站|E|INTL|consumer,industrial,material|wholesale|平台公开页面|实时|https://www.alibaba.com/
made_in_china|Made-in-China 批发报价|焦点科技|E|INTL|consumer,industrial,material|wholesale|平台公开页面|实时|https://www.made-in-china.com/
amazon_retail|零售挂牌价|Amazon|E|INTL|consumer,food|retail|平台公开页面|实时|https://www.amazon.com/
local_chain|当地连锁商超价|Carrefour/Tesco 等|E|INTL|food,consumer|retail|门店公开|周度|
numbeo_intl|城市生活成本众包|Numbeo|F|INTL|food,consumer,health|retail|众包提交|月度|https://www.numbeo.com/
fastmarkets|大宗商品价格评估|Fastmarkets|D|INTL|metal,agri,energy|wholesale|商业订阅|日度|
xianyu_used|二手成交价|闲鱼|F|CN|consumer,industrial|retail|用户内容|实时|
bbs_price|社群比价帖|贴吧/小红书|F|CN|food,consumer|retail|用户内容|不定期|
ebay_used|二手成交价|eBay|F|INTL|consumer,industrial|retail|平台公开页面|实时|
`;

export const SOURCES = [];
export const SOURCE_MAP = new Map();

for (const line of RAW.trim().split('\n').map((l) => l.trim()).filter(Boolean)) {
  const [id, name, org, tier, scope, domains, basis, license, freq, url] = line.split('|');
  const src = {
    id, name, org, tier, scope, basis,
    basisLabel: BASIS[basis]?.label ?? basis,
    domains: domains.split(','),
    license, freq,
    url: url || null,
    weight: TIERS[tier].weight,
    tierLabel: TIERS[tier].label,
    // Systematic offset of each source against the reference level, within one basis.
    bias: { A: 1.0, B: 1.004, C: 1.01, D: 0.994, E: 1.03, F: 0.97 }[tier],
    sigma: { A: 0.010, B: 0.014, C: 0.022, D: 0.028, E: 0.040, F: 0.065 }[tier],
  };
  SOURCES.push(src);
  SOURCE_MAP.set(src.id, src);
}

export const DOMAIN_SOURCES = {};
for (const src of SOURCES) {
  for (const d of src.domains) {
    DOMAIN_SOURCES[d] ||= { CN: [], INTL: [] };
    if (src.scope === 'CN' || src.scope === 'BOTH') DOMAIN_SOURCES[d].CN.push(src.id);
    if (src.scope === 'INTL' || src.scope === 'BOTH') DOMAIN_SOURCES[d].INTL.push(src.id);
  }
}

export const SOURCE_STATS = {
  total: SOURCES.length,
  byTier: TIER_ORDER.reduce((acc, t) => {
    acc[t] = SOURCES.filter((s) => s.tier === t).length;
    return acc;
  }, {}),
  byBasis: {
    wholesale: SOURCES.filter((s) => s.basis === 'wholesale').length,
    retail: SOURCES.filter((s) => s.basis === 'retail').length,
  },
  cn: SOURCES.filter((s) => s.scope === 'CN').length,
  intl: SOURCES.filter((s) => s.scope === 'INTL').length,
};
