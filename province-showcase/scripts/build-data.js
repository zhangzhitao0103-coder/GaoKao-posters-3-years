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

// ---------- 补充表（scripts/import-extra.py 生成） ----------
const EXTRA_FILE = path.join(ROOT, 'data', 'extra', 'extra.json');
const EXTRA = fs.existsSync(EXTRA_FILE) ? JSON.parse(fs.readFileSync(EXTRA_FILE, 'utf8')) : { gaokao: {}, daily: [], video: [] };
const REPORT = {};
const bump = (k) => { REPORT[k] = (REPORT[k] || 0) + 1; };
const hlText = (x) => `${x.subject}${x.score}`;
function addHighlights(card, singles, skipSubject) {
  for (const x of singles || []) {
    if (x.subject === skipSubject) continue;
    const hl = (card.highlights ||= []);
    if (hl.some((h) => h.startsWith(x.subject))) continue;
    hl.push(hlText(x));
    card.hlFromExtra = true;
  }
}

// 各省高考满分（海南标准分 900，上海 660，其余 750）
const MAX_TOTAL = (prov) => (prov === '海南' ? 900 : prov === '上海' ? 660 : 750);

// ---------- 喜报库 ----------
function buildGaokao(materials) {
  const out = { champion: [], school: [], total: [], single: [], improve: [] };
  for (const m of materials) {
    const ex = EXTRA.gaokao[m.id] || {};
    let prov = matchProvince(m.province) || matchProvince(m.rawName);
    if (!prov && matchProvince(ex.province)) {
      prov = matchProvince(ex.province);
      bump('喜报-补充省份');
    }
    if (!prov) continue;
    const year = m.year;
    const base = { province: prov, year, image: m.previewUrl || m.imageUrl, source: m.fileName };
    if (ex.rank) { base.rank = ex.rank; bump('喜报-补充省排名'); }
    if (ex.stream) base.stream = ex.stream;
    // 姓名：原数据没有时，用补充表（文件名来源或海报脱敏格式）
    const nameOf = () => {
      const n = cleanName(m.studentName);
      if (n) return n;
      const e = ex.name && cleanName(ex.name.replace(/＊/g, '*'));
      if (e) bump('喜报-补充姓名');
      return e || null;
    };

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
        const name = nameOf();
        if (!m.school) break;
        const card = { ...base, rawName: name, name: maskName(name), school: m.school, tier: schoolTier(m.school) };
        if (ex.total) { card.totalScore = ex.total; card.scoreText = `${ex.total}分`; bump('喜报-补充名校学员总分'); }
        addHighlights(card, ex.singles);
        out.school.push(card);
        break;
      }
      case '超高分喜报': {
        const name = nameOf();
        // 文件名把总分和排名连写（如 678528 = 678 分 + 排名 528）时，取前三位
        if (m.totalScore > 999) m.totalScore = Number(String(m.totalScore).slice(0, 3));
        if (!m.totalScore || m.totalScore < 300 || m.totalScore > MAX_TOTAL(prov)) break;
        const card = { ...base, rawName: name, name: maskName(name), totalScore: m.totalScore };
        addHighlights(card, ex.singles);
        out.total.push(card);
        break;
      }
      case '单科高分': {
        const name = nameOf();
        if (!m.subject || !m.score) break;
        const card = { ...base, rawName: name, name: maskName(name), subject: m.subject, score: Number(m.score) };
        if (ex.total) { card.totalScore = ex.total; bump('喜报-补充单科学员总分'); }
        out.single.push(card);
        break;
      }
      case '高分学员': {
        // 多为“语文124 总分675”，基本无姓名
        const name = nameOf();
        const total = m.totalScore || ex.total || null;
        if (!m.totalScore && ex.total) bump('喜报-补充高分学员总分');
        if (m.subject && SUBJECTS.includes(m.subject) && m.score) {
          out.single.push({ ...base, rawName: name, name: maskName(name), subject: m.subject, score: Number(m.score), totalScore: total, anonymous: !name });
        } else if (total) {
          const card = { ...base, rawName: name, name: maskName(name), totalScore: total, anonymous: !name };
          addHighlights(card, ex.singles);
          out.total.push(card);
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
        // 理综/文综（满分 300）单独标注，不算总分
        const zong = text.match(/(理综|文综)从?\d/);
        let ft = parseFromTo(zong ? text.slice(zong.index) : (totalPart ? totalPart[0] : text));
        let delta = (ft && ft.delta) || m.improvementScore || parseDelta(text);
        if (!delta && ex.gain) { delta = ex.gain; bump('喜报-补充提分值'); }
        // 起止分超过 150 的一定是总分；“超强提分”目录下未标学科的也是总分
        const isTotal = (ft && ft.to > 150) || !SUBJECTS.includes(m.subject) || /^总分|总分提升|全科/.test(text);
        const subject = zong ? zong[1] : (isTotal ? '总分' : m.subject);
        // 标成总分但起止分不到 150 的，多半是文件名里混了单科分，不画条形，只保留文字
        if (subject === '总分' && ft && ft.to <= 150) ft = null;
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
        const text = c.scoreText || c.name.split('_').slice(2).join('_');
        // 名次类（“排名进步700多名”）不是分数；起止分超过 150 的是总分，不放进单科提分
        const isRank = /名|排名/.test(text);
        let ft = isRank ? null : parseFromTo(text);
        if (ft && ft.to > 150) ft = null;
        let prov = matchProvince(c.province);
        let provinceFrom;
        const ex = ft ? EXTRA.daily.filter((x) => x.subject === t.subject && x.from === ft.from && x.to === ft.to) : [];
        if (!prov) {
          // 补充表中同学科、同起止分且省份唯一时，补上省份
          const provs = [...new Set(ex.map((x) => matchProvince(x.province)).filter(Boolean))];
          if (provs.length === 1) { prov = provs[0]; provinceFrom = '补充表'; bump('日常-补充省份'); }
        }
        if (!prov) continue;
        const exName = ex.find((x) => matchProvince(x.province) === prov && x.name);
        const student = exName ? maskName(exName.name.replace(/\*+/g, '*')) : null;
        if (student) bump('日常-补充学员姓名');
        const key = `${prov}|${t.name}|${ft ? `${ft.from}-${ft.to}` : text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          province: prov,
          teacher: t.name,
          subject: t.subject,
          band: band.name,
          student,
          provinceFrom,
          ...(ft || {}),
          // 没有起止分时：名次、“喜提X分”（指考到X分）、单科提升超过 60 的都不当作提分值
          delta: (ft && ft.delta) || (isRank || /喜提/.test(text) || (parseDelta(text) || 0) > 60 ? null : parseDelta(text)),
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
    .filter((v) => v.province && v.url)
    .map((v) => {
      // 学霸视频学员表：同省、同姓、同总分即视为同一人，补充单科与成绩变化
      const b = EXTRA.video.find((x) => matchProvince(x.province) === v.province && x.total && x.total === v.score && x.name && v.rawName && x.name[0] === v.rawName[0]);
      if (b) {
        bump('视频-补充单科/成绩变化');
        return { ...v, singles: b.singles, change: b.change || null };
      }
      return v;
    });
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
  // 同一人多张图只保留一条：总分榜按 省+届+姓名+总分，名校榜按 省+届+姓名+学校
  const dedupe = (list, keyOf) => {
    const seen = new Set();
    return list.filter((x) => {
      if (!x.name) return true;
      const k = keyOf(x);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  g.total = dedupe(g.total, (x) => `${x.province}|${x.year}|${x.name}|${x.totalScore}`);
  g.school = dedupe(g.school, (x) => `${x.province}|${x.year}|${x.name}|${x.school}`);
  // 单科亮点里超过常规满分的（海南标准分、旧理综等）不展示
  for (const list of [g.champion, g.school, g.total]) {
    for (const x of list) {
      if (!x.highlights) continue;
      x.highlights = [...new Set(x.highlights)].filter((h) => {
        const m = h.match(/^(\D+)([\d.]+)$/);
        return m && Number(m[2]) <= (['语文', '数学', '英语'].includes(m[1]) ? 150 : 100);
      });
      if (!x.highlights.length) delete x.highlights;
    }
  }
  sortAll(g);
  const daily = buildDaily(cases).sort((a, b) => (b.delta || 0) - (a.delta || 0));
  const vids = buildVideos(videos);
  // 补充表合并情况
  const used = new Set();
  for (const p of Object.values(g)) for (const x of p) if (x.rank) used.add(x);
  fs.mkdirSync(path.join(ROOT, 'data', 'extra'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'data', 'extra', 'merge-report.json'), JSON.stringify(REPORT, null, 1));
  console.log('补充表合并：', REPORT);

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
