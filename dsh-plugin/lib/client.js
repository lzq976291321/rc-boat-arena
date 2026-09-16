// RC Boat Arena · DSH 浏览器半（客户端插件 bundle）
// 模块系统要求的 lazy-CJS factory bundle：脚本执行时只注册 factory，
// 物化时才 require 静态模块表里的 react（只使用已声明的 external）。
window.__ModuleLoader__.load({
  id: 'dsh-rc-boat-arena',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    const React = require('react');

    const PANEL_ID = 'dsh-rc-boat-arena-panel';
    const BTN_ID = 'dsh-rc-boat-arena-button';
    const DEFAULT_PATH = '/rc-boat-arena/';
    const URL_KEY = 'dsh-rc-boat-arena.url';
    const listeners = new Set();
    let open = false;

    function arenaUrl() {
      try {
        const saved = window.localStorage.getItem(URL_KEY);
        if (saved) return saved;
      } catch (e) { /* 隐私模式：忽略 */ }
      try { return new URL(DEFAULT_PATH, window.location.href).href; } catch (e) { return DEFAULT_PATH; }
    }

    const CSS = [
      '#dsh-rc-boat-arena-button{pointer-events:auto;cursor:pointer;font:600 12px/1 "PingFang SC",system-ui,sans-serif;' +
        'color:var(--dsw-alias-label-secondary,#cfe3f2);background:transparent;border:1px solid var(--dsw-alias-border-l2,rgba(120,210,255,.25));' +
        'border-radius:8px;padding:6px 10px;display:inline-flex;align-items:center;gap:6px;transition:.15s background,.15s color}',
      '#dsh-rc-boat-arena-button:hover{color:var(--dsw-alias-label-primary,#eaf6ff);background:rgba(63,225,255,.12)}',
      '#dsh-rc-boat-arena-button[data-open="true"]{color:#0a2230;background:linear-gradient(180deg,#6fe6ff,#2bb8dd);border-color:#7dfcff}',
    ].join('');

    function panelCss() {
      const P = '#' + PANEL_ID;
      return [
        P + '{position:fixed;right:18px;bottom:18px;width:760px;height:480px;max-width:calc(100vw - 36px);' +
          'max-height:calc(100vh - 36px);z-index:2147483000;display:flex;flex-direction:column;overflow:hidden;' +
          'border-radius:14px;border:1px solid rgba(120,210,255,.35);background:rgba(4,18,28,.92);color:#e8f6ff;' +
          'box-shadow:0 24px 70px rgba(0,0,0,.6);font:13px/1.5 "PingFang SC",system-ui,sans-serif}',
        P + ' .rc-bar{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid rgba(120,210,255,.22);' +
          'background:rgba(6,20,30,.92);cursor:move;user-select:none}',
        P + ' .rc-title{flex:1;font-weight:700;letter-spacing:.04em}',
        P + ' .rc-title small{font-weight:400;color:#8fb6cc;margin-left:8px;font-size:11px}',
        P + ' button.rc-btn{cursor:pointer;font:600 12px/1 inherit;color:#e8f6ff;background:rgba(20,58,80,.7);' +
          'border:1px solid rgba(120,210,255,.28);border-radius:7px;padding:6px 9px}',
        P + ' button.rc-btn:hover{background:rgba(32,96,128,.85)}',
        P + ' .rc-frame{flex:1;border:0;width:100%;background:#04121c}',
        P + ' .rc-foot{display:flex;align-items:center;gap:10px;padding:6px 10px;border-top:1px solid rgba(120,210,255,.22);' +
          'font-size:11px;color:#8fb6cc}',
        P + ' .rc-foot a{color:#7dfcff;text-decoration:none}',
        P + ' .rc-foot input{flex:1;min-width:80px;background:rgba(0,0,0,.35);border:1px solid rgba(120,210,255,.22);' +
          'border-radius:6px;color:#cfe9f6;font:11px/1.4 ui-monospace,monospace;padding:4px 6px}',
      ].join('');
    }

    function injectStyle() {
      if (document.getElementById(PANEL_ID + '-style')) return;
      const tag = document.createElement('style');
      tag.id = PANEL_ID + '-style';
      tag.textContent = CSS + panelCss();
      document.head.appendChild(tag);
    }

    function buildPanel() {
      const el = document.createElement('div');
      el.id = PANEL_ID;
      el.setAttribute('data-role', 'rc-boat-arena-panel');
      el.innerHTML = [
        '<div class="rc-bar">',
        '  <span class="rc-title">🚤 RC Boat Arena<small>独立面板 · DSH 客户端插件</small></span>',
        '  <button class="rc-btn" data-act="open-tab">新标签页</button>',
        '  <button class="rc-btn" data-act="reload">重新加载</button>',
        '  <button class="rc-btn" data-act="close">关闭 ✕</button>',
        '</div>',
        '<iframe class="rc-frame" data-role="arena-frame" title="RC Boat Arena" allow="fullscreen; gamepad"></iframe>',
        '<div class="rc-foot">',
        '  <span>点击画面后用 WASD / 方向键驾驶；C 切镜头，T 调参，P 回放，R 重开</span>',
        '  <input data-role="url" spellcheck="false" />',
        '</div>',
      ].join('');
      document.body.appendChild(el);

      const frame = el.querySelector('[data-role="arena-frame"]');
      const input = el.querySelector('[data-role="url"]');
      input.value = arenaUrl();
      frame.src = arenaUrl();

      el.querySelector('[data-act="close"]').addEventListener('click', () => setOpen(false));
      el.querySelector('[data-act="reload"]').addEventListener('click', () => {
        frame.src = 'about:blank';
        window.requestAnimationFrame(() => { frame.src = arenaUrl(); });
      });
      el.querySelector('[data-act="open-tab"]').addEventListener('click', () => window.open(arenaUrl(), '_blank', 'noopener'));
      input.addEventListener('change', () => {
        try { window.localStorage.setItem(URL_KEY, input.value); } catch (e) { /* 忽略 */ }
        frame.src = input.value;
      });

      const bar = el.querySelector('.rc-bar');
      let drag = null;
      bar.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return;
        const r = el.getBoundingClientRect();
        drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
        el.style.right = 'auto'; el.style.bottom = 'auto';
        el.style.left = r.left + 'px'; el.style.top = r.top + 'px';
        try { bar.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      });
      bar.addEventListener('pointermove', (e) => {
        if (!drag) return;
        el.style.left = Math.max(0, Math.min(window.innerWidth - 120, e.clientX - drag.dx)) + 'px';
        el.style.top = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - drag.dy)) + 'px';
      });
      bar.addEventListener('pointerup', (e) => {
        drag = null;
        try { bar.releasePointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      });
      return el;
    }

    function panel() {
      injectStyle();
      return document.getElementById(PANEL_ID) || buildPanel();
    }

    function setOpen(next) {
      open = !!next;
      const el = panel();
      el.style.display = open ? 'flex' : 'none';
      const btn = document.getElementById(BTN_ID);
      if (btn) btn.setAttribute('data-open', String(open));
      listeners.forEach((fn) => { try { fn(open); } catch (e) { /* 忽略订阅者异常 */ } });
    }
    function toggle() { setOpen(!open); }

    /** 会话头部的入口按钮。 */
    function ArenaEntry() {
      const [isOpen, setLocalOpen] = React.useState(open);
      React.useEffect(() => {
        const fn = (v) => setLocalOpen(v);
        listeners.add(fn);
        return () => { listeners.delete(fn); };
      }, []);
      return React.createElement('button', {
        id: BTN_ID,
        type: 'button',
        title: '打开 RC Boat Arena 竞速场面板（独立面板，不影响聊天）',
        'data-open': String(isOpen),
        onClick: () => toggle(),
      }, '🚤 竞速场');
    }

    const inject = ['slots'];
    function apply(ctx) {
      if (ctx.slots && typeof ctx.slots.inject === 'function') {
        ctx.slots.inject('conversation.session.header.actions', () =>
          ctx.slots.register({ name: 'conversation.session.header.actions', id: 'rc-boat-arena', order: 60 }, ArenaEntry));
      } else if (ctx.slots && typeof ctx.slots.register === 'function') {
        ctx.slots.register({ name: 'conversation.session.header.actions', id: 'rc-boat-arena', order: 60 }, ArenaEntry);
      }
      if (typeof window !== 'undefined') {
        window.__DSH_ARENA__ = { open: () => setOpen(true), close: () => setOpen(false), toggle, isOpen: () => open, url: arenaUrl };
      }
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
