// The library owns this canvas; the scene asset owns its rendering resources.
export async function createScenePreview({ container, asset, signal }) {
  const loaders = {
    'sunny-cove': () => import('../scene-assets/sunny-cove/index.js').then(module => module.createSunnyCoveViewer),
  };
  if (!Object.hasOwn(loaders, asset.sceneAsset)) throw new Error('Unknown scene asset');
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', `${asset.name}，自动巡游观赏`);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let controller, destroyed = false, visible = false;
  const syncVisibility = () => controller?.setPaused(reducedMotion || destroyed || !visible || document.hidden);
  const intersection = new IntersectionObserver(entries => {
    visible = entries[0]?.isIntersecting ?? false;
    syncVisibility();
  });
  const resize = new ResizeObserver(() => controller?.resize());
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    intersection.disconnect(); resize.disconnect();
    document.removeEventListener('visibilitychange', syncVisibility);
    signal?.removeEventListener('abort', destroy);
    controller?.dispose(); controller = undefined;
    canvas.remove();
  }
  signal?.addEventListener('abort', destroy, { once: true });
  try {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const createViewer = await loaders[asset.sceneAsset]();
    if (destroyed || signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    container.append(canvas);
    intersection.observe(container); resize.observe(container);
    document.addEventListener('visibilitychange', syncVisibility);
    const created = await createViewer({
      canvas,
      assetBaseUrl: new URL('../assets/', document.baseURI).href,
      quality: 'low', signal,
      reducedMotion,
    });
    if (destroyed || signal?.aborted) {
      created.dispose();
      throw new DOMException('Aborted', 'AbortError');
    }
    controller = created;
    syncVisibility(); controller.resize();
    return { reset: () => controller?.reset(), destroy, snapshot: () => controller?.snapshot() };
  } catch (error) {
    destroy();
    throw error;
  }
}
