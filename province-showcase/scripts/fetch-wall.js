#!/usr/bin/env node
/*
 * 下载某省的喜报原图到 cache/wall/<省>/（海报“真实喜报”图带和视频喜报墙用）
 * 用法：node scripts/fetch-wall.js 河北 [河南 ...] | --all
 * 顺序：状元 → 清北 → 其他名校 → 总分高分 → 单科 → 高考提分 → 日常提分，最多 24 张
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let provinces = process.argv.slice(2);
if (provinces.includes('--all')) provinces = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'summary.json'))).map((s) => s.province);

for (const p of provinces) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'provinces', `${p}.json`), 'utf8'));
  const g = d.gaokao;
  const pick = [
    ...g.champion.slice(0, 3),
    ...g.school.filter((x) => x.tier === 0).slice(0, 6),
    ...g.school.filter((x) => x.tier !== 0).slice(0, 2),
    ...g.total.slice(0, 5),
    ...g.single.filter((x) => x.name).slice(0, 4),
    ...g.improve.slice(0, 2),
    ...d.daily.slice(0, 2),
  ].filter((x) => x.image).slice(0, 24);
  const dir = path.join(ROOT, 'cache', 'wall', p);
  fs.mkdirSync(dir, { recursive: true });
  let ok = 0;
  pick.forEach((x, i) => {
    const file = path.join(dir, `${i}${path.extname(new URL(x.image).pathname) || '.webp'}`);
    if (fs.existsSync(file) && fs.statSync(file).size > 1000) { ok += 1; return; }
    try {
      execFileSync('curl', ['-sS', '-m', '40', '-o', file, x.image]);
      if (fs.statSync(file).size > 1000) ok += 1; else fs.unlinkSync(file);
    } catch { /* 单张失败不影响其余 */ }
  });
  console.log(`${p}: ${ok}/${pick.length}`);
}
