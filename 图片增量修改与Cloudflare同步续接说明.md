# 图片增量修改与 Cloudflare 同步续接说明

本文档用于在新对话框继续维护“有道领世高考喜报素材库”项目。后续如果只对少量图片做命名修改、增删、替换，不要全量重建 R2 图片资源，优先走本文档的增量流程。

## 1. 当前项目基本信息

本地项目目录：

```text
D:\销售转化策略\三年-高考喜报
```

GitHub 仓库：

```text
https://github.com/zhangzhitao0103-coder/GaoKao-posters-3-years
```

Cloudflare Pages 正式网页：

```text
https://gaokao-posters-3-years.pages.dev/
```

当前 R2 public base URL：

```text
https://pub-ceb3a66b5d2b48a1b9138364de4f3495.r2.dev
```

本地 R2 配置文件：

```text
.env.r2
```

注意：`.env.r2` 不提交 GitHub，只在本地使用。

## 2. 后续新对话开场建议

新对话可以直接发送：

```text
请先读取：
1. 图片增量修改与Cloudflare同步续接说明.md
2. Cloudflare-R2-image-library-guide.md

我接下来会修改或增删少量源图片，请严格按增量流程处理，不要全量重建 R2 图片资源。
```

如果已经明确改了哪些图片，可以继续补充：

```text
我本次只修改了以下图片命名/新增/删除：
- ...

请只处理这些改动相关的增量内容，并同步更新 data.js、R2、GitHub 和 Cloudflare Pages。
```

## 3. 核心原则

后续维护时遵守：

```text
1. 源图片目录是唯一真实来源
2. 不手动编辑 data.js 里的单条素材
3. 改图片信息时，优先改源图片文件名
4. 少量改名、新增、替换时走增量流程
5. 不要重新上传全部 8256 张素材
6. data.js 最终必须使用 R2 URL，不要停留在本地 ./2024/ 路径
7. GitHub 只提交代码、脚本、data.js、文档，不提交源图片、outputs、dist、node_modules、.env.r2
8. Cloudflare Pages 会在推送 GitHub main 后自动部署
```

## 4. 源图片目录

当前源图片目录：

```text
2024/
2025/
2026/
```

这些目录已被 `.gitignore` 忽略，不会提交到 GitHub。

后续修改图片时，直接在这些本地目录里改文件名、添加图片或删除图片。

## 5. 文件命名建议

押题学员反馈建议命名：

```text
2026_数学_安徽_圆锥曲线_1.png
2024_英语_新高考1卷_1.jpg
2025_数学_新高考2卷_4.jpg
2026_物理_黑吉辽蒙_1.png
```

标题展示会转成类似：

```text
26｜数学｜安徽｜圆锥曲线
24｜英语｜新高考1卷
```

命名注意：

```text
1. 尽量包含年份、学科、省份或试卷类型、主题、编号
2. 出现重名时，直接调整末尾编号
3. 如果图片里明确标了省份，文件名里也写省份
4. 如果图片没写省份但写了试卷类型，文件名里写试卷类型
5. 不确定省份且无试卷类型，才保留未知省份
```

## 6. 已沉淀的试卷类型映射

当前前端已支持这些押题反馈映射：

```text
新高考一卷：
山东、浙江、江苏、广东、湖南、湖北、福建、河北、安徽、江西、河南

新高考二卷：
海南、重庆、辽宁、黑龙江、吉林、甘肃、贵州、广西、云南、山西、四川、陕西、内蒙古、青海、宁夏

陕晋青宁 / 陕西卷：
山西、宁夏、青海、陕西

黑吉辽蒙 / 黑吉辽 / 辽宁卷：
内蒙古、吉林、黑龙江、辽宁

新课标 / 老高考：
新疆、西藏

西北卷：
陕西、山西、青海、宁夏

全国甲卷：
新疆、西藏
```

筛选逻辑：

```text
选中某省份时：
1. 文件名或数据省份直接包含该省份的图片排前
2. 文件名包含该省份所属试卷类型的图片排后
3. 不含任何省份且不含任何试卷类型，才视为未知省份
```

## 7. 少量改名/新增/替换的增量流程

在项目根目录运行：

```powershell
cd "D:\销售转化策略\三年-高考喜报"
```

然后执行：

```powershell
npm.cmd run scan
node scripts\build-r2-incremental.js
$env:R2_UPLOAD_MANIFEST="outputs\r2-incremental\upload-manifest.json"
npm.cmd run upload:r2-assets
Copy-Item outputs\r2-incremental\data.r2.js data.js
npm.cmd run build
```

每一步含义：

```text
npm.cmd run scan
  重新扫描本地源图片，生成本地路径版 data.js

node scripts\build-r2-incremental.js
  对比当前 data.js 和 git HEAD:data.js
  复用没变素材的旧 R2 URL
  只为新增或改名素材生成 R2 图片资源

$env:R2_UPLOAD_MANIFEST=...
  指定本次只上传增量 manifest

npm.cmd run upload:r2-assets
  只上传增量生成的 thumbs/previews/originals

Copy-Item outputs\r2-incremental\data.r2.js data.js
  用带 R2 URL 的增量版数据覆盖 data.js

npm.cmd run build
  验证静态站点可构建
```

重点：`npm.cmd run scan` 后的 `data.js` 是本地路径版，不能直接提交。必须用 `outputs\r2-incremental\data.r2.js` 覆盖后再提交。

## 8. 删除图片时如何处理

如果只是从素材库移除少量图片：

```text
1. 删除或移走本地源图片
2. npm.cmd run scan
3. node scripts\build-r2-incremental.js
4. Copy-Item outputs\r2-incremental\data.r2.js data.js
5. npm.cmd run build
6. 验证页面不再引用该图片
```

删除图片通常不需要立刻删除 R2 旧对象。推荐策略：

```text
data.js 先移除引用，R2 旧对象暂时保留
```

原因：

```text
1. 防止误删线上仍在用的图片
2. R2 早期存储空间足够
3. 等页面验证无误后，再单独做 R2 未引用对象清理
```

## 9. 上传中断或很慢怎么办

如果 PowerShell 中断，先不要回滚，查看已经上传了多少。

上传脚本支持：

```text
R2_UPLOAD_MANIFEST      指定上传 manifest
R2_UPLOAD_CONCURRENCY   上传并发，默认 4
R2_UPLOAD_START_INDEX   从 manifest 的某个序号继续
R2_FORCE_UPLOAD=1       强制覆盖已存在对象
```

增量上传续传示例：

```powershell
$env:R2_UPLOAD_MANIFEST="outputs\r2-incremental\upload-manifest.json"
$env:R2_UPLOAD_START_INDEX="已处理到的序号"
npm.cmd run upload:r2-assets
```

如果日志显示大量 `skipped`，通常说明 R2 已有对象，不是错误。

## 10. 必须做的验证

每次增量处理完成后，至少验证：

```powershell
npm.cmd run build
```

验证 `data.js` 是否仍全部指向 R2：

```powershell
node -e "const fs=require('fs');const vm=require('vm');const ctx={window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('data.js','utf8'),ctx);const m=ctx.window.MATERIALS;const bad=m.flatMap(x=>[x.thumbUrl,x.previewUrl,x.imageUrl]).filter(Boolean).filter(u=>!String(u).startsWith('https://pub-ceb3a66b5d2b48a1b9138364de4f3495.r2.dev/')).length;const unknown=m.filter(x=>x.category==='押题学员反馈'&&x.province==='未知省份').length;console.log({total:m.length,bad,unknown});"
```

正常目标：

```text
bad: 0
unknown: 按预期，当前最好为 0
```

还要检查：

```powershell
git status --short
```

不要出现：

```text
.env.r2
node_modules/
outputs/
dist/
2024/
2025/
2026/
*.zip
*.7z
```

## 11. 提交和同步 Cloudflare Pages

确认验证通过后：

```powershell
git add app.js data.js styles.css scripts Cloudflare-R2-image-library-guide.md 图片增量修改与Cloudflare同步续接说明.md
git status --short
git commit -m "更新素材数据"
git push origin main
```

如果只改了 `data.js`，就只提交 `data.js`。

推送到 GitHub 后，Cloudflare Pages 会自动重新部署：

```text
https://gaokao-posters-3-years.pages.dev/
```

不要把 Workers 链接作为最终链接。

## 12. Cloudflare Pages 设置提醒

Pages 应使用：

```text
Build command: npm run build
Build output directory: dist
Production branch: main
```

不要使用：

```text
Output directory: .
npx wrangler deploy
```

否则可能把 `node_modules` 当静态资源上传，出现类似错误：

```text
Asset too large.
node_modules/workerd/bin/workerd with a size of 122 MiB
```

## 13. R2 CORS 提醒

如果复制图片功能失效，检查 R2 bucket 的 CORS 是否包含 Pages 域名：

```json
[
  {
    "AllowedOrigins": [
      "https://gaokao-posters-3-years.pages.dev"
    ],
    "AllowedMethods": [
      "GET",
      "HEAD"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [
      "Content-Length",
      "Content-Type",
      "ETag"
    ],
    "MaxAgeSeconds": 86400
  }
]
```

本地测试可临时加入：

```text
http://127.0.0.1:8088
http://localhost:8088
```

## 14. 新对话让 Codex 执行时的标准口径

推荐直接复制：

```text
请读取“图片增量修改与Cloudflare同步续接说明.md”，然后按其中的增量流程处理。

我本次只做了少量图片命名/新增/删除，不要全量重建 R2。

请完成：
1. 扫描源图片
2. 生成增量 R2 资源
3. 只上传增量 manifest
4. 用增量 data.r2.js 覆盖 data.js
5. 验证 data.js 全部是 R2 URL
6. 验证未知省份数量
7. npm.cmd run build
8. 提交并推送 GitHub，触发 Cloudflare Pages 自动部署
```

如果还没决定是否提交，可以把最后一条改成：

```text
先不要提交 GitHub，等我确认后再提交。
```

## 15. 重要风险提醒

```text
1. npm.cmd run scan 会把 data.js 变成本地图片路径版
2. 本地路径版 data.js 不能提交，否则 Pages 无法访问被忽略的源图片目录
3. 增量流程必须用 outputs\r2-incremental\data.r2.js 覆盖 data.js
4. 少量改名不要运行全量 build:r2-assets，除非明确需要
5. 不要泄露 .env.r2 和 R2 Secret Access Key
6. 推送 GitHub 前一定看 git status --short
```
