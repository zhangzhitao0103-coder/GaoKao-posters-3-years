/* 把 DataV GeoJSON（省 -> 地级市）投影成 SVG path，供海报水印和视频片头使用 */
const fs = require('fs');
const path = require('path');

const ADCODE = {
  北京: 110000, 天津: 120000, 河北: 130000, 山西: 140000, 内蒙古: 150000, 辽宁: 210000, 吉林: 220000, 黑龙江: 230000,
  上海: 310000, 江苏: 320000, 浙江: 330000, 安徽: 340000, 福建: 350000, 江西: 360000, 山东: 370000, 河南: 410000,
  湖北: 420000, 湖南: 430000, 广东: 440000, 广西: 450000, 海南: 460000, 重庆: 500000, 四川: 510000, 贵州: 520000,
  云南: 530000, 西藏: 540000, 陕西: 610000, 甘肃: 620000, 青海: 630000, 宁夏: 640000, 新疆: 650000,
};

function loadGeo(province) {
  const file = path.join(__dirname, '..', '..', 'assets', 'geo', `${ADCODE[province]}_full.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * @returns {{width,height,cities:[{name,d,cx,cy,area}],project:(lng,lat)=>[x,y]}}
 */
function provinceSvg(province, width = 1000, height = 1000, pad = 40, opts = {}) {
  const geo = loadGeo(province);
  const feats = geo.features.filter((f) => f.geometry && f.properties.name);
  const polys = (f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates);
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  const lat0 = feats.reduce((s, f) => s + (f.properties.center ? f.properties.center[1] : 0), 0) / feats.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const minArea = opts.minRingRatio ?? 0.0004;
  // 去掉面积极小的海岛碎片（海南南海诸岛除外由调用方处理）
  for (const f of feats) for (const poly of polys(f)) for (const [lng, lat] of poly[0]) {
    minX = Math.min(minX, lng * k); maxX = Math.max(maxX, lng * k); minY = Math.min(minY, -lat); maxY = Math.max(maxY, -lat);
  }
  const s = Math.min((width - pad * 2) / (maxX - minX), (height - pad * 2) / (maxY - minY));
  const ox = (width - (maxX - minX) * s) / 2;
  const oy = (height - (maxY - minY) * s) / 2;
  const project = (lng, lat) => [ox + (lng * k - minX) * s, oy + (-lat - minY) * s];
  const ringArea = (r) => Math.abs(r.reduce((a, [x1, y1], i) => { const [x2, y2] = r[(i + 1) % r.length]; return a + x1 * y2 - x2 * y1; }, 0) / 2);
  const total = (maxX - minX) * s * (maxY - minY) * s;

  const cities = feats.map((f) => {
    let d = '';
    let area = 0;
    for (const poly of polys(f)) {
      const ring = poly[0].map(([lng, lat]) => project(lng, lat));
      const a = ringArea(ring);
      if (a < total * minArea) continue;
      area += a;
      d += `M${ring.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}Z`;
    }
    const [cx, cy] = project(...(f.properties.centroid || f.properties.center));
    return { name: f.properties.name, d, cx, cy, area, center: project(...f.properties.center) };
  }).filter((c) => c.d);
  return { width, height, cities, project };
}

module.exports = { provinceSvg, ADCODE };
