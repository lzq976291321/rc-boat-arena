# 山坡草岩 · PBR 材质

> 2026-10-05 交付优化：当前文件 **1,728,320 字节**，SHA-256 `78d6c5ed643b77a3c4eb2d497df0af60621c2feb3a61acfe34dc92b85d2db1c3`。下方原始下载/打包数据为历史记录。保留模型顶点值、三角面、节点、UV 和贴图尺寸；JPEG 重新编码、透明图保持像素不变，索引按值无损收窄后使用 EXT_meshopt_compression 压缩。公开 URL 不变，加载器需 MeshoptDecoder。

作者：Rob Tuytel

来源：[aerial_grass_rock](https://polyhaven.com/a/aerial_grass_rock)

许可：[CC0-1.0](https://polyhaven.com/license)

2026-09-22 从 Poly Haven 官方 API 获取 1K glTF 与其三张 JPG 纹理；下载的 glTF 和图像均通过官方文件大小及 MD5 校验。原始 glTF、纹理和下载元数据保存在仓库外的 `Downloads/rc-boat-assets/terrain-2026-09-22/aerial_grass_rock/`。未下载或公开原始大型预览几何。

加工：使用 `tools/assets/pack-material-preview.py` 自行生成 32×16 分段 UV 球（561 顶点、960 个有效三角面、单网格、单材质、UV 0–1），替换官方预览几何。通过 `tools/assets/pack-gltf.py` 将几何及三张原始图像打包为单个 GLB；原材质、纹理绑定、采样器与图像字节保持不变，不做纹理重编码。该球体是本项目生成的材质预览载体，不是 Poly Haven 原始扫描模型。

材质：保留基础颜色贴图、OpenGL 法线贴图、粗糙度贴图与 `metallicFactor=0`。原始灰度粗糙度图保持来源 glTF 的 metallicRoughnessTexture 绑定。

用途：松岚湖 · 山坡与岩地；运行时提取材质供湖岸地表使用，预览球不作为山体几何。

- 文件大小：1959336 字节
- 三角面：960
- 网格：1；材质：1；图像：3
- 检查：GLB 2.0 文件头、总大小、缓冲视图边界、UV 范围、全部三角面朝外通过；三个内嵌图像字节与下载原图逐一一致；无外部依赖
- SHA-256：`b63578e65ecd94b8964c74ec7e9ed108f4b10f9bf1940f6db445d296e6ebe0d8`

此处的结构检查不代表场景摆放、浏览器显示或性能已验收；这些由松岚湖本次场景验收单独记录。
