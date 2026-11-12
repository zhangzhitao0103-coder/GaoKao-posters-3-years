#!/usr/bin/env node
/*
 * 生成省份荣耀榜竖版视频（1080x1920, 30fps）
 * 用法：node scripts/render-video.js 河北 [--preview]   （--preview 只渲染关键帧截图，不出视频）
 * 流程：选数据 → 生成舞台 HTML → 逐帧截图推流给 ffmpeg → 合成配乐 → 叠加学员原声片段 → output/videos/<省>.mp4
 */
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { chromium } = require('playwright');
const { selectShowcase } = require('./lib/select');
const { buildMap, ICON } = require('./lib/mapdata');

const ROOT = path.resolve(__dirname, '..');
const FPS = 30;
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'province-meta.json'), 'utf8'));
const CLIPS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'clips.json'), 'utf8'));
const fileUrl = (p) => `file://${path.join(ROOT, p)}`;

function buildData(province) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'provinces', `${province}.json`), 'utf8'));
  const meta = META[province] || { tagline: '', highlightCities: [], landmarks: [], universities: [] };
  const sc = selectShowcase(d, { qingbei: 36, otherSchool: 5, total: 12, improve: 5, dailyPerSubject: 3 });
  const geo = buildMap(province, meta, 960, 40, 1);

  const s = d.stats;
  // 只展示 状元 / 清北录取 / 高考600+ 三项中有数据的，不用其他内容补位
  const stats = [[s.champion, '位', '状元喜报'], [s.qingbei, '人', '清北录取'], [s.high600, '人', '高考 600 分+']];

  // 学员原声：每个时段（slot）可以是一段，也可以是 2–3 段快剪
  const cut = (c) => {
    const v = d.videos.find((x) => x.id === c.id) || {};
    const file = path.join(ROOT, 'cache', 'clips', `${c.id}.mp4`);
    const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]).toString().trim().split(',').map(Number);
    const rect = h > w ? { x: 170, y: 400, w: 740, h: 1316 } : { x: 50, y: 720, w: 980, h: 552 };
    return { id: c.id, file, ss: c.ss, dur: c.dur, rect, label: c.label, quote: c.quote, name: v.name, score: v.score, school: v.school };
  };
  const clips = (CLIPS[province] || []).slice(0, 2).map((slot) => (Array.isArray(slot) ? slot : [slot]).map(cut));

  // 真实喜报墙：cache/wall/<省>/ 下的喜报原图
  const wallDir = path.join(ROOT, 'cache', 'wall', province);
  const wall = fs.existsSync(wallDir)
    ? fs.readdirSync(wallDir).filter((f) => /\.(webp|jpg|png)$/.test(f)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).map((f) => `file://${path.join(wallDir, f)}`)
    : [];

  // 开头钩子：选该省最强的一个数字
  const maxTotal = Math.max(0, ...[...d.gaokao.champion, ...d.gaokao.school, ...d.gaokao.total].map((x) => x.totalScore || 0));
  let hook;
  if (s.qingbei >= 5) hook = { value: s.qingbei, unit: '人', text: '考入清华北大' };
  else if (s.champion) hook = { value: s.champion, unit: '位', text: '高考状元' };
  else if (maxTotal) hook = { value: maxTotal, unit: '分', text: '高考最高分' };
  else hook = { value: s.improve + s.daily, unit: '例', text: '提分喜报' };

  return {
    province, meta, sc, stats: stats.filter(([n]) => n > 0).slice(0, 4), stats_raw: s, geo, icons: ICON, clips, wall, hook,
    logoWhite: fileUrl('assets/logo-white.png'),
  };
}

function stageHtml(data) {
  const css = (p) => `<link rel="stylesheet" href="${fileUrl(p)}">`;
  return `<!doctype html><html><head><meta charset="utf-8">
${css('node_modules/@fontsource/noto-sans-sc/400.css')}${css('node_modules/@fontsource/noto-sans-sc/700.css')}${css('node_modules/@fontsource/noto-sans-sc/900.css')}
${css('node_modules/@fontsource/noto-serif-sc/900.css')}${css('node_modules/@fontsource/ma-shan-zheng/400.css')}${css('node_modules/@fontsource/oswald/600.css')}
${css('templates/video.css')}
</head><body><div id="stage"><div id="rays"></div><div id="pattern"></div>
<img id="brand" src="${data.logoWhite}"><div id="tag"></div>
<div id="scenes"></div><div id="wipe"></div><div id="prog"><i></i></div><canvas id="fx" width="1080" height="1920"></canvas><div id="flash"></div><div id="fade"></div></div>
<script>window.DATA = ${JSON.stringify(data)};</script>
<script src="${fileUrl('node_modules/gsap/dist/gsap.min.js')}"></script>
<script src="${fileUrl('templates/video-stage.js')}"></script>
</body></html>`;
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error(`${cmd} exited ${c}`))));
  });
}

function makeMask(rect, file) {
  execFileSync('python3', ['-c', `
from PIL import Image, ImageDraw
w,h=${rect.w},${rect.h}
m=Image.new('L',(w,h),0);ImageDraw.Draw(m).rounded_rectangle((0,0,w-1,h-1),radius=22,fill=255);m.save('${file}')`]);
}

async function main() {
  const args = process.argv.slice(2);
  const preview = args.includes('--preview');
  const province = args.find((a) => !a.startsWith('--')) || '河北';
  const work = path.join(ROOT, 'output', 'video-work', province);
  fs.mkdirSync(work, { recursive: true });
  const data = buildData(province);
  const htmlFile = path.join(work, 'stage.html');
  fs.writeFileSync(htmlFile, stageHtml(data));

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`file://${htmlFile}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const sched = await page.evaluate(() => window.SCHEDULE);
  fs.writeFileSync(path.join(work, 'schedule.json'), JSON.stringify(sched, null, 1));
  console.log(`${province}: ${sched.duration.toFixed(1)}s`, sched.scenes.map((s) => `${s.name}@${s.start.toFixed(1)}`).join(' '));

  if (preview) {
    const shots = args.find((a) => a.startsWith('--at='));
    const times = shots ? shots.slice(5).split(',').map(Number) : sched.scenes.map((s) => Math.min(s.end - 0.5, s.start + (s.end - s.start) * 0.75));
    for (const t of times) {
      await page.evaluate((x) => window.seek(x), t);
      await page.screenshot({ path: path.join(work, `preview_${t.toFixed(1)}.jpg`), type: 'jpeg', quality: 80 });
    }
    console.log('preview frames ->', work);
    await browser.close();
    return;
  }

  // 1) 动画逐帧 -> base.mp4
  const base = path.join(work, 'base.mp4');
  const total = Math.ceil(sched.duration * FPS);
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', base], { stdio: ['pipe', 'inherit', 'inherit'] });
  const started = Date.now();
  for (let i = 0; i < total; i += 1) {
    await page.evaluate((x) => window.seek(x), i / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 150 === 0) process.stdout.write(`  frame ${i}/${total} (${((Date.now() - started) / 1000).toFixed(0)}s)\n`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('exit', r));
  await browser.close();

  // 2) 配乐
  const cues = {
    duration: sched.duration,
    impacts: sched.impacts,
    whoosh: sched.whoosh,
    chimes: sched.chimes,
    duck: sched.clips.map((c) => [c.start - 0.2, c.end + 0.1]),
    introEnd: (sched.scenes.find((x) => x.name === 'title') || sched.scenes[1]).start,
    outroStart: sched.scenes[sched.scenes.length - 1].start,
  };
  fs.writeFileSync(path.join(work, 'cues.json'), JSON.stringify(cues));
  const music = path.join(work, 'music.wav');
  execFileSync('python3', [path.join(ROOT, 'scripts', 'make-music.py'), path.join(work, 'cues.json'), music], { stdio: 'inherit' });

  // 3) 叠加学员原声片段 + 混音
  const outDir = path.join(ROOT, 'output', 'videos');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${province}.mp4`);
  const inputs = ['-i', base, '-i', music];
  const vf = [];
  const af = ['[1:a]volume=1.0[m]'];
  let last = '0:v';
  sched.clips.forEach((c, k) => {
    const mask = path.join(work, `mask${k}.png`);
    makeMask(c.rect, mask);
    inputs.push('-ss', String(c.ss), '-t', String(c.dur), '-i', c.file, '-loop', '1', '-i', mask);
    const vi = 2 + k * 2;
    const mi = vi + 1;
    vf.push(`[${vi}:v]scale=${c.rect.w}:${c.rect.h}:force_original_aspect_ratio=increase,crop=${c.rect.w}:${c.rect.h},fps=${FPS},format=yuva420p,setpts=PTS-STARTPTS+${c.start}/TB[cv${k}]`);
    vf.push(`[${mi}:v]format=gray,trim=duration=${c.dur},setpts=PTS-STARTPTS+${c.start}/TB[mk${k}]`);
    vf.push(`[cv${k}][mk${k}]alphamerge[ca${k}]`);
    vf.push(`[${last}][ca${k}]overlay=${c.rect.x}:${c.rect.y}:enable='between(t,${c.start},${c.start + c.dur})':eof_action=pass[v${k}]`);
    last = `v${k}`;
    const ms = Math.round(c.start * 1000);
    af.push(`[${vi}:a]aresample=44100,afade=t=in:d=0.3,afade=t=out:st=${Math.max(c.dur - 0.5, 0)}:d=0.5,loudnorm=I=-12:TP=-1.0,volume=1.4,adelay=${ms}|${ms}[a${k}]`);
  });
  const amixIn = ['[m]', ...sched.clips.map((_, k) => `[a${k}]`)].join('');
  af.push(`${amixIn}amix=inputs=${1 + sched.clips.length}:normalize=0:duration=first,alimiter=limit=0.95[aout]`);
  const filter = [...vf, ...af].join(';').replace('[0:v][ca0]', '[0:v][ca0]');
  await run('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', filter, '-map', last === '0:v' ? '0:v' : `[${last}]`, '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', String(sched.duration), out]);
  console.log('done ->', out);
}

main().catch((e) => { console.error(e); process.exit(1); });
