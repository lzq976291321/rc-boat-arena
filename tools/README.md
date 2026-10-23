# 开发工具

所有命令从仓库根目录执行。

| 目录 | 用途 | 执行入口 |
| --- | --- | --- |
| `checks/` | 正式回归、参数检查、无渲染模拟、静态路由验收 | `pnpm check:cove`、`pnpm check:viewing`、`pnpm check:contact`、`pnpm check:delivery`、`pnpm check:routes`、`pnpm check:assets`、`pnpm check:bundle`、`pnpm check:tools` |
| `assets/` | 原始素材转换为网站可用资源；运行变体再压缩与发布清单 | `python3 tools/assets/pack-gltf.py SOURCE.gltf OUTPUT.glb`；`node tools/assets/optimize-cove-runtime.mjs --python /path/to/python-with-pillow`；`node tools/assets/publish-cove-runtime.mjs`；单模型重建用 `node tools/assets/publish-cove-model.mjs --id ... --file ... --textures ... --geometry ...` |
| `local/` | 新的本机实验（忽略目录） | 历史实验已移到项目外归档；不作为正式检查入口 |

`check:routes` 与 `check:bundle` 检查构建产物，先运行 `pnpm build`。工具输出放入 `artifacts/<主题>/<日期>/`，不要写进 `src/` 或 `public/`。正式工具不依赖个人机器上的固定绝对路径；一次性工具整理后再移入正式目录。运行变体再压缩需要带 AVIF/WebP 支持的 Python Pillow，产物先落在 `tools/local/cove-runtime/`，审查后由 `publish-cove-runtime.mjs` 发布并同步清单。

完整规则见 [项目目录与职责](../docs/PROJECT-STRUCTURE.md)。
