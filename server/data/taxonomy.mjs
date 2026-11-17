// Product taxonomy: 8 domains / 51 categories / 226 subcategories.
// Reference prices are retail-basis CNY, 2026 levels.
// wholesale = retail reference / (1 + markup)
// DSL: domain|category|elasticity|markup|subcategory:unit:retail price;...
// Elasticity = sensitivity of the category to local price levels
//   (0 = nationally uniform, 1 = moves fully with local prices)

const RAW = `
食品饮料|粮食|0.55|0.3|籼米:kg:5.6;粳米:kg:6.2;特一粉:kg:4.4;玉米面:kg:3.6;小米:kg:9.5
食品饮料|食用油|0.45|0.35|菜籽油(四级):L:13.8;大豆油(一级):L:10.2;花生油(压榨):L:26.5;玉米油(一级):L:12.4;橄榄油(特级初榨):L:78
食品饮料|肉禽蛋|0.50|0.28|白条猪:kg:22.4;猪五花肉:kg:29.6;黄牛肉:kg:76.5;羊肉:kg:69.8;白条鸡:kg:18.2;鸡蛋:kg:9.4;鸭肉:kg:20.5
食品饮料|水产|0.45|0.35|草鱼:kg:16.2;鲫鱼:kg:20.4;鲤鱼:kg:13.8;基围虾:kg:72;带鱼(冷冻):kg:36;三文鱼(冰鲜):kg:118
食品饮料|蔬菜|0.70|0.55|土豆:kg:2.8;大白菜:kg:2.4;西红柿:kg:5.6;黄瓜:kg:5.0;青椒:kg:6.2;生姜:kg:9.5;大蒜:kg:9.0
食品饮料|水果|0.65|0.45|红富士苹果:kg:7.5;香蕉:kg:5.2;柑橘:kg:5.8;西瓜:kg:4.2;巨峰葡萄:kg:12.0
食品饮料|乳品|0.50|0.32|常温纯牛奶:L:12.5;巴氏鲜奶:L:16.8;酸奶:kg:18.0;婴幼儿配方奶粉:kg:268;切达奶酪:kg:88
食品饮料|调味品|0.45|0.38|生抽酱油:L:12.0;陈醋:L:9.0;加碘食盐:kg:3.2;白砂糖:kg:7.2;味精:kg:13.5;豆瓣酱:kg:16
食品饮料|酒水|0.75|0.45|53度酱香白酒(500ml):瓶:2680;56度二锅头(500ml):瓶:18;淡色啤酒(500ml):瓶:4.5;干红葡萄酒(750ml):瓶:68;黄酒(500ml):瓶:15
食品饮料|饮料|0.50|0.4|瓶装饮用水(550ml):瓶:2.0;碳酸饮料(500ml):瓶:3.3;NFC果汁:L:9.5;绿茶(散装):kg:180;咖啡豆(中焙):kg:96
食品饮料|加工食品|0.40|0.3|袋装方便面:袋:4.5;挂面:kg:7.0;切片面包:kg:18;速冻水饺:kg:22;火腿肠:kg:16
食品饮料|糖蜜干果|0.50|0.35|蜂蜜:kg:42;灰枣:kg:26;带壳核桃:kg:32;葵花籽:kg:18

农产品原料|油料作物|0.40|0.3|国产大豆:kg:5.2;油菜籽:kg:6.4;花生仁:kg:9.8;棉籽:kg:3.2
农产品原料|经济作物|0.35|0.35|棉花(3128B):kg:16.8;甘蔗:kg:0.55;甜菜:kg:0.5;烤烟叶:kg:28
农产品原料|林木竹材|0.40|0.35|松原木:m3:1250;锯材(板材):m3:2100;胶合板(18mm):张:180;漂白针叶浆:t:5200
农产品原料|畜禽活体|0.40|0.25|生猪(外三元):kg:17.2;活牛:kg:30;活羊:kg:34;白羽肉鸡:kg:9.6
农产品原料|饲料饲草|0.35|0.2|豆粕(43%):kg:3.6;麦麸:kg:2.1;育肥猪配合料:kg:3.4;苜蓿干草:kg:2.6

能源|成品油|0.12|0.1|92号汽油:L:7.85;95号汽油:L:8.42;0号柴油:L:7.52;航空煤油:t:6200;180CST燃料油:t:4800
能源|燃气|0.35|0.15|管道天然气:m3:2.85;液化天然气(LNG):kg:4.6;瓶装液化气(15kg):瓶:118;工业液化石油气:kg:5.2
能源|电力|0.15|1.2|居民生活用电:kWh:0.538;一般工商业用电:kWh:0.72;大工业用电:kWh:0.58
能源|煤炭焦炭|0.25|0.18|动力煤(5500大卡):t:780;主焦煤:t:1650;无烟煤:t:1200;冶金焦:t:1950
能源|新能源装备|0.30|0.08|单晶光伏组件(550W):W:0.78;磷酸铁锂储能电芯:Wh:0.42;陆上风机(2MW):kW:3200

金属矿产|贵金属|0.06|0.03|黄金(Au99.99):g:782;白银(Ag99.99):g:8.9;铂金(Pt99.95):g:268;钯金(Pd99.95):g:245
金属矿产|黑色金属|0.18|0.06|螺纹钢(HRB400 20mm):t:3680;热轧卷板(3.0mm):t:3560;冷轧板(1.0mm):t:4180;中厚板(20mm):t:3720;铁矿石(61.5%粉):t:790
金属矿产|有色金属|0.12|0.07|电解铜(1#):t:78500;铝锭(A00):t:20300;锌锭(0#):t:23800;铅锭(1#):t:17200;电解镍:t:128000;锡锭(1#):t:218000
金属矿产|稀有金属|0.10|0.05|碳酸锂(电池级):t:74500;电解钴:t:215000;氧化镨钕:t:425000;钨精矿(65%):t:125000;钼精矿(45%):t:144000
金属矿产|非金属矿|0.30|0.2|石灰石:t:85;精制石英砂:t:320;鳞片石墨:t:4200;萤石(97%):t:2850;膨润土:t:680

建材与工程物资|水泥混凝土|0.45|0.12|P.O42.5水泥:t:420;C30预拌混凝土:m3:465;C25预拌混凝土:m3:438;水泥熟料:t:350
建材与工程物资|砂石骨料|0.55|0.15|碎石(5-25mm):t:78;天然中砂:t:105;机制砂:t:88;石粉:t:45
建材与工程物资|钢材制品|0.20|0.1|钢筋(HRB400 12mm):t:3820;高线(HPB300 8mm):t:3760;H型钢:t:3980;直缝焊管:t:4050;热镀锌管:t:4850
建材与工程物资|沥青路面|0.30|0.08|70号道路沥青:t:4250;SBS改性沥青:t:4900;乳化沥青:t:3200
建材与工程物资|管材线缆|0.35|0.25|PPR给水管(DN25):m:6.8;PE双壁波纹管(DN300):m:78;铜芯电缆(YJV4×25):m:92;PVC排水管(DN110):m:14.5
建材与工程物资|墙材装饰|0.40|0.3|蒸压加气砌块(B06):m3:245;烧结页岩砖:块:0.52;纸面石膏板(9.5mm):张:22;抛釉瓷砖(800×800):片:58;内墙乳胶漆:kg:18

医药健康|中药材|0.55|0.4|板蓝根(统货):kg:32;黄芪(统货):kg:58;当归(全归):kg:96;三七(60头):kg:168;金银花(统货):kg:210
医药健康|化学药(集采)|0.08|0.35|阿莫西林胶囊(0.25g):粒:0.35;布洛芬缓释胶囊(0.3g):粒:0.62;二甲双胍片(0.5g):片:0.12;阿托伐他汀钙片(20mg):片:0.85
医药健康|中成药OTC|0.15|0.45|连花清瘟胶囊:粒:1.15;感冒灵颗粒:袋:0.75;藿香正气水:支:1.2;六味地黄丸(浓缩):丸:0.06
医药健康|医疗器械|0.20|0.3|一次性医用口罩:只:0.35;医用外科手套:副:1.2;电子血压计:台:168;血糖试纸:条:1.6
医药健康|营养保健|0.25|0.5|乳清蛋白粉:kg:168;深海鱼油软胶囊:粒:0.65;碳酸钙D3片:片:0.32

日用消费品|家用电器|0.30|0.25|变频空调(1.5匹):台:2680;三门冰箱(300L):台:3280;滚筒洗衣机(10kg):台:2890;4K电视(65英寸):台:3180;微波炉(23L):台:468
日用消费品|数码产品|0.28|0.2|旗舰智能手机(256G):台:5999;轻薄笔记本(i5/16G):台:4899;平板电脑(11英寸):台:2680;真无线蓝牙耳机:副:468;移动电源(20000mAh):个:128
日用消费品|服装鞋帽|0.42|0.55|男装棉T恤:件:89;牛仔裤:条:199;羽绒服(90绒):件:699;运动跑鞋:双:469;棉袜:双:12
日用消费品|美妆个护|0.45|0.5|洗发水(400ml):瓶:42;牙膏(120g):支:18;保湿面霜(50g):瓶:168;口红:支:189;卷纸(140g):卷:3.2
日用消费品|家居日用|0.40|0.35|洗衣液(3kg):桶:42;洗洁精(1.5kg):瓶:12;LED球泡灯(9W):只:9.8;不锈钢汤锅(30cm):口:168;保温杯(500ml):个:128
日用消费品|文教玩具|0.40|0.4|A4复印纸(500张):包:22;中性笔(0.5mm):支:1.8;胶装笔记本(A5):本:6.5;儿童积木(500粒):盒:128
日用消费品|母婴用品|0.35|0.35|纸尿裤(L码):片:1.55;婴儿湿巾:张:0.35;宽口径奶瓶(240ml):个:88
日用消费品|宠物用品|0.40|0.4|成犬粮:kg:26;膨润土猫砂:kg:12;成猫粮:kg:38

工业设备与运输|汽车整车|0.20|0.08|紧凑型轿车(1.5T):辆:118000;纯电SUV(500km):辆:189000;轻型载货汽车(4.2m):辆:96000
工业设备与运输|工程机械|0.22|0.06|履带挖掘机(20t):台:680000;轮式装载机(5t):台:328000;塔式起重机(QTZ63):台:420000
工业设备与运输|农业机械|0.22|0.06|轮式拖拉机(100马力):台:138000;谷物联合收割机:台:268000;植保无人机(20L):台:42000
工业设备与运输|电子元件|0.15|0.35|MLCC电容(0402):只:0.002;18650锂电芯:只:8.5;四层PCB板:片:12;MCU(STM32F103):只:12.8
工业设备与运输|工业耗材|0.25|0.3|碳钢焊条(J422):kg:7.8;树脂砂轮片(100mm):片:6.5;抗磨液压油(46#):L:12.5;深沟球轴承(6205):个:12
`;

// Product variants, grouped by pricing family
const VARIANT_FAMILY = {
  measure: { units: ['kg', 'g', 'L', 'm3', 't', 'm', 'kWh', 'W', 'Wh', 'kW'], labels: ['散装/出厂', '标准包装', '品牌包装'], mult: [1.0, 1.12, 1.34] },
  retail: { units: ['瓶', '袋', '包', '支', '片', '块', '张', '只', '粒', '丸', '副', '条', '卷'], labels: ['基础款', '品牌款', '高端款'], mult: [1.0, 1.22, 1.78] },
  durable: { units: ['台', '件', '双', '个', '口', '盒', '桶', '辆', '套'], labels: ['国产中端', '国产品牌', '进口/高端'], mult: [1.0, 1.18, 1.62] },
};

function familyOf(unit) {
  for (const [k, v] of Object.entries(VARIANT_FAMILY)) if (v.units.includes(unit)) return k;
  return 'retail';
}

export const DOMAINS = [];
export const CATEGORIES = [];
export const SUBSPECIES = [];
export const PRODUCTS = [];
export const PRODUCT_MAP = new Map();
export const SUBCAT_MAP = new Map();

// Domain order maps onto the source-coverage keys.
const DOMAIN_KEYS = ['food', 'agri', 'energy', 'metal', 'material', 'health', 'consumer', 'industrial'];

let di = -1, ci = -1;
for (const line of RAW.trim().split('\n').map((l) => l.trim()).filter(Boolean)) {
  const [domainName, catName, elast, markup, subsRaw] = line.split('|');
  if (DOMAINS.length === 0 || DOMAINS[DOMAINS.length - 1].name !== domainName) {
    DOMAINS.push({ id: `d${DOMAINS.length}`, key: DOMAIN_KEYS[DOMAINS.length], name: domainName, categories: [] });
    di = DOMAINS.length - 1;
    ci = -1;
  }
  const domain = DOMAINS[di];
  const catId = `d${di}c${domain.categories.length}`;
  const cat = { id: catId, name: catName, domainId: domain.id, domainKey: domain.key, domainName, elast: Number(elast), markup: Number(markup), subs: [] };
  domain.categories.push(cat);
  CATEGORIES.push(cat);
  ci = domain.categories.length - 1;

  const subs = subsRaw.split(';').map((s) => s.trim()).filter(Boolean);
  subs.forEach((tok, k) => {
    const [name, unit, base] = tok.split(':');
    const fam = familyOf(unit);
    const subId = `d${di}c${ci}s${k}`;
    const sub = {
      id: subId, name, unit, base: Number(base), family: fam,
      catId, catName, domainId: domain.id, domainKey: domain.key, domainName,
      elast: cat.elast, markup: cat.markup, products: [],
    };
    SUBSPECIES.push(sub);
    SUBCAT_MAP.set(subId, sub);
    cat.subs.push(sub);

    const f = VARIANT_FAMILY[fam];
    f.labels.forEach((label, vi) => {
      const p = {
        id: `${subId}v${vi}`,
        name: vi === 0 ? name : `${name}·${label}`,
        shortName: name,
        variant: label,
        unit,
        base: Number(base),
        mult: f.mult[vi],
        family: fam,
        subId, subName: name,
        catId, catName,
        domainId: domain.id, domainKey: domain.key, domainName,
        elast: cat.elast, markup: cat.markup,
        // Durables track local prices less closely and carry a thinner service margin.
        goodsBias: fam === 'durable' ? 0.75 : 1,
      };
      sub.products.push(p);
      PRODUCTS.push(p);
      PRODUCT_MAP.set(p.id, p);
    });
  });
}

export const STATS = {
  domains: DOMAINS.length,
  categories: CATEGORIES.length,
  subspecies: SUBSPECIES.length,
  products: PRODUCTS.length,
  units: new Set(SUBSPECIES.map((s) => s.unit)).size,
};
