# Sunny Cove asset sources

> 第二轮首屏优化：场景显式使用 [runtime 变体](../runtime/SOURCES.md)；本页原素材路径继续保留完整版本。变体贴图降采样、几何有界精度及码头部件提取记录见该目录的交付清单。

晴湾船坞复用项目已有公开资产，保留源模型形状、节点和公共 URL。以下记录实际运行范围，不表示已经上线。

| 素材 | 作者 | 许可 | 原始来源 | 项目文件 |
| --- | --- | --- | --- | --- |
| Riva Aquarama · 经典木质快艇 | Anton Kovalev | [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) | [原始素材](https://sketchfab.com/3d-models/riva-aquarama-lamborghini-9d5716a2ab6645b9a1452f1d6b0372ef) | `/assets/library/riva-aquarama/model.glb` |
| Modular Wooden Pier · 做旧木码头 | Rico Cilliers | [CC0-1.0](https://polyhaven.com/license) | [原始素材](https://polyhaven.com/a/modular_wooden_pier) | `/assets/library/modular-wooden-pier/model.glb` |
| 掉漆木长椅 | Kirill Sannikov | [CC0-1.0](https://polyhaven.com/license) | [原始素材](https://polyhaven.com/a/painted_wooden_bench) | `/assets/library/painted-wooden-bench/model.glb` |
| Wooden Crate · 绳柄货箱 | James Ray Cock, Jurita Burger | [CC0-1.0](https://polyhaven.com/license) | [原始素材](https://polyhaven.com/a/wooden_crate_02) | `/assets/library/wooden-crate-02/model.glb` |
| Lifebuoy · 救生圈 | Hank Kaamura | [CC0-1.0](https://polyhaven.com/license) | [原始素材](https://polyhaven.com/a/lifebuoy) | `/assets/library/lifebuoy/model.glb` |
| 灰褐层理岸石 | Jenelle van Heerden | [CC0-1.0](https://polyhaven.com/license) | [原始素材](https://polyhaven.com/a/rock_09) | `/assets/library/rock-09/model.glb` |
| 层理岩壁 | Dario Barresi | [CC0-1.0](https://polyhaven.com/license) | [原始素材](https://polyhaven.com/a/rock_face_01) | `/assets/library/rock-face-01/model.glb` |
| 蓝花楹 · 宽展绿冠 · Jacaranda Tree | Rico Cilliers（制作）, Rob Tuytel（指导） | [CC0-1.0](https://polyhaven.com/license) | [原始素材](https://polyhaven.com/a/jacaranda_tree) | `/assets/library/jacaranda-tree/model.glb` |
| 低矮灌丛 04 | Rico Cilliers | [CC0-1.0](https://polyhaven.com/license) | [原始素材](https://polyhaven.com/a/shrub_04) | `/assets/library/shrub-04/model.glb` |

## 加工与组合

船艇使用 Anton Kovalev 的 Riva Aquarama，CC BY 4.0。保留原始贴图与 UV，运行时按原有材质分区调整清漆、皮革、镀铬与独立风挡。+Y 向上、-Z 向前、水面 y=0；长度 2.4 米，默认吃水 0.11 米，可在独立工厂配置。历史加工见 [Riva 来源记录](../library/riva-aquarama/SOURCES.md)。

码头仅使用 modular_wooden_pier_planks 节点，加厚板边并组合。木柱、梁、年轮、风化木纹、连接件、绳结、帆布缝边与少量生活细节由项目程序生成，资源由码头实例统一释放。

岩岸由连续底形与错落扫描岩片组成，保留岩石 PBR 细节。Jacaranda 使用原始绿色叶冠和主干，省去被树冠遮住的细枝；两棵共享几何和材质。少量低冠层取自同一叶冠的完整三角面，保留 UV。Shrub 04 原为同一网格中的四株展示排布，运行时沿真实株间空隙分离两株完整灌木，不将整排展示套组摆入场景。原文件的减面、1K 贴图和校验记录见 [Jacaranda 来源](../library/jacaranda-tree/SOURCES.md)、[Shrub 04 来源](../library/shrub-04/SOURCES.md)。

2026-10-04 起，晴湾不再使用 Aerial Grass Rock、Island Tree 02、Shrub 02 与 Shrub 03。其他场景及素材库保留各自的原有资源。

浅海水面、天空、海床沙纹、遮阳棚、巡游、运镜及水声由本项目程序生成。组合场景不改变外部资产各自的许可；再次分发或接入时保留作者、来源链接、许可和加工说明。

机器可读清单：[asset-manifest.json](asset-manifest.json)。字节、SHA256、三角面描述源文件，不是画面中的实例总面数。

## 2026-10-05 加载优化

2026-10-05：保留模型顶点值、三角面、节点、UV 和贴图尺寸；JPEG 重新编码、透明图保持像素不变，索引按值无损收窄后使用 EXT_meshopt_compression 压缩。公开 URL 不变，加载器需 MeshoptDecoder。 当前字节数和 SHA-256 见 `asset-manifest.json`；先显示船艇、码头与岩岸，树冠随后载入。
