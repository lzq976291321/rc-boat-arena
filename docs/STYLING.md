# 页面样式

项目使用原生 HTML、JavaScript 与 Three.js。Tailwind CSS 4 和 `@tailwindcss/vite` 在构建时生成样式，不使用浏览器端编译器或全局重置。

## 入口与范围

- `src/shared/styles/tailwind.css` 声明 theme / base / components / utilities 层，导入主题与工具类，不导入 Preflight，保留原生表单、dialog和页面基础行为。
- `src/cove/style.css` 扫描根目录 `index.html`、晴湾页面JS和 `shared/viewing/page.js`；页面结构共用 `shared/viewing/page.css`，晴湾设置配色及专用视觉效果。
- `src/library/style.css` 只扫描本地工作台的HTML与JS。工作台仅开发可用，不进入生产CSS。
- 自动扫描关闭；不扫描 `dist/`、报告、文档与历史场景。新增模板目录由实际使用它的入口补充 `@source`。
- 生产只生成晴湾应用样式；旧入口跳转页不加载另一套场景样式。

## 迭代方式

普通布局、间距和响应式行为直接写完整工具类：

```html
<div class="header-actions ml-auto flex gap-2">…</div>
<div class="form-grid grid grid-cols-2 gap-[15px]">…</div>
```

重复卡片、按钮与弹窗可在 `@layer components` 内用 `@apply` 复用。渐变、复杂动画和场景效果允许普通CSS。

工具类层高于组件层。属性移入HTML后，同步处理原组件媒体查询：一起迁移为响应式工具类，或把整组规则留在组件层。JS中选择完整类名，不拼接半截类名；连续动画参数使用CSS变量。`hidden` 属性必须继续生效。

## 验证

运行 `pnpm build`、`pnpm check:bundle` 和 `pnpm check:routes`。涉及交互时检查晴湾窄屏、横屏、换船卡片、拍照、弹窗与沉浸模式；本地素材工作台的相关修改另验按需预览。检查JS/CSS实际体积，不把采用Tailwind视为体积已经缩小的证据。

历史四页面和湿地专用样式描述对应旧版本，已不适用于当前发布范围。

官方资料：[Vite接入](https://tailwindcss.com/docs/installation/using-vite)、[类名扫描](https://tailwindcss.com/docs/detecting-classes-in-source-files)、[Preflight](https://tailwindcss.com/docs/preflight)。
