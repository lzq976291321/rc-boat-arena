# 中型枯枝堆 / Dry Branches Medium 01

作者：Rico Cilliers

来源：[Dry Branches Medium 01](https://polyhaven.com/a/dry_branches_medium_01)

许可：[CC0-1.0](https://polyhaven.com/license)

2026-09-22 从 Poly Haven 官方 API 下载 1K glTF 与全部依赖；逐文件大小和 MD5 与官方 files 元数据一致。原始包和下载元数据保存在仓库外。

加工：使用项目 `tools/assets/pack-gltf.py` 将外部缓冲区和图像无损内嵌为 GLB；保留源几何、节点、材质和图像字节，不做减面或纹理重编码。未根据来源未核实单位的 dimensions 声明模型尺寸。

用途：适合岸边枯枝堆和漂积物；放置时调整与地面及水面的交接。

状态：已下载，待用户审查；尚未摆入场景。以下仅为文件结构与统计检查，不代表浏览器材质、场景摆放或运行性能已验收。

- 文件大小：3249380 字节
- 三角面：16803（按网格 primitive 统计，不重复计算节点实例）
- 网格：3；材质：1；图像：3
- 检查：GLB 2.0 文件头、分块边界及缓冲视图边界通过；缓冲与图像资源均内嵌，无外部依赖
- SHA-256：`b97d49317522b3ca0ecbdbe7ecc028117cfe7b719db5a25a31e42cf3da34cf2e`

2026-09-22：已在本地素材库逐件加载并核对预览画面，未发现缺失贴图或模型加载错误；仍待用户筛选及真实场景验收。

预览为三根分开的独立枯枝，场景中需单独选择和摆放。
