/* 省份地图 + 城市点 + 地标/高校标注的布局，海报和视频共用 */
const { provinceSvg } = require('./geo');

// 简单斥力迭代，避免标签互相重叠
function layoutCallouts(items, geo, spread = 1) {
  const cx = geo.width / 2;
  const cy = geo.height / 2;
  const nodes = items.map((it, i) => {
    const dx = it.x - cx;
    const dy = it.y - cy;
    const same = items.filter((o) => o.city === it.city).indexOf(it);
    const ang = Math.atan2(dy, dx) + (same % 2 ? 1 : -1) * 0.5 * same;
    const charW = 31 * spread;
    return { ...it, bx: it.x + Math.cos(ang) * 170 * spread, by: it.y + Math.sin(ang) * 140 * spread, w: 70 * spread + [...it.name].length * charW, h: 66 * spread, i };
  });
  for (let k = 0; k < 400; k += 1) {
    for (const a of nodes) {
      for (const b of nodes) {
        if (a === b) continue;
        const ox = (a.w + b.w) / 2 + 12 - Math.abs(a.bx - b.bx);
        const oy = (a.h + b.h) / 2 + 12 - Math.abs(a.by - b.by);
        if (ox > 0 && oy > 0) {
          if (ox < oy * 1.5) a.bx += (a.bx < b.bx ? -1 : 1) * ox * 0.25;
          else a.by += (a.by < b.by ? -1 : 1) * oy * 0.25;
        }
      }
      a.bx = Math.max(a.w / 2 - 50, Math.min(geo.width + 50 - a.w / 2, a.bx));
      a.by = Math.max(-40, Math.min(geo.height + 40, a.by));
    }
  }
  return nodes;
}

function buildMap(province, meta, size = 960, pad = 40, spread = 1) {
  const geo = provinceSvg(province, size, size, pad);
  const byName = (n) => geo.cities.find((c) => c.name === n || c.name.startsWith(n));
  const cityDots = (meta.highlightCities || []).map(byName).filter(Boolean)
    .map((c) => ({ name: c.name, x: c.center[0], y: c.center[1], capital: c.name === meta.capital }));
  const items = [
    ...(meta.landmarks || []).map((l) => ({ ...l, kind: 'land' })),
    ...(meta.universities || []).map((u) => ({ ...u, kind: 'univ', icon: 'cap' })),
  ].map((it) => {
    const c = byName(it.city) || geo.cities[0];
    return { name: it.name, kind: it.kind, icon: it.icon, city: it.city, x: c.center[0], y: c.center[1] };
  });
  return { width: geo.width, height: geo.height, cities: geo.cities.map((c) => ({ d: c.d })), cityDots, callouts: layoutCallouts(items, geo, spread) };
}

const ICON = {
  gate: '<path d="M6 42h36M10 42V22h28v20M4 22h40L38 14H10zM14 14l2-6h16l2 6M20 42v-9a4 4 0 0 1 8 0v9"/>',
  pavilion: '<path d="M4 18 24 6l20 12M10 18h28M8 24h32M12 24v18M36 24v18M20 30h8v12h-8zM6 42h36"/>',
  bridge: '<path d="M2 30h44M4 30c4-14 36-14 40 0M14 30a10 8 0 0 1 20 0M8 30v8M40 30v8M2 38h44"/>',
  lotus: '<path d="M24 38c-6-6-6-18 0-26 6 8 6 20 0 26zM24 38c-10-2-16-10-16-18 8 0 14 6 16 18zM24 38c10-2 16-10 16-18-8 0-14 6-16 18zM8 42h32"/>',
  mountain: '<path d="M2 40 16 16l8 12 6-8 16 20zM16 16l-3 6 3-1 3 2"/>',
  pagoda: '<path d="M24 4v4M14 12l10-4 10 4zM16 12v6h16v-6M12 22l12-4 12 4zM16 22v6h16v-6M10 32l14-4 14 4zM16 32v8h16v-8M8 42h32"/>',
  wave: '<path d="M2 26c6-6 10-6 14 0s10 6 14 0 10-6 16 0M2 36c6-6 10-6 14 0s10 6 14 0 10-6 16 0M30 16c0-6 6-10 12-8"/>',
  temple: '<path d="M4 16 24 6l20 10zM8 16v4h32v-4M12 20v18M20 20v18M28 20v18M36 20v18M6 38h36v4H6z"/>',
  grotto: '<path d="M6 42V22a18 18 0 0 1 36 0v20zM24 14a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM16 40c0-10 3-16 8-16s8 6 8 16M4 42h40"/>',
  ding: '<path d="M10 14h28v14a14 12 0 0 1-28 0zM8 14h32M14 14V8h4v6M30 14V8h4v6M16 38l-2 6M32 38l2 6M24 40v4M17 22h14"/>',
  cap: '<path d="M24 10 4 18l20 8 16-6v10M12 22v8c0 3 5 6 12 6s12-3 12-6v-8"/>',
};
const iconSvg = (k, cls = 'ico') => `<svg viewBox="0 0 48 48" class="${cls}">${ICON[k] || ICON.temple}</svg>`;

module.exports = { buildMap, ICON, iconSvg };
