#!/usr/bin/env node
/*
 * 31 省优秀学员数据清洗
 * 输入：喜报库 data.js、提分案例库 data.js、学霸视频库 videos-data.js
 * 输出：data/provinces/<省>.json（海报/视频用）、data/all.json（Excel 用）
 *
 * 规则：
 *  - 押题学员反馈不纳入
 *  - 姓名统一打码：首字 + * + 末字（两字名：首字 + *）
 *  - 同一学员（同省同年、首末字相同）跨类别只保留最高一档，低档信息合并进高档卡片
 *    优先级：状元 > 名校 > 总分高分 > 单科高分
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const REPOS = path.resolve(ROOT, '..', '..');
const SRC = {
  posters: process.env.POSTERS_DATA || path.join(REPOS, 'GaoKao-posters-3-years', 'data.js'),
  cases: process.env.CASES_DATA || path.join(REPOS, 'Score-Improve-Case', 'data.js'),
  videos: process.env.VIDEOS_DATA || path.join(REPOS, 'xueba-video-library', 'videos-data.js'),
};

function loadWindow(file) {
  const win = {};
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window: win });
  return win;
}

const PROVINCES = ['北京', '天津', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江', '上海', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南', '广东', '广西', '海南', '重庆', '四川', '贵州', '云南', '西藏', '陕西', '甘肃', '青海', '宁夏', '新疆'];
const matchProvince = (s) => (s ? PROVINCES.find((p) => String(s).startsWith(p)) : undefined);

const SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '政治', '历史', '地理'];
const SUBJECT_ORDER = Object.fromEntries(SUBJECTS.map((s, i) => [s, i]));

// ---------- 姓名 ----------
const MASK_RE = /[xX×＊*]/g;
function cleanName(raw) {
  if (!raw) return null;
  const s = String(raw).trim().replace(/[（(].*?[）)]/g, '');
  if (!s || /\d/.test(s) || SUBJECTS.some((x) => s.includes(x)) || /提分|学员|未知|满分|论文|小说|阅读|选择题/.test(s)) return null;
  if (!/^[一-龥·xX×＊*]{2,6}$/.test(s)) return null;
  return s;
}
function maskName(name) {
  if (!name) return null;
  if (/同学$/.test(name)) return name; // 已是匿名称呼
  const masked = MASK_RE.test(name);
  MASK_RE.lastIndex = 0;
  const chars = [...name.replace(MASK_RE, '')];
  if (chars.length === 0) return null;
  if (chars.length === 1) return chars[0] + '*';
  if (chars.length === 2 && !masked) return chars[0] + '*';
  return chars[0] + '*' + chars[chars.length - 1];
}
// 用于跨类别识别同一学员
const personKey = (prov, year, name) => {
  if (!name) return null;
  const c = [...name.replace(MASK_RE, '')];
  return `${prov}|${year}|${c[0]}|${c.length > 1 ? c[c.length - 1] : ''}`;
};

// ---------- 学校分级 ----------
const SCHOOL_TIER = [
  ['北京大学', '清华大学'],
  ['复旦大学', '上海交通大学', '浙江大学', '中国科学技术大学', '南京大学', '中国人民大学'],
];
function schoolTier(s) {
  if (!s) return 9;
  for (let i = 0; i < SCHOOL_TIER.length; i += 1) if (SCHOOL_TIER[i].some((x) => s.includes(x))) return i;
  if (/北京航空|北京理工|同济|武汉大学|中山大学|华中科技|西安交通|哈尔滨工业|南开|天津大学|厦门大学|东南大学|北京师范|四川大学|山东大学|吉林大学|西北工业|中国农业|国防科技|电子科技|华南理工|湖南大学|中南大学|大连理工|重庆大学|兰州大学|东北大学|中国海洋|西北农林|中央民族|华东师范|北京外国语|上海财经|中央财经|对外经济贸易|中国政法|北京邮电/.test(s)) return 2;
  return 3;
}

// ---------- 分数解析 ----------
function parseFromTo(text) {
  const t = String(text).replace(/\s+/g, '');
  const m = t.match(/(?:从)?(\d{1,3})(?:\.\d)?(多|\+|几)?分?(?:提升?到|提分到|到|→|-|至)(\d{1,3})(?:\.\d)?分?/);
  if (m) {
    const from = Number(m[1]);
    const to = Number(m[3]);
    if (to > from && to <= 750) return { from, to, delta: to - from, approx: Boolean(m[2]) };
  }
  if (/十几分?到(\d{2,3})/.test(t)) {
    const to = Number(t.match(/十几分?到(\d{2,3})/)[1]);
    return { from: 15, to, delta: to - 15, approx: true, fromText: '十几' };
  }
  return null;
}
function parseDelta(text) {
  const m = String(text).match(/(?:提升|提分|进步|提高|提|涨)(\d{1,3})\+?/);
  return m ? Number(m[1]) : null;
}

// ---------- 喜报库 ----------
function buildGaokao(materials) {
  const out = { champion: [], school: [], total: [], single: [], improve: [] };
  for (const m of materials) {
    const prov = matchProvince(m.province) || matchProvince(m.rawName);
    if (!prov) continue;
    const year = m.year;
    const base = { province: prov, year, image: m.previewUrl || m.imageUrl, source: m.fileName };

    switch (m.category) {
      case '高考状元': {
        // 河北省石家庄市物理类状元 田＊阳 高考704分 清华大学
        const r = m.rawName.match(/^(.*?状元)\s+(\S+)\s+高考(\S+?)\s+(\S+)$/);
        if (!r) break;
        const region = r[1].replace(new RegExp(`^${prov}(省|市|自治区|壮族自治区|回族自治区|维吾尔自治区)?`), '');
        const scoreText = r[3].replace(/分$/, '');
        out.champion.push({
          ...base,
          rawName: r[2],
          name: maskName(r[2]),
          title: region || '状元',
          level: m.championLevel || (/[市州区县盟]/.test(region) ? 'city' : 'province'),
          totalScore: /^\d+$/.test(scoreText) ? Number(scoreText) : null,
          scoreText: /^\d+$/.test(scoreText) ? `${scoreText}分` : scoreText,
          school: r[4],
        });
        break;
      }
      case '顶尖名校': {
        const name = cleanName(m.studentName);
        if (!m.school) break;
        out.school.push({ ...base, rawName: name, name: maskName(name), school: m.school, tier: schoolTier(m.school) });
        break;
      }
      case '超高分喜报': {
        const name = cleanName(m.studentName);
        if (!m.totalScore || m.totalScore < 300) break;
        out.total.push({ ...base, rawName: name, name: maskName(name), totalScore: m.totalScore });
        break;
      }
      case '单科高分': {
        const name = cleanName(m.studentName);
        if (!m.subject || !m.score) break;
        out.single.push({ ...base, rawName: name, name: maskName(name), subject: m.subject, score: Number(m.score) });
        break;
      }
      case '高分学员': {
        // 多为“语文124 总分675”，基本无姓名
        const name = cleanName(m.studentName);
        if (m.subject && SUBJECTS.includes(m.subject) && m.score) {
          out.single.push({ ...base, rawName: name, name: maskName(name), subject: m.subject, score: Number(m.score), totalScore: m.totalScore || null, anonymous: !name });
        } else if (m.totalScore) {
          out.total.push({ ...base, rawName: name, name: maskName(name), totalScore: m.totalScore, anonymous: !name });
        } else if (m.improvementScore) {
          const ft = parseFromTo(m.rawName);
          out.improve.push({ ...base, subject: '总分', ...(ft || {}), delta: m.improvementScore, text: m.rawName.split('_').pop() });
        }
        break;
      }
      case '提分学员': {
        // 文件名笔误修正：“地理从50到提74分24” -> “地理从50到74提分24”
        const text = m.rawName.split('_').pop().replace(/到提(\d{2,3})分(\d{1,3})/, '到$1提分$2');
        // “总分从340提升到443”优先于前面的单科描述
        const totalPart = text.match(/总分从?\d{3}.*$/);
        const ft = parseFromTo(totalPart ? totalPart[0] : text);
        const delta = (ft && ft.delta) || m.improvementScore || parseDelta(text);
        // 起止分超过 150 的一定是总分；“超强提分”目录下未标学科的也是总分
        const isTotal = (ft && ft.to > 150) || !SUBJECTS.includes(m.subject) || /^总分/.test(text);
        const subject = isTotal ? '总分' : m.subject;
        out.improve.push({ ...base, subject, ...(ft || {}), delta: delta || null, text });
        break;
      }
      default:
        break;
    }
  }
  return out;
}

// ---------- 日常提分 ----------
function buildDaily(caseData) {
  const seen = new Set();
  const rows = [];
  for (const t of caseData.teachers) {
    for (const band of t.scoreBands) {
      for (const c of band.cases) {
        const prov = matchProvince(c.province);
        if (!prov) continue;
        const text = c.scoreText || c.name.split('_').slice(2).join('_');
        const ft = parseFromTo(text);
        const key = `${prov}|${t.name}|${ft ? `${ft.from}-${ft.to}` : text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          province: prov,
          teacher: t.name,
          subject: t.subject,
          band: band.name,
          ...(ft || {}),
          delta: (ft && ft.delta) || parseDelta(text),
          text: text.replace(/_[0-9a-f]{8,}$/, ''),
          image: c.previewUrl || c.imageUrl,
        });
      }
    }
  }
  return rows;
}

// ---------- 学霸视频 ----------
function buildVideos(videos) {
  return videos
    .map((v) => ({
      province: matchProvince(v.province),
      id: v.id,
      year: v.year,
      rawName: v.student,
      name: maskName(cleanName(v.student) || v.student),
      score: v.score && /^\d+$/.test(v.score) ? Number(v.score) : null,
      school: v.school || null,
      title: v.title,
      category: v.videoCategory,
      teacher: v.teacher,
      url: v.videoUrl,
      cover: v.coverPath,
    }))
    .filter((v) => v.province && v.url);
}

// ---------- 跨类别去重合并 ----------
function mergePeople(g) {
  const used = new Set();
  const idx = (list) => {
    const map = new Map();
    list.forEach((x, i) => {
      const k = personKey(x.province, x.year, x.rawName);
      if (!k) return;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(i);
    });
    return map;
  };
  const totalIdx = idx(g.total);
  const singleIdx = idx(g.single);
  const schoolIdx = idx(g.school);

  const absorb = (card) => {
    const k = personKey(card.province, card.year, card.rawName);
    if (!k) return;
    for (const i of totalIdx.get(k) || []) {
      if (used.has(`t${i}`)) continue;
      used.add(`t${i}`);
      if (!card.totalScore) {
        card.totalScore = g.total[i].totalScore;
        card.scoreText = `${g.total[i].totalScore}分`;
      }
    }
    for (const i of singleIdx.get(k) || []) {
      if (used.has(`s${i}`)) continue;
      used.add(`s${i}`);
      (card.highlights ||= []).push(`${g.single[i].subject}${g.single[i].score}`);
    }
  };

  for (const c of g.champion) {
    absorb(c);
    const k = personKey(c.province, c.year, c.rawName);
    for (const i of schoolIdx.get(k) || []) used.add(`c${i}`);
  }
  g.school.forEach((s, i) => {
    if (used.has(`c${i}`)) return;
    absorb(s);
  });
  g.total.forEach((t, i) => {
    if (used.has(`t${i}`)) return;
    const k = personKey(t.province, t.year, t.rawName);
    for (const j of singleIdx.get(k) || []) {
      if (used.has(`s${j}`)) continue;
      used.add(`s${j}`);
      (t.highlights ||= []).push(`${g.single[j].subject}${g.single[j].score}`);
    }
  });

  return {
    champion: g.champion,
    school: g.school.filter((_, i) => !used.has(`c${i}`)),
    total: g.total.filter((_, i) => !used.has(`t${i}`)),
    single: g.single.filter((_, i) => !used.has(`s${i}`)),
    improve: g.improve,
  };
}

// ---------- 排序 ----------
const byYearDesc = (a, b) => Number(b.year) - Number(a.year);
function sortAll(g) {
  g.champion.sort((a, b) => (a.level === 'province' ? 0 : 1) - (b.level === 'province' ? 0 : 1) || (b.totalScore || 999) - (a.totalScore || 999));
  g.school.sort((a, b) => a.tier - b.tier || a.school.localeCompare(b.school, 'zh') || (b.totalScore || 0) - (a.totalScore || 0) || byYearDesc(a, b));
  g.total.sort((a, b) => (a.anonymous ? 1 : 0) - (b.anonymous ? 1 : 0) || b.totalScore - a.totalScore);
  const fullMark = (s) => (['语文', '数学', '英语'].includes(s.subject) ? 150 : 100);
  g.single.sort((a, b) => (a.anonymous ? 1 : 0) - (b.anonymous ? 1 : 0) || b.score / fullMark(b) - a.score / fullMark(a));
  g.improve.sort((a, b) => (b.delta || 0) - (a.delta || 0) || (b.to || 0) - (a.to || 0));
}

function main() {
  const posters = loadWindow(SRC.posters).MATERIALS;
  const cases = loadWindow(SRC.cases).CASE_DATA;
  const videos = loadWindow(SRC.videos).VIDEO_DATA;

  const g = mergePeople(buildGaokao(posters));
  sortAll(g);
  const daily = buildDaily(cases).sort((a, b) => (b.delta || 0) - (a.delta || 0));
  const vids = buildVideos(videos);

  const outDir = path.join(ROOT, 'data', 'provinces');
  fs.mkdirSync(outDir, { recursive: true });
  const summary = [];
  for (const p of PROVINCES) {
    const f = (list) => list.filter((x) => x.province === p);
    const d = {
      province: p,
      gaokao: { champion: f(g.champion), school: f(g.school), total: f(g.total), single: f(g.single), improve: f(g.improve) },
      daily: f(daily),
      videos: f(vids),
    };
    d.stats = {
      champion: d.gaokao.champion.length,
      qingbei: d.gaokao.champion.filter((x) => /北京大学|清华大学/.test(x.school)).length + d.gaokao.school.filter((x) => x.tier === 0).length,
      school: d.gaokao.champion.length + d.gaokao.school.length,
      high600: [...d.gaokao.champion, ...d.gaokao.school, ...d.gaokao.total].filter((x) => x.totalScore >= 600).length,
      total: d.gaokao.total.length,
      single: d.gaokao.single.length,
      improve: d.gaokao.improve.length,
      daily: d.daily.length,
      dailyTeachers: new Set(d.daily.map((x) => x.teacher)).size,
      videos: d.videos.length,
    };
    fs.writeFileSync(path.join(outDir, `${p}.json`), JSON.stringify(d, null, 1));
    summary.push({ province: p, ...d.stats });
  }
  fs.writeFileSync(path.join(ROOT, 'data', 'summary.json'), JSON.stringify(summary, null, 1));
  console.table(summary);
}

main();
