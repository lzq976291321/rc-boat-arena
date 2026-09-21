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
