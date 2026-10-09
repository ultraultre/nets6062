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

编辑 `public/data/notices.json`。每条通知包含 `id`、`title`、`date`（`YYYY-MM-DD`）、`category`、`important` 和 `body`。重要通知置顶，其余按日期倒序。直接提交 JSON 即可通过 Actions 更新站点，不需在线管理后台。

### 文件下载

把经确认可公开的文件加入 `document/`，运行 `npm run prepare:data` 或 `npm run build`。脚本递归扫描、保留中文和空格文件名、跳过隐藏/临时文件，把可公开文件复制到 `public/downloads/`，生成 `public/data/files.json`。网页链接逐段 URL 编码，支持 GitHub Pages 项目子路径。

发布前必须审查新增文件内容。需要暂缓公开的相对文件名写进 `document-review.json` 的 `exclude` 数组，且在公开仓库中加入 `.gitignore`。脚本将其列入 `public/data/pending-files.json`，不会复制到公开目录。当前“最佳团日”评分方案 PDF 含联系电话，因此暂缓发布并已从 Git 跟踪中排除；空白研究生请假单已收录。若拥有该 PDF 的公开授权，确认联系方式可公开后，从排除表和 `.gitignore` 中移除并重新构建。单个文件超过 100 MiB 会列为待处理，不会静默忽略；建议压缩或改为其他获授权的文件托管方式。请勿上传学生名单、身份证号、联系方式、成绩、账号密钥等隐私内容。GitHub 仓库本身若设为公开，`document/` 中未被忽略的原文件也会公开；发布前应先移走不适合公开的源文件或使用私有源仓库。

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
| `public/data/` | 通知、文件索引、房间、楼层和路径图 |
| `public/maps/` | 从 PDF 生成的六层 WebP 地图 |
| `scripts/` | 地图处理与文件清单构建 |
| `tools/editor.html` | 只在本地开发服务器使用的校对工具 |
| `tests/` | 数据、路径与算法测试 |
