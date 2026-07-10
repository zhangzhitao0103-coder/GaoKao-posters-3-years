# Cloudflare R2 图片素材筛选网页制作流程

本文档用于复用当前项目经验，制作新的“销售素材筛选展示网页”。适用场景：有上千张图片，需要销售按学科、省份、老师、分数段、类型等条件筛选、预览、复制或下载。

## 1. 推荐架构

```text
GitHub
  只放前端代码、数据索引、脚本

Cloudflare Pages
  托管静态网页

Cloudflare R2
  托管图片素材

前端 data.js / materials.json
  保存筛选字段和图片 URL
```

不要把大量图片直接放进 GitHub 或 Cloudflare Pages。GitHub 和 Pages 只适合放代码、HTML、CSS、JS、JSON 等轻量文件。图片统一放 R2。

## 2. R2 图片分层规则

每张图片生成三类文件：

```text
thumb：列表缩略图，建议 200KB 以内
preview：弹窗预览图，建议 500KB-1MB
original：高清原图，用于下载或高清查看
```

R2 bucket 中推荐目录结构：

```text
score-improve-cases/
├─ thumbs/
├─ previews/
└─ originals/
```

新项目也建议沿用这个结构。不要按老师、学科、省份建复杂 R2 目录，因为筛选信息应由数据索引管理，R2 只负责存图片。

## 3. Cloudflare R2 配置步骤

1. 进入 Cloudflare 控制台。
2. 打开 `Storage & databases`。
3. 选择 `R2 Object Storage`。
4. 点击 `Create bucket`。
5. Bucket 名称建议使用项目名，例如：

```text
score-improve-cases
```

6. Storage class 选择：

```text
Standard
```

7. 创建后进入 bucket 的 `Settings`。
8. 开启 `Public Development URL`。
9. 记录公共访问地址，例如：

```text
https://pub-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.r2.dev
```

这个地址会作为图片 URL 前缀。

## 4. R2 API Token 配置

进入 R2 API Token 页面，选择：

```text
Create Account API token
```

推荐配置：

```text
Token name:
project-name-uploader

Permission:
Object Read & Write

Bucket scope:
Apply to specific buckets
目标 bucket
```

生成后保存：

```text
Access Key ID
Secret Access Key
Endpoint / Account ID
```

本地新建 `.env.r2`，不要提交到 GitHub：

```text
CLOUDFLARE_ACCOUNT_ID=你的_account_id
R2_BUCKET=你的_bucket_name
R2_ACCESS_KEY_ID=你的_access_key_id
R2_SECRET_ACCESS_KEY=你的_secret_access_key
```

`.gitignore` 必须包含：

```text
.env
.env.*
!.env.r2.example
node_modules/
outputs/
```

## 5. CORS 配置

如果前端需要“复制图片本体”而不只是复制图片 URL，R2 需要配置 CORS。否则浏览器能显示图片，但 JS `fetch()` 图片时会失败。

进入 bucket 的 `Settings`，找到 `CORS Policy`，配置：

```json
[
  {
    "AllowedOrigins": [
      "https://你的-pages项目.pages.dev"
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

如果本地开发也要测试复制图片，可以临时加入：

```text
http://127.0.0.1:8088
http://localhost:8088
```

## 6. 素材目录建议

源图片可以按业务逻辑组织，例如：

```text
素材汇总/
├─ 语文/
│  ├─ 广东/
│  ├─ 山东/
│  └─ 全国/
├─ 数学/
│  ├─ 广东/
│  └─ 浙江/
└─ 英语/
```

或者按老师组织：

```text
素材汇总/
├─ 语文姜博杨-提分案例/
│  ├─ 背书.png
│  ├─ 大招.png
│  ├─ 40分以下/
│  └─ 40-60分/
└─ 数学胡源-提分案例/
```

关键原则：

- 源图片目录是唯一真相。
- 不要手动维护图片 URL。
- 用脚本扫描目录生成数据索引。
- 删除图片时，先只从数据索引移除引用，不急着删 R2 旧对象。

## 7. 数据索引字段设计

新网页可根据业务调整字段。推荐每张图片最终生成类似数据：

```json
{
  "id": "auto-generated-id",
  "subject": "语文",
  "province": "广东",
  "teacher": "姜博杨",
  "category": "提分案例",
  "title": "姜博杨｜广东｜30分到60分",
  "thumbUrl": "https://pub-xxx.r2.dev/thumbs/xxx.webp",
  "previewUrl": "https://pub-xxx.r2.dev/previews/xxx.webp",
  "imageUrl": "https://pub-xxx.r2.dev/originals/xxx.png"
}
```

前端规则：

- 列表卡片只加载 `thumbUrl`
- 弹窗预览加载 `previewUrl`
- 下载或复制高清图时才加载 `imageUrl`

## 8. 前端性能规则

必须避免一次性加载全部图片。

推荐：

```text
默认显示 20 张
点击“继续加载”再显示 20 张
图片使用 loading="lazy"
图片使用 decoding="async"
```

不要让一个筛选结果一次渲染几百张高清图。

## 9. 上传流程

标准流程：

```bash
npm install
npm run build:r2-assets
npm run upload:r2-assets
```

当前项目脚本能力：

- `build-r2-assets.js`：扫描源目录，生成 `thumb / preview / data.js / upload-manifest.json`
- `upload-r2-assets.js`：根据 manifest 上传 R2，支持断点续传和重试
- `.env.r2`：保存本地 R2 凭据

生成时可指定源目录：

```powershell
$env:CASE_SOURCE_DIR="D:\path\to\素材汇总"
npm.cmd run build:r2-assets
```

上传：

```powershell
npm.cmd run upload:r2-assets
```

## 10. 小批量更新流程

如果只更新少量老师或少量目录，不要全量重传。

推荐提示词：

```text
我已在本地更新了图片素材，更新范围是：
路径：D:\...\素材汇总
变更类型：替换 / 增添 / 删除
我只更新了以下目录：
- 语文姜博杨-提分案例
- 数学胡源-提分案例

请只处理有改动的图片：
1. 重新扫描改动的素材目录
2. 只为新增或替换的图片生成 thumb / preview / original
3. 只上传 R2 缺失或内容已变化的对象
4. 更新 data.js
5. 本地验证老师数量、图片数量、抽样图片 URL
6. 验证成功后再提交并推送 GitHub
禁止全量重传，禁止删除本地图片素材。
```

脚本运行方式：

```powershell
$env:CASE_SOURCE_DIR="D:\...\素材汇总"
$env:CASE_FORCE_FOLDERS="语文姜博杨-提分案例,数学胡源-提分案例"
npm.cmd run build:r2-assets

$env:CASE_FORCE_FOLDERS="语文姜博杨-提分案例,数学胡源-提分案例"
npm.cmd run upload:r2-assets
```

含义：

- `CASE_SOURCE_DIR` 指定完整素材源目录。
- `CASE_FORCE_FOLDERS` 指定本次强制刷新目录。
- 同路径替换的图片会重新生成缩略图和预览图。
- 同 key 已上传对象会被覆盖。
- 未改动目录不会重传。

## 11. 删除策略

建议默认策略：

```text
删除的图片只从 data.js 移除引用，暂不删除 R2 旧对象。
```

原因：

- 防止误删线上可用图片。
- R2 10GB 免费存储早期足够用。
- 等页面确认无误后，再单独清理未引用对象。

如果后续要清理 R2，应先生成“当前 data.js 引用 key 列表”，再删除不再引用的旧 key。

## 12. 验证清单

每次上线前至少验证：

```text
1. data.js 可正常解析
2. 老师 / 学科 / 省份等筛选项数量正确
3. 更新目录图片数量正确
4. 抽样 thumbUrl 返回 200
5. 抽样 previewUrl 返回 200
6. 抽样 imageUrl 返回 200
7. thumb 全部低于 200KB
8. preview 全部低于 1MB
9. Git diff 不包含图片素材、zip、密钥文件
```

## 13. GitHub 和 Pages 部署

GitHub 只提交：

```text
index.html
styles.css
app.js
data.js
package.json
package-lock.json
脚本文件
README / 文档
```

不要提交：

```text
源图片目录
outputs/
node_modules/
.env.r2
zip / 7z
```

Cloudflare Pages 设置：

```text
Framework preset: None
Build command: 留空 或 exit 0
Build output directory: /
Production branch: main
```

推送 GitHub 后，Pages 会自动部署。

## 14. 新网页制作建议

如果新网页主要按学科、省份筛选，可以优先设计：

```text
学科筛选：语文 / 数学 / 英语 / 物理 / 化学 / 生物 / 历史 / 地理 / 政治
省份筛选：全国 / 北京 / 天津 / 河北 ...
类型筛选：提分案例 / 喜报 / 课程海报 / 赠礼 / 资料包
关键词搜索：文件名、标题、老师名
```

前端首屏不做宣传页，直接进入素材筛选工具。

推荐页面结构：

```text
左侧：筛选条件
右侧：图片结果网格
顶部：当前筛选摘要和数量
卡片：缩略图 + 标题 + 复制 / 下载按钮
弹窗：预览图 + 下载高清图
```

## 15. 安全提醒

- 不要把 R2 Secret Access Key 发到聊天、截图或 GitHub。
- 如果密钥截图外传，应立刻删除 token 并重新创建。
- `.env.r2` 必须在 `.gitignore` 中。
- 公开 R2 bucket 适合公开销售素材，不适合存放隐私或敏感资料。

