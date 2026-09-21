# RC 船候选素材适配核查

核查日期：2026-09-21。首轮范围：DEATHBOAT、M-Jet Supersprint、Drifter、Ragnarok；后续游戏资产搜索见第二轮。

## 结论

四款外观和题材都适合喷射船竞速，但按目前公开许可与文件说明，没有一款满足本项目直接下载并作为公开运行资产入库的条件。首轮未购买、未下载模型文件、未向 `public/` 或正式素材清单添加这些模型。没有进行文件级面数、材质或浏览器性能验收。

这些作品主要用于实体 RC 船的打印装配。商品照片中的涂装、贴花和成品细节，不等于文件包已包含同等效果的游戏材质。

## 项目要求

- 资产库 `src/library/viewer.js` 使用 GLTFLoader，运行资源优先采用自包含 GLB；目前不读取 STL、STEP 或 3MF。
- 竞速船 `src/arena/rendering/boat.js` 使用 +Y 朝上、+Z 船头，显示船长 4.6；水线、船宽和喷口位置按现有 HBY 船设定。新船需要独立核对这些参数，不能仅替换文件地址。
- `public/assets/library/README.md` 与 `AGENTS.md` 要求：公开目录只放可发布资源；候选原始包、工程与购买凭证留在仓库外。
- 当前 HBY 清单为 5,003,728 字节、111,388 个三角面。这是现有参考值，不是给新船规定的性能上限；新资产仍需实际浏览器验收。

## 逐款结果

| 候选 | 文件与技术适配 | 当前公开许可 | 本次处置 |
| --- | --- | --- | --- |
| DEATHBOAT | 作者提供 STL、STEP、3MF；约 120 种零件、250 多件打印组件。需要保留外观零件、处理内部结构、制作材质并导出 GLB。 | 官网标注 Private Use License；条款 6.1 限私人用途，6.2 限向第三方传递内容。 | 不下载入公开资产库；需要额外的网页游戏使用与交付授权。 |
| M-Jet Supersprint | 提供打印件和除喷泵外的整船 STEP，具备进一步转换的基础；未验证游戏网格、UV 或 PBR 材质。 | 当前 CGTrader 商品页标注 Editorial License (no AI)。 | 不购买、不入库；现有许可不能作为本游戏使用授权。 |
| Drifter | 文件清单包含 3MF 与船体 STEP；需要组装整船、重做材质并转换。 | YouMagine 付费文件默认私人非商业许可，明确限制数字文件及衍生版本的托管、分享和分发；本次未查到额外游戏授权。 | 不购买、不入库。 |
| Ragnarok | 免费打印船体，作者说明包含 STEP；仍需网格转换、材质处理和性能检查，喷泵另配。 | 当前 CGTrader 商品页标注 Editorial License (no AI)，免费不等于允许作为游戏资源公开交付。 | 不下载入项目资产库；需要适合游戏使用的额外许可。 |

CGTrader 条款 22.2 将 Editorial 用途限定在新闻、评论等编辑性用途。本项目是可驾驶竞速游戏，不能据此认定满足许可。这里的阻碍是用途与交付范围；并非将 “no AI” 标签解释为禁止自动化检查。

## 核查来源

- [DEATHBOAT 作者商品页](https://hillprinties.com/products/deathboat-1-6-scale-have-it-all-river-jet-boat-hpw40-incl)
- [HillPrinties 使用条款，第 6 节](https://hillprinties.com/policies/terms-of-service)
- [M-Jet Supersprint 作者商品页](https://www.cgtrader.com/3d-print-models/hobby-diy/hobby-accessories/m-jet-sprint-3d-printable-rc-jetsprint-boat-model)
- [Ragnarok 作者商品页](https://www.cgtrader.com/free-3d-print-models/hobby-diy/hobby-accessories/ragnarok-3d-printable-rc-jetsprint-boat)
- [CGTrader 使用条款，第 22 节](https://www.cgtrader.com/pages/terms-and-conditions)
- [Drifter 作者商品页](https://youmagine.com/designs/eeac354d-839d-4ffc-b4b2-c7a2f9624899)
- [YouMagine 付费内容许可](https://youmagine.com/information/premium_content_license)

后续选型应优先核对允许网页游戏使用、加工和相应数字交付的许可，再查看完整模型、贴图、面数与文件体积。商品名中的 RC、打印成功率、实体航行表现不能替代游戏资产适配检查。


## 第二轮：可用于游戏的候选

质量判断顺序：题材与轮廓、实际模型细节、材质与网格、许可和获取方式、浏览器性能。评论、点赞、下载量只作辅助，不能代替以上检查。

| 候选 | 已核对的信息 | 适配结论与状态 |
| --- | --- | --- |
| [Jet Sprint Boat](https://sketchfab.com/3d-models/jet-sprint-boat-5b76557ed6384c5595f7a7c4e18d625d) / moto man 135 | CC BY 4.0；约 133,706 三角面；在线外观有座舱、防滚架、喷泵。48 赞、902 下载。 | 本轮首选，轮廓贴合现有喷射艇竞速；仅完成来源与外观优选。Sketchfab 登录阻止了正式下载，文件和游戏性能未验收。 |
| [RC Boat](https://www.cgtrader.com/3d-models/watercraft/other/rc-boat) / Nudelkopf | 作者声明实时游戏用 PBR、4K 贴图、FBX/OBJ；对应 Sketchfab 约 8,762 三角面。商品标注 Royalty Free。 | 技术方向合适的付费候选。未购买；公开模型原文件分发权限未确认，不入 public。 |
| [Futuristic Speedboat](https://sketchfab.com/3d-models/futuristic-speedboat-5a8f4d21472e4b2b8ec4d23f70cf8cbc) / dylanheyes | CC BY 4.0；约 162,800 三角面；作者称 Substance Painter 制作贴图；在线外观已检查。 | 备用候选，银色封闭船舱偏科幻，与当前 RC 主题差异较大。Sketchfab 下载需要登录，文件未验收。 |

[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 允许复制、改作及商业用途，但需署名、保留许可链接并注明修改。候选入收藏不代表模型下载完成，更不代表已经接入可驾驶船。面数为作者平台展示值，尚未对候选源文件独立统计。

### 实际下载检查后淘汰

从 [3DAssets.dev Powerboat Racing and Launch Ramp](https://3dassets.dev/api/v1/packs/powerboat-racing-and-launch-ramp) 官方公开包下载并用 Blender 渲染检查了三款 CC0 GLB：Compact jet sprint boat（22253，5,648 三角面）、Tunnel-hull sprint boat（22251，6,152）、Three-point racing hydroplane（22255，7,816）。

三款虽然获取与格式方便，但船体过于简化、座舱缺少细节；实际渲染未达到本项目“精品”要求，因此不写入运行清单。官方元数据将它们标为 AI 生成。检查图归档在 `artifacts/asset-research/2026-09-21/rejected/`；本次下载的淘汰 GLB 已清理。

候选收藏备份：`artifacts/asset-research/2026-09-21/candidate-library.json`，可通过素材库“管理收藏 → 导入备份”合并。记录含来源、作者、许可、优先级与尚未验收事项，不包含模型文件。


## Futuristic Speedboat 已下载入库（2026-09-21）

用户确认喜欢此款并完成 Sketchfab 登录后，已从官方下载入口取得 2K GLB。实测 7,687,736 字节、162,766 三角面、3 网格、2 材质，6 张 2048 × 2048 PNG 全部内嵌，无外部文件依赖或必需 glTF 扩展。

文件位于 `public/assets/library/futuristic-speedboat/model.glb`，署名、许可和加工说明见同目录 `SOURCES.md`；原始下载副本留在仓库外。平台 GLB 原样保留，仅重命名。素材库已成功加载预览，船壳金属与蓝色窗材质可见。项目清单登记为 `ready`（待接入驾驶场景），不是候选链接，也不是已上线。

素材库将同来源的旧候选收藏隐藏为备份，避免与已下载模型重复显示；原浏览器收藏数据保留。正式模型的备注编辑正确显示清单中的“待接入”状态。未修改当前驾驶船。


## 应用到月下湿地（2026-09-21）

Futuristic Speedboat 已成为月下湿地的驾驶船，来源与许可从湿地清单统一读取；资产库继续使用同一 GLB 和同一 builtin 编号，状态为“已接入”。原 Bass boat 保留为备用资产。

运行时保留原导出变换，使用独立挂载组将 +X 船头转为 -Z，统一船长 5.2 m、船宽约 1.418 m、静态船底 y=-0.28 m，再叠加原有轻微浮动。尾流起点后移到船心后方 2.55 m，水面船体扰动宽度同步收窄。删除旧钓鱼艇灯架及水面暖光，保留模型的镀铬与蓝窗 PBR 贴图。

本地验收：月夜、晨雾、跟随及侧览正常；自动巡航可见航程从 32 m 增至 131 m，约 14.4 km/h，按 A 可退出巡航转为手动控制，未发现项目浏览器错误。导航 9 项、资产 8 项、路由 5 项检查和生产构建、分包检查通过。此为本地应用，未部署。


## 第三轮：三艘船已下载入库（2026-09-21）

此前四款 Poly Haven 道具已全部下载，本轮新增三艘船；全部来自 Sketchfab 作者页面，下载弹窗明确 CC BY 4.0，已保留署名、来源和许可。前文“登录阻止下载”仅为历史状态，本轮 Jet Sprint 已成功取得正式文件。

| 入库模型 | 实测文件 | 适配判断 |
| --- | --- | --- |
| Jet Sprint Boat / moto man 135 | 3,808,100 字节；133,372 三角面；13 网格、13 材质，无贴图 | 红色双座、防滚架和尾部喷泵，适合竞速驾驶候选。没有精细 PBR 贴图，以几何和纯色为主。 |
| Riva Aquarama / Anton Kovalev | 3,169,824 字节；4,458 三角面；2 网格、2 材质、3 张内嵌贴图 | 经典木质快艇，适合湖面巡游。原导出船壳与玻璃共用 BLEND 导致穿透；复制材质将船壳改为 OPAQUE，玻璃保留 BLEND，修复后浏览器外观正常。 |
| Wooden Boat / mezuna | 4,103,284 字节；3,206 三角面；30 网格、1 材质、3 张内嵌贴图 | 做旧木板、木肋和双桨清楚，适合湿地码头；使用平台 1K 版本，避免 4K 的约 41 MB 下载体积。 |

文件分别位于 `public/assets/library/jet-sprint-boat/`、`riva-aquarama/`、`wooden-boat/`，各有 SOURCES.md；原始下载文件在仓库外 `rc-boat-assets/originals/`。Jet Sprint 与 Wooden Boat 原样保留，Riva 仅调整 JSON 材质引用和透明模式，二进制几何与贴图块逐字节一致。文件检查结果和散列记录于 `artifacts/asset-research/2026-09-21/boats-inspection.json`。

三艘均已在本地资产库实际渲染检查，登记为 ready（待接入），不是链接候选。此次未改动月下湿地或松岚湖的驾驶船。

本轮验证：GLB 头部、二进制视图边界、外部依赖、三角面及 SHA-256 检查通过；三艘资产库实际渲染通过，Riva 修复后复验通过，未发现项目页面错误。`npm run build` 与 `npm run check:bundle` 通过。仅本地入库，未部署。

## 用户审查后的移除与替换（2026-09-21）

按用户要求移除 Bass fishing boat、Jet Sprint Boat、HBY Kart Boat 和程序生成的“赛道浮标与旗门”。这些模型不再出现在 public 运行目录或资产库中；被移除的本地文件、来源和清单快照归档到被忽略的 `artifacts/asset-review/2026-09-21/removed/`。前文关于这些模型保留或可用的描述仅代表历史状态。

松岚湖驾驶船换为 MAVERICK GT，沿用原 GLB 几何、贴图和材质，通过独立挂载组将源模型 -X 船头转为游戏 +Z；船长 4.6 m，船宽约 1.602 m，尾流和船体水面扰动同步适配。许可、作者和处理信息见 `public/assets/library/maverick-gt/SOURCES.md`。

赛道航道标记和检查点实体统一换为 Ocean Buoy；保留计时、软碰撞、检查点编号和起终点拱门。月下湿地继续使用 Futuristic Speedboat。清单的 retiredAssets 隐藏浏览器中同源的旧候选收藏，避免删除后再次出现；不改动其他收藏和备注。

本地浏览器验证三个入口正常：资产库 26 项，MAVERICK 和 Ocean Buoy 预览成功；新船真实 AI 演示三圈完成，总用时 1:04.63，零碰撞、零脱困，项目运行错误为空。玩法、物理、模拟、湿地、资产、路由、构建和分包检查通过。详细记录位于 `artifacts/asset-review/2026-09-21/verification.md`；未推送或部署。
