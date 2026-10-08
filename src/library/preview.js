export function setupPreview({ container, message, open, reset, wireframe, onStats }) {
  let asset, viewer, loading, imagePreview, sceneViewer, sceneRequest, revision = 0, suspended = false;
  const canPreview = () => !!asset?.path || asset?.kind === 'procedural' || asset?.kind === 'scene';
  function controls() {
    reset.hidden = !(viewer || sceneViewer) || !canPreview();
    wireframe.hidden = !viewer || !canPreview() || asset?.kind === 'scene';
  }
  function clearScene() {
    sceneRequest?.abort(); sceneRequest = undefined;
    sceneViewer?.destroy(); sceneViewer = undefined;
  }
  async function showScene(current) {
    viewer?.destroy(); viewer = undefined;
    wireframe.setAttribute('aria-pressed', 'false'); controls();
    container.style.visibility = 'visible'; container.dataset.state = 'scene-loading';
    open.disabled = true; message.hidden = false; message.textContent = '正在展开这片风景…';
    const request = new AbortController(); sceneRequest = request;
    try {
      const { createScenePreview } = await import('./scene-preview.js');
      if (current !== revision || suspended || request.signal.aborted) return;
      const created = await createScenePreview({ container, asset, signal: request.signal });
      if (current !== revision || suspended || request.signal.aborted) { created.destroy(); return; }
      sceneViewer = created;
      message.hidden = true; container.dataset.state = 'scene-ready'; controls();
    } catch (error) {
      if (current !== revision || suspended || request.signal.aborted) return;
      console.error('Scene preview failed:', error);
      container.dataset.state = 'error'; container.style.visibility = 'hidden';
      message.hidden = false; message.textContent = '这片风景暂时未能展开，请重试。';
      open.hidden = false;
    } finally {
      if (current === revision) { open.disabled = false; open.textContent = '重试预览'; }
    }
  }
  function clearImage() {
    if (!imagePreview) return;
    imagePreview.image.onload = imagePreview.image.onerror = null;
    imagePreview.image.removeAttribute('src');
    imagePreview.element.remove(); imagePreview = undefined;
  }
  function showImage(current) {
    viewer?.destroy(); viewer = undefined;
    wireframe.setAttribute('aria-pressed', 'false'); controls();
    container.style.visibility = 'visible'; container.dataset.state = 'image-loading';
    open.disabled = true; message.hidden = false; message.textContent = '正在加载原作预览图…';
    const element = document.createElement('figure'), image = document.createElement('img'), caption = document.createElement('figcaption');
    element.className = 'm-0 flex h-full w-full flex-col items-center gap-2 px-3 pb-3';
    element.hidden = true;
    image.className = 'block min-h-0 w-full flex-1 object-contain';
    image.alt = `${asset.name} 原作预览图`; image.decoding = 'async';
    caption.className = 'shrink-0 text-center text-[11px] text-[#7b8675]';
    caption.textContent = '原作预览 · 模型待下载';
    element.append(image, caption); container.append(element);
    imagePreview = { element, image };
    image.onload = () => {
      if (current !== revision || suspended) return;
      element.hidden = false; message.hidden = true;
      container.dataset.state = 'image-ready'; open.disabled = false;
    };
    image.onerror = () => {
      if (current !== revision || suspended) return;
      clearImage(); container.dataset.state = 'error'; container.style.visibility = 'hidden';
      message.hidden = false; message.textContent = '原作预览图加载失败，请重试或查看素材来源。';
      open.disabled = false; open.hidden = false; open.textContent = '重试预览';
    };
    image.src = asset.previewImage;
  }
  async function render() {
    const current = ++revision;
    clearImage(); clearScene();
    open.hidden = true; open.disabled = false;
    if (!suspended && asset?.kind === 'scene') { await showScene(current); return; }
    if (!suspended && !canPreview() && asset?.previewImage) { showImage(current); return; }
    if (suspended || !canPreview()) {
      viewer?.show(null); container.style.visibility = 'hidden';
      container.dataset.state = 'empty';
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
    revision++; suspended = true; clearImage(); clearScene(); viewer?.destroy(); viewer = undefined;
    container.style.visibility = 'hidden'; container.dataset.state = 'closed'; message.hidden = true;
    open.hidden = true; wireframe.setAttribute('aria-pressed', 'false'); controls();
  }
  function resume(event) { if (event.persisted) { suspended = false; void render(); } }
  open.onclick = () => { suspended = false; void render(); };
  reset.onclick = () => { if (sceneViewer) sceneViewer.reset(); else viewer?.reset(); };
  wireframe.onclick = () => { const value = wireframe.getAttribute('aria-pressed') !== 'true'; wireframe.setAttribute('aria-pressed', value); viewer?.wireframe(value); };
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', resume);
  if (import.meta.hot) import.meta.hot.dispose(() => {
    stop(); window.removeEventListener('pagehide', stop); window.removeEventListener('pageshow', resume);
  });
  return { select(value) { asset = value; void render(); }, dispose: stop };
}
