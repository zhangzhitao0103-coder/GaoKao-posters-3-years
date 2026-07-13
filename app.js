const ANALYTICS_CONTEXT = {
  project_name: "有道领世高考喜报素材库",
  module_name: "gaokao-success-gallery",
};

function trackEvent(eventName, properties = {}) {
  if (!window.posthog || typeof window.posthog.capture !== "function") return;

  window.posthog.capture(eventName, {
    ...ANALYTICS_CONTEXT,
    page_title: document.title,
    page_path: window.location.pathname,
    ...properties,
  });
}

const MATERIALS = Array.isArray(window.MATERIALS) ? window.MATERIALS : [];
const AVAILABLE_YEARS = [...new Set(MATERIALS.map((item) => item.year).filter(Boolean))]
  .sort((a, b) => b.localeCompare(a, "zh-Hans-CN", { numeric: true }));
const CURRENT_YEAR = AVAILABLE_YEARS[0] || "2025";
const ALL = "全部";
const UNKNOWN_PROVINCE = "未知省份";
const SUBJECTS = ["全部", "语文", "数学", "英语", "物理", "化学", "生物", "政治", "历史", "地理"];
const PROVINCE_COLLATOR = new Intl.Collator("zh-Hans-CN-u-co-pinyin", { numeric: true });
const SECTION_CONFIGS = [
  { category: "顶尖名校", key: "top-university", elementId: "section-top-university", pageSize: 6, gridClass: "grid-3" },
  { category: "超高分喜报", key: "ultra-high-score", elementId: "section-ultra-high-score", pageSize: 6, gridClass: "grid-3" },
  { category: "单科高分", key: "single-subject-high-score", elementId: "section-single-subject-high-score", pageSize: 4, gridClass: "grid-2" },
  { category: "高分学员", key: "high-score-student", elementId: "section-high-score-student", pageSize: 4, gridClass: "grid-2" },
  { category: "提分学员", key: "score-improvement", elementId: "section-score-improvement", pageSize: 8, gridClass: "grid-4" },
  { category: "押题学员反馈", key: "prediction-feedback", elementId: "section-prediction-feedback", pageSize: 8, gridClass: "grid-2" },
];
const SCHOOL_PRIORITY = ["清华大学", "北京大学", "复旦大学", "上海交通大学", "浙江大学", "中国人民大学", "香港大学"];
const EXAM_PROVINCE_GROUPS = [
  {
    aliases: ["新高考一卷", "新高考1卷", "新高考Ⅰ卷", "新高考I卷", "新一卷"],
    provinces: ["山东", "浙江", "江苏", "广东", "湖南", "湖北", "福建", "河北", "安徽", "江西", "河南"],
  },
  {
    aliases: ["新高考二卷", "新高考2卷", "新高考Ⅱ卷", "新高考II卷", "新二卷"],
    provinces: ["海南", "重庆", "辽宁", "黑龙江", "吉林", "甘肃", "贵州", "广西", "云南", "山西", "四川", "陕西", "内蒙古", "青海", "宁夏"],
  },
  {
    aliases: ["陕晋青宁", "陕西卷"],
    provinces: ["山西", "宁夏", "青海", "陕西"],
  },
  {
    aliases: ["黑吉辽蒙", "辽宁卷"],
    provinces: ["内蒙古", "吉林", "黑龙江", "辽宁"],
  },
  {
    aliases: ["老高考"],
    provinces: ["新疆", "西藏"],
  },
];

const state = {
  year: CURRENT_YEAR,
  province: ALL,
  subject: ALL,
  keyword: "",
  pageIndexByCategory: Object.fromEntries(SECTION_CONFIGS.map((section) => [section.category, 0])),
  viewAll: {
    category: null,
    pageIndex: 0,
    pageSize: 15,
  },
  lightbox: {
    items: [],
    index: 0,
    category: null,
  },
};

const elements = {
  totalYears: document.querySelector("#totalYears"),
  totalImages: document.querySelector("#totalImages"),
  totalCategories: document.querySelector("#totalCategories"),
  resetButton: document.querySelector("#resetButton"),
  yearSelect: document.querySelector("#yearSelect"),
  provinceSelect: document.querySelector("#provinceSelect"),
  subjectButtons: document.querySelector("#subjectButtons"),
  filterSummary: document.querySelector("#filterSummary"),
  yearTitle: document.querySelector("#yearTitle"),
  yearSubtitle: document.querySelector("#yearSubtitle"),
  viewAllModal: document.querySelector("#viewAllModal"),
  viewAllTitle: document.querySelector("#viewAllTitle"),
  viewAllSubtitle: document.querySelector("#viewAllSubtitle"),
  viewAllGrid: document.querySelector("#viewAllGrid"),
  viewAllPrev: document.querySelector("#viewAllPrev"),
  viewAllNext: document.querySelector("#viewAllNext"),
  viewAllPageIndicator: document.querySelector("#viewAllPageIndicator"),
  lightbox: document.querySelector("#lightbox"),
  lightboxImage: document.querySelector("#lightboxImage"),
  lightboxTitle: document.querySelector("#lightboxTitle"),
  lightboxFile: document.querySelector("#lightboxFile"),
  lightboxTags: document.querySelector("#lightboxTags"),
  lightboxDownload: document.querySelector("#lightboxDownload"),
  lightboxPrev: document.querySelector("#lightboxPrev"),
  lightboxNext: document.querySelector("#lightboxNext"),
  lightboxCopy: document.querySelector("#lightboxCopy"),
  lightboxCopyName: document.querySelector("#lightboxCopyName"),
  lightboxCloseTop: document.querySelector("#lightboxCloseTop"),
  lightboxCloseBottom: document.querySelector("#lightboxCloseBottom"),
  toast: document.querySelector("#toast"),
};

let toastTimer = null;

function normalizeText(value) {
  return String(value || "").toLowerCase().trim();
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

function predictionText(item) {
  return [item.rawName, item.fileName, item.sourcePath, item.title].filter(Boolean).join(" ");
}

function containsProvinceName(item, province) {
  return predictionText(item).includes(province);
}

function matchingExamGroups(item) {
  const text = predictionText(item);
  return EXAM_PROVINCE_GROUPS.filter((group) => group.aliases.some((alias) => text.includes(alias)));
}

function hasPredictionProvinceSignal(item) {
  return Boolean(item.province) || containsProvinceName(item, "全国") || matchingExamGroups(item).length > 0
    || EXAM_PROVINCE_GROUPS.some((group) => group.provinces.some((province) => containsProvinceName(item, province)));
}

function predictionProvinceMatchRank(item, province) {
  if (item.category !== "押题学员反馈" || province === ALL) return 0;
  if (province === UNKNOWN_PROVINCE) return hasPredictionProvinceSignal(item) ? -1 : 0;
  if (item.province === province || containsProvinceName(item, province)) return 0;
  if (matchingExamGroups(item).some((group) => group.provinces.includes(province))) return 1;
  return -1;
}

function imageProperties(item, source) {
  return {
    image_name: item.fileName,
    image_src: item.imageUrl,
    content_type: item.content_type,
    category: item.category,
    year: item.year,
    subject: item.subject,
    province: item.province,
    school: item.school,
    score: item.score,
    totalScore: item.totalScore,
    source,
  };
}

function getBaseItems() {
  if (state.year === ALL) return MATERIALS;
  return MATERIALS.filter((item) => item.year === state.year);
}

function matchesSearch(item) {
  if (!state.keyword) return true;
  const keyword = normalizeText(state.keyword);
  return [
    item.fileName,
    item.title,
    item.province,
    item.subject,
    item.school,
    item.studentName,
    item.searchableText,
    ...(item.tags || []),
  ].some((value) => normalizeText(value).includes(keyword));
}

function matchesFilters(item, section) {
  if (item.category !== section.category) return false;
  if (state.year !== ALL && item.year !== state.year) return false;
  if (item.category === "押题学员反馈") {
    const provinceRank = predictionProvinceMatchRank(item, state.province);
    if (state.province !== ALL && provinceRank < 0) return false;
  } else {
    if (state.province === UNKNOWN_PROVINCE && item.province) return false;
    if (state.province !== ALL && state.province !== UNKNOWN_PROVINCE && item.province !== state.province) return false;
  }
  if (state.subject !== ALL && item.subject && item.subject !== state.subject) return false;
  if (state.subject !== ALL && !item.subject && !["顶尖名校", "超高分喜报"].includes(item.category)) return false;
  return matchesSearch(item);
}

function schoolRank(item) {
  const index = SCHOOL_PRIORITY.findIndex((school) => item.school && item.school.includes(school));
  return index === -1 ? SCHOOL_PRIORITY.length : index;
}

function compareByFileName(a, b) {
  return a.fileName.localeCompare(b.fileName, "zh-Hans-CN", { numeric: true });
}

function sortItems(items, category) {
  return [...items].sort((a, b) => {
    if (category === "顶尖名校") return schoolRank(a) - schoolRank(b) || compareByFileName(a, b);
    if (category === "超高分喜报") return (b.totalScore || 0) - (a.totalScore || 0) || compareByFileName(a, b);
    if (category === "单科高分") return (b.score || 0) - (a.score || 0) || compareByFileName(a, b);
    if (category === "高分学员") return (b.totalScore || 0) - (a.totalScore || 0) || (b.score || 0) - (a.score || 0) || compareByFileName(a, b);
    if (category === "提分学员") return (b.improvementScore || 0) - (a.improvementScore || 0) || compareByFileName(a, b);
    if (category === "押题学员反馈") {
      const provinceRankA = predictionProvinceMatchRank(a, state.province);
      const provinceRankB = predictionProvinceMatchRank(b, state.province);
      return provinceRankA - provinceRankB
        || (a.subject || "").localeCompare(b.subject || "", "zh-Hans-CN")
        || (a.province || "").localeCompare(b.province || "", "zh-Hans-CN")
        || (a.feedbackIndex || 0) - (b.feedbackIndex || 0)
        || compareByFileName(a, b);
    }
    return compareByFileName(a, b);
  });
}

function getSectionItems(section) {
  return sortItems(MATERIALS.filter((item) => matchesFilters(item, section)), section.category);
}

function getAllFilteredItems() {
  return SECTION_CONFIGS.flatMap((section) => getSectionItems(section));
}

function resetPages() {
  SECTION_CONFIGS.forEach((section) => {
    state.pageIndexByCategory[section.category] = 0;
  });
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 2200);
}

function createChip(label, active, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `chip${active ? " is-active" : ""}`;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function renderFilters() {
  elements.yearSelect.innerHTML = [ALL, ...AVAILABLE_YEARS].map((year) => `<option value="${year}">${year}</option>`).join("");
  elements.yearSelect.value = state.year;

  const currentYearItems = getBaseItems();
  const sortedProvinces = uniqueSorted(currentYearItems.map((item) => item.province))
    .sort((a, b) => PROVINCE_COLLATOR.compare(a, b));
  const hasUnknown = currentYearItems.some((item) => !item.province);
  const provinceOptions = [ALL, ...sortedProvinces, ...(hasUnknown ? [UNKNOWN_PROVINCE] : [])];
  elements.provinceSelect.innerHTML = provinceOptions.map((province) => {
    const label = province === ALL ? "全部省份" : province;
    return `<option value="${province}">${label}</option>`;
  }).join("");
  elements.provinceSelect.value = state.province;

  elements.subjectButtons.textContent = "";
  SUBJECTS.forEach((subject) => {
    elements.subjectButtons.append(createChip(subject, state.subject === subject, () => selectSubject(subject)));
  });
}

function renderSummary() {
  const years = uniqueSorted(MATERIALS.map((item) => item.year));
  const yearItems = getBaseItems();
  const filteredCount = getAllFilteredItems().length;
  elements.totalYears.textContent = years.length;
  elements.totalImages.textContent = yearItems.length;
  elements.totalCategories.textContent = uniqueSorted(yearItems.map((item) => item.category)).length;
  elements.yearTitle.textContent = `${state.year === ALL ? "全部年份" : state.year} 高考喜报素材`;
  elements.yearSubtitle.textContent = `共 ${yearItems.length} 张素材，当前筛选 ${filteredCount} 张`;
  elements.filterSummary.textContent = `当前筛选：${state.year === ALL ? "全部年份" : state.year}｜${state.province === ALL ? "全部省份" : state.province}｜${state.subject === ALL ? "全部学科" : state.subject}｜共 ${filteredCount} 张`;
}

function createMaterialCard(item, source, sectionItems) {
  const card = document.createElement("article");
  card.className = "material-card";
  card.tabIndex = 0;
  card.innerHTML = `
    <div class="thumb-frame">
      <img src="${item.thumbUrl}" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async" />
    </div>
    <div class="card-footer">
      <div class="card-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
      <button class="copy-button" type="button" aria-label="复制图片"></button>
    </div>
  `;
  card.addEventListener("click", () => openLightbox(sectionItems, sectionItems.findIndex((entry) => entry.id === item.id), "card"));
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter") openLightbox(sectionItems, sectionItems.findIndex((entry) => entry.id === item.id), "card");
  });
  card.querySelector(".copy-button").addEventListener("click", (event) => {
    event.stopPropagation();
    copyImage(item, source);
  });
  return card;
}

function renderSection(section) {
  const root = document.querySelector(`#${section.elementId}`);
  const items = getSectionItems(section);
  const totalPages = Math.max(1, Math.ceil(items.length / section.pageSize));
  const pageIndex = Math.min(state.pageIndexByCategory[section.category] || 0, totalPages - 1);
  state.pageIndexByCategory[section.category] = pageIndex;
  const pageItems = items.slice(pageIndex * section.pageSize, pageIndex * section.pageSize + section.pageSize);

  const card = document.createElement("section");
  card.className = "section-card";
  card.dataset.category = section.category;
  const subjectHint = state.subject !== ALL && ["顶尖名校", "超高分喜报"].includes(section.category)
    ? `<div class="section-hint">该模块不支持学科筛选，已展示当前省份/年份下素材。</div>`
    : "";
  card.innerHTML = `
    <div class="section-card__head">
      <div>
        <div class="section-title">${section.category}<span>共 ${items.length} 张</span></div>
      </div>
      <div class="section-actions">
        <button class="mini-button" type="button" data-page="prev" ${pageIndex <= 0 ? "disabled" : ""}>‹</button>
        <span class="page-indicator">${pageIndex + 1}/${totalPages}</span>
        <button class="mini-button" type="button" data-page="next" ${pageIndex >= totalPages - 1 ? "disabled" : ""}>›</button>
        <button class="view-all-button" type="button" ${items.length ? "" : "disabled"}>查看全部</button>
      </div>
    </div>
    ${subjectHint}
  `;

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = "<div><strong>暂无匹配素材</strong><span>可尝试切换省份、学科或清空关键词。</span></div>";
    card.append(empty);
  } else {
    const grid = document.createElement("div");
    grid.className = `card-grid ${section.gridClass}`;
    pageItems.forEach((item) => grid.append(createMaterialCard(item, "card", items)));
    card.append(grid);
  }

  card.querySelector('[data-page="prev"]').addEventListener("click", () => changeSectionPage(section, -1));
  card.querySelector('[data-page="next"]').addEventListener("click", () => changeSectionPage(section, 1));
  card.querySelector(".view-all-button").addEventListener("click", () => openViewAll(section));
  root.replaceChildren(card);
}

function renderSections() {
  SECTION_CONFIGS.forEach(renderSection);
}

function renderAll() {
  renderFilters();
  renderSummary();
  renderSections();
  if (!elements.viewAllModal.hidden && state.viewAll.category) renderViewAllContent();
}

function selectProvince(province) {
  state.province = province;
  resetPages();
  renderAll();
  const resultCount = getAllFilteredItems().length;
  trackEvent("filter_changed", filterEventProperties("province", province, resultCount));
  trackEvent("province_selected", filterEventProperties("province", province, resultCount));
}

function selectYear(year) {
  state.year = year;
  resetPages();
  closeViewAll();
  renderAll();
  const resultCount = getAllFilteredItems().length;
  trackEvent("filter_changed", filterEventProperties("year", year, resultCount));
}

function selectSubject(subject) {
  state.subject = subject;
  resetPages();
  renderAll();
  const resultCount = getAllFilteredItems().length;
  trackEvent("filter_changed", filterEventProperties("subject", subject, resultCount));
  trackEvent("subject_selected", filterEventProperties("subject", subject, resultCount));
}

function filterEventProperties(filterName, filterValue, resultCount) {
  return {
    filter_name: filterName,
    filter_value: filterValue,
    province: state.province,
    subject: state.subject,
    search_keyword: state.keyword,
    result_count: resultCount,
  };
}

function applySearch(track = true) {
  state.keyword = elements.searchInput.value.trim();
  resetPages();
  renderAll();
  if (track) {
    trackEvent("filter_search_clicked", {
      search_keyword: state.keyword,
      province: state.province,
      subject: state.subject,
      result_count: getAllFilteredItems().length,
    });
  }
}

function changeSectionPage(section, delta) {
  const items = getSectionItems(section);
  const totalPages = Math.max(1, Math.ceil(items.length / section.pageSize));
  const current = state.pageIndexByCategory[section.category] || 0;
  const next = Math.min(Math.max(current + delta, 0), totalPages - 1);
  if (next === current) return;
  state.pageIndexByCategory[section.category] = next;
  renderSection(section);
  trackEvent("section_page_changed", {
    year: state.year,
    category: section.category,
    page_index: next,
    page_size: section.pageSize,
    result_count: items.length,
    direction: delta > 0 ? "next" : "prev",
  });
}

function openViewAll(section) {
  state.viewAll.category = section.category;
  state.viewAll.pageIndex = 0;
  elements.viewAllModal.hidden = false;
  renderViewAllContent();
  trackEvent("section_view_all_clicked", {
    year: state.year,
    category: section.category,
    result_count: getSectionItems(section).length,
  });
}

function renderViewAllContent() {
  const section = SECTION_CONFIGS.find((entry) => entry.category === state.viewAll.category);
  if (!section) return;
  const items = getSectionItems(section);
  const totalPages = Math.max(1, Math.ceil(items.length / state.viewAll.pageSize));
  state.viewAll.pageIndex = Math.min(state.viewAll.pageIndex, totalPages - 1);
  const start = state.viewAll.pageIndex * state.viewAll.pageSize;
  const visibleItems = items.slice(start, start + state.viewAll.pageSize);
  elements.viewAllTitle.textContent = `${state.year === ALL ? "全部年份" : state.year}｜${section.category}｜共 ${items.length} 张`;
  elements.viewAllSubtitle.textContent = `当前筛选：${state.province === ALL ? "全部省份" : state.province}｜${state.subject === ALL ? "全部学科" : state.subject}`;
  elements.viewAllGrid.textContent = "";
  visibleItems.forEach((item) => elements.viewAllGrid.append(createMaterialCard(item, "card", items)));
  elements.viewAllPageIndicator.textContent = `${state.viewAll.pageIndex + 1} / ${totalPages}`;
  elements.viewAllPrev.disabled = state.viewAll.pageIndex <= 0;
  elements.viewAllNext.disabled = state.viewAll.pageIndex >= totalPages - 1;
}

function closeViewAll() {
  elements.viewAllModal.hidden = true;
  state.viewAll.category = null;
  state.viewAll.pageIndex = 0;
}

function changeViewAllPage(delta) {
  const section = SECTION_CONFIGS.find((entry) => entry.category === state.viewAll.category);
  if (!section) return;
  const items = getSectionItems(section);
  const totalPages = Math.max(1, Math.ceil(items.length / state.viewAll.pageSize));
  const next = Math.min(Math.max(state.viewAll.pageIndex + delta, 0), totalPages - 1);
  if (next === state.viewAll.pageIndex) return;
  state.viewAll.pageIndex = next;
  renderViewAllContent();
  trackEvent("section_page_changed", {
    year: state.year,
    category: section.category,
    page_index: next,
    page_size: state.viewAll.pageSize,
    result_count: items.length,
    direction: delta > 0 ? "next" : "prev",
    source: "view_all_modal",
  });
}

function openLightbox(items, index, source) {
  if (!items.length || index < 0) return;
  state.lightbox.items = items;
  state.lightbox.index = index;
  elements.lightbox.hidden = false;
  renderLightbox();
  trackEvent("image_clicked", imageProperties(items[index], source));
}

function renderLightbox() {
  const item = state.lightbox.items[state.lightbox.index];
  if (!item) return;
  elements.lightboxImage.src = item.previewUrl;
  elements.lightboxImage.alt = item.title;
  elements.lightboxTitle.textContent = item.title;
  elements.lightboxFile.textContent = item.fileName;
  elements.lightboxTags.textContent = (item.tags || []).join(" / ");
  elements.lightboxDownload.href = item.imageUrl;
  elements.lightboxDownload.download = item.fileName;
}

function closeLightbox() {
  elements.lightbox.hidden = true;
  elements.lightboxImage.removeAttribute("src");
}

function navigateLightbox(delta) {
  const items = state.lightbox.items;
  if (!items.length) return;
  state.lightbox.index = (state.lightbox.index + delta + items.length) % items.length;
  renderLightbox();
  trackEvent("image_clicked", imageProperties(items[state.lightbox.index], "lightbox_navigation"));
}

async function copyImage(item, source) {
  const props = {
    button_name: "复制图片",
    ...imageProperties(item, source),
  };
  trackEvent("image_copy_clicked", props);
  try {
    const pngBlob = await loadImageAsPngBlob(item.imageUrl);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
    showToast("已复制图片");
    trackEvent("image_copy_succeeded", { ...props, copy_type: "image_blob" });
    return;
  } catch (error) {
    try {
      await navigator.clipboard.writeText(new URL(item.imageUrl, window.location.href).href);
      showToast("已复制图片链接");
      trackEvent("image_copy_succeeded", { ...props, copy_type: "image_url" });
    } catch (fallbackError) {
      showToast("复制失败，请打开大图后右键保存");
      trackEvent("image_copy_failed", { ...props, error_message: fallbackError.message || error.message || "" });
    }
  }
}

async function loadImageAsPngBlob(imageUrl) {
  if (!navigator.clipboard || typeof navigator.clipboard.write !== "function" || !window.ClipboardItem) {
    throw new Error("当前浏览器不支持复制图片本体");
  }

  const absoluteUrl = new URL(imageUrl, window.location.href).href;
  const response = await fetch(absoluteUrl, { cache: "force-cache" });
  if (!response.ok) throw new Error(`图片加载失败：${response.status}`);
  const sourceBlob = await response.blob();
  const bitmap = await createImageBitmap(sourceBlob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("图片转换失败"));
    }, "image/png");
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function bindEvents() {
  elements.resetButton.addEventListener("click", () => {
    const previous = {
      previous_province: state.province,
      previous_subject: state.subject,
      previous_search_keyword: state.keyword,
    };
    state.province = ALL;
    state.subject = ALL;
    state.year = CURRENT_YEAR;
    state.keyword = "";
    resetPages();
    renderAll();
    trackEvent("reset_clicked", previous);
  });
  elements.provinceSelect.addEventListener("change", (event) => selectProvince(event.target.value));
  elements.yearSelect.addEventListener("change", (event) => selectYear(event.target.value));
  elements.viewAllPrev.addEventListener("click", () => changeViewAllPage(-1));
  elements.viewAllNext.addEventListener("click", () => changeViewAllPage(1));
  elements.viewAllModal.addEventListener("click", (event) => {
    if (event.target.matches("[data-close-modal]")) closeViewAll();
  });
  elements.lightboxCloseTop.addEventListener("click", closeLightbox);
  elements.lightboxCloseBottom.addEventListener("click", closeLightbox);
  elements.lightboxPrev.addEventListener("click", () => navigateLightbox(-1));
  elements.lightboxNext.addEventListener("click", () => navigateLightbox(1));
  elements.lightboxCopy.addEventListener("click", () => {
    const item = state.lightbox.items[state.lightbox.index];
    if (item) copyImage(item, "lightbox");
  });
  elements.lightboxCopyName.addEventListener("click", async () => {
    const item = state.lightbox.items[state.lightbox.index];
    if (!item) return;
    await navigator.clipboard.writeText(item.fileName);
    showToast("已复制文件名");
  });
  document.addEventListener("keydown", (event) => {
    if (!elements.lightbox.hidden) {
      if (event.key === "Escape") closeLightbox();
      if (event.key === "ArrowLeft") navigateLightbox(-1);
      if (event.key === "ArrowRight") navigateLightbox(1);
    } else if (!elements.viewAllModal.hidden && event.key === "Escape") {
      closeViewAll();
    }
  });
}

function init() {
  bindEvents();
  renderAll();
  trackEvent("tool_page_viewed", {
    total_images: MATERIALS.length,
    total_years: uniqueSorted(MATERIALS.map((item) => item.year)).length,
    total_categories: uniqueSorted(MATERIALS.map((item) => item.category)).length,
    total_subjects: uniqueSorted(MATERIALS.map((item) => item.subject)).length,
    total_provinces: uniqueSorted(MATERIALS.map((item) => item.province)).length,
  });
}

init();
