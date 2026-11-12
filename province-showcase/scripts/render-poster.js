#!/usr/bin/env node
/*
 * 生成省份优秀学员荣耀榜长海报（v2）
 * 用法：node scripts/render-poster.js 河北 [江苏 ...] | --all
 * 输出：output/posters/<省>.html + <省>.jpg（宽 1242）
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { selectShowcase } = require('./lib/select');
const { buildMap, iconSvg } = require('./lib/mapdata');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'output', 'posters');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'province-meta.json'), 'utf8'));
const fileUrl = (p) => `file://${path.join(ROOT, p)}`;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FULL = { 语文: 150, 数学: 150, 英语: 150 };
const fullOf = (x) => (x.subject === '总分' || x.to > 150 ? 750 : (FULL[x.subject] || (x.to > 100 ? 150 : 100)));

const ICON = {
  crown: '<svg viewBox="0 0 48 48"><path d="M6 36 3 14l12 9 9-15 9 15 12-9-3 22z" fill="currentColor"/><rect x="6" y="38" width="36" height="5" rx="2" fill="currentColor"/></svg>',
  cap: '<svg viewBox="0 0 48 48"><path d="M24 8 2 18l22 10 18-8v12h4V18z" fill="currentColor"/><path d="M11 25v9c0 3 6 7 13 7s13-4 13-7v-9l-13 6z" fill="currentColor"/></svg>',
  star: '<svg viewBox="0 0 48 48"><path d="m24 4 6 13 14 2-10 10 2 14-12-7-12 7 2-14L4 19l14-2z" fill="currentColor"/></svg>',
  book: '<svg viewBox="0 0 48 48"><path d="M6 8h14c3 0 4 2 4 4v28c0-2-1-3-4-3H6zM42 8H28c-3 0-4 2-4 4v28c0-2 1-3 4-3h14z" fill="currentColor"/></svg>',
  rocket: '<svg viewBox="0 0 48 48"><path d="M8 40 20 28M30 6c8 0 12 4 12 12L26 34l-12-12z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><circle cx="31" cy="17" r="4" fill="#fff"/></svg>',
  chart: '<svg viewBox="0 0 48 48"><rect x="6" y="28" width="8" height="14" rx="2" fill="currentColor"/><rect x="20" y="18" width="8" height="24" rx="2" fill="currentColor"/><rect x="34" y="6" width="8" height="36" rx="2" fill="currentColor"/></svg>',
};

function statTiles(sc) {
  // 只展示 状元 / 清北录取 / 高考600+ 三项中有数据的，不用其他内容补位
  const s = sc.stats;
  return [[s.champion, '位', '状元喜报'], [s.qingbei, '人', '清北录取'], [s.high600, '人', '高考 600 分+']].filter(([n]) => n > 0);
}

let blockNo = 0;
const CLOUD = '<svg class="cloud" viewBox="0 0 150 64"><path d="M14 50c-12 0-12-16 2-16 0-15 20-18 26-6 5-16 31-16 34 2 13-7 28 3 21 16 10 0 13 12 0 12H22M48 50c0-10 13-11 14-3M88 50c0-9 12-10 13-2" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const lead = (num, unit, text) => `<div class="lead"><span class="lead-n">${num}<i>${unit}</i></span><span class="lead-t">${text}</span></div>`;
const block = (inner, dark) => `<section class="block ${dark ? 'dark' : ''}">${inner}</section>`;
function subHeader(icon, title, sub) {
  blockNo += 1;
  return `<div class="sub-h"><span class="sub-no">${String(blockNo).padStart(2, '0')}</span><span class="sub-ic">${ICON[icon]}</span><h3>${esc(title)}</h3>${sub ? `<span class="sub-meta">${sub}</span>` : ''}</div>`;
}
const more = (shown, total) => (total > shown ? '<div class="more">…… 更多学员未展示</div>' : '');

function heroMap(province, meta) {
  let m;
  try { m = buildMap(province, meta, 600, 24, 0.74); } catch { return ''; }
  const lines = m.callouts.map((c) => `<line x1="${c.x.toFixed(1)}" y1="${c.y.toFixed(1)}" x2="${c.bx.toFixed(1)}" y2="${c.by.toFixed(1)}"/>`).join('');
  const dots = m.cityDots.map((c) => `<div class="mdot ${c.capital ? 'cap' : ''}" style="left:${c.x}px;top:${c.y}px"><i></i><span>${esc(c.name.replace(/市$/, ''))}</span></div>`).join('');
  const tags = m.callouts.map((c) => `<div class="mtag ${c.kind}" style="left:${c.bx}px;top:${c.by}px">${iconSvg(c.icon)}<span>${esc(c.name)}</span></div>`).join('');
  return `<div class="hmap"><svg viewBox="0 0 ${m.width} ${m.height}">
    <defs><linearGradient id="mf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe7a8" stop-opacity=".55"/><stop offset="1" stop-color="#d4973a" stop-opacity=".22"/></linearGradient></defs>
    <g class="shadow" transform="translate(0 14)">${m.cities.map((c) => `<path d="${c.d}"/>`).join('')}</g>
    <g class="land">${m.cities.map((c) => `<path d="${c.d}"/>`).join('')}</g><g class="lines">${lines}</g></svg>${dots}${tags}</div>`;
}

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
  const topAdmit = [...qingbei.groups, ...otherSchool.groups].flatMap((g) => g.people.map((p) => ({ ...p, school: g.school }))).filter((p) => p.totalScore).sort((a, b) => a.tier - b.tier || b.totalScore - a.totalScore)[0];
  const head = subHeader('cap', '名校录取榜') + (topAdmit ? lead(topAdmit.totalScore, '分', `${esc(topAdmit.name || '学员')} · 圆梦${esc(topAdmit.school)}`) : '');
  const all = [...qingbei.groups, ...otherSchool.groups].flatMap((g) => g.people.map((p) => ({ ...p, school: g.school })));
  // 人数少：一人一张“录取通知书”
  if (all.length <= 8) {
    const tickets = all.map((p) => `
      <div class="ticket ${p.tier === 0 ? 'qb' : ''}">
        <div class="tk-stub"><span>录取</span></div>
        <div class="tk-main">
          <div class="tk-school">${esc(p.school)}</div>
          <div class="tk-name">${esc(p.name || '有道领世学员')}</div>
          <div class="tk-meta">${p.year}届${p.totalScore ? ` · 高考 <b>${p.totalScore}</b> 分` : ''}${p.highlights?.length ? ` · ${esc(p.highlights[0])}` : ''}</div>
        </div>
      </div>`).join('');
    return `<section class="block dark">${head}<div class="tickets">${tickets}</div>${more(qingbei.shown + otherSchool.shown, qingbei.total + otherSchool.total)}</section>`;
  }
  const chip = (x) => `<span class="chip">${esc(x.name || '学员')}${x.totalScore ? `<em>${x.totalScore}</em>` : ''}</span>`;
  const qbCols = qingbei.groups.map((g) => `
    <div class="qb-col"><div class="seal">${esc(g.school)}</div><div class="chips">${g.people.map(chip).join('')}</div></div>`).join('');
  const others = otherSchool.groups.map((g) => `
    <div class="os-row"><span class="os-school">${esc(g.school)}</span><span class="os-names">${g.people.map((x) => esc(x.name || '学员') + (x.totalScore ? `<em>${x.totalScore}</em>` : '')).join('<i>·</i>')}</span></div>`).join('');
  return `<section class="block dark">${head}
    ${qbCols ? `<div class="qb one">${qbCols}</div>` : ''}${more(qingbei.shown, qingbei.total)}
    ${others ? `<div class="os two">${others}</div>${more(otherSchool.shown, otherSchool.total)}` : ''}</section>`;
}

function totalBlock(sc) {
  const ppl = sc.total.people;
  if (!ppl.length) return '';
  const pod = [1, 0, 2].map((k) => (ppl[k] ? `
    <div class="pod pod-${k + 1}">
      <div class="pod-score">${ppl[k].totalScore}<i>分</i></div>
      <div class="pod-name">${esc(ppl[k].name || '学员')}</div>
      <div class="pod-hl">${ppl[k].year}届${ppl[k].highlights?.length ? ` · ${esc(ppl[k].highlights.slice(0, 2).join(' '))}` : ''}</div>
      <div class="pod-bar"><span>${k + 1}</span></div>
    </div>` : '')).join('');
  const rows = ppl.slice(3).map((x, i) => `
    <div class="rk"><span class="rk-no">${String(i + 4).padStart(2, '0')}</span><span class="rk-name">${esc(x.name || '学员')}</span>
      <span class="rk-hl">${x.highlights?.length ? esc(x.highlights[0]) : `${x.year}届`}</span><span class="rk-score">${x.totalScore}<i>分</i></span></div>`).join('');
  return `<section class="block">${subHeader('star', '总分高分榜')}
    <div class="podium">${pod}</div>${rows ? `<div class="rk-grid">${rows}</div>` : ''}${more(ppl.length, sc.total.total)}</section>`;
}

function singleBlock(sc) {
  if (!sc.single.subjects.length) return '';
  const cards = sc.single.subjects.map((s) => `
    <div class="subj">
      <div class="subj-h"><span class="subj-name">${s.subject}</span></div>
      ${s.people.map((x, i) => `<div class="subj-row ${i === 0 ? 'first' : ''}"><span>${x.name ? esc(x.name) : `<span class="anon">学员${x.totalScore ? `<small>总分${x.totalScore}</small>` : ''}</span>`}</span><b>${x.score}</b><small>/${FULL[s.subject] || 100}</small></div>`).join('')}
    </div>`).join('');
  const tops = sc.single.subjects.map((s) => ({ subject: s.subject, ...s.people[0], full: FULL[s.subject] || 100 }));
  const fulls = tops.filter((x) => x.score >= x.full);
  const best = [...tops].sort((a, b) => b.score / b.full - a.score / a.full)[0];
  const singleLead = fulls.length ? lead(fulls[0].full, '分', `${fulls.map((x) => x.subject).join('、')}满分`) : lead(best.score, '分', `${best.subject}最高分 · 满分${best.full}`);
  return `<section class="block dark">${subHeader('book', '单科高分榜')}${singleLead}<div class="subj-grid">${cards}</div>${more(sc.single.subjects.reduce((a, x) => a + x.people.length, 0), sc.single.total)}</section>`;
}

function improveBlock(sc) {
  const { top, bars, texts, total } = sc.improve;
  if (!top && !bars.length && !texts.length) return '';
  const feature = top ? `
    <div class="feat">
      <div class="feat-tag">高考提分之最</div>
      <div class="feat-body">
        <div class="feat-ft"><small>${esc(top.subject || '总分')}</small><span>${top.fromText || top.from}</span><i>→</i><b>${top.to}</b></div>
        <div class="feat-d"><em>↑</em>${top.delta}<i>分</i></div>
      </div>
    </div>` : '';
  const rows = bars.map((x) => {
    const max = fullOf(x);
    const a = (x.from / max) * 100;
    const b = (x.to / max) * 100;
    return `<div class="imp-row">
      <span class="imp-subj">${esc(x.subject || '总分')}</span>
      <div class="imp-track"><div class="imp-from" style="width:${a}%"></div><div class="imp-gain" style="left:${a}%;width:${b - a}%"></div>
        <span class="imp-lab ${b - a < 14 ? 'tight' : ''}" style="left:${a}%">${x.fromText || x.from}${x.approx ? '+' : ''}</span><span class="imp-lab to" style="left:${b}%">${x.to}</span></div>
      <span class="imp-delta">↑${x.delta}</span>
    </div>`;
  }).join('');
  const chips = texts.map((x) => `<span class="imp-chip">${x.subject ? `<b>${esc(x.subject)}</b>` : ''}${esc(x.text.replace(new RegExp(`^${x.subject || '#'}`), ''))}</span>`).join('');
  return `<section class="block">${subHeader('rocket', '高考提分榜')}${feature}<div class="imp">${rows}</div>${chips ? `<div class="imp-chips">${chips}</div>` : ''}${more((top ? 1 : 0) + bars.length + texts.length, total)}</section>`;
}

function dailyBlock(sc) {
  if (!sc.dailyGroups.length) return '';
  const who = (x) => (x.student ? esc(x.student) : '<span class="anon">学员</span>');
  const stars = sc.dailyTop.length >= 2 ? `<div class="stars">${sc.dailyTop.map((x, i) => `
    <div class="starc s${i + 1}">
      <div class="starc-rk">TOP ${i + 1}</div>
      <div class="starc-d"><em>↑</em>${x.delta}<i>分</i></div>
      <div class="starc-ft">${x.from} → <b>${x.to}</b></div>
      <div class="starc-t">${esc(x.subject)} · ${x.student ? esc(x.student) : `${esc(sc.province)}学员`}</div>
    </div>`).join('')}</div>` : '';
  const groups = sc.dailyGroups.map((g) => `
    <div class="dg">
      <div class="dg-h"><span class="dg-name">${[...g.name].join('<i>·</i>')}</span><span class="dg-subs">${g.subjects.join(' / ')}</span></div>
      ${g.named.length ? `<div class="dg-rows">${g.named.map((x) => `
        <div class="dg-row"><span class="dg-tag s-${x.subject}">${x.subject[0]}</span><span class="dg-name2">${esc(x.student)}</span><span class="dg-ft">${x.from}<i>→</i><b>${x.to}</b></span><span class="dg-d">↑${x.delta}</span></div>`).join('')}</div>` : ''}
      ${g.anon.length ? `<div class="caps">${g.anon.map((x) => `<span class="cap"><em class="s-${x.subject}">${x.subject[0]}</em>${x.from}→<b>${x.to}</b><i>↑${x.delta}</i></span>`).join('')}</div>` : ''}
    </div>`).join('');
  const shown = sc.dailyTop.length + sc.dailyGroups.reduce((a, g) => a + g.named.length + g.anon.length, 0);
  return `<section class="block dark">${subHeader('chart', '提分之星')}${stars}<div class="dgs">${groups}</div>${more(shown, sc.daily.total)}</section>`;
}

function wallStrip(province) {
  const dir = path.join(ROOT, 'cache', 'wall', province);
  if (!fs.existsSync(dir)) return '';
  const files = fs.readdirSync(dir).filter((f) => /\.(webp|jpg|png)$/.test(f)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  // 取状元、清北、高分、单科各类靠前的 6 张
  const pick = [0, 1, 3, 9, 11, 14].map((i) => files[i]).filter(Boolean);
  if (pick.length < 4) return '';
  return `<div class="wall"><div class="wall-h"><span>真实喜报</span><i>学员喜报原图 · 部分展示</i></div><div class="wall-imgs">${pick.map((f, i) => `<img src="file://${path.join(dir, f)}" style="transform:rotate(${[-2, 1.5, -1, 2, -1.5, 1][i]}deg)">`).join('')}</div></div>`;
}

function buildHtml(d, opts = {}) {
  blockNo = 0;
  const sc = selectShowcase(d);
  const meta = META[d.province] || { fullName: d.province, tagline: '' };
  const tiles = statTiles(sc).map(([n, u, l]) => `<div class="stat"><div class="stat-n">${n}<i>${u}</i></div><div class="stat-l">${l}</div></div>`).join('');
  const facts = sc.facts.map((f) => `<div class="fact"><div class="fact-l">${esc(f.label)}</div><div class="fact-v">${f.prefix || ''}${f.value}<i>${f.unit}</i></div></div>`).join('');
  const nameLen = [...d.province].length;
  const gaokaoBlocks = [championBlock(sc), schoolBlock(sc), totalBlock(sc), singleBlock(sc), improveBlock(sc)].join('');
  const daily = dailyBlock(sc);
  const map = heroMap(d.province, meta);
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
    <div class="topbar"><img src="${fileUrl('assets/logo-white.png')}" class="logo"><span class="years">${esc(d.province)} · 优秀学员喜报</span></div>
    <div class="hero-title">
      <div class="prov prov-${nameLen}">${esc(d.province)}</div>
      <div class="hero-main">优秀学员荣耀榜</div>
      <div class="ribbon"><span>${esc(meta.tagline)}</span></div>
    </div>
    ${map ? `<div class="hero-mid">${map}<div class="facts"><div class="facts-h">亮点速览</div>${facts}</div></div>` : ''}
    <div class="stats">${tiles}</div>
    ${opts.wall === false ? '' : wallStrip(d.province)}
    <div class="clouds">${CLOUD}${CLOUD}</div>
  </header>

  <div class="part"><div class="part-no">PART 01</div><h2>高考喜报</h2><div class="part-sub">高考 · ${sc.champion.length ? '状元 · ' : ''}名校 · 高分 · 单科 · 提分</div></div>
  <main class="part-body">${gaokaoBlocks}</main>

  ${daily ? `<div class="part"><div class="part-no">PART 02</div><h2>日常提分喜报</h2><div class="part-sub">语数英 · 物化生 · 史地政 · ${esc(d.province)}学员日常提分</div></div>
  <main class="part-body">${daily}</main>` : ''}

  <footer class="foot">
    <div class="foot-l">
      <div class="slogan">高效学习，从有道领世开始</div>
      <img src="${fileUrl('assets/logo-white.png')}" class="logo-foot">
      <div class="disclaimer">数据来源：有道领世学员喜报，学员信息已做脱敏处理</div>
    </div>
    <div class="qr"><div class="qr-box"><span>二维码</span></div><div class="qr-lab">扫码查看<br>视频介绍</div></div>
  </footer>
</div></body></html>`;
}

async function main() {
  const noWall = process.argv.includes('--no-wall');
  let provinces = process.argv.slice(2).filter((a) => a !== '--no-wall');
  if (provinces.includes('--all')) provinces = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'summary.json'))).map((s) => s.province);
  if (!provinces.length) provinces = ['河北'];
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1242, height: 2000 }, deviceScaleFactor: 1 });
  for (const p of provinces) {
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'provinces', `${p}.json`), 'utf8'));
    const tag = noWall ? '_无喜报图' : '';
    const htmlFile = path.join(OUT, `${p}${tag}.html`);
    fs.writeFileSync(htmlFile, buildHtml(d, { wall: !noWall }));
    await page.goto(`file://${htmlFile}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const h = await page.evaluate(() => document.querySelector('.poster').scrollHeight);
    await page.screenshot({ path: path.join(OUT, `${p}${tag}.jpg`), fullPage: true, type: 'jpeg', quality: 90 });
    console.log(`${p}: 1242x${h}${h > 10000 ? '  ⚠ 超过 10000px' : ''}`);
  }
  await browser.close();
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { buildHtml };
