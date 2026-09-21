export function setupPreview({ container, message, open, reset, wireframe, onStats }) {
  let asset, viewer, loading, revision = 0, suspended = false;
  const canPreview = () => !!asset?.path || asset?.kind === 'procedural';
  function controls() {
    reset.hidden = wireframe.hidden = !viewer || !canPreview();
  }
  async function render() {
    const current = ++revision;
    open.hidden = true; open.disabled = false;
    if (suspended || !canPreview()) {
      viewer?.show(null); container.style.visibility = 'hidden';
      message.hidden = !asset; message.textContent = '暂无模型预览'; controls(); return;
    }
    open.disabled = true; message.hidden = false; message.textContent = '加载中…'; controls();
    try {
      loading ??= import('./viewer.js').catch(error => { loading = undefined; throw error; });
      const { createViewer } = await loading;
      if (current !== revision || suspended) return;
      viewer ??= createViewer(container, message, onStats);
      controls();
      const ok = await viewer.show(asset);
      if (!ok && current === revision && !suspended && canPreview()) open.hidden = false;
    } catch (error) {
      if (current !== revision || suspended) return;
      console.error('Asset preview failed:', error);
      container.dataset.state = 'error';
      message.hidden = false; message.textContent = '预览加载失败，请重试'; open.hidden = false;
    } finally { if (current === revision) { open.disabled = false; open.textContent = '重试预览'; } }
  }
  function stop() {
    revision++; suspended = true; viewer?.destroy(); viewer = undefined;
    open.hidden = true; wireframe.setAttribute('aria-pressed', 'false'); controls();
  }
  function resume(event) { if (event.persisted) { suspended = false; void render(); } }
  open.onclick = () => { suspended = false; void render(); };
  reset.onclick = () => viewer?.reset();
  wireframe.onclick = () => { const value = wireframe.getAttribute('aria-pressed') !== 'true'; wireframe.setAttribute('aria-pressed', value); viewer?.wireframe(value); };
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', resume);
  if (import.meta.hot) import.meta.hot.dispose(() => {
    stop(); window.removeEventListener('pagehide', stop); window.removeEventListener('pageshow', resume);
  });
  return { select(value) { asset = value; void render(); }, dispose: stop };
}
