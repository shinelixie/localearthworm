<div align="center">
  <img alt="Earthworm" width="120" height="120" src="./assets/logo/logo-1000.png">
  <h1>Earthworm · 本地版</h1>
  <p>用「连词构句」学英语 ——<br/>改造成所有数据都留在自己电脑上的单机版</p>
  <img src="./docs/screenshots/home.png" width="860" alt="首页" />
</div>

## 这是什么

[Earthworm](https://github.com/cuixueshe/earthworm)（蚯蚓英语）的重度改造版。
上游是标准 SaaS 形态：Logto 登录、Docker 起库、课程写死在代码里。
这个版本把它拆成了一个**双击就能用、不需要联网、不需要账号**的本地学习工具：

- 免登录，只有一个本地学习者身份
- 用免安装的 PostgreSQL + Redis，不用 Docker、不需要管理员权限
- 课程包可以自己导入 CSV、可以新建、可以分多批往同一个包里追加
- 发音换成微软神经网络语音（与 Azure TTS 同一套声学模型），全库预生成为本地 mp3
- 界面重做：深/浅色主题、课程进度条、收藏本、站内帮助文档

> 上游原始说明（Docker + Logto 的开发方式）仍然适用，见 [上游仓库](https://github.com/cuixueshe/earthworm)。
> 想了解本地部署细节请看 [部署说明.md](./部署说明.md)。

## 截图

| 课程列表（带学习进度）                          | 学习页                                 |
| ----------------------------------------------- | -------------------------------------- |
| ![课程列表](./docs/screenshots/course-list.png) | ![学习页](./docs/screenshots/game.png) |

| 设置项                                   | 站内帮助                             |
| ---------------------------------------- | ------------------------------------ |
| ![设置](./docs/screenshots/settings.png) | ![帮助](./docs/screenshots/help.png) |

## 相对上游做了什么

| 方面     | 改动                                                                                     |
| -------- | ---------------------------------------------------------------------------------------- |
| 认证     | 去掉 Logto，改为 `LOCAL_MODE=true` + 固定 token 的本地身份                               |
| 运行环境 | PostgreSQL 16 / Redis 5 免安装版随仓库外置，`start-earthworm.bat` 一键拉起 4 个服务      |
| 发音     | 有道 `dictvoice`（单词录音拼接）→ 微软 Edge 神经语音，磁盘缓存 + 全库预生成，命中约 76ms |
| 课程     | CSV 导入器 + 课程包新建 + 分批导入（可指定并入已有包、可勾选单节课）                     |
| 进度     | `user_course_progress` 唯一键细到「一节课一条」，课程列表显示进度条与百分比              |
| 界面     | 首页/课程列表/学习页/设置页重做，支持深色模式、手机端；新增收藏本、站内帮助              |
| 数据     | 内置 55 课 / 8865 句的《新概念》语料，导入后按句去重建库                                 |

## 持续开发的新功能（v0.1 之后）

| 功能           | 说明                                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 拆分练习       | 按词/短语/自顶向下等拆分方式把句子切成空位逐段默写，支持中译英/听写/听力三种模式与多级难度，可断点续练、会话评级（S–D） |
| 语法分析       | 每句的逐词成分标注（离线 LLM 批量生成），卡片里按成分框选高亮，管理页可可视化编辑                                       |
| 拆分树         | LLM 生成的嵌套句法树（本地校验：连续、不重叠、不漏词），是拆分练习的切分依据，可逐句重生成                              |
| 学习路径       | 每个课程包一棵「模式 × 难度 × 星级」的解锁树，含每日题量限制与进度星                                                    |
| 复习（FSRS）   | 根据练习行为信号（尝试次数/提示/拼错/听音次数）自动排期的记忆卡片，毕业制（≥21 天）                                     |
| 成长分析       | 近 30 天柱状图、累计时长（墙钟口径）、练习次数、正确率与会话明细                                                        |
| 课程管理       | `/manage` 页：编辑句子原文/翻译/音标、可视化编辑语法与拆分树，并实时预览四种拆分练习的出题效果                          |
| 四六级语料     | CET4/CET6 重排为「一句一节课」（CET4 201 节 / CET6 397 节），迁移脚本自动改写旧表引用                                   |
| 翻译与音频落库 | 练习中产生的片段翻译走「本地 LLM → Google → MyMemory」三级链并持久缓存；TTS 音频同时存磁盘与数据库，换机不用重新合成    |
| 纯前端版       | 无服务器/无数据库的 GitHub Pages 版，见下节                                                                             |

## 快速开始（Windows）

前提：**Node.js ≥ 20**、**pnpm ≥ 8**。

```bash
pnpm install
cp apps/api/.env.example apps/api/.env       # Windows 用 copy
cp apps/client/.env.example apps/client/.env

pnpm schema:build                             # 生成 drizzle schema
pnpm -F api build                             # 后端产物 apps/api/dist
pnpm -F client build                          # 前端产物 apps/client/.output
```

首次建库（空库要初始化表结构 + 导入语料）：

```bash
pnpm db:init
```

再选一种方式导入课程内容：

- **完整内容（推荐）**：`data/earthworm-content.sql.gz` 是本仓库当前全部内容
  （5 个课程包、语法分析、拆分树），导入方法见 [data/README.md](./data/README.md)。
- **仅内置语料**：`pnpm db:upload` 只导入内置 55 课《新概念》语料，
  且会清空已有课程（seed 脚本是整体重建），适合只要入门包的场景。

然后双击 **`start-earthworm.bat`**，等约 25 秒自动打开 http://localhost:3100 。
停止用 `stop-earthworm.bat`。

### 关于 `tools/pgsql`、`tools/redis`

这两个目录是免安装的数据库程序本体（约 170MB），**没有放进仓库**（见 `.gitignore`）。
一键脚本默认从下面两个位置启动它们：

| 需要的程序             | 放哪里                                  | 下载                                                                      |
| ---------------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| PostgreSQL 16 免安装版 | `tools/pgsql/`（含 `bin/postgres.exe`） | [EDB Binaries](https://www.enterprisedb.com/download-postgresql-binaries) |
| Redis for Windows 5.x  | `tools/redis/`（含 `redis-server.exe`） | [tporadowski/redis](https://github.com/tporadowski/redis/releases)        |

也可以不用一键脚本，直接用本机已装的 PostgreSQL / Redis，改 `apps/api/.env` 里的连接串即可，
或者沿用上游的 `docker-compose.yml`：

```bash
docker compose up -d      # 5434 / 6381
pnpm dev:serve            # 后端 dev
pnpm dev:client           # 前端 dev
```

### 神经语音（可选）

发音需要 Python 环境里的 `edge-tts`：

```bash
pip install edge-tts
```

`apps/api/.env` 里 `TTS_PYTHON` 不填则用 PATH 上的 `python`。
服务启动 15 秒后会自动补齐缺失音频（`TTS_AUTO_PREWARM=true`），也可以手动触发：

```bash
curl -X POST http://localhost:3101/tts/prewarm          # 全库补齐
curl http://localhost:3101/tts/prewarm/status           # 看进度
curl -X POST http://localhost:3101/tts/cache/purge      # 清缓存
```

关掉语音（`TTS_ENABLED=false`）也不影响使用，会自动降级到浏览器 `speechSynthesis`。

## 纯前端版（GitHub Pages）

不需要服务器和数据库，浏览器里直接用：
[https://shinelixie.github.io/localearthworm-web/](https://shinelixie.github.io/localearthworm-web/)

站点发布在独立仓库 [`shinelixie/localearthworm-web`](https://github.com/shinelixie/localearthworm-web)
（GitHub 不支持在 fork 仓库上启用 Pages，所以单独建了个非 fork 仓库）。

**两个仓库的分工**：

| 仓库                                  | 角色              | 内容                                                                                                      |
| ------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------- |
| `shinelixie/localearthworm`（本仓库） | 开发主仓库        | 全部代码 + 数据库工具链，本地版功能开发都在这里                                                           |
| `shinelixie/localearthworm-web`       | 纯 Pages 站点仓库 | 只有 `apps/client` + 课程内容 `courses.json` + 部署 workflow，不含 API / DB / 工具，改动即触发 Pages 构建 |

纯前端版的代码改动仍在本仓库开发，完成后同步到站点仓库（`git push` 同一个 commit）
发布；站点仓库不单独开发。

- **课程内容**随站点发布（`apps/client/public/data/courses.json`，由 `pnpm web-data`
  从本机库导出并提交进仓库）
- **学习数据**（进度/断点/收藏/练习记录）存本机浏览器 IndexedDB，不上传、换设备不迁移
- **发音**用微软神经语音（Jenny 美音）：整句 + 拆分语块都在本地预合成好
  （`pnpm web-tts`，见 `tools/build-web-tts.mjs`），mp3 与 `text → 地址` 清单
  （`public/tts/`、`public/data/tts-manifest.json`）随站点发布；未收录的文本
  联网走有道 dictvoice，离线退浏览器系统语音
- **没有**：按需服务端 TTS 合成、FSRS 复习排期（复习入口在，队列为空）、翻译、排行榜
- 路由用 hash（`…/#/course-pack/…`），静态服务器刷新不 404

重新发布（课程内容有更新时）：

```bash
pnpm web-data                    # 从本机 Postgres 重新导出 courses.json
pnpm web-tts                     # 补齐新增句子的预合成音频（需本地 API 在跑）
git commit -am "chore(web): 更新课程内容数据与音频"
git push github main             # 本仓库
git push webrepo main            # 站点仓库；其 GitHub Actions 自动构建并部署 Pages
```

本地构建验证：`pnpm build:web`（产物在 `apps/client/.output/public`，
`npx serve apps/client/.output/public` 可预览）。
仓库名不是 `xxx.github.io` 时站点在 `https://<用户>.github.io/<仓库名>/`。

## 数据在哪 / 怎么备份

| 内容                 | 位置                                   |
| -------------------- | -------------------------------------- |
| 学习记录、课程、进度 | `tools/pgdata/`（PostgreSQL 数据目录） |
| 句子音频缓存         | `storage/tts/<hash前2位>/<hash>.mp3`   |
| 上传的封面           | `apps/client/public/covers/`           |

换电脑时：先 `stop-earthworm.bat` 正常关闭数据库，再整包拷走，在 `tools/` 放回
PostgreSQL / Redis，`pnpm install` 后重新构建即可。

## 文档

| 文档                                     | 内容                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| [使用说明.md](./使用说明.md)             | 面向使用者：首页、课程列表、怎么学一节课、发音、设置、收藏、加自己的课程、常见问题 |
| [课程包导入说明.md](./课程包导入说明.md) | CSV 格式、命令行导入、分批导入、封面怎么设                                         |
| [部署说明.md](./部署说明.md)             | 一键启动、端口、目录结构、数据库结构变动、维护命令                                 |
| [界面改版说明.md](./界面改版说明.md)     | 历次界面改版的实现记录（设计取舍、踩过的坑）                                       |

站内也有同样的文档：打开 http://localhost:3100/help 。

## 目录结构

```
earthworm/
├── start-earthworm.bat / stop-earthworm.bat   一键启停
├── apps/api/            NestJS 后端（3101）
├── apps/client/         Nuxt 3 前端（3100）
├── packages/schema/     drizzle 表结构
├── packages/xingrong-courses/  语料与 CSV 导入器
├── tools/
│   ├── tts-worker/      edge-tts 常驻合成进程
│   ├── build-help-docs.mjs      生成站内帮助文档
│   ├── build-wordinfo.mjs       生成逐词释义表
│   └── shot.mjs / test-answer-audio.mjs   截图与朗读回归脚本
├── docs/screenshots/    README 用图
└── storage/tts/         音频缓存（运行时生成，不入库）
```

## 版本

当前版本 **v0.1**，见 [Releases](../../releases)。
分支约定：`main` 为开发主线，`release/0.1` 为当前版本快照。

## 许可与致谢

本项目沿用上游的 **AGPL-3.0** 许可（见 [LICENSE](./LICENSE)）。
原始项目：[cuixueshe/earthworm](https://github.com/cuixueshe/earthworm)，
界面与课程语料的大部分功劳属于原作者与贡献者。
