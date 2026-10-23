# 加载、复用与资源管理

## 2026-10-22 运行资源再压缩与首屏预加载

本轮只改传输与加载路径，不改三角形拓扑、顶点坐标、节点变换、材质槽或船水参数。基准是当时已发布的 17 个 runtime GLB，完整库原件未动。

| 指标 | 优化前 | 优化后 | 变化 |
| --- | ---: | ---: | ---: |
| 17 个运行 GLB 合计 | 9,637,908 B | 6,448,212 B | -33.1% |
| 运行贴图字节 | 3,434,278 B | 1,689,913 B | -50.8% |
| 默认船首屏核心 GLB（Riva + 码头 + 两岸石） | 1,413,160 B | 866,892 B | -38.7% |
| 默认 Riva 单船 | 673,008 B | 240,228 B | -64.3% |
| Riva 完整场景 | 6,435,448 B | 4,000,548 B | -37.8% |
| 其余船完整场景 | 6.78–6.92 MB | 4.34–4.85 MB | -28% 左右 |
| 发布目录（含完整库原件） | 73,747,748 B | 70,569,974 B | 约 -4.3% |

不透明贴图优先改为 AVIF 4:4:4（保留 PBR 通道独立性），透明贴图使用 WebP 并把 alpha 以 lossless 方式保存。编码从当前交付图开始，颜色图 PSNR ≥ 36 dB、法线/ORM 等数据图 ≥ 38 dB；达不到阈值的贴图保留原 JPEG/PNG，因此 Maverick GT 仍有 JPEG 贴图。材质实际只引用 0 号 UV，故移除 `TANGENT` 与 `TEXCOORD_1+`；Assault Boat 因此从 1,012,880 降到 579,616 字节。AVIF/WebP 由 `EXT_texture_avif`、`EXT_texture_webp` 声明，不再内嵌回退图；需要 Chrome 85+、Firefox 93+、Safari 16.4+。

第二轮继续削减几何占比最高的内容，没有删除模型：蓝花楹从完整库原件重建并减面，叶冠 57,658→34,595 面（总 103,674→80,611 面，相对误差 0.00365），贴图上限 512→384，文件 2,978,264→2,036,196 字节；提灯 33,902→16,950 面（376,060→219,212 字节），shrub-04 27,327→13,639 面（356,988→231,636 字节），两者改为 16 位索引。减面使用法线/UV 权重和误差上限，保留主干、冠形与材质槽。树冠在固定机位的全画面平均像素差为 0.578/255，但画面含大片空白；排除空白后平均差为 **1.174/255**，差异超过 8 的像素约 **3.18%**，明显高于原定 0.5% 门槛。冠形与构图肉眼相近，但这是一次明确的画质取舍，**不能算原门槛通过**；蓝花楹停止继续减面。

首屏侧：`index.html` 内联脚本读取当前浏览器的 `sunny-cove.preferences.v1`，在模块图解析前预加载对应船型 GLB（默认 Riva）。实测资源时间线中该文件只出现一次实际下载，后续调用命中缓存。素材来源清单原来在启动时请求，现改为首次打开“来源”对话框时再取（约 16 KB JSON）。构建产物移到 `assets/build/`：该目录由 Vite 内容哈希命名，Vercel 设置一年 immutable；`assets/runtime/`、`assets/library/`、`assets/cove/` 设置 1 小时缓存 + 1 天 stale-while-revalidate，避免未哈希 URL 长期锁死旧模型。

无头 Chrome（SwiftShader、1440×900、2 Mbps / 40 ms、冷缓存）下，四个首屏 GLB 的最后完成时间由约 6.36 s 降到 4.26 s（-33%）；页面 `ready` 仅从约 6.7–6.9 s 降到 6.6 s，因为软件渲染的着色器编译与首帧占主导，这个 ready 数字不能当作真机首屏时间。预加载 `<link rel=preload as=fetch>` 必须带 `crossorigin="anonymous"` 才能与 `fetch()` 的 CORS 模式合并；缺少时，大文件尚未下载完就会触发第二次请求。真机与公网测量仍未做。

验证：`check:cove` 5 项、`check:viewing` 8 项、`check:contact` 19 项、`check:assets` 8 项、`check:delivery`（含贴图格式声明与未使用属性断言）、`check:routes` 8 项、`check:tools` 2 项、构建和 `check:bundle` 通过。真实 GLB/WebGL 工厂检查 36 项通过，四轮全船切换后 46 geometry / 59 texture 稳定、双实例释放归零。固定机位前后截图：船体与道具平均像素差 0.007–0.225/255，超过 8 的像素约 0.2%；蓝花楹按排除空白的区域口径为 1.174/255、3.18% 像素超过 8。无头浏览器使用 SwiftShader，不能代表实体手机帧率或公网下载时间；本轮未部署。

工具修复（2026-10-22 复验后）：`optimize-glb.py` 的纹理校验改为按**输出** MIME 判断扩展，并保留纹理上的其他扩展；已用 `painted-wooden-bench` 的库原件复现并验证 `--avif --webp` 可重复运行。`texture_roles()` 现在同时解析 core `source` 和 `EXT_texture_avif` / `EXT_texture_webp` 里的 source，重复压缩时法线/ORM 使用 38 dB 数据门槛；输出声明随新 MIME 替换，`--node` 子集也会保留扩展贴图。报告新增 `is_data_texture`、`minimum_psnr_db`、`retained_input`，可区分“按门槛重编码”和“保留原图、没有新增损失”。`publish-cove-runtime.mjs` 与 `publish-cove-model.mjs` 改为先校验全部输入、再写临时文件并重命名；任一步失败会恢复原模型和清单。回归检查 `pnpm check:tools` 用隔离目录覆盖“第二个模型校验失败时第一个不得被替换”和成功发布两种路径。

重复压缩复现（当前蓝花楹解压后重压）：

```sh
node tools/assets/decompress-glb.mjs public/assets/runtime/jacaranda-tree.glb /tmp/tree.glb --report /tmp/tree-decompress.json
python3 tools/assets/optimize-glb.py /tmp/tree.glb /tmp/tree-recompressed.glb --avif --webp --report /tmp/tree-recompress.json
# 检查 /tmp/tree-recompress.json：is_data_texture=true 的 minimum_psnr_db 应为 38，
# 且 psnr_db >= 38，或 retained_input=true（保留原图，不新增损失）。
```

验收时可先核对这几个固定值：`public/assets/runtime` 下 17 个 GLB 之和为 6,448,212 字节；`check:delivery` 输出的默认首屏 `coreBytes` 为 866,892、`runtimeImageBytes` 为 1,689,913；贴图格式集合为 avif/jpeg/webp；蓝花楹清单为 2,036,196 字节 / 80,611 面。任何一项与清单或文件哈希不符，都应先重新生成清单而不是直接改数字。

可复现工具（Python 需带 AVIF/WebP 支持的 Pillow）：

```sh
node tools/assets/optimize-cove-runtime.mjs --python /path/to/python-with-pillow
node tools/assets/publish-cove-runtime.mjs
pnpm check:delivery
pnpm build
pnpm check:routes
pnpm check:bundle
```

`optimize-cove-runtime.mjs` 先展开 Meshopt 数据，再由 `prepare-startup-glb.py --avif --webp --drop-unused-attributes` 处理，最后用 `bound-startup-glb.mjs` 重新压缩；逐文件输入/输出 SHA、贴图 PSNR、格式和丢弃属性写在 `tools/local/cove-runtime/report.json`（本机生成，不发布）。`publish-cove-runtime.mjs` 会拒绝覆盖在优化后又被改动过的运行文件，并同步 `public/assets/runtime/asset-manifest.json`。单模型重建（如蓝花楹、提灯）用：

```sh
node tools/assets/build-cove-dressing.mjs --python /path/to/python-with-pillow \
  --only jacaranda-tree --tree-ratio .12 --texture-size 384 --avif --webp --drop-unused-attributes \
  --output-root tools/local/cove-tree-384
node tools/assets/publish-cove-model.mjs --id jacaranda-tree \
  --file tools/local/cove-tree-384/jacaranda-tree.glb \
  --textures tools/local/cove-tree-384/jacaranda-tree/textures.json \
  --geometry tools/local/cove-tree-384/jacaranda-tree/geometry.json \
  --simplification tools/local/cove-tree-384/report.json
```

## 2026-10-05 第二轮：首屏可用低于 3 秒

本地生产构建完成，尚未提交、推送或部署。Chromium、1280×800、DPR 1、减少动态效果；每次新建浏览器上下文并禁用缓存，CDP 下载 1,250,000 B/s（10 Mbps）、延迟 40 ms。四入口各测三次，以下为最终构建的实际结果：

| 页面 | 三次首屏可用 | 最慢一次 | 核心 GLB |
| --- | --- | ---: | ---: |
| 竞速 | 1.621 s / 1.600 s / 1.607 s | 1.621 s | 1.443 MB |
| 晴湾 | 1.647 s / 1.589 s / 1.586 s | 1.647 s | 1.413 MB |
| 湿地 | 1.655 s / 1.641 s / 1.629 s | 1.655 s | 1.467 MB |
| 素材库完整首个船模 | 2.443 s / 2.414 s / 2.404 s | 2.443 s | 2.217 MB |

验收终点同时要求真实模型准备好、Canvas 已完成绘制且主要操作可用。竞速检查 `ready`、`firstReadyFrameAt` 和开始按钮；晴湾/湿地检查 `ready`、`renderCount` 和暂停按钮；素材库检查首个完整模型的 `ready` 与预览容器的 `renderCount`。所有计时从页面 navigation start 起，包含代码下载、GLB 下载与解析、初始化和首次绘制。较第一轮仅观察 ready 的方式更严格，旧数值保留作历史记录。未用空画布或纯加载提示代替验收。另按默认持续动画模式各冷启动一次，竞速 1.623 s、晴湾 1.625 s、湿地 1.649 s、素材库 2.411 s，同样全部低于 3 s。

此次为场景新增 10 个独立 runtime 变体，每组首屏模型小于 1.5 MB，并在 HTML 预加载关键模型。GLTF 模块直接带入小型 MeshoptDecoder，避免它在大模型下载后排队；纯素材列表仍不静态依赖 Three.js。实际浏览器每个预加载 GLB 只出现一次资源请求。完整单模型素材库保持原 URL、原完整文件与预览行为。

场景变体不减面，船模最长贴图边 512、其他变体 256，几何 FLOAT 使用有界精度编码。最大实测位置误差为原模型单位的 0.000122071，法线/切线分量 0.000488282，UV 分量 0.000244141；码头文件只包含实际使用的 planks 节点及依赖。与第一轮完整模型的无损几何压缩不同，此批变体允许明确的精度/贴图分辨率取舍。来源、许可、加工说明和 SHA 见 `public/assets/runtime/`。源码工具从未压缩原始文件生成，并通过独立重建确认 10 个 SHA 全部一致。

晴湾先显示船、水面、完整码头结构与岩岸，树冠/灌木/家具稍后补齐；湿地先显示船、程序树林、岸线与水面，扫描树木在相同位置替换，树位、碰撞和根系不重复。暂停时详情完成或部分失败都会补画，关闭/切换和独立宿主的取消信号均终止详情请求。细节失败保留首屏及可用操作；关键模型失败仍显示重试。

**3 秒是首屏可用目标，不是所有景物下载完成。** 同一限速的全流程测量：晴湾全部细节约 22.46 s，湿地约 8.75 s；竞速全部 GLB 下载约 22.40 s。相应全部 GLB 分别约 26.96 / 9.94 / 26.97 MB。测速未模拟慢 CPU，未覆盖实体手机或公网部署，因此不能声称所有设备与网络都低于 3 秒。

已完成浏览器截图对照、10 个 runtime 经生产加载器解析、四入口模拟手机视口、开始驾驶、失败/重试、后台细节失败与暂停重绘、素材库切换取消和静止停止绘制。构建及 `check:assets`、`check:delivery`、`check:bundle`、`check:routes`、`check:gameplay`、`check:swamp`、`check:viewing`、`check:cove`、`check:contact` 通过。交付检查覆盖 57 个 GLB、366 个压缩视图、48 项映射/完整模型选择断言，三场景核心预算固定为 1,500,000 B。

证据位于 `artifacts/performance/2026-10-05/`：`round2-repeat.json`（12 次计时与逐请求）、`round2-normal-motion.json`（默认动画模式）、`round2-probe.json`（含完整细节）、`startup-models.json`（逐属性误差/可复现命令/工具 SHA）、`round2-browser-acceptance.json` 与 `round2-details.json`（浏览器检查）以及 `round2-*.png`。生成工具：

```bash
node tools/assets/build-startup-models.mjs --python /path/to/python-with-pillow --source-root /path/to/originals/assets/library --output-root tools/local/startup-models
pnpm check:assets
pnpm check:delivery
pnpm build
pnpm check:bundle
```

## 2026-10-05 第一轮历史测量

已完成本地实现、生产构建和浏览器核验；未提交、推送或部署。以下为同一台机器上的 Chromium、1280×800、DPR 1、减少动态效果、冷缓存，CDP 固定 10 Mbps 下载和 40 ms 延迟的单次前后测量，不是公网或实体手机测速。

| 页面 | 优化前可用 | 优化后可用 | 原先必等 GLB | 当前必等 GLB | 当前完整 GLB |
| --- | ---: | ---: | ---: | ---: | ---: |
| 竞速 `/` | 52.45 s | 3.67 s | 64.86 MB | 4.03 MB | 40.18 MB |
| 晴湾 `/cove/` | 48.73 s | 12.70 s | 59.58 MB | 15.21 MB | 39.07 MB |
| 湿地 `/swamp/` | 17.39 s | 10.79 s | 21.11 MB | 12.76 MB | 12.76 MB |
| 素材库首个船模 | 3.93 s | 2.33 s | 4.26 MB | 2.22 MB | 2.22 MB |

MB 使用十进制，表中资源量仅为 GLB；计时包含页面代码、下载、模型解析及页面 ready。竞速先加载船与航标，开放驾驶并留出绘制机会后才请求 19 个岸景模型；`scenery.ready` / `scenery.userData.assetState` 独立报告背景结果。晴湾先显示船、码头、水面和岩岸，树冠稍后补齐；`snapshot().detailState` 与场景的 `detailReady` 区分可观赏和细节完成。相同限速下，晴湾完整树冠约 32.76 s 完成，竞速全部 GLB 下载约 33.14 s 完成，不能把首屏可用时间称为全量加载时间。

26 个运行模型合计从 115,134,000 B 降为 73,380,900 B（减少 36.3%）。保留全部节点、顶点值、三角面、UV、材质通道和贴图尺寸；3 个船模索引按相同数值收窄为 uint16，再做无损 `EXT_meshopt_compression`。共享 GLTF 加载器异步载入 Three.js 随包的 MeshoptDecoder，新增约 22.10 KB JS / gzip 5.96 KB，无外部解码服务。纯素材列表仍不静态依赖 Three.js 或解码器。

纹理仅重新编码，不缩小分辨率。透明 PNG 的解码像素保持一致；JPEG 允许少量像素误差，不抽样色度，颜色图 PSNR 至少 36 dB、法线/ORM 等数据图至少 40 dB，不达阈值则提高质量或保留原图。这减少传输字节，不代表 GPU 贴图内存或场景帧率同比改善。晴湾相同暂停镜头的前后截图已核对，完整树冠、船体、岸石与码头保持原有外观。

可复现工具为 `tools/assets/optimize-glb.py`（Python + Pillow）和 `tools/assets/compress-gltf.mjs`。从原始、未压缩 GLB 开始，始终输出到独立候选路径，不反复重编码已发布模型：

```bash
python3 tools/assets/optimize-glb.py source.glb textures.glb --compact-indices --opaque-png-jpeg --report textures.json
node tools/assets/compress-gltf.mjs textures.glb delivery.glb --report geometry.json
pnpm check:assets
pnpm check:delivery
pnpm build
pnpm check:bundle
```

压缩工具将输出重新解码后逐 bufferView 比对；`check:delivery` 核对 47 个公开模型的清单字节数、SHA-256、压缩缓冲区可解码性，以及竞速核心、晴湾核心/完整场景、湿地完整场景的模型体积预算。替换文件后同步所有相关 catalog / manifest 和 SOURCES，公开 URL 保持不变。

证据保存在 `artifacts/performance/2026-10-05/`：`before.json`、`after.json` 为逐请求测量，`asset-optimization.json` 为逐模型/纹理误差与无损验证，截图记录首屏和完整晴湾，`originals/` 保留本次替换前的文件，包含用户尚未提交的素材。旧记录如下，数字不代表当前资源。

本次浏览器还验证了 26 个压缩模型经生产加载器解析、竞速核心失败/重试与岸景失败仍可驾驶、晴湾细节失败仍可观赏、暂停时补齐植被会重绘、素材库切换取消后台树请求并保持单个模型画布，以及四入口 390×844 模拟手机视口。未出现未捕获页面错误；模拟手机视口不等于实体手机性能验收。相关 `check:assets`、`check:delivery`、`check:bundle`、`check:routes`、`check:gameplay`、`check:swamp`、`check:viewing`、`check:cove`、`check:contact` 均通过。

## 2026-09-21 历史记录

检查日期：2026-09-21。当前为本地实现与本机构建/浏览器验收，未部署。测量使用生产构建，字节数为未压缩 JS；gzip 为本地压缩估算，不是公网传输测量。

## 实际复用边界

| 能力 | 统一入口 | 使用者与边界 |
| --- | --- | --- |
| 模型加载 | `src/shared/assets/gltf.js` | 竞速船、湿地船、湿地植被、素材库预览；GLTFLoader 动态加载且复用一个解析器入口 |
| 文件缓存 | `src/shared/assets/binary-cache.js` | 同一页面按完整 URL 合并正在进行的请求；LRU 最多 16 MiB / 8 项；超大文件可加载但不驻留缓存 |
| 资源释放 | `src/shared/rendering/resources.js` | 预览、过期模型结果和湿地环境；几何体、材质、纹理、ImageBitmap、实例化网格和骨架去重释放 |
| 像素预算 | `src/shared/rendering/pixel-budget.js` | 竞速 260 万、湿地 180 万、素材预览 120 万像素上限，仍保留各自 DPR 上限 |
| 程序道具 | `src/arena/rendering/props.js` | 竞速和素材库直接复用拱门构造函数；航标使用共享 GLB 加载器，预览通过动态 import 调用 |

缓存存的是不可变文件字节，解析后的场景由每个消费者独立拥有。调整水线、材质或销毁预览不会破坏其他使用者。湿地重复植被继续使用 InstancedMesh；船艇原本共用的材质只调整一次，避免逐网格克隆。

切换选中模型会取消上一消费者；只有同一请求最后一个消费者取消时才中止网络请求。失败请求不占缓存，解析失败也会移除相应字节缓存以允许重试。无法中断的解析若延迟返回，其结果会被释放，不覆盖新选择。

16 MiB 是文件字节缓存上限，不是整个页面内存/显存上限；贴图解码和 GLTF 解析仍有单独开销。重复访问复用文件字节，但各预览仍需单独解析，以保持资源所有权明确。

## 加载时机与分包

素材库保留自动全屏预览：先初始化列表/收藏逻辑，选中可预览资产后异步加载 viewer；viewer 再按需加载 GLTF 解析器或程序道具模块。模型预览静止时不重画；拖动、缩放、线框、尺寸变化会触发绘制，阻尼结束后停下。离屏或页面隐藏时停止绘制；pagehide 释放观察器、控件、渲染器和 GPU 资源，BFCache 返回时恢复预览。

Vite 6 使用动态 import 和依赖预加载，生产构建输出 `.vite/manifest.json`。Three.js 的 core 与 WebGL 使用统一共享 chunk；GLTF、湿地后处理、素材预览保留独立边界，拱门代码也由构建图复用。`onlyExplicitManualChunks` 避免手动分包把不相关依赖一起提到首屏。未改高 chunk 告警阈值，未升级构建依赖。机制依据：[Vite 6 异步 chunk 优化](https://v6.vite.dev/guide/features#async-chunk-loading-optimization)、[Rollup manualChunks](https://rollupjs.org/configuration-options/#output-manualchunks)。

竞速和湿地的画面本身就是首屏功能，需要立即加载渲染器和当前场景资产。它们不加载素材库的 OrbitControls/工作室环境；竞速和素材库不加载湿地的后处理。竞速隐藏时跳过模拟和渲染，保持原有失焦暂停行为。

## 构建对比

| 指标 | 优化前 | 当前构建 |
| --- | ---: | ---: |
| 素材库静态入口及其静态 JS 依赖 | 786,117 B | 16,196 B |
| 自动完成首个 GLB 预览需要的全部 JS | 786,117 B | 800,647 B |
| 最大单个 JS chunk | 749,489 B | 375,848 B |
| 三个页面所有 JS chunk 合计 | 925,429 B | 940,782 B |

自动预览的模型文件没有改变，HBY GLB 仍为 5,003,728 B。静态入口变小不等于全页总下载量减少；新增生命周期和缓存逻辑、分包边界会增加少量总 JS。此次主要收益是代码/资源复用、按功能隔离，以及静态预览避免连续 GPU 工作。源站 gzip、用户缓存命中与网络速度会影响真实传输时延；本次未把这些数据换算为首屏速度或帧率提升百分比。

## 已验证

- 生产构建、`check:bundle` 通过；单个 JS 不超过 500 KB，素材库静态 JS 不超过 30 KB / gzip 12 KB。检查 manifest 防止 Three.js、GLTF 和后处理被重新静态引入列表。
- 8 项资源检查通过：请求去重、LRU、超大文件不留存、单消费者/全部消费者取消、失败重试、已取消请求、资源去重释放与像素预算。
- 原有 16 项玩法、9 项湿地、5 项子路径路由检查通过；物理检查和三圈模拟通过。
- 三个入口实际载入；竞速 HBY 模型 ready、shader 失败 0；湿地四件模型加载且 errors 为空。
- 素材库自动预览 ready；静置 1 秒新增绘制帧数为 0；线框切换恢复绘制。
- HBY → Bass boat → HBY 后，HBY GLB 请求次数仍为 1；快速切换后仅最后选择显示，只有一个 canvas，无湿地/竞速页面或后处理代码请求。
- 各类模型与程序道具保持实际源码构造；完整七件预览由同仓库素材库修复任务独立核验。

原始构建指标与本次截图保存在本机 `artifacts/performance/2026-09-21/`。这些结论不代表大型新素材、低端手机或整个湿地场景的帧率已经验收；模型面数、贴图分辨率、阴影与反射开销仍需在具体场景中检查。

## 资产替换补充（2026-09-21）

上述 HBY/Bass 数据为此前性能验证快照。当前 HBY、Bass、Jet Sprint 和程序浮标已按用户要求移出运行资产库；驾驶船改为 MAVERICK GT（4,257,020 B），赛道改用 Ocean Buoy 实例化航标。原先性能数据不能作为新模型帧率结论。
