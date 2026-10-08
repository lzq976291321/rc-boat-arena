# 场景交付模型

此目录是场景专用派生文件，原有 `/assets/library/<id>/model.glb` 及素材库单模型预览继续保留完整版本。来源作者、原始链接和许可逐项保存在 [asset-manifest.json](asset-manifest.json)，每项 `sourceRecord` 指向原素材公开记录。

2026-10-05 加工：英雄船贴图最长边 512，其他模型最长边 256，保留透明通道；几何不减面，位置误差不超过源模型单位的 0.0002，法线/切线分量不超过 0.001，UV 分量不超过 1/4096。FLOAT 属性仍是 FLOAT，经 Three.js 自带解码器回读验证。meshopt TRIANGLES 可能循环旋转单个三角形的三个索引，但保留面顺序、顶点集合及朝向；不将其称为索引字节无损。独有码头仅保留场景实际使用的 `modular_wooden_pier_planks` 节点及依赖，共 5,512 面；完整套件仍在素材库。

所有变体保留原材质通道、UV 集和节点语义，运行时朝向/缩放继续由原使用方控制。完整加工参数、逐属性最大/RMS误差及贴图编码误差见本地验收记录；可复现工具为 `tools/assets/build-startup-models.mjs`。从原始未压缩模型生成，不重复有损处理已发布文件。交付校验使用 `pnpm check:delivery`。

| 变体 | 字节 | 三角面 | 来源记录 |
| --- | ---: | ---: | --- |
| futuristic-speedboat | 1,466,616 | 162,766 | [原素材](../library/futuristic-speedboat/SOURCES.md) |
| lifebuoy | 206,280 | 10,728 | [原素材](../library/lifebuoy/SOURCES.md) |
| maverick-gt | 1,149,484 | 127,081 | [原素材](../library/maverick-gt/SOURCES.md) |
| modular-wooden-pier | 180,764 | 5,512 | [原素材](../library/modular-wooden-pier/SOURCES.md) |
| ocean-buoy | 293,788 | 12,240 | [原素材](../library/ocean-buoy/SOURCES.md) |
| painted-wooden-bench | 79,188 | 630 | [原素材](../library/painted-wooden-bench/SOURCES.md) |
| riva-aquarama | 673,008 | 4,458 | [原素材](../library/riva-aquarama/SOURCES.md) |
| rock-09 | 212,396 | 12,416 | [原素材](../library/rock-09/SOURCES.md) |
| rock-face-01 | 346,992 | 20,174 | [原素材](../library/rock-face-01/SOURCES.md) |
| wooden-crate-02 | 143,248 | 5,176 | [原素材](../library/wooden-crate-02/SOURCES.md) |
