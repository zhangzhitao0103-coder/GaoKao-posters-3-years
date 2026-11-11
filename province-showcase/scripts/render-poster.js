#!/usr/bin/env node
/*
 * 生成省份优秀学员荣耀榜长海报
 * 用法：node scripts/render-poster.js 河北 [江苏 ...] | --all
 * 输出：output/posters/<省>.html + <省>.jpg（宽 1242）
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { selectShowcase } = require('./lib/select');
const { provinceSvg } = require('./lib/geo');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'output', 'posters');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'province-meta.json'), 'utf8'));
const fileUrl = (p) => `file://${path.join(ROOT, p)}`;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FULL = { 语文: 150, 数学: 150, 英语: 150 };

const ICON = {
  crown: '<svg viewBox="0 0 48 48"><path d="M6 36 3 14l12 9 9-15 9 15 12-9-3 22z" fill="currentColor"/><rect x="6" y="38" width="36" height="5" rx="2" fill="currentColor"/></svg>',
  cap: '<svg viewBox="0 0 48 48"><path d="M24 8 2 18l22 10 18-8v12h4V18z" fill="currentColor"/><path d="M11 25v9c0 3 6 7 13 7s13-4 13-7v-9l-13 6z" fill="currentColor"/></svg>',
  star: '<svg viewBox="0 0 48 48"><path d="m24 4 6 13 14 2-10 10 2 14-12-7-12 7 2-14L4 19l14-2z" fill="currentColor"/></svg>',
  book: '<svg viewBox="0 0 48 48"><path d="M6 8h14c3 0 4 2 4 4v28c0-2-1-3-4-3H6zM42 8H28c-3 0-4 2-4 4v28c0-2 1-3 4-3h14z" fill="currentColor"/></svg>',
  rocket: '<svg viewBox="0 0 48 48"><path d="M8 40 20 28M30 6c8 0 12 4 12 12L26 34l-12-12z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><circle cx="31" cy="17" r="4" fill="#fff"/></svg>',
  chart: '<svg viewBox="0 0 48 48"><rect x="6" y="28" width="8" height="14" rx="2" fill="currentColor"/><rect x="20" y="18" width="8" height="24" rx="2" fill="currentColor"/><rect x="34" y="6" width="8" height="36" rx="2" fill="currentColor"/></svg>',
};

function statTiles(sc) {
  const s = sc.stats;
  const tiles = [];
  if (s.champion) tiles.push([s.champion, '位', '状元喜报']);
  tiles.push([s.qingbei, '人', '清北录取']);
  if (!s.champion) tiles.push([s.school, '人', '名校录取']);
  tiles.push([s.high600, '人', '高考 600 分+']);
  tiles.push([s.improve + s.daily, '例', '提分喜报']);
  return tiles.filter(([n]) => n > 0).slice(0, 4);
}

function subHeader(icon, title, sub) {
  return `<div class="sub-h"><span class="sub-ic">${ICON[icon]}</span><h3>${esc(title)}</h3>${sub ? `<span class="sub-meta">${sub}</span>` : ''}</div>`;
}
const more = (shown, total, unit = '位学员') => (total > shown ? `<div class="more">…… 等 <b>${total}</b> ${unit}</div>` : '');
const hl = (x) => (x.highlights?.length ? `<span class="hl">${x.highlights.map(esc).join(' · ')}</span>` : '');

function championBlock(sc) {
  if (!sc.champion.length) return '';
  const big = sc.champion.length === 1;
  const cards = sc.champion.map((c) => `
    <div class="champ ${big ? 'champ-big' : ''}">
      <div class="champ-year">${c.year}</div>
      <div class="champ-crown">${ICON.crown}</div>
      <div class="champ-title">${esc(c.title)}</div>
      <div class="champ-name">${esc(c.name)}</div>
      <div class="champ-row"><span class="champ-score">${esc(c.scoreText.replace('分', ''))}<i>${/\d/.test(c.scoreText) ? '分' : ''}</i></span><span class="champ-school">${esc(c.school)}</span></div>
      ${c.highlights?.length ? `<div class="champ-hl">${c.highlights.map((h) => `<span>${esc(h)}</span>`).join('')}</div>` : ''}
    </div>`).join('');
  return `<section class="block">${subHeader('crown', '状元榜', '高考荣耀巅峰')}<div class="champ-grid ${big ? 'one' : ''}">${cards}</div></section>`;
}

function schoolBlock(sc) {
  const { qingbei, otherSchool } = sc;
  if (!qingbei.total && !otherSchool.total) return '';
  const chip = (x) => `<span class="chip">${esc(x.name || '学员')}${x.totalScore ? `<em>${x.totalScore}</em>` : ''}</span>`;
  const qbCols = qingbei.groups.map((g) => `
    <div class="qb-col">
      <div class="seal">${esc(g.school)}<small>${g.total}人</small></div>
      <div class="chips">${g.people.map(chip).join('')}</div>
    </div>`).join('');
  const others = otherSchool.groups.map((g) => `
    <div class="os-row"><span class="os-school">${esc(g.school)}</span><span class="os-names">${g.people.map((x) => esc(x.name || '学员') + (x.totalScore ? `<em>${x.totalScore}</em>` : '')).join('<i>·</i>')}</span></div>`).join('');
  return `<section class="block">${subHeader('cap', '名校录取榜', `清北 <b>${sc.stats.qingbei}</b> 人 · 名校共 <b>${sc.stats.school}</b> 人${sc.champion.length ? '（含状元）' : ''}`)}
    ${qbCols ? `<div class="qb one">${qbCols}</div>` : ''}
    ${more(qingbei.shown, qingbei.total)}
    ${others ? `<div class="os">${others}</div>${more(otherSchool.shown, otherSchool.total)}` : ''}
  </section>`;
}

function totalBlock(sc) {
  if (!sc.total.people.length) return '';
  const tiles = sc.total.people.map((x, i) => `
    <div class="score-tile ${i < 3 ? 'top' : ''}">
      <div class="st-score">${x.totalScore}<i>分</i></div>
      <div class="st-name">${esc(x.name || '学员')}</div>
      <div class="st-year">${x.year}届${x.highlights?.length ? ' · ' + esc(x.highlights[0]) : ''}</div>
    </div>`).join('');
  return `<section class="block">${subHeader('star', '总分高分榜', `高分学员 <b>${sc.total.total}</b> 人`)}<div class="score-grid">${tiles}</div>${more(sc.total.people.length, sc.total.total)}</section>`;
}

function singleBlock(sc) {
  if (!sc.single.subjects.length) return '';
  const cards = sc.single.subjects.map((s) => `
    <div class="subj">
      <div class="subj-h"><span class="subj-name">${s.subject}</span><span class="subj-n">${s.count}人</span></div>
      ${s.people.map((x) => `<div class="subj-row"><span>${x.name ? esc(x.name) : `<span class="anon">学员${x.totalScore ? `<small>总分${x.totalScore}</small>` : ''}</span>`}</span><b>${x.score}</b><small>/${FULL[s.subject] || 100}</small></div>`).join('')}
    </div>`).join('');
  return `<section class="block">${subHeader('book', '单科高分榜', `单科高分 <b>${sc.single.total}</b> 人次`)}<div class="subj-grid">${cards}</div></section>`;
}

function improveBlock(sc) {
  const { bars, texts, total } = sc.improve;
  if (!bars.length && !texts.length) return '';
  const rows = bars.map((x) => {
    const max = x.subject === '总分' || x.to > 150 ? 750 : (FULL[x.subject] || (x.to > 100 ? 150 : 100));
    const a = (x.from / max) * 100;
    const b = (x.to / max) * 100;
    return `<div class="imp-row">
      <span class="imp-subj">${esc(x.subject || '总分')}</span>
      <div class="imp-track"><div class="imp-from" style="width:${a}%"></div><div class="imp-gain" style="left:${a}%;width:${b - a}%"></div>
        <span class="imp-lab" style="left:${a}%">${x.fromText || x.from}${x.approx ? '+' : ''}</span><span class="imp-lab to" style="left:${b}%">${x.to}</span></div>
      <span class="imp-delta">↑${x.delta}</span>
    </div>`;
  }).join('');
  const chips = texts.map((x) => `<span class="imp-chip">${x.subject ? `<b>${esc(x.subject)}</b>` : ''}${esc(x.text.replace(new RegExp(`^${x.subject || '#'}`), ''))}</span>`).join('');
  return `<section class="block">${subHeader('rocket', '高考提分榜', `高考提分 <b>${total}</b> 例`)}<div class="imp">${rows}</div>${chips ? `<div class="imp-chips">${chips}</div>` : ''}${more(bars.length + texts.length, total, '例')}</section>`;
}

function dailyBlock(sc) {
  if (!sc.daily.subjects.length) return '';
  const cards = sc.daily.subjects.map((s) => `
    <div class="dly">
      <div class="dly-h"><span class="dly-subj">${s.subject}</span><span class="dly-meta">${s.teachers}位老师 · ${s.count}例</span></div>
      ${s.cases.map((x) => `<div class="dly-row"><span class="dly-t">${esc(x.teacher)}<small>老师</small></span><span class="dly-ft">${x.from}<i>→</i><b>${x.to}</b></span><span class="dly-d">↑${x.delta}</span></div>`).join('')}
    </div>`).join('');
  return `<div class="dly-grid ${sc.daily.subjects.length % 2 ? 'odd' : ''}">${cards}</div>${more(sc.daily.subjects.reduce((a, s) => a + s.cases.length, 0), sc.daily.total, '例日常提分')}`;
}

function provinceOutline(province) {
  try {
    const g = provinceSvg(province, 640, 640, 10);
    return `<svg class="outline" viewBox="0 0 640 640">${g.cities.map((c) => `<path d="${c.d}"/>`).join('')}</svg>`;
  } catch {
    return '';
  }
}

function buildHtml(d) {
  const sc = selectShowcase(d);
  const meta = META[d.province] || { fullName: d.province, tagline: '' };
  const tiles = statTiles(sc).map(([n, u, l]) => `<div class="stat"><div class="stat-n">${n}<i>${u}</i></div><div class="stat-l">${l}</div></div>`).join('');
  const nameLen = [...d.province].length;
  const gaokaoBlocks = [championBlock(sc), schoolBlock(sc), totalBlock(sc), singleBlock(sc), improveBlock(sc)].join('');
  const daily = dailyBlock(sc);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<link rel="stylesheet" href="${fileUrl('node_modules/@fontsource/noto-sans-sc/400.css')}">
<link rel="stylesheet" href="${fileUrl('node_modules/@fontsource/noto-sans-sc/700.css')}">
<link rel="stylesheet" href="${fileUrl('node_modules/@fontsource/noto-sans-sc/900.css')}">
<link rel="stylesheet" href="${fileUrl('node_modules/@fontsource/noto-serif-sc/900.css')}">
<link rel="stylesheet" href="${fileUrl('node_modules/@fontsource/ma-shan-zheng/400.css')}">
<link rel="stylesheet" href="${fileUrl('node_modules/@fontsource/oswald/600.css')}">
<link rel="stylesheet" href="${fileUrl('templates/poster.css')}">
<title>${esc(d.province)}优秀学员荣耀榜</title></head>
<body><div class="poster">
  <header class="hero">
    <div class="hero-bg"></div>
    ${provinceOutline(d.province)}
    <div class="topbar"><img src="${fileUrl('assets/logo-white.png')}" class="logo"><span class="years">2024 – 2026 · 喜报合集</span></div>
    <div class="hero-title">
      <div class="prov prov-${nameLen}">${esc(d.province)}</div>
      <div class="hero-main">优秀学员荣耀榜</div>
      <div class="ribbon"><span>${esc(meta.tagline)}</span></div>
    </div>
    <div class="stats">${tiles}</div>
  </header>

  <div class="part"><div class="part-no">PART 01</div><h2>高考喜报</h2><div class="part-sub">近三年高考 · 状元 · 名校 · 高分 · 单科 · 提分</div></div>
  <main class="part-body">${gaokaoBlocks}</main>

  ${daily ? `<div class="part"><div class="part-no">PART 02</div><h2>日常提分喜报</h2><div class="part-sub"><b>${sc.daily.teachers}</b> 位主讲老师 · <b>${sc.daily.total}</b> 例${esc(d.province)}学员日常提分</div></div>
  <main class="part-body"><section class="block">${daily}</section></main>` : ''}

  <footer class="foot">
    <div class="foot-l">
      <div class="slogan">高效学习，从有道领世开始</div>
      <img src="${fileUrl('assets/logo-white.png')}" class="logo-foot">
      <div class="disclaimer">数据来源：有道领世学员喜报（2024–2026），学员信息已做脱敏处理</div>
    </div>
    <div class="qr"><div class="qr-box"><span>二维码</span></div><div class="qr-lab">扫码查看<br>视频介绍</div></div>
  </footer>
</div></body></html>`;
}

async function main() {
  let provinces = process.argv.slice(2);
  if (provinces.includes('--all')) provinces = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'summary.json'))).map((s) => s.province);
  if (!provinces.length) provinces = ['河北'];
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1242, height: 2000 }, deviceScaleFactor: 1 });
  for (const p of provinces) {
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'provinces', `${p}.json`), 'utf8'));
    const htmlFile = path.join(OUT, `${p}.html`);
    fs.writeFileSync(htmlFile, buildHtml(d));
    await page.goto(`file://${htmlFile}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const h = await page.evaluate(() => document.querySelector('.poster').scrollHeight);
    await page.screenshot({ path: path.join(OUT, `${p}.jpg`), fullPage: true, type: 'jpeg', quality: 90 });
    console.log(`${p}: 1242x${h}${h > 10000 ? '  ⚠ 超过 10000px' : ''}`);
  }
  await browser.close();
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { buildHtml };
