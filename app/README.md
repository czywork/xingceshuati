# 行测真题刷题系统

基于本仓库 `真题数据/`（2016–2026，515 套卷 / 5.8 万条收录 / 2.7 万道唯一真题）构建的**可视化刷题网站**。
**零依赖**：后端仅用 Node 内置模块，前端为原生 JS/CSS，无需 `npm install`，完全离线运行。

> 真题数据来自开源项目 [ERRRC/xingcezhenti](https://github.com/ERRRC/xingcezhenti)；本刷题系统在该数据基础上由 AI 开发实现。

## 快速开始

```bash
# 前置：Node.js >= 18（推荐 20+）
cd app

# 1) 解析真题数据，生成 data/（首次或数据更新后运行；已构建可跳过）
npm run build

# 2) 启动服务器
npm start

# 3) 浏览器打开
#    http://127.0.0.1:5173
```

> `data/` 已被 `.gitignore` 忽略，可由 `npm run build` 随时重新生成。
> 若启动报「题库数据未构建」，先执行 `npm run build`。
>
> **Windows 一键启动**：双击仓库根目录的 `run.bat` —— 首次会自动构建数据，然后启动服务并打开浏览器。

## 功能

- **多维筛选**：题型模块（01–06）、刷题数量、年份范围、地区、考点（随模块联动，均支持多选）
- **考点细分**：数量关系（04）下把数列题从「数学运算」中分出为「数字推理」（数列推理，264 道唯一题），可只刷数列题
- **随机出题**：Fisher–Yates 洗牌，按 qid 去重抽取；材料题抽中子题自动附带所属材料
- **答题体验**：单选/多选、题干与选项内图片渲染、上一题/下一题、答题卡跳转、键盘快捷键
  （`←/→` 翻题，`A–D` 或 `1–9` 选择）
- **限时倒计时**：时长可设置，剩余 5 分钟预警、1 分钟告警，到时自动交卷
- **收藏 / 标记**：收藏持久化到本地；标记用于本场回顾
- **交卷判分**：正确率环、分模块 / 分考点统计、逐题解析（全部 / 错题 / 正确筛选）
- **错题本**：答错自动入库、答对自动移出，可单题练习或「重练全部错题」
- **本地持久化**：错题本、收藏、设置、历史记录均存于浏览器 `localStorage`

## 项目结构

```
app/
├─ config.mjs            # 全局路径与模块配置（PORT/HOST/路径/MODULE_MAP）
├─ package.json          # 脚本入口（零运行依赖）
├─ scripts/              # 数据解析（md → data/*.json）
│  ├─ parse.mjs          # 解析主程序
│  └─ lib/               # frontmatter / 正文 / 试卷解析
├─ server/               # HTTP 服务（Node 内置 http）
│  ├─ index.mjs          # 入口：加载题库 + 监听
│  ├─ app.mjs            # createApp()：组装路由与静态服务（与监听解耦，便于测试）
│  ├─ routes/api.mjs     # /api/* 接口
│  └─ lib/               # bank（题库）/ http / router / static
├─ web/                  # 前端（原生 JS 模块 + CSS，hash 路由）
│  ├─ index.html
│  ├─ 图标.png            # 站点图标（favicon + 头部 logo）
│  ├─ css/               # base（主题令牌/排版/布局）/ components（通用件）/ pages（各页）
│  └─ js/
│     ├─ main.js         # 入口：注册路由、导航高亮、头部统计、日/夜主题切换
│     ├─ dom.js          # h() 声明式建元素、工具函数
│     ├─ api.js          # 后端接口封装
│     ├─ store.js        # 持久化状态（错题/收藏/设置/历史）+ 瞬时会话
│     ├─ router.js       # 极简 hash 路由
│     ├─ meta.js         # 元数据缓存
│     ├─ components/     # toast、questionView（题干/材料/选项/解析）
│     └─ pages/          # setup 配置 / quiz 答题 / result 结果 / library 错题本
├─ tests/                # node:test 单元测试（解析 / 题库 / HTTP）
├─ smoke.mjs             # 端到端冒烟测试（真实数据 + 真实静态服务）
└─ data/                 # 构建产物（gitignore）：index.json / meta.json / questions-<code>.json
```

## HTTP 接口

| 方法 | 路径               | 说明                                                                                                              |
| ---- | ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| GET  | `/api/meta`      | 模块 / 地区 / 年份 / 考点统计与总题量                                                                             |
| POST | `/api/quiz`      | 按筛选条件抽题（**不含答案**）；body：`{count, modules?, yearFrom?, yearTo?, regions?, knowledgePoints?}` |
| POST | `/api/count`     | 统计筛选条件下的可用题量：`{poolSize, availableUnique}`                                                         |
| POST | `/api/grade`     | 判分；body：`{answers:[{qid, selected:[keys]}], timeUsed}` → `{summary, details}`                            |
| POST | `/api/questions` | 按 qid 取题；body：`{qids, mode:'review'\|'quiz'}`（review 含答案与解析）                                        |
| GET  | `/img/*`         | 真题图片（直接服务 `真题数据/90-图片`，含路径穿越防护）                                                         |
| GET  | `/*`             | 前端静态资源（`web/`）                                                                                          |

错误统一结构：`{ "error": { "status", "message" } }`。

## 数据模型

- **索引保留全部出现记录**：`data/index.json` 每条对应一次「试卷收录」，带准确的年份 / 地区 / 试卷 / 考点，用于筛选与抽题（5.8 万条）。
- **内容按 qid 去重**：`data/questions-<code>.json` 按模块分片懒加载，存题干 / 选项 / 答案 / 解析 / 材料（2.7 万道唯一题）。`qid` 全局唯一且不跨模块，作为主键。
- **材料题群**：材料单独存储，题目内容以 `materialId` 关联；抽中任一子题自动附带其材料。
- **图片**：不复制原始 256MB 图片，`/img/*` 直接映射到 `真题数据/90-图片`。

## 脚本

| 命令              | 作用                                     |
| ----------------- | ---------------------------------------- |
| `npm run build` | 解析真题数据，生成 `data/`             |
| `npm start`     | 启动服务器（`http://127.0.0.1:5173`）  |
| `npm run dev`   | 以 `--watch` 启动，改动自动重启        |
| `npm test`      | 运行单元测试（解析 / 题库 / HTTP）       |
| `npm run smoke` | 端到端冒烟测试（需已 `npm run build`） |

自定义端口 / 主机：`PORT=8080 HOST=0.0.0.0 npm start`。

## 说明

- 题目 HTML 为本地可信数据，前端以 `innerHTML` 注入；服务默认仅监听 `127.0.0.1`。
- `data/` 下的 JSON 以 2 空格缩进输出，便于人工查看与版本 diff（体积换可读性）。

## 界面主题

界面为**纸墨卷面**风格：暖白纸底 + 近墨黑正文，标题与题面用衬线字体，配色取自站点图标（钢笔蓝 `#1B4F8F` / 批改红 `#B5342A` / 琥珀点缀）。

- 页头右上角按钮可在**日间「纸墨」**与**夜间「夜读」**间切换，选择存于 `localStorage`（键 `xingce-theme`），并在首屏渲染前套用以避免闪烁。
- 全部颜色/圆角/阴影由 `css/base.css` 顶部的 CSS 变量驱动；深色主题只覆盖变量，不重复写组件样式。默认浅色。
- 若想改为跟随系统，把 `index.html` 中的主题引导脚本改为判断 `prefers-color-scheme` 即可。

## 来源与致谢

- **真题数据**：来自开源项目 [ERRRC/xingcezhenti](https://github.com/ERRRC/xingcezhenti)（2016–2026 公务员·行测原题副本，图片已本地化）；本项目未改动原始题库内容。
- **本系统**：在上述数据基础上由 AI 开发完成——数据解析、零依赖后端与原生前端均为本项目新增。
- 真题内容版权归原作者 / 相关机构所有，仅供个人学习研究使用。
