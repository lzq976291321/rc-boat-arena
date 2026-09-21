# 批量收集资产 · 2026-09-21

用户要求扩大收集，全部先入库，由用户审查后再决定删除。此次新增 14 条资产：10 条船艇（其中一条包含三色摩托艇及拖车）和 4 条道具；共 84,858,724 字节，约 80.93 MiB。

所有条目状态为 candidate（待筛选），用途标记“已下载 · 待用户审查”，不是未下载的链接收藏。原有资产和用户收藏保留。

| 名称与来源 | MiB | 三角面 |
| --- | ---: | ---: |
| [Assault Boat · 硬派充气艇](https://sketchfab.com/3d-models/assault-boat-0d4fca4f2e014cd7b6aefd4653b1508c) | 4.06 | 40,036 |
| [MAVERICK GT · 运动摩托艇](https://sketchfab.com/3d-models/maverick-gt-1cbe1b65836d4536bade28ca351ba164) | 4.06 | 127,081 |
| [UNDERPOLY · 摩托艇与拖车](https://sketchfab.com/3d-models/underpoly-free-jet-ski-trailer-c9e324b0a9284904b4a442080fc2a6ef) | 1.62 | 29,118 |
| [Fishing Boat · 传统渔船](https://sketchfab.com/3d-models/fishing-boat-f4b38ccf5ffb46018aa7931c0e106654) | 2.72 | 7,244 |
| [Motor Whaleboat · 机动交通艇](https://sketchfab.com/3d-models/us-navy-26ft-motor-whaleboat-fbcf4df5bab7439b9e1e385c9f41c272) | 9.34 | 47,198 |
| [Dinghy · 救生艇](https://sketchfab.com/3d-models/dinghy-92b24c2f8b874360ab84bf0e881883fe) | 2.06 | 7,766 |
| [Gislinge · 维京木船](https://sketchfab.com/3d-models/gislinge-viking-boat-01098ad7973647a9b558f41d2ebc5193) | 5.42 | 29,035 |
| [Chinese Boat · 中式船](https://sketchfab.com/3d-models/chinese-boat-df5de16d9aa249eda96e9efa4944b69a) | 10.52 | 54,128 |
| [Dutch Ship · 荷兰帆船](https://polyhaven.com/a/dutch_ship_medium) | 8.33 | 69,162 |
| [Ship Pinnace · 古典帆船](https://polyhaven.com/a/ship_pinnace) | 20.09 | 168,317 |
| [Wooden Barrels · 木桶组合](https://polyhaven.com/a/wooden_barrels_01) | 7.13 | 33,142 |
| [Wooden Crate · 绳柄货箱](https://polyhaven.com/a/wooden_crate_02) | 2.13 | 5,176 |
| [Barrel 02 · 工业桶](https://polyhaven.com/a/Barrel_02) | 0.40 | 2,688 |
| [Plastic Crate · 周转筐](https://polyhaven.com/a/plastic_crate_01) | 3.04 | 18,320 |

Sketchfab 模型由已登录浏览器官方入口下载，均为 CC BY 4.0；Poly Haven 模型为 CC0，从官方 API 取得 1K glTF 及依赖，逐文件 MD5 验证后打包为自包含 GLB。每个资产目录记录 SOURCES.md，包含作者、来源、许可、加工和 SHA-256。来源页面中的 NoAI 标记保留于相关备注，资产只用于项目预览。

检查：14 个 GLB 头部、缓冲视图边界、内嵌资源依赖检查通过；14 个模型均已在本地资产库实际渲染检查，未发现项目页面 console 错误。浏览器 Adblock 扩展自身报错不属于项目。

注意：Chinese Boat 有 78 个网格/材质，Ship Pinnace 约 20.09 MiB，UNDERPOLY 和 Wooden Barrels 包含成套展示组件；这些仍全部保留，供用户审查。未应用到现有驾驶场景，未部署。

原始下载及 API 元数据存于仓库外 `rc-boat-assets/candidates/2026-09-21-bulk/`；实测记录：`artifacts/asset-research/2026-09-21/bulk-inspection.json`。

构建验收：`npm run build` 和 `npm run check:bundle` 通过；14 个新增 GLB 在 public 与 dist 中逐一核对 SHA-256 一致。
