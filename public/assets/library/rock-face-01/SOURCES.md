# 层理岩壁 / Rock Face 01

> 2026-10-05 交付优化：当前文件 **1,878,608 字节**，SHA-256 `6d2f545f293a8b35df6df48c989b74296f9620ec5d672fc1384f16aa866df28b`。下方原始下载/打包数据为历史记录。保留模型顶点值、三角面、节点、UV 和贴图尺寸；JPEG 重新编码、透明图保持像素不变，索引按值无损收窄后使用 EXT_meshopt_compression 压缩。公开 URL 不变，加载器需 MeshoptDecoder。

作者：Dario Barresi

来源：[Rock Face 01](https://polyhaven.com/a/rock_face_01)

许可：[CC0-1.0](https://polyhaven.com/license)

2026-09-22 从 Poly Haven 官方 API 下载 1K glTF 与全部依赖。逐文件大小、MD5 与官方 files 元数据核对一致；原始文件和元数据保存在仓库外 `../rc-boat-assets/candidates/2026-09-22-rocks/`。

加工：使用项目 `tools/assets/pack-gltf.py` 将外部缓冲与图像原样内嵌为 GLB。逐个缓冲视图与图像比对通过；未减面、未改变节点/材质/源贴图，未使用官方展示渲染图。

用途与摆放：山脚岩壁；正面主要朝 +Z 与 +Y，朝湖心摆放，开口背面埋入山坡并覆盖扫描边缘。

- 文件大小：3048988 字节
- 三角面：20174（实际 glTF primitive 统计）
- 网格：1；材质：1；图像：3（均为 1024 × 1024）
- Three.js 节点：`rock_face_01`
- Three.js 源姿态包围盒尺寸：X=4.95351124、Y=3.56404900、Z=3.82730329；+Y 朝上，尺寸来自实际顶点，未用来源 API dimensions 推测单位
- 材质保留源双面设置；岩壁的双面可见不代表背面存在完整岩体
- SHA-256：`1a94fa37c0f0c04becbed033d72833690884268180648df63e8119101e7f16ed`

验证：GLB 2.0 文件头、分块及缓冲视图边界通过；无外部依赖。通过项目共享 `loadGLTF` 在本地 Chromium 中真正解码纹理并渲染正面、背面和侧面，贴图完整、无控制台错误。截图与节点/材质/尺寸记录位于 `artifacts/asset-research/2026-09-22-rocks/`。这表示资产预览通过，实际场景摆放、运行性能及上线状态另行验收。
