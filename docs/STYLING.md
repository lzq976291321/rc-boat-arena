# 页面样式

本项目使用原生 HTML + JavaScript + Three.js，样式通过 Tailwind CSS 4 和 `@tailwindcss/vite` 构建。不需要 React，不使用 CDN 或浏览器端 Tailwind 编译器。

## 入口与范围

- `src/shared/styles/tailwind.css` 声明 theme / base / components / utilities 层，导入主题与工具类。不导入 Preflight，保留当前页面依赖的原生标题、表单、dialog 默认行为与各页基础样式。
- `src/arena/ui/style.css`、`src/swamp/style.css`、`src/cove/style.css`、`src/library/style.css` 分别导入共享入口，并用 `@source` 指定本页 HTML 和 JS 模板。
- 湿地和晴湾共用 `src/shared/viewing/page.css` 的页面结构样式；各自 CSS 用变量配置配色，并补充共享 `page.js` 的 `@source`，不扫描另一场景页面。
- 自动扫描关闭；不扫描 `dist/`、报告、文档或其他页面。以后新增模板目录，在实际消费它的页面补充 `@source`。
- Vite 继续按四个 HTML 入口生成独立 CSS，模型与 Three.js 的动态加载边界保持原样。

## 迭代方式

普通布局、间距和响应式样式直接写工具类，例如素材库已有：

```html
<div class="header-actions ml-auto flex gap-2">…</div>
<div class="form-grid grid grid-cols-2 gap-[15px]">…</div>
```

反复出现的卡片、按钮、弹窗在 `@layer components` 中复用 `@apply`。渐变、复杂动画和场景专用效果允许普通 CSS；竞速与湿地已接入 Tailwind，保留原有专用设计，随实际功能迭代迁移。

工具类层优先于组件层。把某个属性移入 HTML 工具类时，检查组件 CSS 的媒体查询：原有媒体查询无法覆盖更高层的普通工具类，需要一起移成响应式工具类，或将整组规则保留在组件层。

JS 中条件选择完整类名，如 `active ? 'opacity-100' : 'opacity-50'`，不要使用 `bg-${color}-500` 等拼接形式。连续变化的速度、进度和 Three.js 参数继续通过现有逻辑或 CSS 变量传递。`hidden` 属性和游戏 `.hidden` 状态类必须继续生效。

## 验证

运行 `pnpm build`、`pnpm check:bundle`、`pnpm check:routes`；涉及交互时在浏览器检查四个入口、窄屏布局、弹窗与模型预览。检查产物的 JS 与 CSS 实际体积，不能把“使用 Tailwind”当作体积一定变小的结论。

官方资料：[Vite 接入](https://tailwindcss.com/docs/installation/using-vite)、[类名扫描](https://tailwindcss.com/docs/detecting-classes-in-source-files)、[Preflight](https://tailwindcss.com/docs/preflight)。
