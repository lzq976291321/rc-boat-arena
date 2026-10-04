# 灰褐层理岸石 / Rock 09

作者：Jenelle van Heerden

来源：[Rock 09](https://polyhaven.com/a/rock_09)

许可：[CC0-1.0](https://polyhaven.com/license)

2026-09-22 从 Poly Haven 官方 API 下载 1K glTF 与全部依赖。逐文件大小、MD5 与官方 files 元数据核对一致；原始文件和元数据保存在仓库外 `../rc-boat-assets/candidates/2026-09-22-rocks/`。

加工：使用项目 `tools/assets/pack-gltf.py` 将外部缓冲与图像原样内嵌为 GLB。逐个缓冲视图与图像比对通过；未减面、未改变节点/材质/源贴图，未使用官方展示渲染图。

用途与摆放：近岸散石与石群；保持灰褐源贴图，按湖岸尺度等比放大。

- 文件大小：1963436 字节
- 三角面：12416（实际 glTF primitive 统计）
- 网格：1；材质：1；图像：3（均为 1024 × 1024）
- Three.js 节点：`rock_09_LOD0`
- Three.js 源姿态包围盒尺寸：X=0.07400986、Y=0.03286941、Z=0.14462451；+Y 朝上，尺寸来自实际顶点，未用来源 API dimensions 推测单位
- 材质保留源双面设置；岩壁的双面可见不代表背面存在完整岩体
- SHA-256：`6be049785bd00a91ecfd0daa36c5dc3d4b3cd4de70668772d3055fd872b7bcd6`

验证：GLB 2.0 文件头、分块及缓冲视图边界通过；无外部依赖。通过项目共享 `loadGLTF` 在本地 Chromium 中真正解码纹理并渲染正面、背面和侧面，贴图完整、无控制台错误。截图与节点/材质/尺寸记录位于 `artifacts/asset-research/2026-09-22-rocks/`。这表示资产预览通过，实际场景摆放、运行性能及上线状态另行验收。
