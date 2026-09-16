# RC Boat Arena · 松岚湖竞速俱乐部

基于 Three.js / WebGL2 的遥控喷水船竞速游戏。驾驶粉色 HBY 卡丁船，依次穿过 5 个检查点，完成三圈计时赛。

## 运行

需要 Node.js 22 或更新版本，以及 package.json 指定的 pnpm 版本。

```bash
corepack pnpm install --frozen-lockfile
pnpm dev
```

本地入口：<http://127.0.0.1:5177/>。

```bash
pnpm build              # 静态产物 dist/
pnpm serve              # 本地预览构建产物
pnpm check:gameplay     # 16 项输入、操控、赛道和回放回归
pnpm check:physics      # 参数与运动模型检查
pnpm check:sim          # 无渲染三圈模拟
```

## 驾驶

| 操作 | 按键 |
| --- | --- |
| 油门 / 倒车 | W / S 或 ↑ / ↓ |
| 左转 / 右转 | A / D 或 ← / → |
| 冲刺 / 收油 | Shift / 空格 |
| 跟随与俯视镜头 | C |
| 俯视缩放 | + / − |
| 脱困，罚时 2 秒 | R |
| 暂停 | Esc |
| 调校 / 回放 / 驾驶数据 | T / P / Y |

支持触屏方向与油门按钮。AI 演示可随时由驾驶按键接管；AI 成绩不覆盖个人最佳。成绩保存在当前浏览器本地。

## 画面与模型

- 真实水面倒影、分层细浪、浅深水过渡和船水接触阴影。
- 暖阳光与冷天光、跟随船艇的阴影、程序化山体及树林。
- 尾浪与水花随速度变化并自然消散；手机首页为船体留出独立展示空间。
- 3D 画布限制约 260 万像素，倒影最长边不超过 1024，控制高分辨率屏幕开销。

`public/models/hby-kart-boat.glb` 保留 HBY 模型原粉色、贴花、双座、顶棚与发动机，约 4.77 MiB。原 Blender 文件不包含在仓库中。

重新导出自己的源文件：

```bash
blender --background --disable-autoexec --python tools/export-hby-boat.py -- --source SOURCE.blend --out public/models/hby-kart-boat.glb
```

操控采用固定步长的游戏模型，水线和碰撞为游戏展示设定。

## Vercel

这是无需后端和环境变量的静态网站。`vercel.json` 配置 Vite 构建并发布 `dist/`，GitHub 仓库可与 Vercel 项目关联。

## 可选 DSH 面板

`dsh-plugin/` 可将已构建的游戏挂载到本机 DSH 的 `/rc-boat-arena/`。这部分只用于本地 DSH，不是网站运行依赖。

```bash
pnpm build
# 按本机情况设置 DSH_HOME / DSH_PROFILE 后：
pnpm dsh:status
pnpm dsh:enable
pnpm dsh:disable
```
