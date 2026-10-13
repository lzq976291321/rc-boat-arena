# 项目目录与职责

当前项目只维护晴湾观赏体验。首页是晴湾，旧场景链接跳转到首页，素材工作台只供本地开发。竞速和 Moonwater 的旧设计记录保留为历史证据，不再要求维护对应实现。

## 目录地图

```text
rc-boat-arena/
├── index.html                  晴湾首页，对应 /
├── cove/index.html             旧晴湾链接兼容入口
├── swamp/index.html            旧湿地链接兼容入口
├── library/index.html          本地素材工作台；生产仅生成首页跳转
├── src/
│   ├── cove/                   晴湾页面组装、选船界面与样式
│   ├── scene-assets/
│   │   ├── catalog.js          晴湾观赏资产纯元数据
│   │   ├── sunny-cove/         海湾、船坞、水面、船艇、镜头和巡游
│   │   │   └── config/         船型、陈设与既定海湾配置
│   │   └── boat-water-interaction/ 船体浮态、波谱与船水尾流
│   ├── library/                本地收藏、筛选、模型和观赏资产预览
│   └── shared/
│       ├── assets/             有界字节缓存、请求去重、GLTF加载与变体映射
│       ├── rendering/          GPU资源释放与画布像素预算
│       ├── viewing/            Canvas宿主、页面行为、水声和公共样式
│       └── styles/             Tailwind构建入口
├── public/
│   └── assets/
│       ├── cove/               当前使用素材清单与来源说明
│       ├── runtime/            场景轻量模型、交付清单与加工记录
│       └── library/            本地素材目录；仅被晴湾引用的资源进入生产
├── tools/
│   ├── checks/                 模型、航线、运镜、生命周期、构建和路由检查
│   ├── assets/                 素材处理与cove-public-assets.mjs发布白名单
│   └── local/                  本机实验，不作为正式验收
├── docs/                       维护约定、设计与历史记录
├── artifacts/                  本地截图、录屏与验收记录
├── dist/                       可重新生成的构建输出
├── node_modules/               可重新安装的依赖
├── .vercel/                    本机Vercel项目关联
└── AGENTS.md、项目配置文件
```

`tools/local/`、`artifacts/`、`dist/`、`node_modules/`、`.vercel/` 按 `.gitignore` 保持本地。素材目录只保留晴湾实际使用的17项，未用旧素材可从Git历史恢复。历史截图、录屏和实验已归档到 `/Users/linzhiqiang/Documents/RC-Boat-Archive/2026-10-13`；当前验收留在项目内。项目与blog同级独立维护，不再接入DSH。

## 新内容放哪里

| 内容 | 位置 | 要求 |
| --- | --- | --- |
| 页面交互、选船和布局 | `src/cove/` | 页面只组装配置，不复制场景实现 |
| 船型适配与陈设参数 | `src/scene-assets/sunny-cove/config/` | 尺度、入水、摆放和接触参数明确；与镜头、岸线一起验收 |
| 海湾画面、船坞、运镜和巡游 | `src/scene-assets/sunny-cove/` | 工厂明确更新和释放责任 |
| 浮态、波谱、接触水面与尾迹 | `src/scene-assets/boat-water-interaction/` | 船体和水面使用同一套输入；切换时清除上一船型状态 |
| 模型加载与GPU公共能力 | `src/shared/assets/`、`src/shared/rendering/` | 必须有真实消费者，缓存有界，不反向依赖业务 |
| Canvas宿主、观赏行为和水声 | `src/shared/viewing/` | 晴湾页面与本地资产预览共享；场景差异用配置 |
| 素材收藏、筛选、备份和预览 | `src/library/` | 只供本地开发；元数据不静态依赖Three.js |
| 样式接入规则 | `src/shared/styles/`、`docs/STYLING.md` | 普通布局用完整工具类，各入口明确扫描范围 |
| 可发布模型与纹理 | `public/assets/<用途>/` | 来源、许可、字节、哈希与加工记录完整；场景清单决定生产发布 |
| 原始工程、未筛选下载包和购买凭证 | 仓库外 | 不放进公开目录 |
| 可重复检查与素材加工 | `tools/checks/`、`tools/assets/` | 无个人绝对路径；参数明确 |
| 设计记录与验收产物 | `docs/design/`、`artifacts/<主题>/<日期>/` | 当前证据按日期保留；早期证据移出项目归档，记录其位置 |

## 依赖与规模

- 生产只构建 `index.html` 这一个应用入口；兼容页面仅负责跳转。本地素材工作台不进入生产依赖图。
- 晴湾页面和素材工作台预览消费同一份 `scene-assets/sunny-cove`。Canvas工厂提供完整生命周期，场景工厂支持已有renderer组合，独立工厂明确资源所属。
- 页面通过场景入口获取船型与工厂；纯元数据消费者可直接使用不依赖Three.js的配置文件。同场景换船不重建整个Canvas。
- 静态模型按需绘制，自动巡游只在可见且前台时更新；取消、关闭、替换均释放所属资源。查看和切镜头不写服务器。
- 素材收藏、备注和晴湾偏好只保存在当前浏览器，不跨设备同步。
- 一个目录直接代码文件宜为3–8个，超过10个按实际职责拆分；只提取真实复用，不预建空层。
- `public/` 是可发布素材目录，**不再整目录复制**。白名单包含晴湾使用中的原始模型、运行变体与来源文件，兼容其原始URL；未用库模型不发布。
- 预算门槛：默认船首屏GLB不超过1.5 MB，其他船不超过2 MB，完整单船场景不超过8 MB，兼容原件后的整个发布目录不超过85 MB。这些是检查目标，实测值以当次检查输出为准。
- 不用修改 `dist/`、依赖文件或提高预算阈值掩盖源实现问题。

## 目录变更检查

移动文件时更新import、HTML、脚本命令、`import.meta.url`、模型映射与文档链接。旧场景移除不能通过复制旧源码保留第二套实现。

```sh
pnpm check:cove
pnpm check:viewing
pnpm check:contact
pnpm check:assets
pnpm check:delivery
pnpm build
pnpm check:routes
pnpm check:bundle
```

浏览器验收首页各船型、氛围、镜头、换船失败与恢复、手机横竖屏；验证旧 `/cove/`、`/swamp/`、`/library/` 生产链接返回正确前缀的首页。本地素材工作台另验列表和按需预览。构建、浏览器、Git推送与部署成功分开记录。
