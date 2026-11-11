# 31 省优秀学员荣耀榜（海报 + 视频）

按省份汇总近三年高考喜报和日常提分学员，每个省批量生成：

- **长海报**：宽 1242px，竖版，右下角留二维码位（"扫码查看 视频介绍"）
- **竖版视频**：1080×1920 / 30fps / 约 70–90 秒，片头是省份地图，结尾是品牌 slogan + logo，中间穿插学员原声片段

## 目录

| 路径 | 内容 |
|---|---|
| `scripts/build-data.js` | 数据清洗：读取喜报库、提分案例库、学霸视频库，输出 `data/provinces/<省>.json` |
| `scripts/export-excel.py` | 导出《31省优秀学员信息汇总.xlsx》（含原始姓名，仅限内部使用） |
| `scripts/lib/select.js` | 选取海报和视频上展示的亮点名单（海报、视频共用） |
| `scripts/render-poster.js` + `templates/poster.css` | 海报渲染 |
| `templates/video-stage.js` + `templates/video.css` | 视频动画舞台（GSAP 时间轴，可逐帧渲染） |
| `scripts/render-video.js` | 视频渲染：逐帧截图 → ffmpeg → 配乐 → 叠加学员原声 |
| `scripts/make-music.py` | 原创配乐合成（按场景节点卡点，原声段落自动压低音乐，无版权风险） |
| `scripts/transcribe.py` | 学员视频语音转文字，用于挑选"提分/感谢"精彩片段 |
| `data/province-meta.json` | 各省片头文案：标语、主要城市、地标、高校 |
| `data/clips.json` | 各省视频中使用的学员原声片段（视频 id、起点、时长、字幕说明） |
| `assets/` | 品牌 logo、省份地图数据（阿里云 DataV 行政区划） |

## 使用

```bash
cd province-showcase
npm install
pip install faster-whisper scipy openpyxl
```

```bash
python3 scripts/import-extra.py           # 可选：导入 data/extra/ 下的三张补充表（不入库）
npm run data                               # 清洗数据 + 导出 Excel
node scripts/render-poster.js 河北          # 生成海报 → output/posters/河北.jpg
node scripts/render-video.js 河北 --preview # 只截关键帧，检查版式
node scripts/render-video.js 河北           # 生成视频 → output/videos/河北.mp4
```

新增一个省份时：

1. 在 `data/province-meta.json` 补充该省的标语、城市、地标和高校；
2. 下载地图 `assets/geo/<adcode>_full.json`（来源 `https://geo.datav.aliyun.com/areas_v3/bound/<adcode>_full.json`）；
3. 下载该省学员视频到 `cache/clips/`，运行 `scripts/transcribe.py` 转文字，挑选片段写入 `data/clips.json`。

## 展示规则

- 姓名统一打码为"首字 + * + 末字"；已经是"X同学"的保留原样
- 同一学员跨类别只出现一次，按 状元 > 名校 > 总分高分 > 单科高分 取最高一档，低档成绩合并显示为"单科亮点"
- 城市状元如实标注为"XX市状元"
- "押题学员反馈"不纳入；未标注省份的日常提分案例无法归属，不纳入
- 某类为 0 时自动隐藏该板块；超出上限的写"…… 等 N 位学员"

## 补充表

`data/extra/` 下放三张人工/OCR 整理的补充表（含学员姓名，不入库）：

- `高考喜报学员档案.xlsx`：按记录 ID 补充省排名、单科成绩、总分、姓名
- `日常提分学员.xlsx`：按学科 + 起止分补充日常案例的省份、学员姓名
- `学霸视频学员.xlsx`：按省份 + 姓氏 + 总分补充视频学员的单科成绩、成绩变化

先运行 `python3 scripts/import-extra.py` 生成 `data/extra/extra.json`，再运行 `npm run data` 合并。合并条数写在 `data/extra/merge-report.json`。
