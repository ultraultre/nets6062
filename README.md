# 班级信息服务平台

一个完全静态、移动端优先的中文班级网站：通知公告、公开文件下载，以及基于真实 PDF 的躬行楼六层地图与房间定位。项目采用 Vite、TypeScript、原生 DOM/CSS/SVG、JSON、Vitest。生产站点无需服务器、数据库、地图 API、外部字体或 CDN。

## 当前数据状态

- 地图源文件是 `assets/source/躬行楼地图.pdf`。原任务说明中的 `sourse` 是拼写差异；项目保留实际路径和原文件。
- 六页对应 1F–6F。`scripts/process_map.py` 使用 PDF 文字层提取房间编号，按页面坐标生成 `public/data/rooms.json`，并输出 `public/maps/*.webp`。提取出的点是**文字标注中心**，不是门口。
- `public/data/graph.json` 初始没有已验证通道。因此当前可以搜索、定位房间、浏览和下载定位示意图，但会提示“当前区域路线尚未校对”，不会生成猜测路线。
- 地图中部分中文字符在 PDF 文字层呈现乱码，但渲染底图保留原有中文、图例和方向标识。房间编号多为可直接提取的 ASCII 文本。部分房号可能因源 PDF 拆行、重叠或字体编码需要人工核对。
- 1F 中庭、草坪等区域与其他楼层不同，不能套用其他楼层的走廊结构。

## 安装与本地运行

需要 Node.js 22+。首次运行：

```bash
npm ci
npm run dev
```

打开终端显示的本地网址。`npm run dev` 会先扫描 `document/` 并生成公开下载清单。运行测试和生产构建：

```bash
npm run prepare:data
npm test
npm run build
npm run preview
```

构建结果位于 `dist/`。如需模拟项目仓库子路径，可设置 `VITE_BASE_PATH=/project-name/` 后运行 `npm run build`。导航使用 hash URL，因此 GitHub Pages 刷新页面不会遇到服务器路由 404。

## 更新内容

### 通知

编辑 `public/data/notices.json`。每条通知包含 `id`、`title`、`date`（`YYYY-MM-DD`）、`category`、`important` 和 `body`。重要通知置顶，其余按日期倒序。直接提交 JSON 即可通过 Actions 更新站点，不需在线管理后台。各数据数组的 `id` 必须非空且在本文件内唯一，不同文件可以使用相同 ID。ID 不要求固定命名格式，建议保持稳定；数组中的对象之间必须加逗号。

### 待办清单

编辑 `public/data/todos.json`，像通知一样在数组中添加事项。每项包含唯一的 `id`、`content`（内容）、`requirements`（要求）、`startAt`（开始时间）、`dueAt`（截止时间）和 `details`（详情正文）。时间使用 `YYYY-MM-DD HH:mm` 格式，统一按 UTC+8 解析，也支持 `2026-10-20T18:00:00+08:00`。到达截止时间显示“已经结束”；开始前显示“未开始”，期间显示“进行中”。未结束事项优先，其内按截止时间升序显示。首页展示前 5 项，点击“查看详情”进入独立详情页。页面停留期间自动更新状态，浏览器恢复前台时重新检查。示例：

```json
[
  {
    "id": "example-task",
    "content": "事项名称",
    "requirements": "需要完成的要求",
    "startAt": "2026-10-12 09:00",
    "dueAt": "2026-10-20 18:00",
    "details": "更完整的说明，支持用换行分段。"
  }
]
```

### 工具分享

编辑 `public/data/tools.json`，在数组中添加想分享的工具。每项包含唯一的 `id`、`title`、`date`（`YYYY-MM-DD`）、`category`、`description` 和 `url`。首页展示最近 3 项，工具分享页展示全部，按日期倒序。`url` 只接受 `https://` 或 `http://` 链接。示例：

```json
[
  {
    "id": "example-tool",
    "title": "工具名称",
    "date": "2026-10-12",
    "category": "学习工具",
    "description": "工具的用途和推荐理由。",
    "url": "https://example.com"
  }
]
```

静态站点本身没有在线管理后台，修改数据只会在发布新版本后对所有访客生效。运行开发或构建命令时会检查这三个文件的 JSON 格式、ID 唯一性及待办起止时间。

### 文件下载

把经确认可公开的文件加入 `document/`，运行 `npm run prepare:data` 或 `npm run build`。脚本递归扫描、保留中文和空格文件名、跳过隐藏/临时文件，把可公开文件复制到 `public/downloads/`，生成 `public/data/files.json`。网页链接逐段 URL 编码，支持 GitHub Pages 项目子路径。

文件截止时间配置在 `public/data/file-deadlines.json`，键是相对于 `document/` 的路径（子目录使用 `/`），值为 UTC+8 时间或 `null`。例如：

```json
{
  "报名表.docx": "2026-10-20 18:00",
  "资料/说明.pdf": null
}
```

配置后重新运行 `npm run prepare:data` 或构建；不要直接修改自动生成的 `files.json`，它会被覆盖。`null` 或未配置表示“长期有效”。现有 9 个文件的截止时间按用户要求统一暂设为四年后的 `2030-10-10 23:59`（UTC+8），可逐项修改。到期后，文件会自动从首页预览及普通分类移入网页的“过期文件”目录，仍能搜索和下载。归档是页面中的动态目录，源文件和下载路径保持稳定；静态网站无需重新构建即可显示到期状态。判断使用访问设备的当前时间，所有时间字符串均按 UTC+8 解释。

发布前必须审查新增文件内容。需要暂缓公开的相对文件名写进 `document-review.json` 的 `exclude` 数组，且在公开仓库中加入 `.gitignore`。脚本将其列入 `public/data/pending-files.json`，不会复制到公开目录。当前已按用户要求开放 `document/` 中全部 4 个文件的下载，`document-review.json` 的排除表为空。单个文件超过 100 MiB 会列为待处理，不会静默忽略；建议压缩或改为其他获授权的文件托管方式。请勿上传学生名单、身份证号、联系方式、成绩、账号密钥等隐私内容。GitHub 仓库本身若设为公开，`document/` 中未被忽略的原文件也会公开；发布前应先移走不适合公开的源文件或使用私有源仓库。

### 更新 PDF 地图与房间

替换原始 PDF 后，安装 Python 的 PyMuPDF 和 Pillow，再运行：

```bash
python -m pip install pymupdf pillow
python scripts/process_map.py
```

脚本要求 PDF 六页，输出统一归一化坐标（0–1）的房间标签和 2200 像素宽 WebP 底图。先视觉复核每页文字、方向、裁剪和旋转，再用本地校对工具确认房间。新增楼层时，要相应修改处理脚本的页数约束、编辑器楼层选项和前端房号规则。

**注意：**重新运行提取脚本会覆盖 `public/data/rooms.json`，包括已人工校对的入口和验证状态。更新 PDF 前请备份已校对 JSON，并按房号合并确认后的入口数据；不要直接覆盖投入使用的导航数据。

## 地图校对工具

运行 `npm run dev`，打开 `/tools/editor.html`。此工具不进入生产构建。可切换楼层、查看原图、选择房间并点击修正标签位置、记录入口、添加走廊/转角/楼梯/电梯节点、建立或删除连接边，设置实测距离与“已验证”标记。工具支持导入/导出 `rooms.json` 和 `graph.json`；导出后手动替换 `public/data/` 中对应文件并提交。数据仅存于浏览器内存，离开页面前务必导出。

校对流程：

1. 在现场和原图确认房间门口，再记录 `entrancePosition`，将房间关联到正确的入口节点 `accessNode`。
2. 沿实际可通行走廊逐段添加节点和边，逐项核对墙体、中庭及禁止通行区域。
3. 跨层只连接实际同一楼梯或电梯的上下层节点。测量距离后可填米数；未测量时只计算相对最短路，不显示米数。
4. 验证房间、节点及边后才标记 `verified: true`。未经验证的边和房间不会参与正式路线。
5. 将 JSON 导回项目，运行测试、构建并检查地图。地图不用于紧急逃生或消防疏散。

导航页支持房号输入和自动补全、起终点交换、楼层切换、缩放、清除及 PNG 导出。有可靠路线时按楼层绘制路线；没有可靠路线时仅导出明确标记的“房间定位示意图（非导航路线）”。

## GitHub Pages 部署

1. 在 GitHub 创建空仓库，名称可为 `username.github.io` 或普通项目名。当前工作区尚未初始化 Git，可在确认待审文件已被 `.gitignore` 排除后运行 `git init`、`git add .`、`git commit -m "Initial site"`、`git branch -M main`、`git remote add origin <仓库地址>`、`git push -u origin main`。在仓库 **Settings → Pages → Build and deployment** 中选择 **GitHub Actions**。
2. `.github/workflows/deploy.yml` 会运行 `npm ci`、文件清单处理、测试、构建并发布 `dist/`。
3. 仓库名是 `username.github.io` 时使用根路径 `/`；普通项目仓库自动使用 `/<仓库名>/`。Actions 通过 `VITE_BASE_PATH` 设置 Vite base。
4. 等 Actions 成功后访问 Pages 提供的网址。本地构建通过不代表线上已部署成功。

GitHub Pages 是公开站点，且在中国大陆的访问稳定性可能受网络环境影响。请勿把班级私密文件、个人信息或密钥放进仓库或站点。地图与房号仅供一般找路参考，实际请以现场标识为准。

## 目录

| 路径 | 作用 |
| --- | --- |
| `src/main.ts` | 页面交互、数据加载、地图与 PNG 导出 |
| `src/navigation/core.ts` | 房号搜索、最短路、验证门槛与楼层分段 |
| `src/styles.css` | 响应式界面和深色模式 |
| `public/data/` | 通知、待办、工具分享、文件索引、房间、楼层和路径图 |
| `public/maps/` | 从 PDF 生成的六层 WebP 地图 |
| `scripts/` | 地图处理与文件清单构建 |
| `tools/editor.html` | 只在本地开发服务器使用的校对工具 |
| `tests/` | 数据、路径与算法测试 |
