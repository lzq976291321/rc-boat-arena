# 晴湾观赏资产接入

当前项目只有晴湾观赏：正式首页为 `/`，可切换四艘船，搭配午后、日落、暮色，看它离泊、巡游、归港。`/cove/`、`/swamp/` 和生产环境的 `/library/` 兼容旧链接并返回同一挂载前缀的首页，保留查询参数与片段。本地开发服务的 `/library/` 仍是素材工作台，不参与生产构建。

页面提供自动或固定镜头、暂停、水声、PNG拍照和沉浸模式；`Esc` 或“显示界面”退出沉浸。水声默认关闭，需要用户点击开启。查看、换船、调光和切镜头不写服务器，照片下载到本地。

## 场景与共享宿主

`src/scene-assets/sunny-cove/` 组合独立晴湾场景；正式页面和本地素材工作台调用同一入口，不复制实现。

| 入口 | 职责 |
| --- | --- |
| `createSunnyCoveScene` | 创建拥有自己 Scene、camera 和子资产的组合；不创建 renderer、RAF、DOM或音频 |
| `createSunnyCoveViewer` | 使用 `shared/viewing/viewer.js` 的Canvas宿主，管理renderer、后处理、帧循环和水声 |
| `createViewingPage` | `shared/viewing/page.js` 中的页面行为、重试、照片下载和来源弹窗 |
| `src/scene-assets/catalog.js` | 本地工作台使用的名称、作者、许可等纯元数据，不依赖Three.js |

`shared/viewing/page.css` 提供页面结构样式，晴湾 CSS 设置配色和专用控件布局；水声由 `shared/viewing/audio.js` 提供。场景是独立 `Scene`，不是可随意挂入另一个场景的 `Group`。

| 文件 | 独立职责 |
| --- | --- |
| `sunny-cove/index.js` | 场景组合、换船状态与Canvas入口，转导出船型、巡游与主要工厂 |
| `sunny-cove/environment.js` | 岩岸、天空、雾、光照与分阶段植被加载 |
| `sunny-cove/dock.js` | 码头结构、陈设、提灯、泊位锚点及其资源 |
| `sunny-cove/water.js` | 反射、折射、深度纹理；通过 `setInteraction()` 引用船水数据 |
| `sunny-cove/boat.js` | 加载船型，适配朝向、展示尺寸、材质与水线，返回实测包围盒 |
| `sunny-cove/config/boats.js` | 冻结的四船目录、默认船型和严格ID查询，不依赖Three.js |
| `sunny-cove/config/tour.js` | 码头布局、巡游/靠泊/镜头时长与 `routeAtBerth()` |
| `sunny-cove/config/dressing.js` | 冻结的码头陈设与岸边植物配置，不依赖Three.js |
| `sunny-cove/camera.js`、`navigation.js` | 使用调用方相机进行运镜，以及闭环靠泊巡游 |
| `boat-water-interaction/index.js` | 浮态和尾流历史，CPU/GPU共享波谱；不创建模型、renderer或RAF |
| `sunny-cove/presets.js` | `MOODS` 光照参数：`afternoon`、`sunset`、`bluehour` |

## 直接放进 Canvas

以下示例可放在 `src/cove/` 同级页面模块，HTML位于项目首页并提供 `#world`、`#sound`。Canvas需先挂入文档并具有实际CSS宽高。

```js
import { createSunnyCoveViewer, DEFAULT_BOAT_ID, COVE_TOUR } from '../scene-assets/sunny-cove/index.js';

const canvas = document.querySelector('#world');
const request = new AbortController();
const viewer = await createSunnyCoveViewer({
  canvas,
  assetBaseUrl: new URL('./assets/', document.baseURI).href,
  quality: 'balanced',
  signal: request.signal,
  boatId: DEFAULT_BOAT_ID,
  mood: 'afternoon',
  cameraMode: 'auto',
  tour: COVE_TOUR,
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
});
viewer.setMood('bluehour');
viewer.setCamera('scenic');
document.querySelector('#sound').addEventListener('click', async () => {
  await viewer.setSound(!viewer.snapshot().sound);
});

function closePreview() {
  request.abort();
  viewer.dispose();
  canvas.remove(); // Canvas属于宿主。
}
```

`assetBaseUrl` 是公开 `assets/` 目录的绝对URL，保留结尾 `/`。**正式首页使用 `./assets/`，本地 `/library/` 使用 `../assets/`**；两者都保留DSH等子路径前缀。不要按JS文件所在位置推导页面的资源URL。

| 方法 | 用途 |
| --- | --- |
| `setMood(name)` | 选择光照；播放时水面、天空与环境光平滑过渡，码头灯光跟随时段 |
| `setCamera(name)` | `auto`、`waterline`、`follow`、`scenic`、`overview` |
| `setBoat(id)` | 异步换船；成功返回 `true`，被后续选择或释放取消返回 `false`，失败拒绝Promise |
| `setPaused(boolean)` | 暂停或继续巡游和动画 |
| `setSound(boolean)` | 异步启停水声，首次开启放在点击处理器中 |
| `reset()` | 重置巡游位置、时间和尾流，保留光照、镜头和当前船型 |
| `resize()` | 使用Canvas当前CSS尺寸；工厂也观察尺寸变化 |
| `capture()` | 返回PNG `Blob` 的Promise，由宿主下载或使用 |
| `snapshot()` | 读取运行、镜头、船型、详情加载和渲染统计 |
| `dispose()` | 停止动画与音频，移除内部观察器/事件，释放所属资源 |

`quality` 为 `balanced` 或 `low`，本地素材工作台使用 `low`。`reducedMotion` 从暂停的码头定机开始。`onFrame(snapshot)` 可更新界面，`onError(error)` 可展示错误。处理创建失败的Promise拒绝；切换预览传取消信号，迟到成功的实例仍须释放。

创建Promise完成及viewer的 `ready` 代表真实船艇、码头结构、水面和岩岸可观赏；树冠、灌木与陈设在首帧后加载。`snapshot().detailState.status` 为 `waiting`、`loading`、`ready` 或 `error`，并包含岸景、码头的独立状态。场景工厂暴露 `detailReady`；暂停的外部宿主应在成功或失败后补画一帧。Canvas viewer已分别订阅 `environment.detailReady` 和 `dock.detailReady` 完成刷新。取消或释放终止后台请求，细节失败不销毁核心场景。

场景加载显式调用 `loadGLTF(url, { delivery: 'scene' })`，由 `shared/assets/scene-models.js` 选择已登记运行变体。未登记模型不改URL，路径前缀、查询参数与片段保留。单模型工作台默认显示完整原件。生产白名单按晴湾素材清单发布使用中的原件、运行变体和来源说明；仅增加配置引用但未同步清单与映射，不能认为资源已可发布。

## 船型、巡游与本机偏好

`config/boats.js` 导出 `BOATS`、`DEFAULT_BOAT_ID` 和 `getBoatDefinition(id)`。场景入口转导出前两者。

| ID | 展示长度 / 吃水（米） | 题材 |
| --- | --- | --- |
| `riva-aquarama` | 2.4 / 0.11 | 经典木质游艇，默认船型 |
| `maverick-gt` | 2.6 / 0.10 | 现代运动摩托艇 |
| `motor-whaleboat` | 2.65 / 0.234 | 白漆木甲板交通艇 |
| `assault-boat` | 2.4 / 0.107 | 近岸轻型充气艇 |

配置包含原件路径、船首朝向、展示尺寸、吃水、材质处理和 `contact`（船尾宽度、船首收窄、尾流出口及强度）。这些是观赏设定与实时近似，不是实艇规格。不得用同一个固定Riva包围盒代表所有船型。

```js
// BOATS可生成选择器；加载期间仍允许改选。
async function onBoatSelected(id) {
  try {
    const applied = await viewer.setBoat(id);
    if (!applied) return;
    console.log('当前船型', viewer.snapshot().boatId);
  } catch (error) {
    // 旧船仍可观赏；显示错误与重试，不重建整个场景。
    console.warn('换船未完成', error);
  }
}
```

场景工厂也提供 `setBoat(id)`，外部宿主负责刷新界面及暂停时补画。场景和viewer快照包含 `boatId`、`boatChange: { status, requestedId, error }` 与 `dimensions: { length, beam, height, draft }`；换船状态为 `idle`、`loading`、`error`。

新船先在不参与渲染的容器中准备，只有最新成功请求可替换当前船、船水交互和镜头尺寸，再释放旧资源。默认新船入泊停4秒后出航；首次进入仍从前景巡游开始。失败、取消与迟到结果不能替换当前船。换船保留氛围、镜头选择、暂停和水声；单实例同时展示一艘船。

`COVE_TOUR` 包含 `dock` 位置/朝向、`navigation` 航行90秒/停泊18秒/开场进度、`camera` 机位停留20秒/过渡12秒、`changeoverDwell` 换船停留4秒。使用新对象覆写，保留未改的嵌套配置：

```js
const tour = {
  ...COVE_TOUR,
  navigation: { ...COVE_TOUR.navigation, travelDuration: 100 },
};
const viewer = await createSunnyCoveViewer({ canvas, assetBaseUrl, signal, tour });
```

`routeAtBerth()` 对齐既定路线与 `dock.getAnchor('berth')` 的位置/方向；不会保证任意码头变换或新船都避开岸景。布局、船型改动必须重新验证全程水线、尾流、靠泊、镜头和横竖屏。页面不提供自由航线或布局编辑器。

`createViewingPage()` 接收 `boats`、`defaultBoatId`、`preferenceKey`。首页使用 `sunny-cove.preferences.v1`，启动校验 `{ boatId, mood, cameraMode }`，未知ID、损坏记录或存储不可用回退默认；启动不写偏好。最新换船成功、用户改变光照或镜头后才保存；写入失败保留会话选择。暂停和水声不持久化，没有服务器或跨设备同步。

## 陈设配置与独立工厂

`config/dressing.js` 导出深冻结的 `DOCK_DRESSING`、`SHORE_DRESSING`。它们是适配当前模块的策划配置，不是任意GLB的自动摆放系统；模型 `key` 与节点约定需和消费者保持一致。

- `DOCK_DRESSING.models` 定义码头板、长椅、货箱、救生圈、旧轮胎、提桶与提灯。第一个条目是首屏必需的 `pier`，后续条目在家具阶段加载。`bench`、`crate`、`bucket`、`lantern`、`lifebuoy`、`fenders` 使用码头局部米制坐标与比例。长椅、箱、桶的高度由甲板决定，提灯放在箱顶；`lanternIntensity` 按三种光照控制灯芯与局部光源。移动物件要保留行走带和靠泊余量。
- `SHORE_DRESSING.models` 当前选取 `shrub_03_a` 和 `shrub_sorrel_01_d` 单株节点，避免把原件的展示排布整套摆入。`shrubAccents`、`sorrelPockets` 每项为 `[side, z, inland, height]`：岸侧、沿岸位置、向陆地偏移与植株目标高度；位置由实际岸线转成世界坐标。它们补充主树和已有灌木，低质量模式会减少点缀数量。

完整晴湾使用默认岸景陈设。码头陈设可通过 `tour.dock.dressing` 传入；岸景陈设目前只在独立 `createCoveEnvironment()` 中接受 `dressing`，完整scene/viewer没有顶层 `shoreDressing` 选项。

```js
import { DOCK_DRESSING, SHORE_DRESSING } from '../scene-assets/sunny-cove/config/dressing.js';
import { createCoveDock } from '../scene-assets/sunny-cove/dock.js';
import { createCoveEnvironment } from '../scene-assets/sunny-cove/environment.js';

const dockDressing = {
  ...DOCK_DRESSING,
  lanternIntensity: { ...DOCK_DRESSING.lanternIntensity, bluehour: 0.6 },
};
const dock = await createCoveDock(scene, {
  assetBaseUrl, signal, position: [-7, 0, 0.25], rotation: 0,
  furniture: true, dressing: dockDressing, mood: 'afternoon',
});
const { position, heading } = dock.getAnchor('berth');
// 另有approach、launch锚点，返回位置与船首方向均为世界坐标。
dock.setMood('bluehour');

const environment = await createCoveEnvironment(scene, {
  renderer, assetBaseUrl, signal, quality: 'balanced', mood: 'afternoon',
  dressing: { ...SHORE_DRESSING, sorrelPockets: SHORE_DRESSING.sorrelPockets.slice(0, 4) },
});
// 宿主核心画面就绪后，启动岸景细节并在结果到达时重绘。
await environment.startDetails();
// 结束时由宿主明确调用dock.dispose()与environment.dispose()。
```

独立码头默认等待家具完成；`furniture: false` 不请求家具，`deferDetails: true` 需由宿主调用 `dock.startDetails()`。独立岸景总是由宿主在基本画面完成后调用 `environment.startDetails()`。二者暴露 `detailReady`、`detailState`、`setMood` 与 `dispose()`，不拥有宿主scene/renderer的生命周期。

`createCoveWater(scene, { quality, size })` 拥有反射、折射与深度纹理；宿主提供海床，调用 `update(time, boat)`、`resize(width, height)`、`setMood(preset)` 和 `dispose()`。`setMood()` 支持 `waterClarity`（0.1–1）与 `waveStrength`（0–1.5）。

`createCoveBoat(scene, url, { signal, definition, length, draft })` 接受船型对象或ID；省略 `definition` 保留Riva挂载约定。`length`、`draft` 可覆盖展示值，未覆盖draft时随length等比变化。URL与definition必须对应。返回的 `dimensions` 来自实际模型包围盒，应传给船水交互和镜头；额外模型仍需先量测方向、水线和材质。

## 接入已有 renderer 与独立镜头

```js
import { createSunnyCoveScene } from '../scene-assets/sunny-cove/index.js';

const request = new AbortController();
const asset = await createSunnyCoveScene({
  renderer,
  assetBaseUrl: new URL('./assets/', document.baseURI).href,
  quality: 'balanced', signal: request.signal,
  boatId: 'motor-whaleboat', mood: 'afternoon', cameraMode: 'auto',
});
asset.resize(canvas.clientWidth, canvas.clientHeight);

// 由已有且受可见性控制的帧循环调用，dt为秒。
function renderCove(dt) {
  asset.update(dt);
  renderer.render(asset.scene, asset.camera);
}
function releaseCove() {
  // 先停止宿主对renderCove的调用。
  request.abort();
  asset.dispose(); // renderer仍归宿主管理。
}
```

场景工厂返回 `scene`、`camera`、`boat`、`state`、`environment`、`dock`、`water`、`boatVisual`、`interaction`，及 `update`、`setMood`、`setCamera`、`setBoat`、`reset`、`resize`、`snapshot`、`dispose`。取消信号用于加载取消，结束使用仍需显式释放。

独立镜头不加载模型，不拥有调用方的camera：

```js
import { createCoveCamera } from '../scene-assets/sunny-cove/camera.js';
const rig = createCoveCamera(camera, { reducedMotion: false, dimensions: boatVisual.dimensions });
rig.setMode('scenic');
rig.resize(width, height);
rig.snap(boat);
rig.update(dt, elapsed, boat); // boat提供x、z、heading与巡游阶段。
rig.setBoatDimensions(nextBoatVisual.dimensions); // 换船后同步实际尺寸。
rig.dispose(); // 不销毁camera。
```

`heading = 0` 朝 `-Z`，正角朝 `-X`。自动运镜从 `waterline` 开始，依次经过 `scenic`、`follow`、`overview`，归港与靠泊时平滑偏向码头。船侧近观固定世界方向，随船体尺寸和竖屏比例退远；船转向不会带动近观镜头环绕。边界约束针对既定海湾，不是任意场景的通用避障。

共享 `createSceneViewer({ createScene, canvas, assetBaseUrl, quality, signal, reducedMotion, mood, cameraMode, onFrame, onError, ambience })` 管理Canvas生命周期；晴湾包装闭包传入专用 `boatId` 与 `tour`，共享宿主不依赖船型目录。可选音频对象遵循 `enabled`、`setEnabled`、`setMood`、`visibility`、`dispose`，交给宿主后由宿主释放。

## 独立接入船水接触

`src/scene-assets/boat-water-interaction/index.js` 导出 `createBoatWaterInteraction({ length, beam, draft, sampleSurface })`。尺寸单位为米；默认值为 `2.4`、`0.738`、`0.11`。调用方提供 `boat` 状态：`x`、`z`、`heading`、`speed`，可选 `turnRate`；朝向沿用 `heading = 0` 面向 `-Z`。

`sampleSurface(x, z, time)` 返回 `{ height, slopeX, slopeZ }`。接入晴湾水面时使用 `sampleSurface: water.sampleSurface`，让 CPU 浮态采样跟随水面的当前浪幅。CPU 采样与 GPU 环境涌浪由同一波谱生成；船边压水与尾流形状在水面 shader 中追加。模块通过四点采样与阻尼响应给出 `interaction.pose`：`heave` 为世界水线高度，`pitch`、`roll` 为弧度。船的挂载层仍负责吃水偏移，不再从 `pose.heave` 扣一次 `draft`。

| 接口 | 接入责任 |
| --- | --- |
| `interaction.update(dt, time, boat)` | 更新浮态和本实例的尾流历史；`dt`、`time` 使用秒 |
| `interaction.pose` | 传入 `boatVisual.update(dt, time, boat, interaction.pose)` 的第 4 个参数 |
| `water.setInteraction(interaction)` | 让晴湾水面引用该实例的 uniforms；水面不取得实例的释放责任 |
| `interaction.reset(time, boat)` | 清空旧尾迹，并在新时间和船位重新取样；重置或跳转时调用 |
| `interaction.snapshot()` / `dispose()` | 读取状态 / 释放本实例历史，重复释放安全 |

以下例子用于已有 `scene`、`camera`、`renderer` 和导航状态 `boat` 的宿主模块，可放在 `src/cove/` 同级页面模块中。宿主先更新导航，再调用 `renderBoatContact()`；海床、光照、帧循环、可见性及 renderer 尺寸继续由宿主管理。

```js
import { createBoatWaterInteraction } from '../scene-assets/boat-water-interaction/index.js';
import { createCoveWater } from '../scene-assets/sunny-cove/water.js';
import { createCoveBoat } from '../scene-assets/sunny-cove/boat.js';
import { getBoatDefinition } from '../scene-assets/sunny-cove/config/boats.js';
import { MOODS } from '../scene-assets/sunny-cove/presets.js';

// 本例挂在正式首页；本地 /library/ 使用 ../assets/。
const assetBaseUrl = new URL('./assets/', document.baseURI).href;
const request = new AbortController();
const water = createCoveWater(scene, { quality: 'balanced' });
const definition = getBoatDefinition('riva-aquarama');
let boatVisual, interaction;
try {
  boatVisual = await createCoveBoat(scene,
    new URL(definition.path, assetBaseUrl).href,
    { signal: request.signal, definition });
  interaction = createBoatWaterInteraction({
    ...boatVisual.dimensions, ...definition.contact, sampleSurface: water.sampleSurface,
  });
  water.setInteraction(interaction);
  water.setMood(MOODS.afternoon, { immediate: true });
  resetBoatContact(0);
} catch (error) {
  releaseBoatContact();
  throw error;
}

// 嵌入宿主已有的帧循环；不要再为这些子模块创建一个 RAF。
function renderBoatContact(dt, time) {
  water.update(time, boat);
  interaction.update(dt, time, boat);
  boatVisual.update(dt, time, boat, interaction.pose);
  renderer.render(scene, camera);
}

// 宿主先恢复自己的导航状态 boat，再调用本函数。
function resetBoatContact(time = 0) {
  water.update(time, boat);
  interaction.reset(time, boat);
  boatVisual.update(0, time, boat, interaction.pose);
}

// 宿主调整绘制尺寸时同时调用；不会改变宿主的 camera 或 renderer。
function resizeBoatContact(width, height) {
  water.resize(width, height);
}

// 先停止调用 renderBoatContact，再分别释放三个子资产。
function releaseBoatContact() {
  request.abort();
  water.dispose();
  interaction?.dispose();
  boatVisual?.dispose();
}
```

只有独立船水模块时，不需要 renderer、RAF、DOM 或模型加载。它不拥有调用方的水面和船。若水面继续使用而只更换交互实例，先 `water.setInteraction(null)` 解绑，再释放旧实例。自定义水面可以使用同入口导出的 GLSL 片段与 `interaction.uniforms`，但必须自行保持 CPU 采样、水面时间和浪幅一致。

这是小尺度实时近似：以环境涌浪采样、受限船体响应和历史尾流改善接触感，没有完整求解流体、船体排水或多船相互作用。晴湾尾迹由接触模块提供数据，并在水面 shader 内绘制。

## 资源、来源与预览生命周期

- 每次工厂调用拥有自己的可变场景、模型和释放责任。共同文件只通过 `src/shared/assets/gltf.js` 复用不可变字节；不同消费者不共用可变场景实例。
- Canvas viewer 拥有 renderer、后处理、场景和音频；宿主拥有 Canvas。场景工厂只释放所属场景资源，不销毁调用方 renderer。实例化植被共用几何体和材质，所属场景统一释放。
- 普通 GLB 预览静止后停止绘制；观赏预览在可见且前台时播放动画，暂停、离屏或后台停止连续绘制。切换素材取消旧请求，旧 Canvas 和迟到实例均需释放，避免同时持有两套预览。
- 水声仅在显式开启后播放；后台或暂停时挂起。预览模块的异步入口大小不代表完整下载量，观赏仍需下载引擎和所用模型。
- 晴湾组合包含项目制作的水面、天空、海床、镜头、水声和船坞结构，以及外部船艇、码头、岩石与植物。四艘船分别保留各自 CC BY 4.0 署名，码头与岸景素材保留各自 CC0 来源；组合标签不替代单件许可。详见 [晴湾来源](../../public/assets/cove/SOURCES.md) 与 [运行变体来源](../../public/assets/runtime/SOURCES.md)。

## 验收范围与命令

本文件描述源码能力与接入约定，不记录部署结果。观赏变更使用以下检查；涉及搬移文件时仍执行 [目录约定](../PROJECT-STRUCTURE.md) 的完整检查。

```bash
pnpm check:viewing
pnpm check:cove
pnpm check:contact
pnpm check:assets
pnpm check:delivery
pnpm build
pnpm check:bundle
pnpm check:routes
```

浏览器核对晴湾首页的所有已配置船型、三种光照、五种镜头、完整靠泊循环、暂停恢复、拍照、沉浸退出和点击开启水声。验证换船后水线与尾流、泊位停留、失败保留旧船、快速改选取消旧请求、重复切换释放资源，以及偏好恢复、损坏与存储不可用。

生产 `/cove/`、`/swamp/`、`/library/` 应返回晴湾首页，保留挂载前缀、查询参数与片段；本地开发 `/library/` 单独验证模型与晴湾预览切换、后台/离屏暂停、重复关闭重开。浏览器窄屏不等于实体手机验收；构建、浏览器、Git推送与部署分别记录。结果写入 [晴湾设计记录](SUNNY-COVE.md)，历史双船验收不替代本轮四船验收。

### 独立工厂补充约定

独立 `createCoveBoat(scene, url, { signal, length, draft })` 的默认长度为 2.4 米、吃水为 0.11 米；省略 draft 时随 length 等比变化。码头的木纹、帆布、绳缆及五金由同一个 createCoveDock 实例管理和释放，无页面依赖。晴湾水面 setMood(preset) 同时读取 waterClarity（0.1–1）与 waveStrength（0–1.5），保留已有色彩、太阳方向和过渡约定。

共享宿主的 `viewer.snapshot().render.antialias` 和 `samples` 提供抗锯齿方式与样本数；宿主内部拥有 HDR MSAA 目标或 FXAA 后备资源。直接使用 createSunnyCoveScene 的外部宿主仍自行拥有 renderer、后处理与 RAF，场景不会替外部宿主创建抗锯齿管线。
