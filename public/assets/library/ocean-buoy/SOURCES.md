# Ocean Buoy · 做旧航标浮标

作者：Mateusz Sadek

来源：[Ocean Buoy](https://polyhaven.com/a/ocean_buoy)

许可：[CC0 1.0](https://polyhaven.com/license)

下载日期：2026-09-21，1K glTF。所有源文件按官方 API 提供的 MD5 核对；由 `tools/assets/pack-gltf.py` 将缓冲区和图像字节原样内嵌到 GLB，未减面、改色或压缩贴图。

- 文件大小：3,026,064 字节
- 三角面：12,240
- 网格：1，材质：1，内嵌图像：4
- SHA-256：`ab3bb19bac7ed63d9f134e4fbe628836378f9b544474e61849c9ce35b8db2fd2`

已接入松岚湖竞速，替代原程序浮标与旗门。保留锈蚀、剥落油漆、灯部发光贴图及模型原点水线 y=0；航道标记直径 1.6 m，检查点标记直径 2.2 m，统一按原比例缩放。目标检查点通过实例颜色轻微增亮，原始 GLB 不变。

60 个航标只解析一次 GLTF，共享几何体、材质和贴图，以 InstancedMesh 绘制。碰撞位置和赛道计时规则沿用现有设置。
