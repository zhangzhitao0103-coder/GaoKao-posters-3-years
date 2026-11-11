/* global gsap */
/*
 * 省份荣耀榜竖版视频舞台（1080x1920）
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

  const ICON = {
    gate: '<path d="M6 42h36M10 42V22h28v20M4 22h40L38 14H10zM14 14l2-6h16l2 6M20 42v-9a4 4 0 0 1 8 0v9"/>',
    pavilion: '<path d="M4 18 24 6l20 12M10 18h28M8 24h32M12 24v18M36 24v18M20 30h8v12h-8zM6 42h36"/>',
    bridge: '<path d="M2 30h44M4 30c4-14 36-14 40 0M14 30a10 8 0 0 1 20 0M8 30v8M40 30v8M2 38h44"/>',
    lotus: '<path d="M24 38c-6-6-6-18 0-26 6 8 6 20 0 26zM24 38c-10-2-16-10-16-18 8 0 14 6 16 18zM24 38c10-2 16-10 16-18-8 0-14 6-16 18zM8 42h32"/>',
    mountain: '<path d="M2 40 16 16l8 12 6-8 16 20zM16 16l-3 6 3-1 3 2"/>',
    tower: '<path d="M24 4v4M20 8h8l-2 10h-4zM18 18h12l2 22H16zM12 40h24M20 26h8"/>',
    pagoda: '<path d="M24 4v4M14 12l10-4 10 4zM16 12v6h16v-6M12 22l12-4 12 4zM16 22v6h16v-6M10 32l14-4 14 4zM16 32v8h16v-8M8 42h32"/>',
    wave: '<path d="M2 30c6-6 10-6 14 0s10 6 14 0 10-6 16 0M2 38c6-6 10-6 14 0s10 6 14 0 10-6 16 0M30 22c0-8 8-14 14-10"/>',
    temple: '<path d="M4 16 24 6l20 10zM8 16v4h32v-4M12 20v18M20 20v18M28 20v18M36 20v18M6 38h36v4H6z"/>',
    cap: '<path d="M24 10 4 18l20 8 16-6v10M12 22v8c0 3 5 6 12 6s12-3 12-6v-8"/>',
  };
  const icon = (k) => `<svg viewBox="0 0 48 48" class="ico">${ICON[k] || ICON.temple}</svg>`;

  // ---------- 骨架 ----------
  const stage = $('#stage');
  const scenesRoot = $('#scenes');
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });
  const SCHEDULE = { scenes: [], clips: [], impacts: [], whoosh: [], chimes: [], bursts: [] };
  let T = 0;

  const brand = $('#brand');
  const tag = $('#tag');
  tag.innerHTML = `${esc(D.province)} · 优秀学员荣耀榜`;
  gsap.set([brand, tag], { autoAlpha: 0 });

  function scene(name, dur, build, opts = {}) {
    const root = el('section', `scene scene-${name}`, null, scenesRoot);
    gsap.set(root, { autoAlpha: 0 });
    const t0 = T;
    tl.set(root, { autoAlpha: 1 }, t0);
    build(root, t0, dur);
    if (!opts.keep) tl.to(root, { autoAlpha: 0, scale: 1.06, duration: 0.35, ease: 'power2.in' }, t0 + dur - 0.35);
    SCHEDULE.scenes.push({ name, start: t0, end: t0 + dur });
    T += dur;
    return root;
  }
  function flash(at, strength = 0.85) {
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
  const countTo = (node, to, at, dur = 1.2) => {
    node.textContent = '0';
    tl.fromTo(node, { innerText: 0 }, { innerText: to, duration: dur, snap: { innerText: 1 }, ease: 'power2.out', immediateRender: false }, at);
  };

  // ---------- 1. 片头：省份地图 ----------
  scene('intro', 8, (root, t0) => {
    const g = D.geo;
    const map = el('div', 'map', null, root);
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${g.width} ${g.height}`);
    svg.innerHTML = `<defs><linearGradient id="mf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe7a8" stop-opacity=".5"/><stop offset="1" stop-color="#d4973a" stop-opacity=".22"/></linearGradient></defs>`
      + g.cities.map((c) => `<path class="city" d="${c.d}" pathLength="1"/>`).join('');
    map.appendChild(svg);
    const paths = svg.querySelectorAll('.city');
    gsap.set(paths, { strokeDasharray: 1, strokeDashoffset: 1, fillOpacity: 0 });
    tl.to(paths, { strokeDashoffset: 0, duration: 2.0, stagger: 0.08, ease: 'power1.inOut' }, t0 + 0.2);
    tl.to(paths, { fillOpacity: 1, duration: 0.8, stagger: 0.03 }, t0 + 2.1);
    tl.fromTo(map, { scale: 0.85 }, { scale: 1, duration: 7.5, ease: 'none' }, t0);

    // 城市点
    const scale = 960 / g.width;
    const pos = (c) => [c.x * scale, c.y * scale];
    g.cityDots.forEach((c, i) => {
      const [x, y] = pos(c);
      const dot = el('div', `cdot ${c.capital ? 'cap' : ''}`, `<i></i><span>${esc(c.name.replace(/市$/, ''))}</span>`, map);
      dot.style.left = `${x}px`;
      dot.style.top = `${y}px`;
      gsap.set(dot, { xPercent: -50, yPercent: -50 });
      tl.from(dot, { scale: 0, autoAlpha: 0, duration: 0.35, ease: 'back.out(3)' }, t0 + 2.6 + i * 0.12);
    });
    // 地标 / 大学标注
    g.callouts.forEach((c, i) => {
      const [x, y] = pos(c);
      const bx = c.bx * scale;
      const by = c.by * scale;
      const line = el('div', 'cline', null, map);
      const ang = Math.atan2(by - y, bx - x);
      Object.assign(line.style, { left: `${x}px`, top: `${y}px`, width: `${Math.hypot(bx - x, by - y)}px`, transform: `rotate(${ang}rad)` });
      const badge = el('div', `callout ${c.kind}`, `${icon(c.icon)}<span>${esc(c.name)}</span>`, map);
      badge.style.left = `${bx}px`;
      badge.style.top = `${by}px`;
      gsap.set(badge, { xPercent: -50, yPercent: -50 });
      const at = t0 + 3.7 + i * 0.28;
      tl.from(line, { scaleX: 0, duration: 0.3, transformOrigin: '0 50%' }, at);
      tl.from(badge, { scale: 0, autoAlpha: 0, duration: 0.45, ease: 'back.out(2.5)' }, at + 0.15);
      SCHEDULE.chimes.push(at + 0.15);
    });

    const title = el('div', 'intro-title', `<div class="it-prov">${chars(D.province, 'pc')}</div><div class="it-intro">${esc(D.meta.intro || '')}</div>`, root);
    tl.from(title.querySelectorAll('.pc'), { y: -260, autoAlpha: 0, scale: 1.6, stagger: 0.12, duration: 0.55, ease: 'bounce.out' }, t0 + 0.6);
    tl.from($('.it-intro', title), { autoAlpha: 0, y: 20, duration: 0.6 }, t0 + 1.6);
    const tagline = el('div', 'intro-tagline', `<span>${chars(D.meta.tagline || '')}</span>`, root);
    tl.from(tagline, { scaleX: 0, duration: 0.5, ease: 'power4.out' }, t0 + 5.5);
    tl.from(tagline.querySelectorAll('.ch'), { autoAlpha: 0, y: 20, stagger: 0.06, duration: 0.3 }, t0 + 5.8);
    tl.to(map, { scale: 2.4, autoAlpha: 0, duration: 0.6, ease: 'power3.in' }, t0 + 7.4);
    SCHEDULE.whoosh.push(t0 + 7.4);
  });

  // ---------- 2. 总标题 + 数据 ----------
  scene('title', 6, (root, t0) => {
    SCHEDULE.impacts.push(t0);
    flash(t0);
    tl.set([brand, tag], { autoAlpha: 1 }, t0);
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
  });

  // ---------- 3. 状元榜 ----------
  if (D.sc.champion.length) {
    const n = D.sc.champion.length;
    scene('champion', n === 1 ? 6.5 : Math.min(10, 5.5 + n * 0.6), (root, t0) => {
      SCHEDULE.impacts.push(t0);
      flash(t0, 0.6);
      el('div', 'spot', null, root);
      header(root, t0, 'PART 01 · 高考喜报', '状元榜', `${esc(D.province)}高考荣耀巅峰`);
      tl.from($('.spot', root), { autoAlpha: 0, scaleY: 0.2, transformOrigin: '50% 0', duration: 0.8 }, t0 + 0.2);
      if (n === 1) {
        const c = D.sc.champion[0];
        const card = el('div', 'champ-big', `
          <div class="cb-crown">${icon('crown')}</div>
          <div class="cb-year">${c.year}届</div>
          <div class="cb-title">${esc(c.title)}</div>
          <div class="cb-name">${chars(c.name, 'nc')}</div>
          <div class="cb-score"><b>${/\d/.test(c.scoreText) ? '0' : esc(c.scoreText)}</b>${/\d/.test(c.scoreText) ? '<i>分</i>' : ''}</div>
          <div class="cb-school">${esc(c.school)}</div>
          ${c.highlights?.length ? `<div class="cb-hl">${c.highlights.map((h) => `<span>${esc(h)}</span>`).join('')}</div>` : ''}`, root);
        $('.cb-crown', card).innerHTML = '<svg viewBox="0 0 48 48"><path d="M6 36 3 14l12 9 9-15 9 15 12-9-3 22z" fill="currentColor"/><rect x="6" y="38" width="36" height="5" rx="2" fill="currentColor"/></svg>';
        tl.from(card, { y: 200, autoAlpha: 0, rotateX: 50, duration: 0.7 }, t0 + 0.6);
        tl.from($('.cb-crown', card), { y: -500, duration: 0.8, ease: 'bounce.out' }, t0 + 0.9);
        tl.from([$('.cb-year', card), $('.cb-title', card)], { autoAlpha: 0, y: 30, stagger: 0.1, duration: 0.4 }, t0 + 1.3);
        tl.from(card.querySelectorAll('.nc'), { scale: 0, autoAlpha: 0, stagger: 0.15, duration: 0.45, ease: 'back.out(3)' }, t0 + 1.6);
        if (c.totalScore) countTo($('.cb-score b', card), c.totalScore, t0 + 2.2, 1.3);
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
    });
  }

  // ---------- 4. 名校录取榜 ----------
  if (D.sc.qingbei.total + D.sc.otherSchool.total) {
    scene('school', 8, (root, t0) => {
      SCHEDULE.impacts.push(t0);
      flash(t0, 0.5);
      header(root, t0, D.sc.champion.length ? 'PART 01 · 高考喜报' : 'PART 01 · 高考喜报', '名校录取榜', `清北 <b>${D.stats_raw.qingbei}</b> 人 · 名校共 <b>${D.stats_raw.school}</b> 人`);
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
      const more = D.sc.qingbei.total + D.sc.otherSchool.total - D.sc.qingbei.shown - D.sc.otherSchool.shown;
      if (more > 0) {
        const m = el('div', 'more', `…… 等 <b>${D.stats_raw.school}</b> 位名校学员`, root);
        tl.from(m, { autoAlpha: 0, duration: 0.4 }, t0 + 6.4);
      }
      tl.fromTo(wrap.querySelectorAll('.qb-chip'), { backgroundPosition: '-150% 0' }, { backgroundPosition: '150% 0', duration: 1.0, stagger: 0.01, ease: 'none', immediateRender: false }, t0 + 5.6);
    });
  }

  // ---------- 学员原声 ----------
  function clipScene(clip, idx) {
    if (!clip) return;
    scene(`clip${idx}`, clip.dur + 0.8, (root, t0) => {
      SCHEDULE.whoosh.push(t0);
      flash(t0, 0.7);
      const r = clip.rect;
      el('div', 'clip-cap', `<span class="clip-pill">学员原声</span><div class="clip-who"><b>${esc(clip.name)}</b>${clip.label ? ` · ${esc(clip.label)}` : `${clip.score ? ` · ${clip.score}分` : ''}${clip.school ? ` · ${esc(clip.school)}` : ''}`}</div>`, root);
      const frame = el('div', 'clip-frame', '<i class="cf-tl"></i><i class="cf-tr"></i><i class="cf-bl"></i><i class="cf-br"></i>', root);
      Object.assign(frame.style, { left: `${r.x - 14}px`, top: `${r.y - 14}px`, width: `${r.w + 28}px`, height: `${r.h + 28}px` });
      const hole = el('div', 'clip-hole', null, root);
      Object.assign(hole.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
      el('div', 'clip-foot', '有道领世学员真实分享', root);
      tl.from(frame, { scale: 0.6, autoAlpha: 0, duration: 0.4 }, t0);
      tl.from($('.clip-cap', root), { y: -80, autoAlpha: 0, duration: 0.4 }, t0 + 0.1);
      SCHEDULE.clips.push({ ...clip, start: t0 + 0.4, end: t0 + 0.4 + clip.dur });
    });
  }
  clipScene(D.clips[0], 1);

  // ---------- 5. 总分高分榜 ----------
  if (D.sc.total.people.length) {
    scene('total', 8, (root, t0) => {
      SCHEDULE.impacts.push(t0);
      flash(t0, 0.5);
      header(root, t0, 'PART 01 · 高考喜报', '总分高分榜', `600分+ 学员 <b>${D.stats_raw.high600}</b> 人`);
      const ppl = D.sc.total.people;
      const pod = el('div', 'podium', null, root);
      [1, 0, 2].forEach((k, j) => {
        const p = ppl[k];
        if (!p) return;
        const col = el('div', `pod pod-${k + 1}`, `<div class="pod-score"><b>0</b><i>分</i></div><div class="pod-name">${esc(p.name || '学员')}</div><div class="pod-bar"><span>${k + 1}</span></div>`, pod);
        tl.from($('.pod-bar', col), { scaleY: 0, transformOrigin: '50% 100%', duration: 0.6, ease: 'back.out(1.6)' }, t0 + 0.9 + j * 0.2);
        tl.from([$('.pod-score', col), $('.pod-name', col)], { autoAlpha: 0, y: 40, duration: 0.4 }, t0 + 1.3 + j * 0.2);
        countTo($('.pod-score b', col), p.totalScore, t0 + 1.3 + j * 0.2, 1.2);
      });
      SCHEDULE.bursts.push(t0 + 2.6);
      const grid = el('div', 'tot-grid', null, root);
      ppl.slice(3, 12).forEach((p, i) => {
        const tile = el('div', 'tot', `<b>0</b><i>分</i><span>${esc(p.name || '学员')}</span>`, grid);
        tl.from(tile, { y: 300, autoAlpha: 0, duration: 0.45 }, t0 + 3.0 + i * 0.12);
        countTo($('b', tile), p.totalScore, t0 + 3.0 + i * 0.12, 0.9);
      });
      if (D.sc.total.total > ppl.length) {
        const m = el('div', 'more', `…… 等 <b>${D.sc.total.total}</b> 位高分学员`, root);
        tl.from(m, { autoAlpha: 0, duration: 0.4 }, t0 + 5.6);
      }
    });
  }

  // ---------- 6. 单科高分榜 ----------
  if (D.sc.single.subjects.length) {
    scene('single', 6.5, (root, t0) => {
      SCHEDULE.impacts.push(t0);
      flash(t0, 0.5);
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
        countTo($('.sg-score b', card), top.score, t0 + 1.1 + i * 0.13, 1.0);
        if (hot) tl.fromTo(card, { boxShadow: '0 0 0 0 rgba(255,215,120,0)' }, { boxShadow: '0 0 60px 10px rgba(255,215,120,.85)', duration: 0.4, yoyo: true, repeat: 3, immediateRender: false }, t0 + 2.4 + i * 0.05);
      });
    });
  }

  // ---------- 7. 高考提分榜 ----------
  if (D.sc.improve.bars.length) {
    scene('improve', 6.5, (root, t0) => {
      SCHEDULE.impacts.push(t0);
      flash(t0, 0.5);
      header(root, t0, 'PART 01 · 高考喜报', '高考提分榜', `高考提分 <b>${D.sc.improve.total}</b> 例`);
      const list = el('div', 'imp-list', null, root);
      D.sc.improve.bars.forEach((x, i) => {
        const max = x.subject === '总分' || x.to > 150 ? 750 : (FULL[x.subject] || (x.to > 100 ? 150 : 100));
        const a = (x.from / max) * 100;
        const b = (x.to / max) * 100;
        const row = el('div', 'imp', `
          <span class="imp-s">${esc(x.subject || '总分')}</span>
          <div class="imp-track"><div class="imp-base" style="width:${a}%"></div><div class="imp-gain" style="left:${a}%;width:${b - a}%"></div>
            <span class="imp-from" style="left:${a}%">${x.fromText || x.from}${x.approx ? '+' : ''}</span><span class="imp-to" style="left:${b}%"><b>${x.from}</b></span></div>
          <span class="imp-d"><em>↑</em>${x.delta}</span>`, list);
        const at = t0 + 0.9 + i * 0.4;
        tl.from(row, { x: 300, autoAlpha: 0, duration: 0.4 }, at);
        tl.from($('.imp-gain', row), { scaleX: 0, transformOrigin: '0 50%', duration: 0.9, ease: 'power2.inOut' }, at + 0.3);
        tl.from($('.imp-to', row), { left: `${a}%`, duration: 0.9, ease: 'power2.inOut' }, at + 0.3);
        tl.fromTo($('.imp-to b', row), { innerText: x.from }, { innerText: x.to, snap: { innerText: 1 }, duration: 0.9, ease: 'power2.inOut', immediateRender: false }, at + 0.3);
        tl.from($('.imp-d', row), { scale: 0, autoAlpha: 0, duration: 0.35, ease: 'back.out(3)' }, at + 1.1);
        tl.from($('.imp-d em', row), { y: 60, autoAlpha: 0, duration: 0.3 }, at + 1.15);
      });
    });
  }

  // ---------- 8. 日常提分喜报 ----------
  if (D.sc.daily.subjects.length) {
    const subs = D.sc.daily.subjects;
    const pages = [];
    for (let i = 0; i < subs.length; i += 3) pages.push(subs.slice(i, i + 3));
    const per = 2.6;
    scene('daily', 2.4 + pages.length * per + 0.4, (root, t0) => {
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
      pages.forEach((pg, pi) => {
        const at = t0 + 2.4 + pi * per;
        const box = el('div', 'dl-page', null, root);
        pg.forEach((s, j) => {
          const card = el('div', 'dl-card', `<div class="dl-h"><span>${s.subject}</span><small>${s.teachers}位老师 · ${s.count}例</small></div>${s.cases.map((x) => `<div class="dl-row"><span class="dl-t">${esc(x.teacher)}<small>老师</small></span><span class="dl-ft">${x.from}<i>→</i><b>${x.from}</b></span><span class="dl-d">↑${x.delta}</span></div>`).join('')}`, box);
          tl.from(card, { x: 1100, duration: 0.5, ease: 'power3.out' }, at + j * 0.12);
          card.querySelectorAll('.dl-row').forEach((row, k) => {
            const x = s.cases[k];
            tl.fromTo($('.dl-ft b', row), { innerText: x.from }, { innerText: x.to, snap: { innerText: 1 }, duration: 0.8, immediateRender: false }, at + 0.4 + j * 0.12);
            tl.from($('.dl-d', row), { scale: 0, duration: 0.3, ease: 'back.out(3)' }, at + 1.1 + j * 0.12 + k * 0.08);
          });
          if (pi < pages.length - 1) tl.to(card, { x: -1100, duration: 0.45, ease: 'power3.in' }, at + per - 0.45 + j * 0.05);
        });
        SCHEDULE.whoosh.push(at);
      });
      const more = el('div', 'more dl-more', `…… 共 <b>${D.sc.daily.total}</b> 例日常提分`, root);
      tl.from(more, { autoAlpha: 0, duration: 0.4 }, t0 + 2.4 + (pages.length - 1) * per + 1.2);
    });
  }

  clipScene(D.clips[1], 2);

  // ---------- 9. 结尾 ----------
  scene('outro', 6, (root, t0, dur) => {
    SCHEDULE.impacts.push(t0);
    flash(t0, 0.9);
    tl.to([brand, tag], { autoAlpha: 0, duration: 0.3 }, t0);
    el('div', 'out-glow', null, root);
    el('img', 'out-logo', null, root).src = D.logoWhite;
    el('div', 'out-slogan', chars('高效学习，从有道领世开始'), root);
    el('div', 'out-sub', `${esc(D.province)} · 优秀学员荣耀榜`, root);
    tl.from($('.out-glow', root), { scale: 0.2, autoAlpha: 0, duration: 1.0 }, t0);
    tl.from($('.out-logo', root), { scale: 0.4, autoAlpha: 0, filter: 'blur(20px)', duration: 0.8, ease: 'back.out(1.6)' }, t0 + 0.2);
    tl.from(root.querySelectorAll('.out-slogan .ch'), { autoAlpha: 0, y: 40, stagger: 0.07, duration: 0.35 }, t0 + 1.0);
    tl.fromTo($('.out-slogan', root), { '--sx': '-200%' }, { '--sx': '200%', duration: 1.6, ease: 'none' }, t0 + 2.2);
    tl.from($('.out-sub', root), { autoAlpha: 0, y: 20, duration: 0.5 }, t0 + 2.0);
    SCHEDULE.bursts.push(t0 + 1.2);
    tl.to('#fade', { opacity: 1, duration: 0.8 }, t0 + dur - 0.8);
  }, { keep: true });

  SCHEDULE.duration = T;
  tl.to({}, { duration: 0.01 }, T);

  // ---------- 背景光芒 & 粒子（确定性） ----------
  const rays = $('#rays');
  const canvas = $('#fx');
  const ctx = canvas.getContext('2d');
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const dust = Array.from({ length: 70 }, () => ({ x: rnd() * W, y: rnd() * H, r: 1 + rnd() * 3.5, v: 20 + rnd() * 60, p: rnd() * 6.28 }));
  const bursts = SCHEDULE.bursts.map((tb) => ({
    tb,
    pieces: Array.from({ length: 140 }, () => ({
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
      const a = 0.35 + 0.35 * Math.sin(t * 2 + d.p);
      ctx.fillStyle = `rgba(255,220,140,${a})`;
      ctx.beginPath();
      ctx.arc(d.x + Math.sin(t + d.p) * 12, yy, d.r, 0, 6.283);
      ctx.fill();
    }
    for (const b of bursts) {
      const dt = t - b.tb;
      if (dt < 0 || dt > 3.2) continue;
      for (const p of b.pieces) {
        const x = p.x + p.vx * dt * (1 - dt * 0.15);
        const y = p.y + p.vy * dt + 900 * dt * dt;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - dt / 3.2);
        ctx.translate(x, y);
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
    drawFx(t);
  };
  window.seek(0);
}());
