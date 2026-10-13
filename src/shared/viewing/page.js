// Shared viewing-page behavior. Scene rendering stays behind createViewer.
export function createViewingPage({ createViewer, moods, cameraModes, debugKey,
  capturePrefix, manifestPath, loadingText = '正在准备观赏场景…',
  boats = [], defaultBoatId, preferenceKey }) {
  const lifetime = new AbortController();
  const listeners = [];
  function listen(target, type, handler) {
    target.addEventListener(type, handler);
    listeners.push(() => target.removeEventListener(type, handler));
  }
  const $ = id => document.getElementById(id);
  const errors = [];
  const assetBaseUrl = new URL('../assets/', document.baseURI).href;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const boatById = new Map(boats.map(boat => [boat.id, boat]));
  const fallbackBoatId = boatById.has(defaultBoatId) ? defaultBoatId : boats[0]?.id;
  const phases = { departing: '正在出港', cruising: '湾中巡游', approaching: '缓缓归港', docked: '泊岸小憩' };
  let preferences = {};
  if (preferenceKey) {
    try {
      const stored = JSON.parse(localStorage.getItem(preferenceKey));
      if (stored && typeof stored === 'object') {
        if (boatById.has(stored.boatId)) preferences.boatId = stored.boatId;
        if (Object.hasOwn(moods, stored.mood)) preferences.mood = stored.mood;
        if (cameraModes.some(mode => mode.id === stored.cameraMode)) preferences.cameraMode = stored.cameraMode;
      }
    } catch { /* Browser storage may be unavailable; the scene still works. */ }
  }
  function savePreferences(next) {
    if (!preferenceKey) return;
    preferences = { ...preferences, ...next };
    try { localStorage.setItem(preferenceKey, JSON.stringify(preferences)); }
    catch { /* Keep this session's choices even when storage is full or blocked. */ }
  }
  let viewer, request, generation = 0, toastTimer, previousFocus, dialogWasPaused = false;
  let immersive = false, lastSnapshot, boatRequest = 0, failedBoatId;
  const debug = window[debugKey] = {
    errors, assets: [],
    get ready() { return !!viewer?.state.ready; },
    get state() { return viewer?.state || { ready: false }; },
    get boat() { return viewer?.boat; },
    get renderer() { return viewer?.renderer; },
    get scene() { return viewer?.scene; },
    get camera() { return viewer?.camera; },
    snapshot: () => ({ ...(viewer?.snapshot() || { ready: false }), errors: [...errors], immersive }),
  };
  listen(window, 'error', event => errors.push(event.message));
  listen(window, 'unhandledrejection', event => errors.push(String(event.reason)));

  function toast(message) {
    clearTimeout(toastTimer);
    $('toast').textContent = message; $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2800);
  }
  function sync(snapshot) {
    lastSnapshot = snapshot;
    const preset = moods[snapshot.mood];
    if (!preset) return;
    $('clock').textContent = preset.time;
    $('weather').textContent = preset.weather;
    $('mood-label').textContent = preset.label;
    $('pause').setAttribute('aria-pressed', String(snapshot.paused));
    $('pause').setAttribute('aria-label', snapshot.paused ? '继续观赏' : '暂停观赏');
    $('pause-icon').textContent = snapshot.paused ? '▷' : 'Ⅱ';
    $('pause-label').textContent = snapshot.paused ? '继续' : '暂停';
    $('sound').setAttribute('aria-pressed', String(snapshot.sound));
    $('sound-label').textContent = snapshot.sound ? '水声开启' : '开启水声';
    $('camera').value = snapshot.camera.mode;
    $('shot-name').textContent = cameraModes.find(item => item.id === snapshot.camera.activeMode)?.label || '贴水跟随';
    document.querySelectorAll('[data-mood]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mood === snapshot.mood)));
    syncBoat(snapshot);
  }
  function syncBoat(snapshot) {
    if (!boats.length) return;
    const selected = boatById.get(snapshot.boatId);
    if (selected && $('boat-name')) $('boat-name').textContent = selected.label;
    if ($('boat-phase')) $('boat-phase').textContent = snapshot.paused ? '已暂停' : phases[snapshot.boat?.phase] || '准备出航';
    const change = snapshot.boatChange || { status: 'idle' };
    for (const button of document.querySelectorAll('[data-boat]')) {
      const pending = change.status === 'loading' && change.requestedId === button.dataset.boat;
      const active = button.dataset.boat === snapshot.boatId;
      button.setAttribute('aria-pressed', String(active));
      button.dataset.pending = String(pending);
      button.querySelector('.boat-choice-mark').textContent = pending ? '' : active ? '✓' : '';
      button.setAttribute('aria-label', `${boatById.get(button.dataset.boat).label}${pending ? '，正在载入' : active ? '，当前船艇' : '，切换到此船'}`);
    }
    if (!$('boat-feedback')) return;
    const failed = change.status === 'error';
    failedBoatId = failed ? change.requestedId : undefined;
    $('boat-feedback').hidden = change.status === 'idle';
    $('boat-retry').hidden = !failed;
    const message = failed
      ? '换船未成功，已保留当前船。'
      : `正在准备${boatById.get(change.requestedId)?.label || '船艇'}…`;
    if ($('boat-feedback-text').textContent !== message) $('boat-feedback-text').textContent = message;
  }
  async function selectBoat(id) {
    if (!viewer || !boatById.has(id)) return;
    const currentViewer = viewer, currentGeneration = generation, currentRequest = ++boatRequest;
    try {
      const pending = currentViewer.setBoat(id);
      sync(currentViewer.snapshot());
      const changed = await pending;
      if (currentGeneration !== generation || currentRequest !== boatRequest) return;
      if (changed) savePreferences({ boatId: currentViewer.snapshot().boatId });
      sync(currentViewer.snapshot());
    } catch {
      if (currentGeneration !== generation || currentRequest !== boatRequest) return;
      sync(currentViewer.snapshot());
    }
  }
  function showError(error) {
    errors.push(String(error));
    $('loading').hidden = false;
    $('load-text').textContent = '场景暂时无法显示';
    $('retry').hidden = false; $('loader').hidden = true;
    document.querySelectorAll('[data-ready]').forEach(button => { button.disabled = true; });
  }
  async function init() {
    const current = ++generation;
    boatRequest++;
    request?.abort(); viewer?.dispose(); viewer = undefined;
    // A disposed WebGL host gives up its context; a retry owns a fresh canvas.
    const oldCanvas = $('world');
    oldCanvas.replaceWith(oldCanvas.cloneNode(false));
    request = new AbortController();
    $('loading').hidden = false; $('loader').hidden = false; $('retry').hidden = true;
    $('load-text').textContent = loadingText;
    if ($('boat-feedback')) $('boat-feedback').hidden = true;
    document.querySelectorAll('[data-ready]').forEach(button => { button.disabled = true; });
    try {
      const instance = await createViewer({
        canvas: $('world'), assetBaseUrl,
        boatId: preferences.boatId ?? fallbackBoatId, mood: preferences.mood,
        cameraMode: preferences.cameraMode ?? 'auto',
        quality: innerWidth < 700 ? 'low' : 'balanced',
        signal: request.signal, reducedMotion,
        onFrame: snapshot => { if (current === generation) sync(snapshot); },
        onError: error => { if (current === generation) showError(error); },
      });
      if (current !== generation) { instance.dispose(); return; }
      viewer = instance;
      if ($('credits-dialog').open) {
        dialogWasPaused = viewer.state.paused;
        viewer.setPaused(true);
      }
      $('loading').hidden = true;
      document.querySelectorAll('[data-ready]').forEach(button => { button.disabled = false; });
      sync(viewer.snapshot());
    } catch (error) {
      if (current === generation && error.name !== 'AbortError') showError(error);
    }
  }
  listen($('retry'), 'click', () => { void init(); });
  listen($('pause'), 'click', () => viewer?.setPaused(!viewer.state.paused));
  $('camera').replaceChildren(...cameraModes.map(({ id, label }) => new Option(label, id)));
  listen($('camera'), 'change', event => {
    if (!viewer) return;
    viewer.setCamera(event.target.value);
    savePreferences({ cameraMode: viewer.snapshot().camera.mode });
  });
  for (const button of document.querySelectorAll('[data-mood]')) {
    listen(button, 'click', () => {
      if (!viewer) return;
      viewer.setMood(button.dataset.mood);
      savePreferences({ mood: viewer.snapshot().mood });
    });
  }
  if ($('boat-picker')) {
    $('boat-picker').replaceChildren(...boats.map(boat => {
      const button = document.createElement('button');
      button.className = 'boat-choice'; button.dataset.boat = boat.id; button.dataset.ready = '';
      button.disabled = true; button.setAttribute('aria-pressed', 'false');
      const text = document.createElement('span'), name = document.createElement('span');
      name.className = 'boat-choice-name'; name.textContent = boat.label; text.append(name);
      if (boat.subtitle) {
        const subtitle = document.createElement('span'); subtitle.className = 'boat-choice-subtitle';
        subtitle.textContent = boat.subtitle; text.append(subtitle);
      }
      const mark = document.createElement('span'); mark.className = 'boat-choice-mark';
      mark.setAttribute('aria-hidden', 'true'); button.append(text, mark);
      listen(button, 'click', () => { void selectBoat(boat.id); });
      return button;
    }));
    if ($('boat-retry')) listen($('boat-retry'), 'click', () => { void selectBoat(failedBoatId); });
  }
  listen($('sound'), 'click', async () => {
    if (!viewer) return;
    try { await viewer.setSound(!viewer.snapshot().sound); }
    catch { toast('声音暂时无法播放，请再试一次'); }
  });
  function setImmersive(value) {
    immersive = value;
    document.body.dataset.immersive = String(value);
    for (const element of document.querySelectorAll('[data-interface]')) element.inert = value;
    $('restore').hidden = !value;
    (value ? $('restore') : $('immerse')).focus({ preventScroll: true });
  }
  listen($('immerse'), 'click', () => setImmersive(true));
  listen($('restore'), 'click', () => setImmersive(false));
  listen($('capture'), 'click', async () => {
    const button = $('capture'); button.disabled = true;
    let objectUrl;
    try {
      const blob = await viewer.capture();
      if (lifetime.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${capturePrefix}-${lastSnapshot.mood}-${Date.now()}.png`;
      document.body.append(link); link.click(); link.remove();
      toast('照片已保存');
    } catch { toast('照片未能保存，请再试一次'); }
    finally {
      button.disabled = !viewer?.state.ready;
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }
  });
  function closeCredits() {
    $('credits-dialog').close();
    viewer?.setPaused(dialogWasPaused);
    previousFocus?.focus?.({ preventScroll: true });
  }
  listen($('credits-open'), 'click', () => {
    previousFocus = document.activeElement;
    dialogWasPaused = viewer?.state.paused ?? true;
    viewer?.setPaused(true); $('credits-dialog').showModal();
  });
  listen($('credits-close'), 'click', closeCredits);
  listen($('credits-dialog'), 'cancel', event => { event.preventDefault(); closeCredits(); });
  listen($('credits-dialog'), 'click', event => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.target === event.currentTarget && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) closeCredits();
  });
  listen(window, 'keydown', event => {
    if (event.metaKey || event.ctrlKey || event.altKey || $('credits-dialog').open) return;
    if (event.key === 'Escape' && immersive) { event.preventDefault(); setImmersive(false); return; }
    if (event.target.closest?.('input,select,textarea,button,a')) return;
    if (!event.repeat && event.code === 'KeyH') setImmersive(!immersive);
    if (!event.repeat && event.code === 'Space' && viewer) { event.preventDefault(); viewer.setPaused(!viewer.state.paused); }
  });
  async function credits() {
    try {
      const response = await fetch(new URL(manifestPath, assetBaseUrl), { signal: lifetime.signal });
      if (!response.ok) throw new Error('Source manifest unavailable');
      const data = await response.json();
      lifetime.signal.throwIfAborted();
      debug.assets = data.assets || data;
      const rows = debug.assets.map(asset => {
        const row = document.createElement('div'); row.className = 'credit-row';
        const name = document.createElement('h3'), by = document.createElement('p'), link = document.createElement('a');
        name.textContent = asset.name || asset.title;
        by.textContent = `${asset.author} · ${asset.license}`;
        link.href = asset.source || asset.sourceUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.textContent = '素材来源 ↗'; row.append(name, by, link); return row;
      });
      $('credits-list').replaceChildren(...rows);
    } catch { if (lifetime.signal.aborted) return; $('credits-list').textContent = '素材清单暂时不可用，请查看下方完整来源记录。'; }
  }
  // Source metadata is useful independently; its network failure must not block the view.
  void credits();
  void init();
  return {
    dispose() {
      generation++; lifetime.abort(); request?.abort(); viewer?.dispose(); clearTimeout(toastTimer);
      for (const remove of listeners) remove();
      document.body.dataset.immersive = 'false';
      for (const element of document.querySelectorAll('[data-interface]')) element.inert = false;
      $('restore').hidden = true;
      if (window[debugKey] === debug) delete window[debugKey];
    },
  };
}
