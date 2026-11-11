/* 从省份数据中挑选海报/视频要展示的“亮点”名单，海报和视频共用 */
const SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '政治', '历史', '地理'];

function selectShowcase(d, caps = {}) {
  const c = {
    qingbei: 40, otherSchool: 16, total: 12, singlePerSubject: 3, improve: 6, improveText: 4, dailyPerSubject: 3,
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
  const singleBySubject = SUBJECTS.map((s) => {
    const list = g.single.filter((x) => x.subject === s);
    const named = list.filter((x) => x.name);
    return { subject: s, count: list.length, people: [...named, ...list.filter((x) => !x.name)].slice(0, c.singlePerSubject) };
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

  return {
    province: d.province,
    stats: d.stats,
    champion: g.champion,
    qingbei: { groups: groupBySchool(qbShown), shown: qbShown.length, total: qb.length },
    otherSchool: { groups: groupBySchool(otherShown), shown: otherShown.length, total: others.length },
    total: { people: totalShown, total: g.total.length },
    single: { subjects: singleBySubject, total: g.single.length },
    improve: { bars: withRange.slice(0, c.improve), texts: textOnly.filter((x) => x.delta || x.text).slice(0, c.improveText), total: g.improve.length },
    daily: { subjects: dailyBySubject, total: d.daily.length, teachers: d.stats.dailyTeachers },
  };
}

module.exports = { selectShowcase, SUBJECTS };
