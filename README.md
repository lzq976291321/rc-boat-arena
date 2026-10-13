# 晴湾船坞 · Sunny Cove

基于 Three.js / WebGL2 的船模观赏项目。打开一个海湾，选船、配氛围，看它出航巡游再归港。开发集中在船体材质、水面、靠泊与镜头；船型和场景陈设通过配置组合。

网站首页 `/` 是晴湾。`/cove/`、`/swamp/` 和生产环境的 `/library/` 兼容旧链接并返回首页；竞速与湿地运行代码已移除。素材工作台保留为本地开发工具，不再公开发布。

## 运行与检查

需要 Node.js 22 或更新版本，以及 `package.json` 指定的 pnpm 版本。

```sh
corepack pnpm install --frozen-lockfile
pnpm dev
```

本地观赏入口：<http://127.0.0.1:5177/>。本地素材工作台：<http://127.0.0.1:5177/library/>，仅开发服务提供。

```sh
pnpm check:cove         # 闭环巡游、靠泊、边界、时间步长
pnpm check:viewing      # 各船型运镜、横竖屏构图与水声
pnpm check:contact      # 船水浮态、尾迹、暂停与独立释放
pnpm check:assets       # 请求去重、取消、缓存、资源释放与像素预算
pnpm check:delivery     # GLB完整性、来源清单、映射与模型预算
pnpm build             # 晴湾页面及白名单资源输出到 dist/
pnpm check:routes      # 首页、旧入口兼容、路径前缀和模型MIME
pnpm check:bundle      # 单入口依赖边界、共享引擎与发布体积预算
pnpm serve             # 本地预览构建产物
```

真实浏览器的场景回归入口是开发服务下的 `/tools/checks/cove/browser.html`。它覆盖实际模型切换、失败保留旧船、取消、连续换船、巡游与资源释放；不替代实体手机画面验收。

## 观赏与配置

船型来自 `src/scene-assets/sunny-cove/config/boats.js`，包含 Riva Aquarama、MAVERICK GT、机动交通艇与硬派充气艇。各自配置朝向、展示长度、吃水、材质处理和船水接触参数；展示尺寸不是实艇工程数据。

首次打开从前景巡游开始，一轮航行 90 秒、靠泊 18 秒。换船时当前船继续展示，新船准备成功后进入泊位，停留 4 秒再出航；失败时保留原船并提供重试。只有当前选择的船需要加载。巡游和镜头时长由 `config/tour.js` 配置，仍围绕既定海湾设计，不提供任意模型导入或自由航线编辑器。

页面提供午后、日落、暮色，以及自动观赏、船侧近观、贴水侧跟、码头定机和湾心斜览。支持暂停、拍照、沉浸模式和手动开启水声；空格暂停或继续，`H` 切换沉浸，`Esc` 恢复界面。船型、氛围和镜头保存在当前浏览器，首次查看不写偏好，不跨设备同步。

## 项目组织

| 目录 | 用途 |
| --- | --- |
| `src/cove/` | 首页组装、船型选择和样式 |
| `src/scene-assets/sunny-cove/` | 海湾、船坞、船艇、水面、镜头与巡游 |
| `src/scene-assets/boat-water-interaction/` | 船体浮态、波谱和船水尾流 |
| `src/library/` | 本地素材收藏、筛选和异步预览 |
| `src/shared/` | 模型加载、资源释放、像素预算和观赏宿主 |
| `public/assets/` | 可发布素材与来源记录；只有当前使用的白名单进入生产 |
| `tools/checks/`、`tools/assets/` | 正式检查、发布白名单和素材加工 |
| `docs/`、`artifacts/` | 维护文档与本地验收证据 |

目录与协作要求见 [项目职责](docs/PROJECT-STRUCTURE.md) 和 [AGENTS.md](AGENTS.md)。场景 API 见 [观赏资产接入](docs/design/VIEWING-ASSETS.md)，画面记录见 [晴湾设计](docs/design/SUNNY-COVE.md)。

## 模型与发布

素材先按用途组合成码头靠泊、维护陈设、休息区和岸边植被，使用数量服务于构图。完整作者、许可与加工记录保留在 [晴湾素材记录](public/assets/cove/SOURCES.md) 及各素材目录中。

Vite 禁止自动复制整个 `public/`。`tools/assets/cove-public-assets.mjs` 根据晴湾清单发布正在使用的完整原件、运行变体及来源说明，兼容这些素材原有公开 URL。素材目录只保留晴湾实际使用的 17 项；未使用的旧素材从当前版本移除，可以通过 Git 历史恢复。减少项目体积不等于首屏加载同等下降。

模型加载统一使用有限容量字节缓存，共享不可变文件字节，各场景实例独立拥有材质、几何与释放责任。素材工作台列表不静态加载 Three.js；静态模型按需绘制，观赏预览离屏或进入后台后停止无效绘制。性能事实及历史记录见 [加载与资源管理](docs/PERFORMANCE.md)。

网站无需后端和环境变量。GitHub `main` 推送通过 Vercel Git 集成自动发布，配置与验收见 [部署说明](docs/DEPLOYMENT.md)。构建、浏览器验收、提交推送与部署成功分别记录。

## 本地工作区与历史资料

项目独立存放在 `/Users/linzhiqiang/code/connected-repos/my-repos/rc-boat-arena`，与 blog 同级，不再接入 DSH 面板。当前验收产物保留在 `artifacts/sunny-cove/2026-10-13/`；早期截图、视频、素材实验和旧本机脚本已移到 `/Users/linzhiqiang/Documents/RC-Boat-Archive/2026-10-13`，没有删除历史证据。Git 历史和用户未跟踪文件保留。

历史设计记录中仍可能提到竞速、Moonwater 与四个公开页面；那些描述对应当时版本，不是当前维护范围。
