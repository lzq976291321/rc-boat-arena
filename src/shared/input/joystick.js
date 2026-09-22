import './joystick.css';

// Shared touch input: right is positive steering, up is positive throttle.
// Each scene owns the mapping to its physics and whether driving is enabled.
export function createJoystick(host, { onChange, onAvailabilityChange } = {}) {
  const view = host.ownerDocument.defaultView;
  const doc = host.ownerDocument;
  const coarsePointer = view.matchMedia('(any-pointer: coarse)');
  const compactViewport = view.matchMedia('(max-width: 699px)');
  const listeners = [];
  let enabled = false;
  let available = false;
  let pointerId = null;
  let bounds = null;
  let destroyed = false;

  host.classList.add('driving-joystick');
  host.innerHTML = `
    <div class="joystick-pad" role="group" tabindex="0" aria-label="驾驶摇杆" aria-describedby="${host.id}-hint">
      <span class="joystick-direction joystick-forward" aria-hidden="true">↑</span>
      <span class="joystick-direction joystick-reverse" aria-hidden="true">↓</span>
      <span class="joystick-direction joystick-left" aria-hidden="true">‹</span>
      <span class="joystick-direction joystick-right" aria-hidden="true">›</span>
      <span class="joystick-thumb" aria-hidden="true"></span>
    </div>
    <span class="joystick-hint" id="${host.id}-hint">拖动驾驶 · 松手收油</span>`;
  const pad = host.querySelector('.joystick-pad');
  const thumb = host.querySelector('.joystick-thumb');

  function listen(target, name, fn, options) {
    target.addEventListener(name, fn, options);
    listeners.push(() => target.removeEventListener(name, fn, options));
  }

  function reset() {
    const previousPointer = pointerId;
    pointerId = null;
    bounds = null;
    pad.classList.remove('is-active');
    thumb.style.transform = 'translate(-50%, -50%)';
    if (previousPointer !== null && pad.hasPointerCapture(previousPointer)) {
      pad.releasePointerCapture(previousPointer);
    }
    onChange?.(null);
  }

  function updateVisibility() {
    host.hidden = !enabled || !available;
    if (host.hidden) reset();
  }

  function updateAvailability() {
    const next = view.navigator.maxTouchPoints > 0 || coarsePointer.matches || compactViewport.matches;
    if (next !== available) {
      available = next;
      onAvailabilityChange?.(available);
    }
    updateVisibility();
  }

  function move(event) {
    const dx = event.clientX - bounds.x;
    const dy = event.clientY - bounds.y;
    const distance = Math.hypot(dx, dy);
    const travel = Math.min(distance, bounds.radius);
    const x = distance ? dx / distance : 0;
    const y = distance ? dy / distance : 0;
    // A small dead zone prevents thumb jitter; the remaining travel is analog.
    const strength = Math.max(0, (travel / bounds.radius - 0.1) / 0.9);
    thumb.style.transform = `translate(calc(-50% + ${x * travel}px), calc(-50% + ${y * travel}px))`;
    onChange?.({ steer: x * strength, throttle: -y * strength, boost: false });
  }

  listen(pad, 'pointerdown', (event) => {
    if (destroyed || !enabled || !available || pointerId !== null || event.button !== 0) return;
    event.preventDefault();
    const rect = pad.getBoundingClientRect();
    const radius = (rect.width - thumb.offsetWidth) / 2;
    if (radius <= 0) return;
    pointerId = event.pointerId;
    bounds = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, radius };
    try { pad.setPointerCapture(pointerId); } catch { reset(); return; }
    pad.classList.add('is-active');
    move(event);
  }, { passive: false });
  listen(pad, 'pointermove', (event) => {
    if (event.pointerId !== pointerId) return;
    event.preventDefault();
    move(event);
  }, { passive: false });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    listen(pad, name, (event) => {
      if (event.pointerId === pointerId) reset();
    });
  }
  listen(pad, 'contextmenu', (event) => event.preventDefault());
  listen(view, 'blur', reset);
  listen(view, 'pagehide', reset);
  listen(doc, 'visibilitychange', () => { if (doc.hidden) reset(); });
  listen(view, 'resize', () => { reset(); updateAvailability(); });
  listen(coarsePointer, 'change', updateAvailability);
  listen(compactViewport, 'change', updateAvailability);
  updateAvailability();

  return {
    get available() { return available; },
    setEnabled(value) {
      if (destroyed) return;
      enabled = Boolean(value);
      updateVisibility();
    },
    reset,
    destroy() {
      reset();
      destroyed = true;
      for (const remove of listeners) remove();
      host.hidden = true;
      host.replaceChildren();
    },
  };
}
