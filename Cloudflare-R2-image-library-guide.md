# Cloudflare R2 图片素材库复用指南

本文档沉淀“有道领世高考喜报素材库”项目的上线流程，后续做新的图片素材筛选网页时可以复用。重点记录这次实际踩过的坑：R2 独立管理、`.env.r2` 获取、全量/增量构建、Cloudflare Pages 与 Workers 的区别、R2 CORS、文件命名修正、以及不要把 `node_modules` 当静态资源部署。

当前项目线上 Pages 地址：

```text
https://gaokao-posters-3-years.pages.dev/
```

当前项目 R2 public base URL：

```text
https://pub-ceb3a66b5d2b48a1b9138364de4f3495.r2.dev
```

后续新项目要替换为自己的 Pages 域名和 R2 public URL。

## 1. 推荐架构

```text
GitHub
  只放网页代码、数据索引、构建脚本、说明文档

Cloudflare Pages
  托管静态网页，生成国内更容易打开的 pages.dev 链接

Cloudflare R2
  托管大量图片素材，网页通过 R2 URL 加载缩略图、预览图、原图

data.js
  保存筛选字段和图片 URL，是前端筛选、分页、灯箱、复制图片的核心数据源
```

不要把大量图片、zip、`node_modules`、`outputs` 放进 GitHub 或 Cloudflare Pages。GitHub/Pages 只适合代码和轻量数据，图片统一放 R2。

## 2. 新项目初始化清单

建议每个独立素材库都新建：

```text
1. 一个独立 GitHub 仓库
2. 一个独立 Cloudflare Pages 项目
3. 一个独立 R2 bucket
4. 一个只绑定该 bucket 的 R2 API Token
5. 一个本地 .env.r2 文件
```

不要多个项目共用同一个 R2 bucket，后期容易出现素材混在一起、误覆盖、误删除、CORS 域名难维护等问题。

## 3. R2 Bucket 创建

Cloudflare 控制台路径：

```text
Storage & databases
R2 Object Storage
Create bucket
```

建议 bucket 名使用项目名，例如：

```text
gaokao-posters-3-years
```

创建后进入该 bucket 的 `Settings`，开启：

```text
Public Development URL
```

记下生成的公开访问地址，例如：

```text
https://pub-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.r2.dev
```

这个值要写进 `.env.r2` 的 `R2_PUBLIC_BASE_URL`。

## 4. Account ID 在哪里找

Cloudflare Account ID 可以从这几个位置找到：

```text
Cloudflare 首页
选择你的账号
右侧或页面下方 Account details
Account ID
```

也可以进入任意 R2 bucket 后，在页面右侧或 API 相关说明里找到 Account ID。最终写入：

```text
CLOUDFLARE_ACCOUNT_ID=你的 Cloudflare Account ID
```

注意：Account ID 不是 bucket 名，也不是 token 名。

## 5. R2 API Token 创建

进入 R2 的 API Token 页面，选择：

```text
Create Account API token
```

推荐配置：

```text
Token name:
项目名-uploader

Permission:
Object Read & Write

Bucket scope:
Apply to specific buckets
只选择当前项目的 bucket
```

创建后保存：

```text
Access Key ID
Secret Access Key
Endpoint / Account ID
```

Secret Access Key 只显示一次，务必保存到本地 `.env.r2`，不要发截图、不要提交 GitHub。

## 6. .env.r2 应该放哪里

`.env.r2` 放在项目根目录，例如本项目：

```text
D:\销售转化策略\三年-高考喜报\.env.r2
```

示例：

```text
CLOUDFLARE_ACCOUNT_ID=你的_account_id
R2_BUCKET=你的_bucket_name
R2_ACCESS_KEY_ID=你的_access_key_id
R2_SECRET_ACCESS_KEY=你的_secret_access_key
R2_PUBLIC_BASE_URL=https://pub-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.r2.dev
```

`.env.r2` 只在本地使用，必须被 `.gitignore` 忽略。仓库里只保留 `.env.r2.example`。

本项目 `.gitignore` 至少应包含：

```text
2024/
2025/
2026/
node_modules/
.env
.env.*
!.env.r2.example
outputs/
dist/
*.zip
*.7z
```

## 7. R2 图片分层规则

每张源图会生成三类 R2 对象：

```text
thumbs/      列表缩略图，前端卡片使用
previews/    灯箱预览图，打开大图时使用
originals/   原图，复制图片、下载原图时使用
```

前端加载规则：

```text
卡片列表：thumbUrl
灯箱预览：previewUrl
下载/复制高清图：imageUrl
```

不要按省份、学科、老师在 R2 里建复杂目录。筛选信息由 `data.js` 管理，R2 只负责存图片对象。

## 8. 源图片命名规则

源图片目录是唯一真实来源。后续修正省份、学科、试卷类型时，优先改源图片文件名，然后重新扫描生成 `data.js`。

本项目押题反馈推荐命名：

```text
2026_数学_安徽_圆锥曲线_1.png
2024_英语_新高考1卷_1.jpg
2026_物理_黑吉辽蒙_1.png
2025_数学_新高考2卷_4.jpg
```

前端标题展示会转成类似：

```text
26｜数学｜安徽｜圆锥曲线
24｜英语｜新高考1卷
```

命名注意：

```text
1. 尽量包含年份、学科、省份或试卷类型、主题、编号
2. 同目录重名时直接改末尾编号
3. 不要手动改 data.js，应该改文件名后运行脚本
4. 如果图片实际标注了省份，不要写“未知省份”
5. 不确定省份但确定试卷类型时，文件名写试卷类型
```

## 9. 试卷类型到省份的映射经验

押题反馈里很多图片不是直接写省份，而是写试卷类型。为了避免大量“未知省份”，前端筛选应支持试卷类型映射。

本项目已经沉淀的规则：

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

筛选排序建议：

```text
选中“山东”时：
1. 文件名或数据省份直接包含“山东”的图片排前面
2. 文件名包含“新高考一卷”的图片排后面
3. 只有既不含省份、也不含任何试卷类型时，才算未知省份
```

这是本项目修正“未知省份”问题最关键的一条经验。

## 10. 常用命令在哪里运行

所有命令都在项目根目录运行。本项目根目录是：

```powershell
cd "D:\销售转化策略\三年-高考喜报"
```

Windows 下建议使用 PowerShell，命令用 `npm.cmd`：

```powershell
npm.cmd install
npm.cmd run scan
npm.cmd run build:r2-assets
npm.cmd run upload:r2-assets
npm.cmd run build
```

注意：不要在 `scripts` 目录、图片目录、`dist` 目录里运行这些命令。

## 11. 首次全量上线流程

首次上线或大量图片变化时，走全量流程：

```powershell
npm.cmd install
npm.cmd run scan
npm.cmd run build:r2-assets
npm.cmd run upload:r2-assets
Copy-Item outputs\r2-assets\data.r2.js data.js
npm.cmd run build
```

含义：

```text
npm.cmd run scan
  扫描本地源图片，生成本地版 data.js

npm.cmd run build:r2-assets
  根据 data.js 生成 thumbs/previews/originals 和 R2 版 data.r2.js

npm.cmd run upload:r2-assets
  根据 outputs/r2-assets/upload-manifest.json 上传 R2

Copy-Item outputs\r2-assets\data.r2.js data.js
  确认 R2 上传成功后，用 R2 URL 版数据覆盖前端 data.js

npm.cmd run build
  生成 dist，验证静态站点可构建
```

首次全量构建图片很多时可能耗时较长。本项目 8000+ 素材会生成 2 万多个 R2 对象，时间可能按几十分钟计算，取决于电脑性能和网络。

## 12. 少量图片改名/新增的增量流程

如果只修改少量图片名称，比如本项目后期只修正了 21 张押题反馈文件名，不要全量重建。

推荐流程：

```powershell
npm.cmd run scan
node scripts\build-r2-incremental.js
$env:R2_UPLOAD_MANIFEST="outputs\r2-incremental\upload-manifest.json"
npm.cmd run upload:r2-assets
Copy-Item outputs\r2-incremental\data.r2.js data.js
npm.cmd run build
```

增量脚本逻辑：

```text
1. 当前 data.js 与 git HEAD:data.js 对比
2. sourcePath 没变的素材复用旧 R2 URL
3. sourcePath 新增或改名的素材才重新生成 thumb/preview/original
4. 只上传 outputs/r2-incremental/upload-manifest.json 里的文件
```

本项目实际结果示例：

```text
Reused 8236 existing materials.
Generated 20 changed materials.
Upload files: 60.
```

也就是说，改 20 张图只需要上传 60 个对象，不需要重传全部 8256 张素材。

## 13. 上传中断怎么办

上传 R2 时如果 PowerShell 中断，不要慌，先看上传脚本输出。

脚本支持：

```text
R2_UPLOAD_CONCURRENCY   上传并发，默认 4
R2_UPLOAD_START_INDEX   从 manifest 的第几个文件继续
R2_UPLOAD_MANIFEST      指定上传哪个 manifest
R2_FORCE_UPLOAD=1       强制覆盖已存在对象
```

常用续传方式：

```powershell
$env:R2_UPLOAD_START_INDEX="已处理到的序号"
npm.cmd run upload:r2-assets
```

如果是增量上传：

```powershell
$env:R2_UPLOAD_MANIFEST="outputs\r2-incremental\upload-manifest.json"
npm.cmd run upload:r2-assets
```

如果脚本显示大量 skipped，说明 R2 已有对象，通常是正常的。

## 14. 上传后必须做的验证

每次上线前至少验证：

```powershell
npm.cmd run build
```

也可以用 Node 检查数据：

```powershell
node -e "const fs=require('fs');const vm=require('vm');const ctx={window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('data.js','utf8'),ctx);const m=ctx.window.MATERIALS;const bad=m.flatMap(x=>[x.thumbUrl,x.previewUrl,x.imageUrl]).filter(Boolean).filter(u=>!u.startsWith('https://pub-')).length;const unknown=m.filter(x=>x.category==='押题学员反馈'&&x.province==='未知省份').length;console.log({total:m.length,bad,unknown});"
```

检查目标：

```text
1. data.js 可以解析
2. total 数量符合预期
3. thumbUrl / previewUrl / imageUrl 都是 R2 URL
4. 押题反馈未知省份数量符合预期，最好为 0
5. npm.cmd run build 成功
6. git diff 不包含源图片、zip、node_modules、outputs、.env.r2
```

## 15. Cloudflare Pages 部署设置

国内访问优先使用 Cloudflare Pages 链接，不要把最终链接发成 Workers 链接。

Pages 推荐设置：

```text
Framework preset: None
Build command: npm run build
Build output directory: dist
Production branch: main
```

部署成功后最终访问：

```text
https://项目名.pages.dev/
```

本项目是：

```text
https://gaokao-posters-3-years.pages.dev/
```

## 16. Workers 误部署的坑

本项目一开始拿到过 Workers 链接：

```text
https://gaokao-posters-3-years.zhangzhitao0103.workers.dev/
```

但国内网络不适合依赖 workers.dev，最终应使用 Pages。

如果 Cloudflare 构建日志出现：

```text
Executing user deploy command: npx wrangler deploy
Detected Project Settings:
Output Directory: .
Asset too large.
node_modules/workerd/bin/workerd with a size of 122 MiB
```

原因通常是：

```text
1. 把项目根目录 "." 当成静态资源目录部署
2. node_modules 被当作静态资源上传
3. 使用了 Workers deploy，而不是 Pages 静态站点部署
```

正确处理：

```text
1. Pages 项目 Build command 设置为 npm run build
2. Build output directory 设置为 dist
3. 不要把 Output Directory 设置成 .
4. 不要在 Pages deploy command 里写 npx wrangler deploy
5. 确保 node_modules、outputs、图片源目录、zip 被 .gitignore 忽略
```

如果日志出现：

```text
sh: 1: wrangler: not found
```

说明 deploy 脚本依赖本地 wrangler，但 Cloudflare 构建环境没有全局 wrangler。Pages 静态站点不需要 wrangler deploy，直接用 Pages 的 `npm run build + dist` 即可。

## 17. R2 CORS 配置

如果网页只显示图片，通常不需要 CORS。但本项目有“复制图片”功能，前端需要 `fetch()` R2 图片，因此必须配置 CORS。

Cloudflare 路径：

```text
R2 Object Storage
目标 bucket
Settings
CORS Policy
```

示例：

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

如果本地也要测试复制图片，可以临时加入：

```text
http://127.0.0.1:8088
http://localhost:8088
```

上线后至少保留正式 Pages 域名。

## 18. PostHog 项目 token 和 API Host

如果项目需要埋点：

```text
PostHog 控制台
选择对应 Project
Settings
Project settings
Project API key / Project token
```

API Host 看项目所在区域：

```text
US Cloud:
https://us.i.posthog.com

EU Cloud:
https://eu.i.posthog.com
```

前端只应该使用 Project token，不要把 Personal API Key 或 Secret 暴露到网页。

## 19. GitHub 提交前检查

允许提交：

```text
index.html
styles.css
app.js
data.js
package.json
package-lock.json
scripts/
README / md 文档
.env.r2.example
```

禁止提交：

```text
源图片目录，如 2024/ 2025/ 2026/
outputs/
dist/
node_modules/
.env.r2
zip / 7z 压缩包
```

提交前运行：

```powershell
git status --short
npm.cmd run build
```

如果看到 `.env.r2`、`node_modules`、`outputs`、图片源目录或 zip 出现在 `git status` 里，先修 `.gitignore`，不要提交。

## 20. 后续项目可复用提示词

以后做类似项目，可以直接对 Codex 说：

```text
请按 Cloudflare-R2-image-library-guide.md 的流程，为这个新素材库搭建 Cloudflare Pages + R2 图片素材筛选网页。

要求：
1. 源图片只保留本地，不提交 GitHub
2. 新建独立 R2 bucket 和独立 R2 API Token
3. 用 .env.r2 保存 R2 配置
4. 图片生成 thumbs/previews/originals 三层
5. data.js 使用 R2 URL
6. Pages 使用 npm run build，输出 dist
7. 不使用 Workers 链接作为最终访问链接
8. 如果只改少量图片名，必须走增量流程，不要全量重建
9. 上线前验证 R2 URL、筛选数量、未知省份数量、构建结果
```

如果是只改少量素材：

```text
我只修改了少量源图片命名，请按增量流程处理：
1. npm.cmd run scan
2. node scripts\build-r2-incremental.js
3. 只上传 outputs\r2-incremental\upload-manifest.json
4. 用 outputs\r2-incremental\data.r2.js 覆盖 data.js
5. 验证后再提交推送
禁止全量重建和全量上传。
```

## 21. 安全提醒

```text
1. 不要把 R2 Secret Access Key 发到聊天、截图或 GitHub
2. 如果密钥外泄，立即删除 token 并重新创建
3. .env.r2 必须在 .gitignore 中
4. 公开 R2 bucket 只适合公开销售素材，不适合隐私或敏感资料
5. Pages 链接、R2 public URL 可以公开；R2 Secret 不可以公开
```
