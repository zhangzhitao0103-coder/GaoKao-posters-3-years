/* global gsap */
/*
 * 省份荣耀榜竖版视频舞台 v2（1080x1920）
 * 输入 window.DATA（由 render-video.js 注入），输出：
 *   window.SCHEDULE  —— 场景时间表（含学员原声片段窗口，供 ffmpeg 叠加）
 *   window.seek(t)   —— 渲染第 t 秒画面（确定性，可逐帧截图）
 */
(function () {
  const D = window.DATA;
  const W = 1080;
  const H = 1920;
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, cls, html, parent) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const chars = (s, cls = 'ch') => [...String(s)].map((c) => `<span class="${cls}">${c === ' ' ? '&nbsp;' : esc(c)}</span>`).join('');
  const FULL = { 语文: 150, 数学: 150, 英语: 150 };
  const fullOf = (x) => (x.subject === '总分' || x.to > 150 ? 750 : (FULL[x.subject] || (x.to > 100 ? 150 : 100)));
  const icon = (k) => `<svg viewBox="0 0 48 48" class="ico">${D.icons[k] || D.icons.temple}</svg>`;
  const CROWN = '<svg viewBox="0 0 48 48"><path d="M6 36 3 14l12 9 9-15 9 15 12-9-3 22z" fill="currentColor"/><rect x="6" y="38" width="36" height="5" rx="2" fill="currentColor"/></svg>';

  // ---------- 骨架 ----------
  const scenesRoot = $('#scenes');
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });
  const SCHEDULE = { scenes: [], clips: [], impacts: [], whoosh: [], chimes: [], bursts: [] };
  let T = 0;

  const brand = $('#brand');
  const tag = $('#tag');
  const setTag = (txt, at) => tl.call(() => { tag.textContent = txt; }, null, at);
  tag.textContent = `${D.province} · 优秀学员荣耀榜`;
  gsap.set([brand, tag, '#prog'], { autoAlpha: 0 });
  gsap.set('#wipe', { xPercent: -160 });

  function scene(name, dur, build, opts = {}) {
    const root = el('section', `scene scene-${name}`, null, scenesRoot);
    gsap.set(root, { autoAlpha: 0 });
    const t0 = T;
    tl.set(root, { autoAlpha: 1 }, t0);
    // 金色斜向扫光转场
    if (t0 > 0 && !opts.noWipe) tl.fromTo('#wipe', { xPercent: -160 }, { xPercent: 160, duration: 0.7, ease: 'power2.inOut', immediateRender: false }, t0 - 0.35);
    build(root, t0, dur);
    if (!opts.keep) tl.to(root, { autoAlpha: 0, scale: 1.05, duration: 0.3, ease: 'power2.in' }, t0 + dur - 0.3);
    SCHEDULE.scenes.push({ name, start: t0, end: t0 + dur, chapter: opts.chapter || '' });
    T += dur;
    return root;
  }
  function flash(at, strength = 0.5) {
    tl.fromTo('#flash', { opacity: strength }, { opacity: 0, duration: 0.5, ease: 'power2.out', immediateRender: false }, at);
  }
  function header(root, t0, part, title, sub) {
    const h = el('div', 'hdr', `<div class="hdr-part">${part}</div><div class="hdr-title">${chars(title)}</div>${sub ? `<div class="hdr-sub">${sub}</div>` : ''}`, root);
    tl.from($('.hdr-part', h), { y: -40, autoAlpha: 0, duration: 0.4 }, t0 + 0.1);
    tl.from(h.querySelectorAll('.hdr-title .ch'), { scale: 2.4, autoAlpha: 0, filter: 'blur(12px)', stagger: 0.05, duration: 0.45, ease: 'back.out(2)' }, t0 + 0.15);
    if (sub) tl.from($('.hdr-sub', h), { autoAlpha: 0, y: 20, duration: 0.4 }, t0 + 0.55);
    tl.fromTo($('.hdr-title', h), { '--sx': '-200%' }, { '--sx': '200%', duration: 1.2, ease: 'none' }, t0 + 0.7);
    return h;
  }
  const countTo = (node, to, at, dur = 1.2, from = 0) => {
    node.textContent = String(from);
    tl.fromTo(node, { innerText: from }, { innerText: to, duration: dur, snap: { innerText: 1 }, ease: 'power2.out', immediateRender: false }, at);
  };

  // ---------- 1. 片头：3D 省份地图 ----------
  scene('intro', 8.5, (root, t0) => {
    const g = D.geo;
    const tilt = el('div', 'map-tilt', null, root);
    const map = el('div', 'map', null, tilt);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${g.width} ${g.height}`);
    const body = g.cities.map((c) => `<path d="${c.d}"/>`).join('');
    svg.innerHTML = `<defs><linearGradient id="mf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe7a8" stop-opacity=".62"/><stop offset="1" stop-color="#d4973a" stop-opacity=".28"/></linearGradient>
      <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0.3"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff8dc" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <clipPath id="landclip">${body}</clipPath></defs>
      <g class="depth">${[30, 22, 14, 7].map((dy) => `<g transform="translate(0 ${dy})">${body}</g>`).join('')}</g>
      <g class="land">${g.cities.map((c) => `<path class="city" d="${c.d}" pathLength="1"/>`).join('')}</g>
      <g clip-path="url(#landclip)"><rect class="sweep" x="-500" y="-100" width="420" height="${g.height + 200}" fill="url(#sweep)" transform="skewX(-20)"/></g>`;
    map.appendChild(svg);
    const paths = svg.querySelectorAll('.city');
    gsap.set(paths, { strokeDasharray: 1, strokeDashoffset: 1, fillOpacity: 0 });
    gsap.set($('.depth', svg), { autoAlpha: 0 });
    // 先倾斜俯视描边，再“立起来”填色
    tl.fromTo(tilt, { rotateX: 58, rotateZ: -8, scale: 0.82, y: 80 }, { rotateX: 0, rotateZ: 0, scale: 1, y: 0, duration: 1.6, ease: 'power3.inOut' }, t0 + 1.9);
    tl.to(paths, { strokeDashoffset: 0, duration: 1.7, stagger: 0.05, ease: 'power1.inOut' }, t0 + 0.2);
    tl.to(paths, { fillOpacity: 1, duration: 0.7, stagger: 0.02 }, t0 + 1.8);
    tl.to($('.depth', svg), { autoAlpha: 1, duration: 0.6 }, t0 + 1.9);
    tl.fromTo($('.sweep', svg), { x: 0 }, { x: g.width + 900, duration: 1.3, ease: 'power1.inOut' }, t0 + 3.0);
    tl.fromTo($('.sweep', svg), { x: 0 }, { x: g.width + 900, duration: 1.3, ease: 'power1.inOut', immediateRender: false }, t0 + 6.0);
    tl.fromTo(map, { scale: 1 }, { scale: 1.06, duration: 5, ease: 'none' }, t0 + 3.4);

    const scale = 960 / g.width;
    g.cityDots.forEach((c, i) => {
      const dot = el('div', `cdot ${c.capital ? 'cap' : ''}`, `<i></i><em></em><span>${esc(c.name.replace(/市$/, ''))}</span>`, map);
      dot.style.left = `${c.x * scale}px`;
      dot.style.top = `${c.y * scale}px`;
      gsap.set(dot, { xPercent: -50, yPercent: -30 });
      tl.from(dot, { scale: 0, autoAlpha: 0, duration: 0.35, ease: 'back.out(3)' }, t0 + 3.3 + i * 0.1);
      tl.fromTo($('em', dot), { scale: 0.3, opacity: 0.9 }, { scale: 3.2, opacity: 0, duration: 1.1, repeat: 2, ease: 'power1.out' }, t0 + 3.4 + i * 0.1);
    });
    g.callouts.forEach((c, i) => {
      const x = c.x * scale; const y = c.y * scale; const bx = c.bx * scale; const by = c.by * scale;
      const line = el('div', 'cline', null, map);
      Object.assign(line.style, { left: `${x}px`, top: `${y}px`, width: `${Math.hypot(bx - x, by - y)}px`, transform: `rotate(${Math.atan2(by - y, bx - x)}rad)` });
      const badge = el('div', `callout ${c.kind}`, `${icon(c.icon)}<span>${esc(c.name)}</span>`, map);
      badge.style.left = `${bx}px`;
      badge.style.top = `${by}px`;
      gsap.set(badge, { xPercent: -50, yPercent: -50 });
      const at = t0 + 4.2 + i * 0.25;
      tl.from(line, { scaleX: 0, duration: 0.3, transformOrigin: '0 50%' }, at);
      tl.from(badge, { scale: 0, autoAlpha: 0, duration: 0.45, ease: 'back.out(2.5)' }, at + 0.15);
      SCHEDULE.chimes.push(at + 0.15);
    });

    const title = el('div', 'intro-title', `<div class="it-prov">${chars(D.province, 'pc')}</div><div class="it-intro">${esc(D.meta.intro || '')}</div>`, root);
    tl.from(title.querySelectorAll('.pc'), { y: -260, autoAlpha: 0, scale: 1.6, stagger: 0.12, duration: 0.55, ease: 'bounce.out' }, t0 + 0.5);
    tl.from($('.it-intro', title), { autoAlpha: 0, y: 20, duration: 0.6 }, t0 + 1.5);
    const tagline = el('div', 'intro-tagline', `<span>${chars(D.meta.tagline || '')}</span>`, root);
    tl.from(tagline, { scaleX: 0, duration: 0.5, ease: 'power4.out' }, t0 + 6.0);
    tl.from(tagline.querySelectorAll('.ch'), { autoAlpha: 0, y: 20, stagger: 0.06, duration: 0.3 }, t0 + 6.3);
    tl.to(tilt, { scale: 2.6, autoAlpha: 0, duration: 0.6, ease: 'power3.in' }, t0 + 7.9);
    SCHEDULE.whoosh.push(t0 + 7.9);
  }, { chapter: '开篇' });

  // ---------- 2. 总标题 + 数据 ----------
  scene('title', 6, (root, t0) => {
    SCHEDULE.impacts.push(t0);
    flash(t0, 0.85);
    tl.set([brand, tag, '#prog'], { autoAlpha: 1 }, t0);
    el('div', 'tt-years', '2024 – 2026', root);
    el('div', 'tt-prov', chars(D.province, 'pc'), root);
    el('div', 'tt-main', chars('优秀学员荣耀榜'), root);
    el('div', 'tt-ribbon', '<span>高考喜报 · 日常提分</span>', root);
    tl.from($('.tt-years', root), { autoAlpha: 0, letterSpacing: '60px', duration: 0.6 }, t0 + 0.1);
    tl.from(root.querySelectorAll('.tt-prov .pc'), { scale: 3, autoAlpha: 0, stagger: 0.1, duration: 0.45, ease: 'back.out(2)' }, t0 + 0.1);
    tl.from(root.querySelectorAll('.tt-main .ch'), { scale: 3, autoAlpha: 0, filter: 'blur(16px)', stagger: 0.06, duration: 0.4, ease: 'power4.out' }, t0 + 0.5);
    tl.fromTo(root, { x: 0 }, { x: 14, duration: 0.05, repeat: 5, yoyo: true, ease: 'none', immediateRender: false }, t0 + 0.95);
    tl.from($('.tt-ribbon', root), { scaleX: 0, duration: 0.5 }, t0 + 1.2);
    const grid = el('div', 'stats', null, root);
    D.stats.forEach(([n, u, l], i) => {
      const s = el('div', 'stat', `<div class="stat-n"><b>0</b><i>${u}</i></div><div class="stat-l">${l}</div>`, grid);
      tl.from(s, { y: 120, autoAlpha: 0, rotateX: -60, duration: 0.5 }, t0 + 1.8 + i * 0.15);
      countTo($('b', s), n, t0 + 2.0 + i * 0.15, 1.4);
    });
  }, { chapter: '开篇', noWipe: true });

  // ---------- 3. 状元榜 ----------
  if (D.sc.champion.length) {
    const n = D.sc.champion.length;
    scene('champion', n === 1 ? 6.5 : Math.min(10, 5.5 + n * 0.6), (root, t0) => {
      SCHEDULE.impacts.push(t0);
      flash(t0);
      el('div', 'spot', null, root);
      header(root, t0, 'PART 01 · 高考喜报', '状元榜', `${esc(D.province)}高考荣耀巅峰`);
      tl.from($('.spot', root), { autoAlpha: 0, scaleY: 0.2, transformOrigin: '50% 0', duration: 0.8 }, t0 + 0.2);
      if (n === 1) {
        const c = D.sc.champion[0];
        const hasNum = /\d/.test(c.scoreText);
        const card = el('div', 'champ-big', `
          <div class="cb-crown">${CROWN}</div>
          <div class="cb-year">${c.year}届</div>
          <div class="cb-title">${esc(c.title)}</div>
          <div class="cb-name">${chars(c.name, 'nc')}</div>
          <div class="cb-score"><b>${hasNum ? '0' : esc(c.scoreText)}</b>${hasNum ? '<i>分</i>' : ''}</div>
          <div class="cb-school">${esc(c.school)}</div>
          ${c.highlights?.length ? `<div class="cb-hl">${c.highlights.map((h) => `<span>${esc(h)}</span>`).join('')}</div>` : ''}`, root);
        tl.from(card, { y: 200, autoAlpha: 0, rotateX: 50, duration: 0.7 }, t0 + 0.6);
        tl.from($('.cb-crown', card), { y: -500, duration: 0.8, ease: 'bounce.out' }, t0 + 0.9);
        tl.from([$('.cb-year', card), $('.cb-title', card)], { autoAlpha: 0, y: 30, stagger: 0.1, duration: 0.4 }, t0 + 1.3);
        tl.from(card.querySelectorAll('.nc'), { scale: 0, autoAlpha: 0, stagger: 0.15, duration: 0.45, ease: 'back.out(3)' }, t0 + 1.6);
        if (c.totalScore) countTo($('.cb-score b', card), c.totalScore, t0 + 2.2, 1.3, c.totalScore - 240);
        else tl.from($('.cb-score', card), { autoAlpha: 0, scale: 2, duration: 0.4 }, t0 + 2.2);
        tl.from($('.cb-school', card), { scale: 3.5, autoAlpha: 0, rotate: -12, duration: 0.35, ease: 'power4.in' }, t0 + 3.4);
        tl.fromTo(card, { x: 0 }, { x: 10, duration: 0.04, repeat: 5, yoyo: true, ease: 'none', immediateRender: false }, t0 + 3.75);
        SCHEDULE.impacts.push(t0 + 3.75);
        SCHEDULE.bursts.push(t0 + 3.75);
        if (c.highlights?.length) tl.from(card.querySelectorAll('.cb-hl span'), { autoAlpha: 0, y: 30, stagger: 0.15, duration: 0.4 }, t0 + 4.2);
        tl.fromTo($('.cb-name', card), { '--sx': '-200%' }, { '--sx': '200%', duration: 1.4, ease: 'none' }, t0 + 4.4);
      } else {
        const grid = el('div', `champ-grid n${Math.min(n, 8)}`, null, root);
        D.sc.champion.slice(0, 8).forEach((c, i) => {
          const card = el('div', 'champ-sm', `<div class="cs-title">${esc(c.title)}</div><div class="cs-name">${esc(c.name)}</div><div class="cs-row"><b>${esc(c.scoreText.replace('分', ''))}</b>${/\d/.test(c.scoreText) ? '<i>分</i>' : ''}<span>${esc(c.school)}</span></div><div class="cs-year">${c.year}</div>`, grid);
          tl.from(card, { y: 160, autoAlpha: 0, rotateY: 80, duration: 0.55 }, t0 + 0.8 + i * 0.35);
          SCHEDULE.chimes.push(t0 + 0.8 + i * 0.35);
        });
        SCHEDULE.bursts.push(t0 + 1.2);
      }
    }, { chapter: '高考喜报' });
  }

  // ---------- 4. 名校录取榜 ----------
  const schoolPeople = [...D.sc.qingbei.groups, ...D.sc.otherSchool.groups].flatMap((g) => g.people.map((p) => ({ ...p, school: g.school })));
  if (schoolPeople.length) {
    const few = schoolPeople.length <= 6;
    scene('school', few ? 7 : 8, (root, t0) => {
      SCHEDULE.impacts.push(t0);
      flash(t0);
      header(root, t0, 'PART 01 · 高考喜报', '名校录取榜', `${D.stats_raw.qingbei ? `清北 <b>${D.stats_raw.qingbei}</b> 人 · ` : ''}名校共 <b>${D.stats_raw.school}</b> 人`);
      if (few) {
        // 一人一张录取通知书，依次翻开
        const list = el('div', 'tickets', null, root);
        schoolPeople.forEach((p, i) => {
          const tk = el('div', `ticket ${p.tier === 0 ? 'qb' : ''}`, `<div class="tk-stub"><span>录取</span></div><div class="tk-main"><div class="tk-school">${esc(p.school)}</div><div class="tk-name">${esc(p.name || '有道领世学员')}<small>${p.year}届${p.totalScore ? ` · ${p.totalScore}分` : ''}</small></div></div><div class="tk-seal">金榜<br>题名</div>`, list);
          const at = t0 + 0.9 + i * 0.5;
          tl.from(tk, { rotateX: -95, autoAlpha: 0, y: -60, transformOrigin: '50% 0', duration: 0.55, ease: 'back.out(1.5)' }, at);
          tl.from($('.tk-seal', tk), { scale: 3, autoAlpha: 0, rotate: 30, duration: 0.25, ease: 'power4.in' }, at + 0.5);
          SCHEDULE.chimes.push(at + 0.1);
        });
        SCHEDULE.bursts.push(t0 + 0.9 + schoolPeople.length * 0.5 + 0.3);
        return;
      }
      const wrap = el('div', 'school-wrap', null, root);
      let at = t0 + 0.9;
      D.sc.qingbei.groups.forEach((g) => {
        const blk = el('div', 'qb-blk', `<div class="qb-seal">${esc(g.school)}<small>${g.total}人</small></div><div class="qb-chips">${g.people.map((p) => `<span class="qb-chip">${esc(p.name || '学员')}${p.totalScore ? `<em>${p.totalScore}</em>` : ''}</span>`).join('')}${g.total > g.people.length ? `<span class="qb-chip qb-more">等${g.total}人</span>` : ''}</div>`, wrap);
        tl.from($('.qb-seal', blk), { scale: 2.4, autoAlpha: 0, duration: 0.35, ease: 'power4.in' }, at);
        SCHEDULE.chimes.push(at + 0.3);
        tl.from(blk.querySelectorAll('.qb-chip'), { autoAlpha: 0, y: -50, scale: 0.6, stagger: { each: 0.03, from: 'start' }, duration: 0.35, ease: 'back.out(2)' }, at + 0.3);
        at += 0.4 + Math.min(g.people.length * 0.03, 1.0) + 0.3;
      });
      if (D.sc.otherSchool.groups.length) {
        const os = el('div', 'os-list', D.sc.otherSchool.groups.map((g) => `<div class="os-row"><b>${esc(g.school)}</b><span>${g.people.map((p) => esc(p.name || '学员')).join(' · ')}</span></div>`).join(''), wrap);
        tl.from(os.querySelectorAll('.os-row'), { x: -700, autoAlpha: 0, stagger: 0.12, duration: 0.45 }, at);
      }
      tl.fromTo(wrap.querySelectorAll('.qb-chip'), { backgroundPosition: '-150% 0' }, { backgroundPosition: '150% 0', duration: 1.0, stagger: 0.01, ease: 'none', immediateRender: false }, t0 + 5.6);
    }, { chapter: '高考喜报' });
  }

  // ---------- 学员原声 ----------
  function clipScene(clip, idx, chapter) {
    if (!clip) return;
    scene(`clip${idx}`, clip.dur + 0.8, (root, t0) => {
      SCHEDULE.whoosh.push(t0);
      flash(t0, 0.6);
      const r = clip.rect;
      el('div', 'clip-cap', `<span class="clip-pill">学员原声</span><div class="clip-who"><b>${esc(clip.name)}</b>${clip.label ? ` · ${esc(clip.label)}` : `${clip.score ? ` · ${clip.score}分` : ''}${clip.school ? ` · ${esc(clip.school)}` : ''}`}</div>`, root);
      const frame = el('div', 'clip-frame', '<i class="cf-tl"></i><i class="cf-tr"></i><i class="cf-bl"></i><i class="cf-br"></i>', root);
      Object.assign(frame.style, { left: `${r.x - 14}px`, top: `${r.y - 14}px`, width: `${r.w + 28}px`, height: `${r.h + 28}px` });
      const hole = el('div', 'clip-hole', null, root);
      Object.assign(hole.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
      el('div', 'clip-foot', clip.quote ? `“${esc(clip.quote)}”` : '有道领世学员真实分享', root);
      tl.from(frame, { scale: 0.6, autoAlpha: 0, duration: 0.4 }, t0);
      tl.from($('.clip-cap', root), { y: -80, autoAlpha: 0, duration: 0.4 }, t0 + 0.1);
      tl.from($('.clip-foot', root), { y: 40, autoAlpha: 0, duration: 0.4 }, t0 + 0.5);
      SCHEDULE.clips.push({ ...clip, start: t0 + 0.4, end: t0 + 0.4 + clip.dur });
    }, { chapter });
  }
  clipScene(D.clips[0], 1, '高考喜报');

  // ---------- 5. 总分高分榜 ----------
  if (D.sc.total.people.length) {
    scene('total', 8, (root, t0) => {
      SCHEDULE.impacts.push(t0);
      flash(t0);
      header(root, t0, 'PART 01 · 高考喜报', '总分高分榜', `600分+ 学员 <b>${D.stats_raw.high600}</b> 人`);
      const ppl = D.sc.total.people;
      const pod = el('div', 'podium', null, root);
      [1, 0, 2].forEach((k, j) => {
        const p = ppl[k];
        if (!p) return;
        const col = el('div', `pod pod-${k + 1}`, `${k === 0 ? `<div class="pod-crown">${CROWN}</div>` : ''}<div class="pod-score"><b>0</b><i>分</i></div><div class="pod-name">${esc(p.name || '学员')}</div><div class="pod-bar"><span>${k + 1}</span></div>`, pod);
        tl.from($('.pod-bar', col), { scaleY: 0, transformOrigin: '50% 100%', duration: 0.6, ease: 'back.out(1.6)' }, t0 + 0.9 + j * 0.2);
        tl.from([$('.pod-score', col), $('.pod-name', col)], { autoAlpha: 0, y: 40, duration: 0.4 }, t0 + 1.3 + j * 0.2);
        countTo($('.pod-score b', col), p.totalScore, t0 + 1.3 + j * 0.2, 1.2, p.totalScore - 180);
        if (k === 0) tl.from($('.pod-crown', col), { y: -400, autoAlpha: 0, duration: 0.7, ease: 'bounce.out' }, t0 + 2.3);
      });
      SCHEDULE.bursts.push(t0 + 2.8);
      const grid = el('div', 'tot-grid', null, root);
      ppl.slice(3, 12).forEach((p, i) => {
        const tile = el('div', 'tot', `<em>${i + 4}</em><b>0</b><i>分</i><span>${esc(p.name || '学员')}</span>`, grid);
        tl.from(tile, { y: 300, autoAlpha: 0, duration: 0.45 }, t0 + 3.1 + i * 0.12);
        countTo($('b', tile), p.totalScore, t0 + 3.1 + i * 0.12, 0.9, p.totalScore - 120);
      });
      if (D.sc.total.total > ppl.length) {
        const m = el('div', 'more', `…… 等 <b>${D.sc.total.total}</b> 位高分学员`, root);
        tl.from(m, { autoAlpha: 0, duration: 0.4 }, t0 + 5.6);
      }
    }, { chapter: '高考喜报' });
  }

  // ---------- 6. 单科高分榜 ----------
  if (D.sc.single.subjects.length) {
    scene('single', 6.5, (root, t0) => {
      SCHEDULE.impacts.push(t0);
      flash(t0);
      header(root, t0, 'PART 01 · 高考喜报', '单科高分榜', `单科高分 <b>${D.sc.single.total}</b> 人次`);
      const grid = el('div', `sg-grid n${D.sc.single.subjects.length}`, null, root);
      D.sc.single.subjects.forEach((s, i) => {
        const top = s.people[0];
        const full = FULL[s.subject] || 100;
        const hot = top.score >= full * 0.95;
        const card = el('div', `sg ${hot ? 'hot' : ''}`, `
          <div class="sg-subj">${s.subject}</div>
          <div class="sg-score"><b>0</b><small>/${full}</small></div>
          <div class="sg-name">${esc(top.name || '学员')}</div>
          ${s.people[1] ? `<div class="sg-2">${esc(s.people[1].name || '学员')} ${s.people[1].score}</div>` : ''}`, grid);
        tl.from(card, { rotateY: 100, autoAlpha: 0, duration: 0.5, ease: 'back.out(1.4)' }, t0 + 0.9 + i * 0.13);
        countTo($('.sg-score b', card), top.score, t0 + 1.1 + i * 0.13, 1.0, Math.round(top.score * 0.5));
        if (hot) tl.fromTo(card, { boxShadow: '0 0 0 4px #edb95a, 0 0 0 0 rgba(255,215,120,0)' }, { boxShadow: '0 0 0 4px #edb95a, 0 0 60px 10px rgba(255,215,120,.85)', duration: 0.4, yoyo: true, repeat: 3, immediateRender: false }, t0 + 2.6 + i * 0.05);
      });
    }, { chapter: '高考喜报' });
  }

  // ---------- 7. 高考提分榜 ----------
  if (D.sc.improve.top || D.sc.improve.bars.length) {
    const top = D.sc.improve.top;
    scene('improve', 7.5, (root, t0) => {
      SCHEDULE.impacts.push(t0);
      flash(t0);
      header(root, t0, 'PART 01 · 高考喜报', '高考提分榜', `高考提分 <b>${D.sc.improve.total}</b> 例`);
      let listAt = t0 + 0.9;
      if (top) {
        const f = el('div', 'feat', `<div class="feat-tag">高考提分之最 · ${esc(top.subject || '总分')}</div>
          <div class="feat-ft"><span>${top.fromText || top.from}</span><i>→</i><b>${top.from}</b></div>
          <div class="feat-d"><em>↑</em><b>0</b><i>分</i></div>`, root);
        tl.from(f, { scale: 0.5, autoAlpha: 0, duration: 0.5, ease: 'back.out(1.8)' }, t0 + 0.8);
        countTo($('.feat-ft b', f), top.to, t0 + 1.3, 1.2, top.from);
        countTo($('.feat-d b', f), top.delta, t0 + 1.3, 1.2);
        tl.from($('.feat-d', f), { scale: 0, duration: 0.4, ease: 'back.out(3)' }, t0 + 1.2);
        tl.fromTo($('.feat-d em', f), { y: 80, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, repeat: 2, repeatDelay: 0.3 }, t0 + 1.4);
        tl.fromTo(f, { x: 0 }, { x: 10, duration: 0.04, repeat: 5, yoyo: true, ease: 'none', immediateRender: false }, t0 + 2.5);
        SCHEDULE.impacts.push(t0 + 2.5);
        SCHEDULE.bursts.push(t0 + 2.5);
        listAt = t0 + 3.0;
      }
      const list = el('div', `imp-list ${top ? 'with-feat' : ''}`, null, root);
      D.sc.improve.bars.slice(0, top ? 5 : 6).forEach((x, i) => {
        const max = fullOf(x);
        const a = (x.from / max) * 100;
        const b = (x.to / max) * 100;
        const row = el('div', 'imp', `
          <span class="imp-s">${esc(x.subject || '总分')}</span>
          <div class="imp-track"><div class="imp-base" style="width:${a}%"></div><div class="imp-gain" style="left:${a}%;width:${b - a}%"></div>
            <span class="imp-from ${b - a < 16 ? 'tight' : ''}" style="left:${a}%">${x.fromText || x.from}${x.approx ? '+' : ''}</span><span class="imp-to" style="left:${b}%"><b>${x.from}</b></span></div>
          <span class="imp-d"><em>↑</em>${x.delta}</span>`, list);
        const at = listAt + i * 0.32;
        tl.from(row, { x: 300, autoAlpha: 0, duration: 0.4 }, at);
        tl.from($('.imp-gain', row), { scaleX: 0, transformOrigin: '0 50%', duration: 0.8, ease: 'power2.inOut' }, at + 0.25);
        tl.from($('.imp-to', row), { left: `${a}%`, duration: 0.8, ease: 'power2.inOut' }, at + 0.25);
        countTo($('.imp-to b', row), x.to, at + 0.25, 0.8, x.from);
        tl.from($('.imp-d', row), { scale: 0, autoAlpha: 0, duration: 0.35, ease: 'back.out(3)' }, at + 0.95);
      });
    }, { chapter: '高考喜报' });
  }

  // ---------- 8. 日常提分喜报 ----------
  if (D.sc.daily.subjects.length) {
    const subs = D.sc.daily.subjects;
    const pages = [];
    for (let i = 0; i < subs.length; i += 3) pages.push(subs.slice(i, i + 3));
    const per = 2.5;
    const stars = D.sc.dailyTop.length >= 2 ? D.sc.dailyTop : [];
    const starDur = stars.length ? 3.4 : 0;
    scene('daily', 2.4 + starDur + pages.length * per + 0.5, (root, t0) => {
      SCHEDULE.impacts.push(t0);
      flash(t0, 0.8);
      const intro = el('div', 'dl-intro', `<div class="dl-part">PART 02</div><div class="dl-title">${chars('日常提分喜报')}</div><div class="dl-sub"><b>0</b> 位主讲老师 · <b>0</b> 例${esc(D.province)}学员日常提分</div>`, root);
      tl.from($('.dl-part', intro), { autoAlpha: 0, letterSpacing: '50px', duration: 0.5 }, t0 + 0.1);
      tl.from(intro.querySelectorAll('.dl-title .ch'), { y: 120, autoAlpha: 0, stagger: 0.06, duration: 0.45, ease: 'back.out(2)' }, t0 + 0.2);
      const bs = intro.querySelectorAll('.dl-sub b');
      tl.from($('.dl-sub', intro), { autoAlpha: 0, duration: 0.3 }, t0 + 0.8);
      countTo(bs[0], D.sc.daily.teachers, t0 + 0.8, 1.0);
      countTo(bs[1], D.sc.daily.total, t0 + 0.8, 1.2);
      tl.to(intro, { y: -560, scale: 0.62, duration: 0.6, ease: 'power3.inOut' }, t0 + 2.0);
      if (stars.length) {
        const box = el('div', 'stars', '<div class="stars-h">提分之星 TOP 3</div>', root);
        tl.from($('.stars-h', box), { autoAlpha: 0, y: 30, duration: 0.3 }, t0 + 2.4);
        stars.forEach((x, i) => {
          const c = el('div', `starc s${i + 1}`, `<div class="starc-rk">TOP<b>${i + 1}</b></div><div class="starc-mid"><div class="starc-ft">${x.from}<i>→</i><b>${x.from}</b></div><div class="starc-t">${esc(x.subject)} · ${esc(x.teacher)}老师</div></div><div class="starc-d"><em>↑</em><b>0</b></div>`, box);
          const at = t0 + 2.5 + i * 0.3;
          tl.from(c, { x: i % 2 ? 1100 : -1100, rotate: i % 2 ? 8 : -8, duration: 0.55, ease: 'back.out(1.3)' }, at);
          countTo($('.starc-ft b', c), x.to, at + 0.4, 0.9, x.from);
          countTo($('.starc-d b', c), x.delta, at + 0.4, 0.9);
          SCHEDULE.chimes.push(at + 0.3);
        });
        SCHEDULE.bursts.push(t0 + 3.6);
        tl.to(box, { y: -200, autoAlpha: 0, duration: 0.4, ease: 'power2.in' }, t0 + 2.4 + starDur - 0.4);
      }
      pages.forEach((pg, pi) => {
        const at = t0 + 2.4 + starDur + pi * per;
        const box = el('div', 'dl-page', null, root);
        pg.forEach((s, j) => {
          const card = el('div', 'dl-card', `<div class="dl-h"><span>${s.subject}</span><small>${s.teachers}位老师 · ${s.count}例</small></div>${s.cases.map((x) => `<div class="dl-row"><span class="dl-t">${esc(x.teacher)}<small>老师</small></span><span class="dl-ft">${x.from}<i>→</i><b>${x.from}</b></span><span class="dl-d">↑${x.delta}</span></div>`).join('')}`, box);
          tl.from(card, { x: 1100, duration: 0.5, ease: 'power3.out' }, at + j * 0.12);
          card.querySelectorAll('.dl-row').forEach((row, k) => {
            const x = s.cases[k];
            countTo($('.dl-ft b', row), x.to, at + 0.4 + j * 0.12, 0.8, x.from);
            tl.from($('.dl-d', row), { scale: 0, duration: 0.3, ease: 'back.out(3)' }, at + 1.1 + j * 0.12 + k * 0.08);
          });
          if (pi < pages.length - 1) tl.to(card, { x: -1100, duration: 0.45, ease: 'power3.in' }, at + per - 0.45 + j * 0.05);
        });
        SCHEDULE.whoosh.push(at);
      });
      const more = el('div', 'more dl-more', `…… 共 <b>${D.sc.daily.total}</b> 例日常提分`, root);
      tl.from(more, { autoAlpha: 0, duration: 0.4 }, t0 + 2.4 + starDur + (pages.length - 1) * per + 1.2);
    }, { chapter: '日常提分' });
  }

  clipScene(D.clips[1], 2, '日常提分');

  // ---------- 9. 结尾 ----------
  scene('outro', 6, (root, t0, dur) => {
    SCHEDULE.impacts.push(t0);
    flash(t0, 0.9);
    tl.to([brand, tag, '#prog'], { autoAlpha: 0, duration: 0.3 }, t0);
    el('div', 'out-glow', null, root);
    el('div', 'out-ring', null, root);
    el('img', 'out-logo', null, root).src = D.logoWhite;
    el('div', 'out-slogan', chars('高效学习，从有道领世开始'), root);
    el('div', 'out-sub', `${esc(D.province)} · 优秀学员荣耀榜`, root);
    tl.from($('.out-glow', root), { scale: 0.2, autoAlpha: 0, duration: 1.0 }, t0);
    tl.fromTo($('.out-ring', root), { scale: 0.2, opacity: 1 }, { scale: 2.2, opacity: 0, duration: 1.6, ease: 'power2.out' }, t0 + 0.2);
    tl.from($('.out-logo', root), { scale: 0.4, autoAlpha: 0, filter: 'blur(20px)', duration: 0.8, ease: 'back.out(1.6)' }, t0 + 0.2);
    tl.from(root.querySelectorAll('.out-slogan .ch'), { autoAlpha: 0, y: 40, stagger: 0.07, duration: 0.35 }, t0 + 1.0);
    tl.fromTo($('.out-slogan', root), { '--sx': '-200%' }, { '--sx': '200%', duration: 1.6, ease: 'none' }, t0 + 2.2);
    tl.from($('.out-sub', root), { autoAlpha: 0, y: 20, duration: 0.5 }, t0 + 2.0);
    SCHEDULE.bursts.push(t0 + 1.2);
    tl.to('#fade', { opacity: 1, duration: 0.8 }, t0 + dur - 0.8);
  }, { keep: true, chapter: '结语' });

  SCHEDULE.duration = T;
  tl.to({}, { duration: 0.01 }, T);

  // ---------- 背景光芒 & 粒子（确定性） ----------
  const rays = $('#rays');
  const progFill = $('#prog i');
  const canvas = $('#fx');
  const ctx = canvas.getContext('2d');
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const dust = Array.from({ length: 80 }, () => ({ x: rnd() * W, y: rnd() * H, r: 1 + rnd() * 3.5, v: 20 + rnd() * 60, p: rnd() * 6.28 }));
  const bursts = SCHEDULE.bursts.map((tb) => ({
    tb,
    pieces: Array.from({ length: 150 }, () => ({
      x: W / 2 + (rnd() - 0.5) * 200, y: H * 0.42, vx: (rnd() - 0.5) * 1500, vy: -600 - rnd() * 1300,
      w: 10 + rnd() * 14, h: 6 + rnd() * 8, rot: rnd() * 6, vr: (rnd() - 0.5) * 14,
      c: ['#ffe39a', '#f2c76e', '#ffffff', '#ff4d4d', '#ffd36b'][Math.floor(rnd() * 5)],
    })),
  }));
  function drawFx(t) {
    ctx.clearRect(0, 0, W, H);
    for (const d of dust) {
      const y = (d.y - d.v * t) % H;
      const yy = y < 0 ? y + H : y;
      ctx.fillStyle = `rgba(255,220,140,${0.35 + 0.35 * Math.sin(t * 2 + d.p)})`;
      ctx.beginPath();
      ctx.arc(d.x + Math.sin(t + d.p) * 12, yy, d.r, 0, 6.283);
      ctx.fill();
    }
    for (const b of bursts) {
      const dt = t - b.tb;
      if (dt < 0 || dt > 3.2) continue;
      for (const p of b.pieces) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - dt / 3.2);
        ctx.translate(p.x + p.vx * dt * (1 - dt * 0.15), p.y + p.vy * dt + 900 * dt * dt);
        ctx.rotate(p.rot + p.vr * dt);
        ctx.scale(1, Math.cos(p.rot + dt * 8));
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
    }
  }

  window.SCHEDULE = SCHEDULE;
  window.seek = (t) => {
    tl.seek(Math.min(t, tl.duration()), false);
    rays.style.transform = `translate(-50%,-50%) rotate(${t * 6}deg)`;
    progFill.style.width = `${Math.min(100, (t / T) * 100)}%`;
    const sc = SCHEDULE.scenes.find((s) => t >= s.start && t < s.end);
    if (sc && sc.chapter) tag.textContent = `${D.province}荣耀榜 · ${sc.chapter}`;
    drawFx(t);
  };
  window.seek(0);
}());
