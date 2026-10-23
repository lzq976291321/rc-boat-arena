# Sunny Cove asset sources

晴湾当前使用下列 17 项素材，其中 4 艘船按选择单独挂载。场景通过共享加载器使用 [runtime 派生文件](../runtime/SOURCES.md)；对应完整库文件仍位于 `/assets/library/<id>/model.glb`。本次单场景加工未覆盖完整库文件，使用中的公开路径保留。此记录描述素材与加工范围，不表示部署状态。

## 当前素材与署名

| 素材 | 作者 | 许可 | 原始来源 | 完整来源记录 |
| --- | --- | --- | --- | --- |
| Riva Aquarama · 经典木质快艇 | Anton Kovalev | [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) | [原始来源](https://sketchfab.com/3d-models/riva-aquarama-lamborghini-9d5716a2ab6645b9a1452f1d6b0372ef) | [riva-aquarama](../library/riva-aquarama/SOURCES.md) |
| MAVERICK GT · 运动摩托艇 | dannzjs | [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) | [原始来源](https://sketchfab.com/3d-models/maverick-gt-1cbe1b65836d4536bade28ca351ba164) | [maverick-gt](../library/maverick-gt/SOURCES.md) |
| Modular Wooden Pier · 做旧木码头 | Rico Cilliers | [CC0-1.0](https://polyhaven.com/license) | [原始来源](https://polyhaven.com/a/modular_wooden_pier) | [modular-wooden-pier](../library/modular-wooden-pier/SOURCES.md) |
| 掉漆木长椅 | Kirill Sannikov | [CC0-1.0](https://polyhaven.com/license) | [原始来源](https://polyhaven.com/a/painted_wooden_bench) | [painted-wooden-bench](../library/painted-wooden-bench/SOURCES.md) |
| Wooden Crate · 绳柄货箱 | James Ray Cock, Jurita Burger | [CC0-1.0](https://polyhaven.com/license) | [原始来源](https://polyhaven.com/a/wooden_crate_02) | [wooden-crate-02](../library/wooden-crate-02/SOURCES.md) |
| Lifebuoy · 救生圈 | Hank Kaamura | [CC0-1.0](https://polyhaven.com/license) | [原始来源](https://polyhaven.com/a/lifebuoy) | [lifebuoy](../library/lifebuoy/SOURCES.md) |
| 灰褐层理岸石 | Jenelle van Heerden | [CC0-1.0](https://polyhaven.com/license) | [原始来源](https://polyhaven.com/a/rock_09) | [rock-09](../library/rock-09/SOURCES.md) |
| 层理岩壁 | Dario Barresi | [CC0-1.0](https://polyhaven.com/license) | [原始来源](https://polyhaven.com/a/rock_face_01) | [rock-face-01](../library/rock-face-01/SOURCES.md) |
| 蓝花楹 · 宽展绿冠 · Jacaranda Tree | Rico Cilliers（制作）, Rob Tuytel（指导） | [CC0-1.0](https://polyhaven.com/license) | [原始来源](https://polyhaven.com/a/jacaranda_tree) | [jacaranda-tree](../library/jacaranda-tree/SOURCES.md) |
| 低矮灌丛 04 | Rico Cilliers | [CC0-1.0](https://polyhaven.com/license) | [原始来源](https://polyhaven.com/a/shrub_04) | [shrub-04](../library/shrub-04/SOURCES.md) |
| Motor Whaleboat · 机动交通艇 | ThomasBeerens | [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) | [原始来源](https://sketchfab.com/3d-models/us-navy-26ft-motor-whaleboat-fbcf4df5bab7439b9e1e385c9f41c272) | [motor-whaleboat](../library/motor-whaleboat/SOURCES.md) |
| Assault Boat · 硬派充气艇 | tnnv | [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) | [原始来源](https://sketchfab.com/3d-models/assault-boat-0d4fca4f2e014cd7b6aefd4653b1508c) | [assault-boat](../library/assault-boat/SOURCES.md) |
| 旧轮胎护舷 | MP | [CC0-1.0](https://polyhaven.com/license) | [原始来源](https://polyhaven.com/a/old_tyre) | [old-tyre](../library/old-tyre/SOURCES.md) |
| 木提桶 | James Ray Cock | [CC0-1.0](https://polyhaven.com/license) | [原始来源](https://polyhaven.com/a/wooden_bucket_01) | [wooden-bucket-01](../library/wooden-bucket-01/SOURCES.md) |
| Lantern 01 · 黄铜提灯 | Rajil Jose Macatangay | [CC0-1.0](https://polyhaven.com/license) | [原始来源](https://polyhaven.com/a/Lantern_01) | [lantern-01](../library/lantern-01/SOURCES.md) |
| 岸边灌丛 03 | Rico Cilliers | [CC0-1.0](https://polyhaven.com/license) | [原始来源](https://polyhaven.com/a/shrub_03) | [shrub-03](../library/shrub-03/SOURCES.md) |
| 酢浆草地被 | Rico Cilliers | [CC0-1.0](https://polyhaven.com/license) | [原始来源](https://polyhaven.com/a/shrub_sorrel_01) | [shrub-sorrel-01](../library/shrub-sorrel-01/SOURCES.md) |

## 四艘可选船艇

四艘船共用巡游、换船和船水交互实现，由 `config/boats.js` 分别指定朝向、显示尺寸、吃水、材质处理与接触参数。每次只挂载选中的船；显示尺寸与水线仅为观赏设置，不是实艇工程规格。局部坐标采用 +Y 向上、-Z 向前、水面 y=0。

| 船艇 | 源船首 → 场景船首 | 显示船长 | 默认吃水 | 场景材质处理 |
| --- | --- | ---: | ---: | --- |
| Riva Aquarama | +X → -Z | 2.4 米 | 0.11 米 | 保留原 UV、贴图及分区，为木材增加清漆，调整镀铬、皮革与独立风挡 |
| MAVERICK GT | -X → -Z | 2.6 米 | 0.10 米 | 沿用原漆面、金属、皮革与清漆，调整采样与环境反射 |
| Motor Whaleboat | +X → -Z | 2.65 米 | 0.234 米 | 保留白漆船身、木甲板等原有材质分区，以源船体白色/深色交界校准观赏水线 |
| Assault Boat | +Z → -Z | 2.4 米 | 0.107 米 | 保留充气管、船底和舷外机完整模型及原材质分区 |

四艘运行船模均保留所用完整几何与节点，贴图最长边缩为 512，再进行有界 FLOAT 精度处理与 Meshopt 压缩；未进行船体减面。各变体字节、SHA-256、面数、贴图尺寸与加工验证见 [runtime 清单](../runtime/asset-manifest.json)。

## 码头、岸景与植被

码头从完整套件选择 `modular_wooden_pier_planks` 节点，组合为三段木平台。长凳位于遮阳棚下，木箱、完整带提手木桶与黄铜提灯形成后侧工具角；三只旧轮胎作为面向泊位的护舷，救生圈挂在前侧木柱。提灯保留铜、玻璃两个节点及材质分层；场景将源铜材质的透射调整为不透光金属，玻璃保持独立透明层，暮色增加小范围暖光。摆放、尺寸与灯光强度由 `config/dressing.js` 配置。木柱、梁、年轮、风化木纹、金属连接件、绳索、帆布缝边和灯芯由项目生成；码头实例统一负责资源释放。

岩岸由连续底形与错落扫描岩片组成，保留岩石 PBR 细节。当前 Jacaranda 运行文件保留叶冠与主干形体，移除不用的细枝部件后进行减面，并将六张纹理缩为 384；2026-10-22 减面与纹理再编码后为 **2,036,196 字节、80,611 三角面**，不声称几何无损。两棵主树共享所属场景的几何和材质；低冠层从该运行叶冠选取完整三角面，保留 UV。减面与压缩的分别验证见 runtime 清单中的 `simplification`、`verification` 字段和 [运行加工说明](../runtime/SOURCES.md)。

Shrub 04 保留 27,327 面原拓扑，运行贴图为 512；场景沿真实株间空隙分离两株完整灌木。Shrub 03 当前已使用，仅取 `shrub_03_a` 单株；酢浆草仅取 `shrub_sorrel_01_d` 单株，两者运行贴图为 256。所有植物按岸边岩缝与干燥肩部摆放，不将来源展示套组整排放入场景；实例共享所属场景资源，并随场景一起释放。

浅海水面、天空、海床沙纹、遮阳棚、巡游、运镜与水声由本项目程序生成。组合场景不改变外部资产各自的许可；再次分发或接入时保留作者、原始链接、许可和加工说明。

机器可读清单：[asset-manifest.json](asset-manifest.json)。该清单的字节、SHA-256 和三角面描述完整库文件；当前运行派生文件的数据见 runtime 清单。二者均不等于画面实例总面数或实际加载时间。

## 历史加工记录

- 2026-10-05：完整库文件曾进行 JPEG 重编码、索引收窄及 Meshopt 压缩，保留当时模型顶点值、三角面、节点、UV 和贴图尺寸，透明图保持像素不变；这些记录描述当时的完整库交付，不能代替当前 runtime 规格。
- 2026-10-13 单场景精细化之前：Jacaranda 曾使用保留全部叶冠/主干三角面的 11,069,092 字节、334,314 面运行版本。该版本已被上文的减面、512 贴图版本替代。
- Shrub 03 在早期晴湾组合中曾停用；当前以独立单株重新接入。Aerial Grass Rock、Island Tree 02 与 Shrub 02 不在当前 17 项晴湾运行清单中。
