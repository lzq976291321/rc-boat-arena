# 素材接入说明

素材库入口：`/library/`。项目资产随代码发布；收藏、星标、备注仅保存在当前浏览器，不会上传或自动进入游戏。

## 收集与筛选

1. 收藏原始商品或作品链接，填写作者、分类和标签。
2. 用星标标出重点，状态从“待筛选”推进到“已优选”“待接入”。
3. 记录风格、适用场景，以及减面、纹理、动画、尺寸、水线等待处理事项。
4. 许可没有核实就保持“待确认”；付费购买不代表可以公开分发源文件。核对该商品许可后再决定接入。
5. 定期导出 JSON 备份。导入按编号合并，已存在的编号保留当前记录，不覆盖新修改。JSON 只包含收藏和备注，不包含模型或购买文件。

## 将素材接入项目

- 源文件、购买凭证与未核实许可的素材留在仓库外；不要放进 public/，该目录内容会随网站公开发布。
- 处理后的模型优先使用自包含 GLB；纹理随模型打包。检查模型轮廓、PBR 材质、透明贴图、面数、文件大小和动画。
- 使用 glTF +Y 朝上，记录前向轴、真实尺寸、原点、水线和运行时缩放。船艇接入还需验证转向、碰撞尺寸和尾流锚点。
- 月下湿地资产写入 public/assets/swamp/asset-manifest.json，并同步 SOURCES.md；素材库自动读取此清单。其他资产写入 public/assets/library/catalog.json。
- 在场景代码加载、摆放并验证模型；“已接入”表示当前源码使用该资产，不表示最新修改已部署。
- 在浏览器验收模型加载、材质、光照、方向、触屏、加载失败与性能，再登记接入。素材库预览采用统一工作室光照，不能替代场景验收。

## 记录字段

catalog.json 的资产至少包含 id（builtin- 前缀）、name、category、stage、kind、usage、author、license、source、licenseUrl、notes、tags。模型另记录 path（public 相对路径）、bytes、triangles、sha256。category 为 boat / prop / nature / structure / material；已接入 stage 为 integrated；kind 为 model 或 procedural。

许可和来源以各素材的 SOURCES.md 为准。已移除的资产登记在清单的 retiredAssets 中，用于隐藏浏览器里残留的同源候选，不再作为运行资源发布。
