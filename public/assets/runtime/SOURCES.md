# 场景交付模型

此目录是场景专用派生文件，原有 `/assets/library/<id>/model.glb` 及素材库单模型预览继续保留完整版本。来源作者、原始链接和许可逐项保存在 [asset-manifest.json](asset-manifest.json)，每项 `sourceRecord` 指向原素材公开记录。

2026-10-05 加工：英雄船贴图最长边 512，其他模型最长边 256，保留透明通道；几何不减面，位置误差不超过源模型单位的 0.0002，法线/切线分量不超过 0.001，UV 分量不超过 1/4096。FLOAT 属性仍是 FLOAT，经 Three.js 自带解码器回读验证。meshopt TRIANGLES 可能循环旋转单个三角形的三个索引，但保留面顺序、顶点集合及朝向；不将其称为索引字节无损。独有码头仅保留场景实际使用的 `modular_wooden_pier_planks` 节点及依赖，共 5,512 面；完整套件仍在素材库。

所有变体保留原材质通道、UV 集和节点语义，运行时朝向/缩放继续由原使用方控制。完整加工参数、逐属性最大/RMS误差及贴图编码误差见本地验收记录。2026-10-05 批次使用 `tools/assets/build-startup-models.mjs` 从原始未压缩模型生成；后续植被加工单独记录于下方。不重复有损处理已发布文件。交付校验使用 `pnpm check:delivery`。

| 变体 | 字节 | 三角面 | 来源记录 |
| --- | ---: | ---: | --- |
| futuristic-speedboat | 1,466,616 | 162,766 | [原素材](../library/futuristic-speedboat/SOURCES.md) |
| jacaranda-tree | 11,069,092 | 334,314 | [原素材](../library/jacaranda-tree/SOURCES.md) |
| lifebuoy | 206,280 | 10,728 | [原素材](../library/lifebuoy/SOURCES.md) |
| maverick-gt | 1,149,484 | 127,081 | [原素材](../library/maverick-gt/SOURCES.md) |
| modular-wooden-pier | 180,764 | 5,512 | [原素材](../library/modular-wooden-pier/SOURCES.md) |
| ocean-buoy | 293,788 | 12,240 | [原素材](../library/ocean-buoy/SOURCES.md) |
| painted-wooden-bench | 79,188 | 630 | [原素材](../library/painted-wooden-bench/SOURCES.md) |
| riva-aquarama | 673,008 | 4,458 | [原素材](../library/riva-aquarama/SOURCES.md) |
| rock-09 | 212,396 | 12,416 | [原素材](../library/rock-09/SOURCES.md) |
| rock-face-01 | 346,992 | 20,174 | [原素材](../library/rock-face-01/SOURCES.md) |
| wooden-crate-02 | 143,248 | 5,176 | [原素材](../library/wooden-crate-02/SOURCES.md) |

## 2026-10-13 晴湾植被变体

Jacaranda 的完整素材继续保留在原公开 URL，字节数与校验值不变。晴湾专用变体剔除本来就不绘制的细枝部件及其三张贴图，保留叶冠与主干全部 334,314 个三角面、节点变换、材质、UV 和六张 1K JPEG 的原始字节。位置最大分量误差为 0.0001221 个模型单位，法线最大分量误差为 0.0002442，UV 最大分量误差为 1/4096；不进一步减面或降采样。

变体从完整库文件的无损 meshopt 缓冲解码后提取，再应用已有有界 FLOAT 压缩流程。交付体积从 23,856,424 降至 11,069,092 字节，减少 53.60%。该数值描述下载资源，不代表单帧 GPU 三角面或实际加载时间。两棵主树继续共享几何与材质；岩肩灌木和低冠层的实例数量另外收敛。

可复现命令：`node tools/assets/build-cove-foliage.mjs tools/local/cove-foliage`。候选默认生成于不发布的本机目录；来源、逐属性误差与解码验证见 `artifacts/sunny-cove/2026-10-13/foliage-delivery.json`。作者为 Rico Cilliers（制作）、Rob Tuytel（指导），原始来源与 CC0 许可见表格中的原素材记录。
