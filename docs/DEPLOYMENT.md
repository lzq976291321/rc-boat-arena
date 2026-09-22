# GitHub 与 Vercel 自动部署

GitHub 仓库：`lzq976291321/rc-boat-arena`（私有）。Vercel 项目：`rc-boat-arena`，所属团队 `sz976291321-gmailcoms-projects`。使用 Vercel 原生 GitHub 集成，生产分支为 `main`。

提交并推送到 `main` 后，Vercel 自动拉取对应提交、安装依赖、构建并更新生产域名。其他分支的推送产生预览部署。无需在仓库或 GitHub Actions 中存储 Vercel Token，也无需在每次推送后执行手动上传命令。

## 构建约定

以下配置以根目录 `vercel.json` 为准：

| 项目 | 值 |
| --- | --- |
| 框架 | Vite |
| 安装 | `corepack pnpm install --frozen-lockfile` |
| 构建 | `pnpm run build` |
| 输出 | `dist/` |
| 页面 | `/`、`/swamp/`、`/library/` |

`package.json` 固定 pnpm 版本，`pnpm-lock.yaml` 固定依赖，`pnpm-workspace.yaml` 允许 esbuild 必需的安装脚本。Vercel 项目当前使用 Node.js 24.x。

## 域名与论坛旧链接（待上线）

目标域名分工如下；本节和 `vercel.json` 的提交仅表示迁移配置已准备，域名归属、DNS、证书和公开页面仍须部署后核验。

| 域名 | 目标项目与用途 |
| --- | --- |
| `www.rcmyq.cn` | `rc-boat-arena`：`/` 竞速、`/swamp/` 湿地、`/library/` 素材库 |
| `forum.rcmyq.cn` | 原论坛项目，保留论坛原有路径 |

`vercel.json` 为旧论坛入口返回 308 永久跳转，目标为 `https://forum.rcmyq.cn`，保留对应路径和完整查询参数：`/t`、`/u`、`/guide` 及各自子路径，以及 `/rc-forum`、`/new`、`/login`、`/register`、`/feed.xml`、`/api/og`、`/sitemap.xml`。只有根路径 `/` 带 `node`、`q`、`page`、`filter` 中任意一个查询键时才跳到论坛；例如 `/?node=boat&page=2` 跳至 `https://forum.rcmyq.cn/?node=boat&page=2`。普通 `/` 和仅带其他参数的根路径仍是游戏；`/swamp/`、`/library/`、`/assets/` 不匹配论坛跳转。

项目保留 `trailingSlash: true`。Vercel 会先为无扩展名的路径补尾斜杠，再处理自定义跳转，因此旧链接规则同时接收有无尾斜杠的路径；无尾斜杠的旧论坛路径可能先经历一次同域 308。带文件扩展名的 `/feed.xml`、`/sitemap.xml` 不会补斜杠。完整路径包含这一步规范化后的尾斜杠；论坛最终是否去掉尾斜杠由论坛项目决定。

迁移顺序是先将 `forum.rcmyq.cn` 接入原论坛项目，完成 DNS、TLS、页面及登录入口核验，再发布本项目的兼容规则并将 `www.rcmyq.cn` 转给本项目。上线后分别检查普通游戏根路径、带论坛查询参数的根路径、帖子/用户/指南链接、订阅与站点地图；检查跳转链的状态码、`Location`、全部查询参数以及最终页面。`has` 条件在 `vercel dev` 中不能作为验收依据，需在 Vercel 预览部署和正式域名验证。

回滚需分别处理部署和域名：规则有误时恢复本项目上一个生产部署；需要恢复主站论坛时，还须把 `www.rcmyq.cn` 的项目归属及实际改动过的 DNS 恢复为迁移前记录。保留 `forum.rcmyq.cn` 的论坛服务，直到旧链接兼容不再需要。Git 回退不会恢复云端域名归属、DNS、TLS、论坛环境变量或浏览器已经缓存的永久跳转；不要把源码回滚写成完整迁移回滚。主域游戏后续若新增 `node`、`q`、`page` 或 `filter` 参数，需要先调整这里的论坛兼容约定。

语法和平台行为参考 [Vercel redirects 配置](https://vercel.com/docs/project-configuration/vercel-json#redirects)、[查询参数跳转](https://vercel.com/kb/guide/how-do-i-perform-vercel-redirects-based-on-query-strings)、[trailingSlash 配置](https://vercel.com/docs/project-configuration/vercel-json#trailingslash)。

## 提交前与部署后

提交前运行项目已有检查：

```sh
pnpm check:gameplay
pnpm check:physics
pnpm check:sim
pnpm check:swamp
pnpm check:assets
pnpm build
pnpm check:routes
pnpm check:bundle
```

部署后核对 Vercel 记录的提交 SHA、来源 `git`、目标 `production` 和状态 `READY`，再打开三个生产页面检查模型、页面交互和控制台。GitHub 推送成功本身不代表网站已发布成功。

网页只发布 Vite 构建输出。源码与公开运行素材进入 Git；`.env*`、本机 DSH 状态、依赖、构建输出、`tools/local/`、模型原始工程和 `artifacts/` 按 `.gitignore` 保持本地。模型转换工具位于 `tools/assets/`，本地转换产物只有在完成运行接入和来源许可核对后才进入 `public/`。

自动部署机制参考 [Vercel GitHub 集成文档](https://vercel.com/docs/git/vercel-for-github)。
