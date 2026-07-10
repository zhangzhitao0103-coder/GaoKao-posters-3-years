# PostHog 数据埋点设置流程

适用场景：轻量级静态网页工具，包含大量图片素材，通过学科、省份、老师、分数段、标签等条件筛选展示，并希望统计页面访问量、图片点击量、复制按钮点击量、筛选使用情况等数据。

## 1. 推荐统计方案

此类网页优先使用 PostHog 做数据统计，不建议一开始就接数据库。

原因：

- 页面多为静态 HTML / CSS / JS，逻辑轻量。
- 主要需求是行为统计，不是业务数据存储。
- PostHog 可以直接统计事件、趋势、排行、分组维度和看板。
- 多个小工具可以共用一个 PostHog Project，通过 `project_name` 和 `module_name` 区分。

推荐结构：

```txt
静态网页 / Netlify
        ↓
PostHog JS SDK
        ↓
PostHog Product Analytics
        ↓
Trends / Breakdown / Dashboard 查看统计图
```

## 2. PostHog 关键信息

接入前需要准备两个信息：

```txt
Project API Key / Project token
API Host
```

查找路径：

```txt
PostHog 后台
→ Settings
→ Project
→ General
→ Project token & ID
```

注意：

- 前端网页应使用 `Project token` / `Project API Key`。
- 不要把 `Personal API key`、`Secret key`、`API token` 放到前端。
- `Project token` 是 write-only client key，适合放在公开网页里。

API Host 根据数据区域不同可能是：

```txt
https://us.i.posthog.com
https://eu.i.posthog.com
```

以 PostHog 后台显示为准。

## 3. 在 HTML 中接入 PostHog

在入口 HTML 文件的 `</head>` 前加入 PostHog 初始化代码。

示例：

```html
<script>
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog && window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify reset register register_once unregister opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  posthog.init("替换为你的 Project API Key", {
    api_host: "替换为你的 API Host",
    person_profiles: "identified_only",
    capture_pageview: true,
    autocapture: true
  });
</script>
```

建议配置说明：

```txt
capture_pageview: true
统计页面访问。

autocapture: true
自动捕获部分点击行为，作为辅助。

person_profiles: "identified_only"
不为匿名用户创建完整用户画像，适合普通访问统计，减少无用 profile。
```

## 4. 新增通用埋点函数

在主 JS 文件中加入统一埋点函数。

示例：

```js
const ANALYTICS_CONTEXT = {
  project_name: "老师提分案例筛选页面",
  module_name: "teacher-score-case-filter",
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
```

字段建议：

```txt
project_name
中文项目名，方便后台筛选。例如：老师提分案例筛选页面

module_name
英文短标识，方便跨项目管理。例如：teacher-score-case-filter
```

多个小工具共用同一个 PostHog Project 时，必须给每个工具设置不同的 `project_name` 和 `module_name`。

## 5. 推荐事件命名

建议所有类似图片筛选网页统一使用以下事件名。

| 事件名 | 含义 | 用途 |
|---|---|---|
| `tool_page_viewed` | 工具页访问 | 页面访问量 |
| `filter_changed` | 筛选条件变化 | 学科、省份、标签筛选热度 |
| `filter_search_clicked` | 点击筛选/搜索 | 搜索使用量、筛选组合分析 |
| `image_clicked` | 点击图片预览 | 图片点击量 |
| `image_copy_clicked` | 点击复制按钮 | 复制按钮点击量 |
| `image_copy_succeeded` | 图片复制成功 | 实际复制成功量 |
| `image_copy_failed` | 图片复制失败 | 复制异常排查 |
| `reset_clicked` | 点击重置 | 重置使用量 |
| `teacher_selected` | 老师被选择 | 老师选择量 |
| `subject_selected` | 学科被选择 | 学科选择量 |
| `province_selected` | 省份被选择 | 省份选择量 |

## 6. 推荐事件属性

事件属性决定后续能不能做分组统计。图片筛选类网页建议统一带以下字段。

| 属性名 | 含义 | 示例 |
|---|---|---|
| `project_name` | 项目中文名 | 老师提分案例筛选页面 |
| `module_name` | 项目英文标识 | teacher-score-case-filter |
| `subject` | 学科 | 数学 |
| `province` | 省份 | 河南 |
| `teacher` | 老师 | 张老师 |
| `image_name` | 图片名称 | 张老师-河南-提分案例.png |
| `image_src` | 图片路径 | ./images/xxx.png |
| `content_type` | 图片类型 | teacher_profile / score_case |
| `filter_name` | 筛选项名称 | subject |
| `filter_value` | 筛选项值 | 数学 |
| `search_keyword` | 搜索关键词 | 张老师 |
| `result_count` | 筛选结果数量 | 32 |
| `button_name` | 按钮名称 | 复制图片 |
| `source` | 触发来源 | search_button |

## 7. 页面访问量埋点

页面初始化完成后，发送一次自定义访问事件。

```js
trackEvent("tool_page_viewed", {
  total_images: images.length,
  total_subjects: subjects.length,
  total_provinces: provinces.length,
});
```

如果当前项目有老师数据：

```js
trackEvent("tool_page_viewed", {
  total_teachers: teachers.length,
  total_images: images.length,
});
```

## 8. 筛选条件变化埋点

当用户选择学科：

```js
trackEvent("filter_changed", {
  filter_name: "subject",
  filter_value: selectedSubject,
  subject: selectedSubject,
});
```

当用户选择省份：

```js
trackEvent("filter_changed", {
  filter_name: "province",
  filter_value: selectedProvince,
  province: selectedProvince,
});
```

当用户点击搜索/筛选按钮：

```js
trackEvent("filter_search_clicked", {
  subject: selectedSubject,
  province: selectedProvince,
  search_keyword: keyword,
  result_count: filteredImages.length,
});
```

## 9. 图片点击量埋点

当用户点击图片预览时：

```js
trackEvent("image_clicked", {
  image_name: item.name,
  image_src: item.src,
  content_type: item.contentType,
  subject: item.subject,
  province: item.province,
  teacher: item.teacher,
});
```

推荐 `content_type` 统一取值：

```txt
teacher_profile
老师介绍图

score_case
提分案例图

gift
赠礼图

schedule
课程表

policy
售后/价格/退费政策

other
其他图片
```

## 10. 图片复制按钮埋点

复制按钮点击时：

```js
trackEvent("image_copy_clicked", {
  image_name: item.name,
  image_src: item.src,
  content_type: item.contentType,
  subject: item.subject,
  province: item.province,
  teacher: item.teacher,
});
```

复制成功后：

```js
trackEvent("image_copy_succeeded", {
  image_name: item.name,
  image_src: item.src,
  content_type: item.contentType,
  subject: item.subject,
  province: item.province,
  teacher: item.teacher,
});
```

复制失败时：

```js
trackEvent("image_copy_failed", {
  image_name: item.name,
  image_src: item.src,
  content_type: item.contentType,
  subject: item.subject,
  province: item.province,
  teacher: item.teacher,
  error_message: error.message || "",
});
```

## 11. PostHog 后台查看统计图

进入：

```txt
PostHog
→ Product analytics
→ + New
→ Trends
```

### 11.1 页面访问量

配置：

```txt
Title:
页面访问量

Series:
tool_page_viewed

Metric:
Total count

Filter:
project_name equals 当前项目中文名

Chart:
Line chart / Bar chart / Number
```

说明：

- 看趋势用 `Line chart`。
- 看总数用 `Number`。
- 看每日数量用 `Bar chart`。

### 11.2 图片点击量

配置：

```txt
Title:
图片点击量

Series:
image_clicked

Metric:
Total count

Filter:
project_name equals 当前项目中文名

Breakdown:
image_name

Chart:
Bar chart / Table
```

如果想区分图片类型：

```txt
Breakdown:
content_type
```

例如：

```txt
teacher_profile = 老师介绍图
score_case = 提分案例图
```

### 11.3 图片复制按钮点击量

配置：

```txt
Title:
图片复制按钮点击量

Series:
image_copy_clicked

Metric:
Total count

Filter:
project_name equals 当前项目中文名

Breakdown:
image_name

Chart:
Bar chart / Table
```

如果想看实际复制成功量：

```txt
Series:
image_copy_succeeded
```

### 11.4 学科筛选热度

配置：

```txt
Title:
学科筛选热度

Series:
filter_changed

Metric:
Total count

Filter:
project_name equals 当前项目中文名
filter_name equals subject

Breakdown:
filter_value

Chart:
Bar chart / Table
```

### 11.5 省份筛选热度

配置：

```txt
Title:
省份筛选热度

Series:
filter_changed

Metric:
Total count

Filter:
project_name equals 当前项目中文名
filter_name equals province

Breakdown:
filter_value

Chart:
Bar chart / Table
```

## 12. 建议建立 Dashboard

建议每个工具建立一个 Dashboard。

路径：

```txt
PostHog
→ Dashboards
→ New dashboard
```

命名示例：

```txt
老师提分案例筛选页面数据看板
```

建议放入以下图表：

```txt
页面访问量
图片点击量
图片复制按钮点击量
图片复制成功量
学科筛选热度
省份筛选热度
图片类型点击量
热门图片 Top 25
```

## 13. 新项目接入检查清单

每次给新网页接入 PostHog 时，按此清单检查。

```txt
[ ] HTML 中已加入 PostHog 初始化代码
[ ] 使用的是 Project token，不是 Personal API key
[ ] api_host 填写正确
[ ] capture_pageview: true
[ ] autocapture: true
[ ] JS 中已添加 trackEvent()
[ ] project_name 已改成当前项目中文名
[ ] module_name 已改成当前项目英文标识
[ ] 页面初始化后发送 tool_page_viewed
[ ] 图片点击发送 image_clicked
[ ] 复制按钮点击发送 image_copy_clicked
[ ] 复制成功发送 image_copy_succeeded
[ ] 筛选条件变化发送 filter_changed
[ ] 点击搜索/筛选发送 filter_search_clicked
[ ] 每个事件都带 subject / province / image_name / content_type 等关键属性
[ ] 本地或线上真实操作过页面
[ ] PostHog 后台能搜到对应事件
[ ] 已创建 Trends 统计图
[ ] 已保存到 Dashboard
```

## 14. 调试方法

如果 PostHog 后台搜不到事件：

1. 确认页面不是直接双击 `index.html` 打开的，建议用本地服务或部署后访问。

```bash
python -m http.server 8088
```

访问：

```txt
http://127.0.0.1:8088/index.html
```

2. 打开浏览器控制台，看是否有 JS 报错。

3. 确认 `window.posthog` 存在。

4. 真实点击页面上的图片、复制按钮、筛选按钮。

5. 等待 1-3 分钟，再回 PostHog 搜事件。

6. 确认 Trends 时间范围包含当前时间，例如 `Last 7 days`。

7. 确认 Filter 中的 `project_name` 与代码完全一致。

## 15. 给 Codex 的通用提示词

新项目中可以直接使用下面这段提示词，让 Codex 自动接入埋点。

```txt
请帮我给当前项目接入 PostHog 数据埋点。

背景：
这是一个轻量级静态/前端图片筛选工具，包含大量图片素材，用户通过学科、省份、老师、标签等条件筛选图片，并点击预览或复制图片。我希望统计页面访问量、图片点击量、复制按钮点击量、筛选条件使用量等数据。

请先阅读项目结构，找到入口 HTML、主 JS 文件、图片渲染逻辑和按钮事件绑定位置。保持改动小而清晰，不要重构无关逻辑，不要改动无关样式和文案。

PostHog 信息：
Project API Key：替换为我的 PostHog Project token
API Host：替换为我的 API Host，例如 https://us.i.posthog.com

请完成：

1. 在入口 HTML 的 </head> 前接入 PostHog 初始化代码。
配置包含：
capture_pageview: true
autocapture: true
person_profiles: "identified_only"

2. 在主 JS 文件中新增通用函数：

function trackEvent(eventName, properties = {}) {
  if (!window.posthog || typeof window.posthog.capture !== "function") return;

  window.posthog.capture(eventName, {
    project_name: "根据当前项目填写中文名",
    module_name: "根据当前项目填写英文短标识",
    page_title: document.title,
    page_path: window.location.pathname,
    ...properties,
  });
}

3. 页面初始化完成后发送：
tool_page_viewed

4. 图片点击预览时发送：
image_clicked

5. 图片复制按钮点击时发送：
image_copy_clicked

6. 图片复制成功时发送：
image_copy_succeeded

7. 图片复制失败时发送：
image_copy_failed

8. 筛选条件变化时发送：
filter_changed

9. 点击搜索/筛选按钮时发送：
filter_search_clicked

10. 每个事件尽量带上这些属性：
subject
province
teacher
image_name
image_src
content_type
filter_name
filter_value
search_keyword
result_count
button_name
source

11. 完成后运行可用的语法检查或构建检查。如果没有构建命令，至少检查 JS 语法。

12. 最后告诉我：
- 修改了哪些文件
- 新增了哪些事件名
- PostHog 后台如何配置 Trends 图表查看页面访问量、图片点击量、图片复制按钮点击量
```

