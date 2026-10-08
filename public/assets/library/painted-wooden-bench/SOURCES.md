# 掉漆木长椅 / Painted Wooden Bench

> 2026-10-05 交付优化：当前文件 **1,129,248 字节**，SHA-256 `77b5d916581a4ae93583f617fd27615814b6c9b8b882bde49792b9201b6b9266`。下方原始下载/打包数据为历史记录。保留模型顶点值、三角面、节点、UV 和贴图尺寸；JPEG 重新编码、透明图保持像素不变，索引按值无损收窄后使用 EXT_meshopt_compression 压缩。公开 URL 不变，加载器需 MeshoptDecoder。

作者：Kirill Sannikov

来源：[Painted Wooden Bench](https://polyhaven.com/a/painted_wooden_bench)

许可：[CC0-1.0](https://polyhaven.com/license)

2026-09-22 从 Poly Haven 官方 API 下载 1K glTF 与全部依赖；逐文件大小和 MD5 与官方 files 元数据一致。原始包和下载元数据保存在仓库外。

加工：使用项目 `tools/assets/pack-gltf.py` 将外部缓冲区和图像无损内嵌为 GLB；保留源几何、节点、材质和图像字节，不做减面或纹理重编码。未根据来源未核实单位的 dimensions 声明模型尺寸。

用途：适合湖岸步道与观赛区；低面数几何适合少量重复。

状态：已下载，待用户审查；尚未摆入场景。以下仅为文件结构与统计检查，不代表浏览器材质、场景摆放或运行性能已验收。

- 文件大小：1988600 字节
- 三角面：630（按网格 primitive 统计，不重复计算节点实例）
- 网格：1；材质：1；图像：3
- 检查：GLB 2.0 文件头、分块边界及缓冲视图边界通过；缓冲与图像资源均内嵌，无外部依赖
- SHA-256：`01366dba8fbdea38c2945ba6eaf91486f268785d6e849913d1df579651df05ef`

2026-09-22：已在本地素材库逐件加载并核对预览画面，未发现缺失贴图或模型加载错误；仍待用户筛选及真实场景验收。
