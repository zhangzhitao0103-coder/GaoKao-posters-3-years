const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT_DIR = path.resolve(__dirname, "..");
const OUTPUT_FILE = path.join(ROOT_DIR, "data.js");
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const YEARS = new Set(["2024", "2025", "2026"]);
const CATEGORIES = ["单科高分", "押题学员反馈", "提分学员", "超高分喜报", "顶尖名校", "高分学员"];
const SUBJECTS = ["语文", "数学", "英语", "物理", "化学", "生物", "政治", "历史", "地理"];
const PROVINCES = [
  "东北四省",
  "内蒙古",
  "黑龙江",
  "北京",
  "上海",
  "天津",
  "重庆",
  "广东",
  "山东",
  "浙江",
  "江苏",
  "河南",
  "河北",
  "四川",
  "湖北",
  "湖南",
  "福建",
  "云南",
  "贵州",
  "广西",
  "江西",
  "山西",
  "陕西",
  "辽宁",
  "吉林",
  "宁夏",
  "甘肃",
  "青海",
  "新疆",
  "西藏",
  "海南",
  "安徽",
  "香港",
  "澳门",
  "台湾",
  "全国"
];

const CONTENT_TYPE_MAP = {
  单科高分: "single_subject_high_score",
  押题学员反馈: "prediction_feedback",
  提分学员: "score_improvement",
  超高分喜报: "ultra_high_score",
  顶尖名校: "top_university",
  高分学员: "high_score_student"
};

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "outputs") continue;
      walk(fullPath, files);
    } else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files;
}

function cleanSegment(segment) {
  return segment.replace(/^\d{4}_/, "").trim();
}

function findKnownValue(text, values) {
  return values.find((value) => text.includes(value)) || null;
}

function findExactSegmentValue(segments, values) {
  for (const segment of segments) {
    const cleaned = cleanSegment(segment);
    if (values.includes(cleaned)) return cleaned;
  }
  return null;
}

function findProvince(segments, rawName) {
  const exactFromPath = findExactSegmentValue(segments, PROVINCES);
  if (exactFromPath) return exactFromPath;

  const exactFromName = findExactSegmentValue(rawName.split("_"), PROVINCES);
  if (exactFromName) return exactFromName;

  const nameWithoutYear = rawName.replace(/^\d{4}_/, "");
  const firstProvinceLikePart = nameWithoutYear.split("_").find((part) => PROVINCES.includes(part));
  if (firstProvinceLikePart) return firstProvinceLikePart;

  return null;
}

function getPathInfo(filePath) {
  const relativePath = path.relative(ROOT_DIR, filePath);
  const segments = relativePath.split(path.sep);
  const rawName = path.basename(filePath, path.extname(filePath));
  const compact = [...segments, rawName].join("_");
  const categorySegment = segments.find((segment) => CATEGORIES.includes(cleanSegment(segment)));
  const category = categorySegment ? cleanSegment(categorySegment) : null;
  const yearFromCategory = categorySegment && categorySegment.match(/^(20\d{2})_/);
  const yearFromPath = segments.find((segment) => YEARS.has(segment) || /^20\d{2}$/.test(segment));
  const yearFromName = rawName.match(/^(20\d{2})_/);
  const year = (yearFromCategory && yearFromCategory[1]) || (yearFromName && yearFromName[1]) || yearFromPath || null;
  const subject = findKnownValue(compact, SUBJECTS);
  const province = findProvince(segments, rawName);

  return { relativePath, segments, rawName, category, year, subject, province };
}

function numberAfter(pattern, text) {
  const match = text.match(pattern);
  return match ? Number.parseFloat(match[1]) : null;
}

function extractScore(rawName, subject, category) {
  if (!["单科高分", "高分学员"].includes(category)) return null;
  if (subject) {
    const subjectScore = numberAfter(new RegExp(`${subject}(\\d+(?:\\.\\d+)?)`), rawName.replace(/^\d{4}_/, ""));
    if (subjectScore !== null) return subjectScore;
  }
  const parts = rawName.replace(/^\d{4}_/, "").split("_");
  const numericPart = parts.find((part) => /^\d+(?:\.\d+)?$/.test(part) && !/^20\d{2}$/.test(part));
  return numericPart ? Number.parseFloat(numericPart) : null;
}

function extractTotalScore(rawName, category) {
  const cleanName = rawName.replace(/^\d{4}_/, "");
  const explicit = numberAfter(/总分(\d+(?:\.\d+)?)/, cleanName);
  if (explicit !== null) return explicit;
  if (!["超高分喜报", "高分学员"].includes(category)) return null;
  const parts = cleanName.split("_");
  const numericParts = parts.filter((part) => /^\d+(?:\.\d+)?$/.test(part) && !/^20\d{2}$/.test(part)).map(Number.parseFloat);
  if (category === "超高分喜报" && numericParts.length) return numericParts[0];
  return numericParts.find((value) => value >= 450) || null;
}

function extractSchool(rawName, category) {
  if (category !== "顶尖名校") return null;
  const parts = rawName.split("_").map(cleanSegment).filter(Boolean);
  const school = parts.find((part) => /(大学|学院|清华|北大|港大|人大|复旦|交大|浙大)/.test(part));
  return school || null;
}

function extractStudentName(rawName, category, province, subject, school, score, totalScore) {
  const parts = rawName.split("_").map(cleanSegment).filter(Boolean);
  const ignored = new Set(["2024", "2025", "2026", category, province, subject, school, String(score), String(totalScore)].filter(Boolean));
  if (category === "高分学员" && /总分/.test(rawName)) return null;
  if (category === "提分学员") return null;
  const candidate = [...parts].reverse().find((part) => {
    if (ignored.has(part)) return false;
    if (/^\d+(?:\.\d+)?$/.test(part)) return false;
    if (/总分|提升|到|从|逆袭|押题|反馈|高分|喜报/.test(part)) return false;
    return part.length <= 8;
  });
  return candidate || null;
}

function extractImprovement(rawName) {
  const direct = numberAfter(/提升(?:近|约)?(\d+(?:\.\d+)?)分/, rawName);
  if (direct !== null) return direct;
  const range = rawName.match(/(\d+(?:\.\d+)?)\+?到(\d+(?:\.\d+)?)/);
  if (!range) return null;
  return Number.parseFloat(range[2]) - Number.parseFloat(range[1]);
}

function feedbackIndex(rawName) {
  const match = rawName.match(/_(\d+)(?:\.[^.]+)?$/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function buildTitle(item) {
  if (item.category === "单科高分") {
    const name = item.studentName || item.province || item.subject || item.rawName;
    return [name, item.province, `${item.subject || ""}${item.score ? `${item.score}分` : ""}`].filter(Boolean).join("｜");
  }
  if (item.category === "高分学员") {
    const scoreText = [item.subject && item.score ? `${item.subject}${item.score}` : null, item.totalScore ? `总分${item.totalScore}` : null].filter(Boolean).join("｜");
    return [item.studentName || item.province, scoreText].filter(Boolean).join("｜") || item.rawName;
  }
  if (item.category === "超高分喜报") {
    return [item.studentName, item.province, item.totalScore ? `${item.totalScore}分` : null].filter(Boolean).join("｜") || item.rawName;
  }
  if (item.category === "顶尖名校") {
    return [item.studentName, item.province, item.school].filter(Boolean).join("｜") || item.rawName;
  }
  if (item.category === "提分学员") {
    const clean = item.rawName.replace(/^\d{4}_/, "").split("_").slice(2).join("_") || item.rawName;
    return [item.province, clean].filter(Boolean).join("｜");
  }
  if (item.category === "押题学员反馈") {
    return [item.province, `${item.subject || ""}押题反馈${item.feedbackIndex || ""}`].filter(Boolean).join("｜");
  }
  return item.rawName;
}

function urlFromRelativePath(relativePath) {
  return `./${relativePath.split(path.sep).map(encodeURIComponent).join("/")}`;
}

function parseMaterial(filePath, index) {
  const info = getPathInfo(filePath);
  if (!info.year || !info.category) return null;

  const score = extractScore(info.rawName, info.subject, info.category);
  const totalScore = extractTotalScore(info.rawName, info.category);
  const school = extractSchool(info.rawName, info.category);
  const studentName = extractStudentName(info.rawName, info.category, info.province, info.subject, school, score, totalScore);
  const improvementScore = extractImprovement(info.rawName);
  const currentFeedbackIndex = feedbackIndex(info.rawName);
  const sourcePath = urlFromRelativePath(info.relativePath);
  const id = crypto.createHash("md5").update(info.relativePath).digest("hex").slice(0, 12);

  const item = {
    id: `${info.year}-${id}`,
    year: info.year,
    category: info.category,
    content_type: CONTENT_TYPE_MAP[info.category],
    subject: info.subject,
    province: info.province,
    score,
    totalScore,
    school,
    studentName,
    title: "",
    fileName: path.basename(filePath),
    rawName: info.rawName,
    sourcePath,
    thumbUrl: sourcePath,
    previewUrl: sourcePath,
    imageUrl: sourcePath,
    tags: [],
    searchableText: "",
    improvementScore,
    feedbackIndex: currentFeedbackIndex,
    sortIndex: index
  };

  item.title = buildTitle(item);
  item.tags = [
    item.year,
    item.category,
    item.subject,
    item.province,
    item.school,
    item.studentName,
    item.score ? `${item.score}分` : null,
    item.totalScore ? `总分${item.totalScore}` : null,
    improvementScore ? `提升${improvementScore}分` : null,
    /个位数|逆袭/.test(item.rawName) ? "低分逆袭" : null
  ].filter(Boolean);
  item.searchableText = [
    item.title,
    item.fileName,
    item.rawName,
    item.year,
    item.category,
    item.subject,
    item.province,
    item.school,
    item.studentName,
    item.score,
    item.totalScore,
    ...item.tags
  ].filter(Boolean).join(" ");

  return item;
}

function main() {
  const imageFiles = walk(ROOT_DIR).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  const materials = imageFiles.map(parseMaterial).filter(Boolean);
  const output = [
    "/* Auto-generated by scripts/scan-materials.js. Do not edit data by hand. */",
    `window.MATERIALS = ${JSON.stringify(materials, null, 2)};`,
    ""
  ].join("\n");

  fs.writeFileSync(OUTPUT_FILE, output, "utf8");
  const byCategory = CATEGORIES.map((category) => `${category}: ${materials.filter((item) => item.category === category).length}`).join(" | ");
  console.log(`Generated data.js with ${materials.length} materials.`);
  console.log(byCategory);
}

main();
