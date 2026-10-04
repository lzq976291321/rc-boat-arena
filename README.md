# RC Boat Arena · 松岚湖竞速俱乐部

基于 Three.js / WebGL2 的船模竞速、湿地、晴湾观赏与素材预览项目。竞速入口保留 MAVERICK GT 三圈计时赛；湿地入口提供自动巡游，并将水面、岸景、船艇和镜头整理为可独立接入的观赏资产。

## 项目管理

按文件夹用途维护，详细职责、新文件归属与迁移检查见 [项目目录与职责](docs/PROJECT-STRUCTURE.md)。协作入口为 [AGENTS.md](AGENTS.md)。

| 目录 | 负责什么 |
| --- | --- |
| `src/arena/` | 竞速代码，按 `gameplay/`（玩法）、`rendering/`（画面）、`ui/`（交互）划分 |
| `src/swamp/`、`src/cove/` | 湿地与晴湾观赏页面组装及样式 |
| `src/scene-assets/` | 观赏资产元数据，以及可组合的 Moonwater / Sunny Cove 场景和独立工厂 |
| `src/library/` | 素材收藏、GLB 预览与观赏资产预览 |
| `public/` | 可公开发布的模型、纹理和素材来源记录 |
| `tools/checks/`、`tools/assets/` | 正式检查与素材加工；历史实验留在被忽略的 `tools/local/` |
| `docs/` | 目录约定、设计方向与维护文档 |
| `artifacts/` | 本地截图、录屏和验收证据，不提交 |
| `dsh-plugin/` | 可选的本机 DSH 集成 |
| `dist/`、`node_modules/` | 构建输出与依赖，不手动维护、不提交 |

`index.html`、`swamp/index.html`、`cove/index.html`、`library/index.html` 分别提供 `/`、`/swamp/`、`/cove/`、`/library/` 四个页面入口。根目录只保留页面主入口、配置和维护入口文档。

GitHub `main` 推送通过 Vercel Git 集成自动发布；构建配置和验收方式见 [部署说明](docs/DEPLOYMENT.md)。

## 运行

需要 Node.js 22 或更新版本，以及 package.json 指定的 pnpm 版本。

```bash
corepack pnpm install --frozen-lockfile
pnpm dev
```

本地入口：<http://127.0.0.1:5177/>。

```bash
pnpm build              # 静态产物 dist/
pnpm serve              # 本地预览构建产物
pnpm check:gameplay     # 16 项输入、操控、赛道和回放回归
pnpm check:physics      # 参数与运动模型检查
pnpm check:sim          # 无渲染三圈模拟
```

## 驾驶

| 操作 | 按键 |
| --- | --- |
| 油门 / 倒车 | W / S 或 ↑ / ↓ |
| 左转 / 右转 | A / D 或 ← / → |
| 冲刺 / 收油 | Shift / 空格 |
| 跟随与俯视镜头 | C |
| 俯视缩放 | + / − |
| 脱困，罚时 2 秒 | R |
| 暂停 | Esc |
| 调校 / 回放 / 驾驶数据 | T / P / Y |

支持触屏摇杆。AI 演示可随时由驾驶按键接管；AI 成绩不覆盖个人最佳。成绩保存在当前浏览器本地。

## 画面与模型

- 真实水面倒影、分层细浪、浅深水过渡和船水接触阴影。
- 暖阳光与冷天光、跟随船艇的阴影、程序化山体及树林。
- 尾浪与水花随速度变化并自然消散；手机首页为船体留出独立展示空间。
- 3D 画布限制约 260 万像素，倒影最长边不超过 1024，控制高分辨率屏幕开销。

`public/assets/library/maverick-gt/model.glb` 是松岚湖驾驶船，作者 dannzjs，CC BY 4.0，约 4.06 MiB；几何与材质保留原样，运行时调整方向、显示比例和入水位置。赛道航道与检查点使用 Poly Haven 的 Ocean Buoy（CC0）替换旧程序浮标与旗门。来源与加工记录见各资产目录的 `SOURCES.md`。

操控采用固定步长的游戏模型，水线和碰撞为游戏展示设定。

## Vercel

这是无需后端和环境变量的静态网站。`vercel.json` 配置 Vite 构建并发布 `dist/`，GitHub 仓库可与 Vercel 项目关联。

## 可选 DSH 面板

`dsh-plugin/` 可将已构建的游戏挂载到本机 DSH 的 `/rc-boat-arena/`。这部分只用于本地 DSH，不是网站运行依赖。

```bash
pnpm build
# 按本机情况设置 DSH_HOME / DSH_PROFILE 后：
pnpm dsh:status
pnpm dsh:enable
pnpm dsh:disable
```

## 月下湿地 · Moonwater

独立入口：`/swamp/`，竞速首页也提供入口。打开后自动巡游；页面提供月夜、晨雾、夕照三种光照，以及自动观赏、贴水跟随、侧览船模、水道全景镜头。

可暂停画面、拍照保存 PNG、隐藏界面沉浸观赏。水声默认关闭，点击“开启水声”后播放。`空格` 暂停或继续，`H` 切换沉浸模式，`Esc` 恢复界面。页面不再提供驾驶操作；自动巡游在水道尽头平缓掉头。

湿地使用 Poly Haven 的三件 CC0 植被，以及 dylanheyes 的 Futuristic Speedboat（CC BY 4.0）。来源、作者、许可和加工记录见页面“素材来源”及 [素材清单](public/assets/swamp/SOURCES.md)。GLB 和纹理本地托管，约 20.13 MiB；水面、天空、低雾、尾流和水声为程序生成。参考作品的具体算法未公开，本版本独立实现。

Moonwater 的同一份运行资产由湿地页和素材库消费。Canvas 接入、已有 renderer 组合、镜头独立复用与资源释放见 [观赏资产接入](docs/design/VIEWING-ASSETS.md)；画面分工见 [视觉方向](docs/design/VISUAL-DIRECTION.md)。

```bash
pnpm check:swamp        # 左右、倒车、惯性、边界与巡航掉头
pnpm check:viewing      # 运镜连续性、水道边界、不同帧率与竖屏构图
pnpm check:cove         # 晴湾闭环靠泊、镜头、边界和恢复
pnpm check:contact      # 船水浮态、尾迹衰减、暂停与独立释放
pnpm check:routes       # 构建后检查子路径、目录重定向与模型 MIME
```

## 晴湾船坞 · Sunny Cove

入口：`/cove/`。木质 Riva Aquarama 从码头离泊，在浅海湾巡游后归港停留。提供午后、日落、暮色三种光照，复用镜头、暂停、水声、拍照、沉浸与来源操作；湿地和晴湾页面可互相切换。

场景位于 `src/scene-assets/sunny-cove/`，与湿地共用 Canvas 宿主、页面行为与水声；晴湾船水交互独立提供浮态与水面尾流。Riva 船艇保留 CC BY 4.0 作者署名；码头与岸景复用已有 CC0 素材，公开模型 URL 不变。完整来源见 [晴湾素材记录](public/assets/cove/SOURCES.md)。

## 素材库

入口：`/library/`，首页和湿地素材来源中均提供链接。顶部分类 Tab、底部素材切换；普通模型支持旋转、缩放和线框，“观赏资产”分类可直接运行 Moonwater / Sunny Cove 自动巡游预览，支持重置视角。来源、许可和备注收进信息面板，搜索、筛选和 JSON 备份收进管理面板。

已有 GLB 和程序道具可预览；模型的网格/材质统计放在信息面板。项目资产来自 `public/assets/library/catalog.json`、湿地 manifest 和纯元数据文件 `src/scene-assets/catalog.js`。候选状态为待筛选、已优选、待接入；已接入记录来自项目代码与清单，不由收藏状态自动驱动。

收藏和备注仅保存在当前浏览器的 localStorage；备份只含元数据，不含模型，不跨设备同步。查看、切换镜头和预览不保存服务器数据；照片下载到本地。导入按 ID 合并，已有记录优先。模型接入方式见 [素材接入说明](public/assets/library/README.md)。

## 复用与按需加载

模型加载、有限容量字节缓存、GPU 资源释放与画布像素预算统一在 `src/shared/`。同一页相同模型请求去重，缓存最多 16 MiB / 8 项；解析后的模型归各个场景独立拥有，避免材质修改和销毁互相影响。湿地的重复树木继续使用实例化网格，船艇材质保留模型内共享。

素材库列表与预览模块分离，元数据不静态依赖 Three.js；选中素材后才动态加载对应预览。静态 GLB 按需绘制，观赏场景在可见时持续动画；离屏、后台停止无效绘制，切换取消旧请求，关闭释放资源。自动预览仍需下载引擎与选中的模型，不能把入口包大小当作总流量。Vite 输出构建 manifest，将 Three.js 核心、WebGL、GLTF 解析器和后处理拆成共享/功能包。

```bash
pnpm check:assets       # 并发去重、缓存淘汰、取消、失败重试、资源释放与像素预算
pnpm build
pnpm check:bundle       # 静态依赖边界、共享引擎与包大小预算
```

性能边界和验收记录见 [加载与资源管理](docs/PERFORMANCE.md)。
