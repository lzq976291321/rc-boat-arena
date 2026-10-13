# 观赏资产接入

观赏页通过自动巡游、光照和镜头呈现船模与环境。`/` 保留竞速，`/swamp/` 提供月下湿地，`/cove/` 提供晴湾船坞，`/library/` 预览模型与完整观赏资产；四个入口独立可用。

湿地提供月夜、晨雾、夕照；晴湾提供 Riva Aquarama / MAVERICK GT 双船选择、午后/日落/暮色，以及离泊、巡游、归港停留。两页共用自动或固定镜头、暂停、水声、拍照和沉浸。拍照保存当前画面的 PNG；沉浸模式隐藏页面操作，可用“显示界面”或 `Esc` 返回。水声默认关闭，必须由用户点击开启。查看、换船、调光和切换镜头不写服务器，照片下载到本地。

## 场景与共享宿主

`src/scene-assets/moonwater/` 与 `src/scene-assets/sunny-cove/` 各自组合独立场景。专用观赏页和素材库调用同一资产入口，素材库直接运行场景，不跳转页面。

| 资产 | 页面 | 场景 / Canvas 工厂 | 光照 ID |
| --- | --- | --- | --- |
| Moonwater | `/swamp/` | `createMoonwaterScene` / `createMoonwaterViewer` | `moonlight`、`dawn`、`sunset` |
| Sunny Cove | `/cove/` | `createSunnyCoveScene` / `createSunnyCoveViewer` | `afternoon`、`sunset`、`bluehour` |

两个 Canvas 工厂都配置 `src/shared/viewing/viewer.js` 的 `createSceneViewer`；两个页面都配置 `shared/viewing/page.js` 的 `createViewingPage`，共同维护操作、重试、照片下载和来源弹窗。页面样式骨架在 `shared/viewing/page.css`，场景 CSS 补配色与专用控件布局。水声复用 `shared/viewing/audio.js`。湿地继续使用 `shared/viewing/wake.js`；晴湾的尾流由独立船水接触模块提供历史数据，在水面 shader 内绘制。

`src/scene-assets/catalog.js` 只登记名称、类型、作者、来源和许可。它加入素材库“观赏资产”分类，不导入 Three.js。纯列表与收藏逻辑不加载渲染引擎；选中可预览素材后，素材库动态导入相应运行模块。

| 文件 | 独立入口与职责 |
| --- | --- |
| 各资产的 `index.js` | 组合独立场景，并为共享 Canvas 宿主提供场景工厂与默认光照；晴湾在此组合独立 `dock.js` 工厂 |
| 各资产的 `environment.js` | 创建岸景、天空、雾和光照 |
| 各资产的 `water.js` | 湿地反射水面与晴湾深度折射浅海，各自拥有渲染目标；晴湾通过 `setInteraction()` 绑定船水接触数据 |
| `boat-water-interaction/index.js` | 独立船体浮态与尾流历史；CPU/GPU 共用环境涌浪波谱，不创建模型、renderer 或 RAF |
| 各资产的 `boat.js` | 船艇加载、朝向、水线与姿态配置 |
| `sunny-cove/config/boats.js` | 不依赖 Three.js 的船型目录：路径、朝向、展示尺寸、吃水、材质与接触参数 |
| `sunny-cove/config/tour.js` | 既定海湾的码头布局、巡游/停泊和运镜时长；`routeAtBerth()` 将路线与世界泊位对齐 |
| 各资产的 `camera.js` | 使用调用方相机、场地边界与巡游目标进行运镜 |
| 各资产的 `navigation.js` | 湿地往返或晴湾靠泊巡游，提供创建、更新与重置 |
| `shared/viewing/audio.js` | `createAmbience` 创建可显式启停的环境水声 |
| 各资产的 `presets.js` | `MOODS` 光照参数与过渡时长 |

各子工厂可以按需组合。整套场景是独立 `Scene`，不是可随意挂到宿主场景中的 `Group`。

## 直接放进 Canvas

以下示例可放在 `src/swamp/` 下的页面模块中；页面已提供 `#world` Canvas 和 `#sound` 按钮。Canvas 必须具有实际 CSS 宽高，并在初始化前挂到文档中。

```js
import { createMoonwaterViewer } from '../scene-assets/moonwater/index.js';

const canvas = document.querySelector('#world');
const request = new AbortController();
const viewer = await createMoonwaterViewer({
  canvas,
  assetBaseUrl: new URL('../assets/', document.baseURI).href,
  quality: 'balanced',
  signal: request.signal,
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
});

viewer.setMood('dawn');
viewer.setCamera('scenic');
document.querySelector('#sound').addEventListener('click', async () => {
  await viewer.setSound(!viewer.snapshot().sound);
});

// 宿主移除预览时先取消请求并释放，再移除自己持有的 Canvas。
function closePreview() {
  request.abort();
  viewer.dispose();
  canvas.remove();
}
```

`assetBaseUrl` 是公开 `assets/` 目录的绝对 URL，保留结尾 `/`。示例按 `/swamp/`、`/cove/` 或 `/library/` 页面位置解析，在项目子路径下也保留前缀。资源 URL 不依赖运行模块被放到哪个目录。

| 方法 | 用途 |
| --- | --- |
| `setMood(name)` | 使用本资产的光照 ID，播放时平滑过渡水面、天空、雾和光照 |
| `setCamera(name)` | 湿地：`auto`、`follow`、`scenic`、`overview`；晴湾另有 `waterline` 船侧近观 |
| `setBoat(id)` | 晴湾异步换船：成功返回 `true`，被后续选择或释放取消返回 `false`，失败拒绝 Promise；湿地不支持 |
| `setPaused(boolean)` | 暂停或继续巡游和动画 |
| `setSound(boolean)` | 异步启停水声，首次开启放在点击处理器中 |
| `reset()` | 重置巡游位置、时间和尾流，保留所选光照与镜头 |
| `resize()` | 按 Canvas 当前 CSS 尺寸更新绘制尺寸；工厂也会观察尺寸变化 |
| `capture()` | 返回 PNG `Blob` 的 Promise，由宿主下载或使用 |
| `snapshot()` | 读取运行状态、镜头、船艇与渲染统计 |
| `dispose()` | 停止动画和音频，移除内部观察器/事件，释放所属资源 |

`quality` 使用 `balanced` 或 `low`；素材库使用 `low`。`reducedMotion` 使观赏从暂停的固定镜头开始。可通过 `onFrame(snapshot)` 更新界面，通过 `onError(error)` 展示重试入口。创建失败要处理 Promise 拒绝，切换时传入取消信号，迟到的成功实例仍须释放。

Sunny Cove 使用相同 Canvas API；默认船型为 `riva-aquarama`，默认光照为 `afternoon`：

晴湾的创建 Promise / `ready` 表示真实船艇、码头结构、水面和岩岸已可观赏；树冠、灌木、码头家具在首帧后后台加载。湿地先提供真实船艇、程序树林、水面和岸线，扫描树木及地面细节随后在相同位置替换；不改变树位和碰撞体。`viewer.snapshot().detailState.status` 为 `waiting`、`loading`、`ready` 或 `error`，晴湾聚合岸景与码头的状态。直接使用场景工厂的宿主可等待 `asset.detailReady`；暂停绘制的宿主应在成功或失败后补画一帧以显示部分成功结果。晴湾如需分阶段刷新，可分别订阅 `asset.environment.detailReady` / `asset.dock.detailReady`；Canvas 工厂已经处理。独立使用 environment 时，在宿主完成基本画面后调用 `environment.startDetails()`。码头独立工厂默认等待家具完成；传 `deferDetails: true` 后由宿主调用 `dock.startDetails()`，`furniture: false` 不请求家具。取消或释放会终止后台请求，细节失败不销毁已可用的核心场景。

场景加载通过共享 `loadGLTF(url, { delivery: 'scene' })` 显式选择 `src/shared/assets/scene-models.js` 中列出的轻量交付版本；未列出的模型不改 URL，路径前缀和查询参数保留。单模型素材库默认 `delivery: 'full'`，继续显示完整模型。公开加工及许可记录见 `public/assets/runtime/`。

```js
import {
  createSunnyCoveViewer, BOATS, DEFAULT_BOAT_ID, COVE_TOUR,
} from '../scene-assets/sunny-cove/index.js';

// canvas、assetBaseUrl、signal 由宿主提供，与上面的 Canvas 示例相同。
const viewer = await createSunnyCoveViewer({
  canvas, assetBaseUrl, signal,
  boatId: DEFAULT_BOAT_ID,
  mood: 'afternoon', cameraMode: 'auto', tour: COVE_TOUR,
});
viewer.setMood('bluehour');

// BOATS 可用于生成选择器；选择器在加载期间仍允许用户改选。
async function onBoatSelected(id) {
  try {
    const applied = await viewer.setBoat(id);
    if (!applied) return; // 后来的选择或 dispose() 已取消这次请求。
    console.log('当前船型', viewer.snapshot().boatId);
  } catch (error) {
    // 旧船仍可使用；宿主显示错误和重试，不重建整个场景。
    console.warn('换船未完成', error);
  }
}
```

`createSunnyCoveScene({ renderer, assetBaseUrl, boatId, tour, ... })` 接受相同场景选项，也提供异步 `setBoat(id)`。直接使用场景工厂时，宿主自行在换船状态变化后刷新界面，暂停时补画一帧；Canvas viewer 已处理刷新。场景工厂与 viewer 的快照均包含 `boatId`、`boatChange: { status, requestedId, error }`、`dimensions: { length, beam, height, draft }`，`status` 为 `idle`、`loading` 或 `error`。

换船先在不参与渲染的容器中准备新模型；当前船继续展示，最新请求成功后才替换船体、船水交互和镜头尺寸，并释放旧船资源。新船进入泊位，默认停留 4 秒再出港；这不改变首次打开从前景巡游开始的默认构图。取消、失败和迟到的结果不能替换当前船。换船不重置氛围、镜头选择、暂停或水声状态；单实例同时展示一艘船，不提供双船并行航行。

晴湾的码头、水面、船和镜头也可以分别使用。码头的尺寸单位为米，
`getAnchor()` 会将泊位位置和方向转换到宿主世界坐标：

```js
import { createCoveDock } from '../scene-assets/sunny-cove/dock.js';
const dock = await createCoveDock(scene, {
  assetBaseUrl, signal, position: [-7, 0, 0.25], rotation: 0, furniture: true,
});
const { position, heading } = dock.getAnchor('berth');
// 也提供 approach / launch 锚点；宿主用它们定义实际航线。
// 结束使用时只释放该码头；scene 与 renderer 仍归宿主管理。
dock.dispose();
```

`createCoveWater(scene, { quality, size })` 拥有反射、折射和深度纹理；宿主提供海床几何，
调用 `update(time, boat)`、`resize(width, height)`、`setMood(preset)` 和 `dispose()`。
船体工厂 `createCoveBoat(scene, url, { signal, definition, length, draft })` 接受船型配置对象或配置 ID；省略 `definition` 保留 Riva 挂载约定。`length` / `draft` 可覆盖展示值，未单独覆盖 `draft` 时随长度等比缩放。不要把 MAVERICK 模型 URL 配上默认 Riva 朝向；可用 `BOATS.find(boat => boat.id === 'maverick-gt')` 同时取得 `path` 与 `definition`。返回的 `dimensions` 来自模型包围盒与展示比例，应传给交互和镜头，不能继续固定为 Riva 尺寸。其他模型仍需先量测朝向、水线和材质。巡游模块接受闭合曲线及航行/停泊时长，不依赖 Three.js。

晴湾提供五种镜头选择：`auto` 自动观赏、`waterline` 船侧近观、`follow` 贴水侧跟、`scenic` 码头定机、`overview` 湾心斜览。自动循环从 `waterline` 开始，随后依次经过码头定机、贴水侧跟和湾心斜览，归港与靠泊阶段平滑偏向码头。船侧近观采用固定世界方向低位跟随，镜头按船体长宽高调整取景，竖屏退远保留整船。船转向时投影宽度会自然变化，镜头不绕船旋转。减少动态效果仍从暂停的码头定机开始。独立镜头实例可通过 `rig.setBoatDimensions(boatVisual.dimensions)` 更新展示尺寸。

新增场景需要复用宿主时，`createSceneViewer({ createScene, canvas, assetBaseUrl, quality, signal, reducedMotion, mood, cameraMode, onFrame, onError, ambience })` 接受一个场景工厂。工厂接收 `renderer` 和同名场景选项，返回 `scene`、`camera`、`boat`、`state`、`update(dt)`、`setMood`、`setCamera`、`reset`、`resize`、`snapshot`、`dispose`。支持换船的场景可额外提供 `setBoat(id)`；晴湾封装将专用 `boatId` / `tour` 选项传给场景，不要求共享宿主认识船型目录。可选 `ambience` 遵循 `enabled`、`setEnabled`、`setMood`、`visibility`、`dispose` 接口；交给宿主后由宿主释放。

## 晴湾配置与本机偏好

`sunny-cove/config/boats.js` 导出冻结的 `BOATS` 与 `DEFAULT_BOAT_ID`；场景入口统一转导出。目录包含 `riva-aquarama`（展示长 2.4 米、吃水 0.11 米）和 `maverick-gt`（展示长 2.6 米、吃水 0.10 米）。`contact` 分别调校船尾宽度、船首收窄、尾流出口和强度。以上是观赏尺寸与实时近似参数，不是实体船规格。

`sunny-cove/config/tour.js` 的 `COVE_TOUR` 保存当前策划布局：`dock` 为码头位置/朝向，`navigation` 为航行 90 秒、停泊 18 秒及开场进度，`camera` 为机位停留 20 秒与过渡 12 秒，`changeoverDwell` 为换船后的 4 秒停泊。需要微调时新建配置对象，保留未修改的嵌套配置；不要修改冻结默认值。

```js
const tour = {
  ...COVE_TOUR,
  navigation: { ...COVE_TOUR.navigation, travelDuration: 100 },
};
const viewer = await createSunnyCoveViewer({ canvas, assetBaseUrl, signal, tour });
```

场景通过 `routeAtBerth()` 将既有路线起点和船首方向对齐 `dock.getAnchor('berth')`。这解决泊位对齐，不保证移动/旋转任意码头后仍避开岸景，也不保证任意船模型都适合该海湾。修改布局或增加船型后，需要重新检查整轮路线、水线、尾迹、镜头与横竖屏构图。页面首版只开放已适配的船型、氛围与镜头，没有自由编辑布局或航线的界面。

`createViewingPage()` 可选接收 `boats`、`defaultBoatId`、`preferenceKey`；晴湾由 `src/cove/main.js` 传入 `BOATS`、`DEFAULT_BOAT_ID` 和 `sunny-cove.preferences.v1`。启动只读取并校验 `{ boatId, mood, cameraMode }`，未知 ID、损坏记录或不可用存储回退默认值；启动不写偏好。船型只在最新换船请求成功后保存，氛围/镜头只在用户改变时保存。写入失败仍保留本次会话选择；没有服务器或跨设备同步，不持久化暂停与水声开关。湿地未传偏好键，行为不变。

## 接入已有 renderer

宿主已有 Three.js renderer、帧循环和可见性管理时，使用场景工厂。它返回自己的 `scene` 和 `camera`，不创建 RAF、DOM 界面或音频；宿主决定何时更新和渲染，也可用自己的后处理合成。

```js
import { createMoonwaterScene } from '../scene-assets/moonwater/index.js';

const request = new AbortController();
const asset = await createMoonwaterScene({
  renderer, // 宿主已有的 renderer
  assetBaseUrl: new URL('../assets/', document.baseURI).href,
  quality: 'balanced',
  signal: request.signal,
});
asset.resize(canvas.clientWidth, canvas.clientHeight);

// 从宿主已有且受可见性控制的帧循环调用，dt 单位为秒。
function renderMoonwater(dt) {
  asset.update(dt);
  renderer.render(asset.scene, asset.camera);
}

// 先停止宿主对 renderMoonwater 的调用；renderer 仍归宿主管理。
function releaseMoonwater() {
  request.abort();
  asset.dispose();
}
```

场景工厂还提供 `setMood`、`setCamera`、`reset`、`snapshot`。`signal` 用于取消加载，宿主结束使用时应明确调用 `dispose()`。复用单个水面、岸景或船艇工厂时，同样由宿主协调 `update`、尺寸变化和最终释放。

镜头可单独用于已有场景，无需加载湿地模型：

```js
import { createViewingCamera } from '../scene-assets/moonwater/camera.js';

const rig = createViewingCamera(camera, {
  riverCenter,    // 宿主提供 function (z) -> 水道中心 x
  riverHalfWidth, // 宿主提供半宽 number 或 function (z)
  reducedMotion: false,
});
rig.setMode('scenic');
rig.resize(width, height);
rig.snap(boat);
// 放入宿主帧循环：boat 提供 x、z、heading。
rig.update(dt, elapsed, boat);
// 停止使用时：rig.dispose()；camera 仍由宿主持有。
```

镜头沿用湿地坐标：`heading = 0` 面向 `-Z`，正角度朝 `-X` 转向。镜头不拥有调用方 camera，`dispose()` 不销毁它；水道边界约束用于避免运镜穿入岸边。

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

const assetBaseUrl = new URL('../assets/', document.baseURI).href;
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

这是第一版小尺度实时近似：以环境涌浪采样、受限船体响应和历史尾流改善接触感，没有完整求解流体、船体排水或多船相互作用。晴湾接入后不再额外创建 `shared/viewing/wake.js` 的透明尾迹网格；湿地保留原有尾迹实现。

## 资源、来源与预览生命周期

- 每次工厂调用拥有自己的可变场景、模型和释放责任。共同文件只通过 `src/shared/assets/gltf.js` 复用不可变字节；不同消费者不共用可变场景实例。
- Canvas viewer 拥有 renderer、后处理、场景和音频；宿主拥有 Canvas。场景工厂只释放所属场景资源，不销毁调用方 renderer。实例化植被共用几何体和材质，所属场景统一释放。
- 普通 GLB 预览静止后停止绘制；观赏预览在可见且前台时播放动画，暂停、离屏或后台停止连续绘制。切换素材取消旧请求，旧 Canvas 和迟到实例均需释放，避免同时持有两套预览。
- 水声仅在显式开启后播放；后台或暂停时挂起。预览模块的异步入口大小不代表完整下载量，观赏仍需下载引擎和所用模型。
- Moonwater 组合包含项目制作的水面、天空、雾、尾流、镜头与水声，以及外部植被、船艇。组合标签不替代每件资产的许可：Poly Haven 植被为 CC0，dylanheyes 船艇为 CC BY 4.0。复用保留作者、原始链接、许可和加工记录，详见 [湿地来源](../../public/assets/swamp/SOURCES.md) 与 [船艇来源](../../public/assets/library/futuristic-speedboat/SOURCES.md)。晴湾使用 Riva Aquarama 与 MAVERICK GT（分别保留各自作者的 CC BY 4.0 署名）及已有 CC0 码头和岸景，完整清单见 [晴湾来源](../../public/assets/cove/SOURCES.md)。

## 验收范围与命令

本文件描述源码能力与接入约定，不记录部署结果。观赏变更使用以下检查；涉及搬移文件时仍执行 [目录约定](../PROJECT-STRUCTURE.md) 的完整检查。

```bash
pnpm check:swamp
pnpm check:viewing
pnpm check:cove
pnpm check:contact
pnpm check:assets
pnpm build
pnpm check:bundle
pnpm check:routes
```

浏览器分别核对 `/`、`/swamp/`、`/cove/`、`/library/`：两个观赏页各自三种光照、湿地四种镜头与晴湾五种镜头、晴湾完整靠泊循环、暂停恢复、拍照、沉浸退出、点击开启水声；素材库模型与观赏快速切换、后台和离屏暂停、重复关闭重开、手机竖屏构图。构建、浏览器验收、Git 推送和部署上线分别记录。

晴湾双船版另需核对两艘船的完整出航归港、水线与尾流匹配、换船后泊位停留、横竖屏构图、加载失败保留旧船及重试、快速改选取消旧请求、反复切换资源释放，以及偏好恢复/损坏/存储不可用。浏览器模拟窄屏不等于实体手机验收；本轮结果写入 [晴湾设计记录](SUNNY-COVE.md)，不得用历史单船验收替代。


### 晴湾 2026-10-04 细化补充

独立 `createCoveBoat(scene, url, { signal, length, draft })` 的默认长度为 2.4 米、吃水为 0.11 米；省略 draft 时随 length 等比变化。码头的木纹、帆布、绳缆及五金由同一个 createCoveDock 实例管理和释放，无页面依赖。晴湾水面 setMood(preset) 同时读取 waterClarity（0.1–1）与 waveStrength（0–1.5），保留已有色彩、太阳方向和过渡约定。

共享宿主的 `viewer.snapshot().render.antialias` 和 `samples` 提供抗锯齿方式与样本数；宿主内部拥有 HDR MSAA 目标或 FXAA 后备资源。直接使用 createSunnyCoveScene 的外部宿主仍自行拥有 renderer、后处理与 RAF，场景不会替外部宿主创建抗锯齿管线。
