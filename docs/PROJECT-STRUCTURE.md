# 项目目录与职责

本文件是目录组织的维护约定。按“项目用途 → 功能模块 → 必要职责”归档；新增文件先找对应目录。只有实际需要时才建目录，不建立空的架构层。

## 目录地图

```text
rc-boat-arena/
├── index.html                  竞速页面入口，对应 /
├── swamp/index.html            湿地页面入口，对应 /swamp/
├── cove/index.html             晴湾页面入口，对应 /cove/
├── library/index.html          素材库页面入口，对应 /library/
├── src/                        浏览器运行代码
│   ├── arena/                  松岚湖竞速
│   │   ├── main.js             组装玩法、场景和界面，启动主循环
│   │   ├── gameplay/           参数、赛道、物理、比赛、AI、回放、成绩
│   │   ├── rendering/          船体、湖景、水面、道具、镜头
│   │   └── ui/                 输入、界面和样式
│   ├── swamp/                  湿地观赏页面组装与样式
│   ├── cove/                   晴湾双船观赏页面组装与暖浅海样式
│   ├── scene-assets/           可独立消费的观赏资产
│   │   ├── catalog.js          纯元数据，不依赖渲染引擎
│   │   ├── moonwater/          湿地场景、岸景、水面、船艇、镜头与巡游
│   │   ├── sunny-cove/         浅海湾场景、船坞组合、水面、船艇、镜头与靠泊巡游
│   │   │   └── config/        纯配置：boats.js 船型适配；tour.js 既定海湾巡游与布局
│   │   └── boat-water-interaction/ 船体浮态、共享波谱与船水尾流
│   ├── library/                素材库：收藏数据、模型/观赏异步预览、界面和样式
│   └── shared/                 已被多个功能实际使用的基础能力
│       ├── assets/             模型字节缓存、请求去重、GLTF 异步加载
│       ├── input/              移动端驾驶摇杆，当前竞速使用
│       ├── rendering/          资源释放与画布像素预算
│       ├── viewing/            观赏 Canvas 宿主、页面行为/样式、水声和复用效果
│       └── styles/             四个页面共用的 Tailwind 构建入口
├── public/                     原样复制到发布目录的公开资源
│   └── assets/
│       ├── swamp/              湿地模型、来源说明和 manifest
│       ├── cove/               晴湾来源说明和 manifest；模型复用原有公开路径
│       ├── runtime/            场景专用轻量模型、来源与交付清单
│       └── library/            项目素材目录、公开接入说明
├── tools/                      开发时执行的工具，不进入网站运行代码
│   ├── checks/                 可重复执行的正式回归、模拟和路由检查
│   ├── assets/                 Blender 导出等素材处理工具
│   └── local/                  本机历史实验脚本，不提交、不作为正式验收
│       ├── browser/            稳定性、录屏与浏览器流程实验
│       ├── gameplay/           驾驶、按键与防作弊实验
│       ├── visual/             图像分析、配色、曝光与视觉探针
│       └── dsh/                DSH 本机集成实验
├── docs/                       维护说明、设计决策与项目约定
│   ├── PROJECT-STRUCTURE.md    本目录约定
│   └── design/                 画面方向与设计记录
├── dsh-plugin/                 可选的本机 DSH 集成
│   ├── install.mjs             启用、停用和状态查询
│   └── lib/                    宿主静态服务与面板客户端
├── artifacts/                  本地截图、录屏、验收记录与历史证据
│   └── reports/                从根目录归档的历史验收报告
├── dist/                       Vite 构建输出，可重新生成
├── node_modules/               安装的依赖，可重新生成
├── .vercel/                    本地 Vercel 项目关联
├── AGENTS.md                   本项目的协作入口
└── 项目配置文件                package.json、锁文件、Vite/Vercel 配置等
```

`tools/local/`、`artifacts/`、`dist/`、`node_modules/`、`.vercel/` 均为本地内容，不随 Git 提交。目录是否出现在本机取决于是否运行过相应工具。

## 新内容放哪里

| 要做的事情 | 放置位置 | 维护要求 |
| --- | --- | --- |
| 改船的加速、碰撞、赛制或 AI | `src/arena/gameplay/` | 保持可在 Node 中运行的纯逻辑；成绩存储只在调用时访问浏览器存储 |
| 改船外观、水面、岸景或镜头 | `src/arena/rendering/` | 负责 Three.js 对象，不把 DOM 界面放在这里 |
| 改按键、触屏、HUD 或竞速页面样式 | `src/arena/ui/` | 输入采集与玩法计算分开 |
| 改触屏驾驶摇杆 | `src/shared/input/` | 触控、回中和样式；使用方负责启停与转向坐标映射 |
| 改湿地或晴湾观赏页面 | `src/swamp/`、`src/cove/` | 页面只传配置和维护样式；共同操作使用 `shared/viewing/page.js`，通过观赏资产 API 控制画面 |
| 适配晴湾船型、调整巡游与镜头时长 | `src/scene-assets/sunny-cove/config/` | 船型参数与场景实现分开；尺寸为展示设定，码头、岸线和镜头安全范围需一起验证 |
| 改可复用的观赏画面与运镜 | `src/scene-assets/<资产名>/` | 场景与 Canvas 工厂分开；子模块暴露独立工厂，明确资源所有权和释放责任 |
| 改多个观赏场景共同使用的能力 | `src/shared/viewing/` | 当前真实复用的 Canvas/页面宿主、声音和效果；场景差异由配置或独立工厂提供 |
| 登记观赏资产 | `src/scene-assets/catalog.js` | 只放元数据，保留作者与组合许可，不静态依赖 Three.js |
| 改收藏、过滤、备份或素材预览 | `src/library/` | 收藏元数据与运行资产分别管理；模型和观赏预览互斥，切换取消旧请求 |
| 修改跨场景加载或渲染基础能力 | `src/shared/assets/`、`src/shared/rendering/` | 至少有真实消费者；说明缓存上限、资源所有权和释放方式 |
| 调整 Tailwind 接入与样式约定 | `src/shared/styles/`、`docs/STYLING.md` | 页面分别声明扫描范围；普通布局用工具类，重复组件可用 `@apply` |
| 接入可公开发布的模型和纹理 | `public/assets/<用途>/` | 登记来源、许可、尺寸、面数、字节数和加工记录；用户明确删除的资产同步清理运行引用 |
| 保存未筛选下载包、原始工程、订单凭证 | 仓库外的本地素材目录 | 不放入 `public/`；不要将完整购买文件当成网站资源 |
| 添加可重复执行的检查 | `tools/checks/` | 在 `package.json` 暴露 `check:*` 命令，默认不依赖个人绝对路径 |
| 添加模型转换或纹理处理脚本 | `tools/assets/` | 源路径与输出路径通过参数传入 |
| 做一次性试验 | `tools/local/<用途>/` | 本地保留，成熟后整理为正式工具再提交 |
| 写规范、方案、设计决策 | `docs/` 或 `docs/design/` | 写事实、理由与验收条件；正式维护文档进入 Git |
| 保存截图、视频、测试结果 | `artifacts/<主题>/<日期>/` | 与源代码分开；旧证据按原路径保留以避免历史链接失效 |

## 依赖与规模

- HTML 入口只承载对应页面结构，行为代码在 `src/`；四个公开入口与现有模型 URL 保持稳定。
- `main.js` 负责组装模块；`gameplay/` 不依赖 `rendering/` 或 `ui/`。渲染、界面可以读取玩法参数与状态。
- 湿地页、晴湾页分别与素材库消费同一份 `scene-assets/moonwater` 和 `scene-assets/sunny-cove`，不复制观赏画面实现；Canvas 工厂负责完整观赏生命周期，场景工厂允许已有 renderer 组合，独立镜头工厂接受调用方的 camera 与水道边界。接入方式见 [观赏资产](design/VIEWING-ASSETS.md)。
- 晴湾页面通过场景入口导入船型与工厂；纯元数据消费者可直接读取不依赖 Three.js 的 `sunny-cove/config/boats.js`。同场景换船由场景实例管理，不重建整个 Canvas。`config/tour.js` 维护既定海湾的策划配置，不充当通用码头或航线编辑器。
- 竞速、观赏资产与素材库通过 `shared/` 复用加载、缓存、资源释放与像素预算；共享层不反向依赖业务模块。素材库预览程序道具直接动态复用竞速的构造函数。新共享代码必须有真实消费者，不预建空服务层。
- 素材列表和观赏资产元数据不静态引入 Three.js。静态 GLB 预览按需绘制；观赏预览仅在可见且前台时持续动画，关闭时释放所属资源。查看、镜头切换与预览不写服务器。
- 一个目录直接包含的代码文件以 3–8 个为宜。超过 10 个时先按具体职责拆分；不要只按文件扩展名机械分组。
- `public/` 不是素材收件箱；`artifacts/` 不是运行资源；`dist/` 不是源码。收藏、成绩与晴湾的船型/氛围/镜头偏好在浏览器存储，不跨设备同步；JSON 导出文件是用户备份，不是默认项目配置。
- 根目录只放网页主入口、项目配置和维护入口文档；新的报告、脚本、模型均放入职责目录。

## 目录变更的检查

移动文件时同步更新相对 import、HTML 引用、`package.json` 命令、`import.meta.url` 相对路径、目录清单和文档链接。不要通过复制同一份源码到旧目录维持两套实现。

```bash
pnpm check:gameplay
pnpm check:physics
pnpm check:sim
pnpm check:swamp
pnpm check:viewing
pnpm check:cove
pnpm check:contact
pnpm build
pnpm check:routes
pnpm check:assets
pnpm check:bundle
```

涉及 HTML 或渲染入口时，再用浏览器打开 `/`、`/swamp/`、`/cove/`、`/library/` 检查页面、模型与控制台。构建通过、浏览器验收、提交推送与上线部署分别记录。
