/* 从省份数据中挑选海报/视频要展示的“亮点”名单，海报和视频共用 */
const SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '政治', '历史', '地理'];

function selectShowcase(d, caps = {}) {
  const c = {
    qingbei: 28, otherSchool: 6, total: 11, singlePerSubject: 3, improve: 5, improveText: 3, dailyPerSubject: 3, dailyPerGroup: 8,
    ...caps,
  };
  const g = d.gaokao;

  // 名校：清北全放（上限 40），其余名校按层次取前 N，按学校分组
  const qb = g.school.filter((x) => x.tier === 0);
  const others = g.school.filter((x) => x.tier !== 0);
  const groupBySchool = (list) => {
    const m = new Map();
    list.forEach((x) => {
      if (!m.has(x.school)) m.set(x.school, []);
      m.get(x.school).push(x);
    });
    return [...m].map(([school, people]) => ({ school, people, total: g.school.filter((x) => x.school === school).length }));
  };
  const qbShown = qb.slice(0, c.qingbei);
  const otherShown = others.slice(0, c.otherSchool);

  // 总分高分：有名字的优先，按分数
  const totalNamed = g.total.filter((x) => x.name);
  const totalShown = (totalNamed.length >= 6 ? totalNamed : g.total).slice(0, c.total);

  // 单科：每科取前 N
  // 已并入更高档（状元/名校/总分）的学员，其单科亮点也计入单科榜
  const absorbed = [...g.champion, ...g.school, ...g.total].flatMap((x) => (x.highlights || []).map((h) => {
    const m = h.match(/^(\D+)([\d.]+)$/);
    return m ? { name: x.name, year: x.year, subject: m[1], score: Number(m[2]), totalScore: x.totalScore } : null;
  }).filter(Boolean));
  // 同一人同科同分只保留一条（单科记录与高档卡片的单科亮点可能重复）
  const seenSingle = new Set();
  // 超过常规满分（语数英 150、其余 100）的单科分属于其他计分制（海南标准分、旧理综等），不进单科榜
  const fullOf = (x) => (['语文', '数学', '英语'].includes(x.subject) ? 150 : 100);
  const singlePool = [...g.single, ...absorbed].filter((x) => x.score <= fullOf(x))
    .sort((a, b) => b.score - a.score || (a.name ? 0 : 1) - (b.name ? 0 : 1))
    .filter((x) => {
      if (!x.name) return true;
      const k = `${x.name}|${x.subject}|${x.score}`;
      if (seenSingle.has(k)) return false;
      seenSingle.add(k);
      return true;
    });
  const singleBySubject = SUBJECTS.map((s) => {
    const list = singlePool.filter((x) => x.subject === s);
    // 严格按分数排序，同分时有姓名的在前
    return { subject: s, count: list.length, people: list.slice(0, c.singlePerSubject) };
  }).filter((x) => x.people.length);

  // 高考提分：有起止分的画条形，其余作为文字标签
  const withRange = g.improve.filter((x) => x.from != null && x.to != null);
  const textOnly = g.improve.filter((x) => x.from == null || x.to == null);

  // 日常提分：按学科分组，每科优先不同老师
  const dailyBySubject = SUBJECTS.map((s) => {
    const list = d.daily.filter((x) => x.subject === s && x.from != null);
    const picked = [];
    const usedTeacher = new Set();
    for (const x of list) {
      if (picked.length >= c.dailyPerSubject) break;
      if (!usedTeacher.has(x.teacher)) {
        picked.push(x);
        usedTeacher.add(x.teacher);
      }
    }
    for (const x of list) {
      if (picked.length >= c.dailyPerSubject) break;
      if (!picked.includes(x)) picked.push(x);
    }
    picked.sort((a, b) => b.delta - a.delta);
    const all = d.daily.filter((x) => x.subject === s);
    return { subject: s, count: all.length, teachers: new Set(all.map((x) => x.teacher)).size, cases: picked };
  }).filter((x) => x.count);

  // 亮点速览
  const FULLM = { 语文: 150, 数学: 150, 英语: 150 };
  const allTotals = [...g.champion, ...g.school, ...g.total].map((x) => x.totalScore).filter(Boolean);
  const bestSingle = [...singlePool].sort((a, b) => b.score / (FULLM[b.subject] || 100) - a.score / (FULLM[a.subject] || 100))[0];
  // 同一案例可能挂在多位老师/多个学科下重复出现：有姓名按 姓名+起止分 去重，匿名按 学科+起止分 去重
  const seenDaily = new Set();
  const dailyRanged = d.daily.filter((x) => x.from != null).filter((x) => {
    const k = x.student ? `${x.student}|${x.from}|${x.to}` : `|${x.subject}|${x.from}|${x.to}`;
    if (seenDaily.has(k)) return false;
    seenDaily.add(k);
    return true;
  });
  const facts = [];
  if (allTotals.length) facts.push({ label: '高考最高分', value: Math.max(...allTotals), unit: '分' });
  if (bestSingle) facts.push({ label: `单科最高 · ${bestSingle.subject}`, value: bestSingle.score, unit: '分' });
  const maxGain = Math.max(withRange[0]?.delta || 0, dailyRanged[0]?.delta || 0, g.improve[0]?.delta || 0);
  if (maxGain) facts.push({ label: '最高提分', value: maxGain, unit: '分', prefix: '+' });

  // 日常提分之星：前三（尽量不同老师）
  // 日常提分之星：提分最多的前三（不再按老师区分）
  const dailyTop = dailyRanged.slice(0, 3);

  // 日常提分按学科组展示（语数英 / 物化生 / 史地政）：有姓名的优先入选，不足再用匿名补位，最后按提分排序
  const GROUPS = [['语数英', ['语文', '数学', '英语']], ['物化生', ['物理', '化学', '生物']], ['史地政', ['历史', '地理', '政治']]];
  const dailyGroups = GROUPS.map(([name, subs]) => {
    const pool = dailyRanged.filter((x) => subs.includes(x.subject) && !dailyTop.includes(x));
    const picked = [...pool.filter((x) => x.student), ...pool.filter((x) => !x.student)].slice(0, c.dailyPerGroup);
    picked.sort((a, b) => b.delta - a.delta);
    // 海报用：有姓名的整行展示，匿名案例压缩成小胶囊
    const named = pool.filter((x) => x.student).slice(0, c.dailyPerGroup);
    const anon = pool.filter((x) => !x.student).slice(0, named.length >= 6 ? 6 : 9);
    return { name, subjects: subs, cases: picked, named, anon, total: d.daily.filter((x) => subs.includes(x.subject)).length };
  }).filter((x) => x.cases.length);

  return {
    province: d.province,
    stats: d.stats,
    facts,
    dailyTop,
    dailyGroups,
    champion: g.champion,
    qingbei: { groups: groupBySchool(qbShown), shown: qbShown.length, total: qb.length },
    otherSchool: { groups: groupBySchool(otherShown), shown: otherShown.length, total: others.length },
    total: { people: totalShown, total: g.total.length },
    single: { subjects: singleBySubject, total: singlePool.length },
    improve: { top: withRange[0] || null, bars: withRange.slice(withRange[0] ? 1 : 0, c.improve + 1), texts: textOnly.filter((x) => x.delta || x.text).slice(0, c.improveText), total: g.improve.length },
    daily: { subjects: dailyBySubject, total: d.daily.length, teachers: d.stats.dailyTeachers },
  };
}

module.exports = { selectShowcase, SUBJECTS };
