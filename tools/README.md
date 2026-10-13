# 开发工具

所有命令从仓库根目录执行。

| 目录 | 用途 | 执行入口 |
| --- | --- | --- |
| `checks/` | 正式回归、参数检查、无渲染模拟、静态路由验收 | `pnpm check:cove`、`pnpm check:viewing`、`pnpm check:contact`、`pnpm check:delivery`、`pnpm check:routes`、`pnpm check:assets`、`pnpm check:bundle` |
| `assets/` | 原始素材转换为网站可用资源 | `python3 tools/assets/pack-gltf.py SOURCE.gltf OUTPUT.glb` |
| `local/` | 新的本机实验（忽略目录） | 历史实验已移到项目外归档；不作为正式检查入口 |

`check:routes` 与 `check:bundle` 检查构建产物，先运行 `pnpm build`。工具输出放入 `artifacts/<主题>/<日期>/`，不要写进 `src/` 或 `public/`。正式工具不依赖个人机器上的固定绝对路径；一次性工具整理后再移入正式目录。

完整规则见 [项目目录与职责](../docs/PROJECT-STRUCTURE.md)。
