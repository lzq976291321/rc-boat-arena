# 项目目录与职责

本文件是目录组织的维护约定。按“项目用途 → 功能模块 → 必要职责”归档；新增文件先找对应目录。只有实际需要时才建目录，不建立空的架构层。

## 目录地图

```text
rc-boat-arena/
├── index.html                  竞速页面入口，对应 /
├── swamp/index.html            湿地页面入口，对应 /swamp/
├── library/index.html          素材库页面入口，对应 /library/
├── src/                        浏览器运行代码
│   ├── arena/                  松岚湖竞速
│   │   ├── main.js             组装玩法、场景和界面，启动主循环
│   │   ├── gameplay/           参数、赛道、物理、比赛、AI、回放、成绩
│   │   ├── rendering/          船体、湖景、水面、道具、镜头
│   │   └── ui/                 输入、界面和样式
│   ├── swamp/                  湿地探索：航行、景观、水面、声音和页面
│   ├── library/                素材库：收藏数据、异步预览、界面和样式
│   └── shared/                 已被多个功能实际使用的基础能力
│       ├── assets/             模型字节缓存、请求去重、GLTF 异步加载
│       ├── input/              竞速与湿地共用的移动端摇杆
│       ├── rendering/          资源释放与画布像素预算
│       └── styles/             三个页面共用的 Tailwind 构建入口
├── public/                     原样复制到发布目录的公开资源
│   └── assets/
│       ├── swamp/              湿地模型、来源说明和 manifest
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
| 改两个场地共用的触屏摇杆 | `src/shared/input/` | 共用触控、回中和样式；场地负责启停与转向坐标映射 |
| 改湿地探索 | `src/swamp/` | 只服务湿地；模块较少，当前不继续拆目录 |
| 改收藏、过滤、备份或模型预览 | `src/library/` | 收藏元数据与模型文件分别管理 |
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

- HTML 入口只承载对应页面结构，行为代码在 `src/`；三个公开入口与现有模型 URL 保持稳定。
- `main.js` 负责组装模块；`gameplay/` 不依赖 `rendering/` 或 `ui/`。渲染、界面可以读取玩法参数与状态。
- 湿地、竞速、素材库分别维护，通过 `shared/` 复用加载、缓存、资源释放与像素预算；共享层不反向依赖业务模块。素材库预览程序道具直接动态复用竞速的构造函数，不复制模型实现。新共享代码必须有真实消费者，不预建空服务层。
- 一个目录直接包含的代码文件以 3–8 个为宜。超过 10 个时先按具体职责拆分；不要只按文件扩展名机械分组。
- `public/` 不是素材收件箱；`artifacts/` 不是运行资源；`dist/` 不是源码。收藏、成绩在浏览器存储，JSON 导出文件是用户备份，不是默认项目配置。
- 根目录只放网页主入口、项目配置和维护入口文档；新的报告、脚本、模型均放入职责目录。

## 目录变更的检查

移动文件时同步更新相对 import、HTML 引用、`package.json` 命令、`import.meta.url` 相对路径、目录清单和文档链接。不要通过复制同一份源码到旧目录维持两套实现。

```bash
pnpm check:gameplay
pnpm check:physics
pnpm check:sim
pnpm check:swamp
pnpm build
pnpm check:routes
pnpm check:assets
pnpm check:bundle
```

涉及 HTML 或渲染入口时，再用浏览器打开 `/`、`/swamp/`、`/library/` 检查页面、模型与控制台。构建通过、浏览器验收、提交推送与上线部署分别记录。
