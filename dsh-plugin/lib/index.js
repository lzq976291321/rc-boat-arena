// RC Boat Arena · DSH host 半
// 职责：把已构建的竞速场（dist/）挂到 DSH 自己的 HTTP 服务上（/rc-boat-arena/），
// 这样浏览器半的面板用同源 iframe 就能直接玩，不需要第二个服务器。
// 不修改任何官方依赖源码，不注册 fallback（不影响正常聊天页面）。
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const name = 'rc-boat-arena';
/** 需要 DSH 的 Web 服务；没有它时插件保持等待，不会报错。 */
export const inject = ['webServer'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.md': 'text/plain; charset=utf-8',
};

/** 由本文件位置推导 dist 目录，允许 config.root 覆盖。 */
function resolveRoot(config) {
  if (config && typeof config.root === 'string' && config.root.length > 0) return resolve(config.root);
  return resolve(fileURLToPath(new URL('../../dist/', import.meta.url)));
}

/**
 * 注册 /rc-boat-arena 前缀路由：静态文件 + SPA 回退到 index.html。
 * @param ctx - Cordis 上下文（提供 webServer 服务）
 * @param config - 可选 { root, path }
 */
export function apply(ctx, config = {}) {
  const root = resolveRoot(config);
  const prefix = typeof config.path === 'string' && config.path ? config.path : '/rc-boat-arena';

  const send = (res, code, body, type = 'text/plain; charset=utf-8') => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-cache' });
    res.end(body);
  };

  const handler = async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      let rel = decodeURIComponent(url.pathname).slice(prefix.length);
      if (rel === '') { res.writeHead(308, { location: url.pathname + '/' + url.search }); res.end(); return; }
      if (rel === '/') rel = '/index.html';
      const target = normalize(join(root, rel));
      if (!target.startsWith(root + sep) && target !== root) return send(res, 403, 'forbidden');
      let file = target;
      try {
        const st = await stat(file);
        if (st.isDirectory()) {
          if (!url.pathname.endsWith('/')) { res.writeHead(308, { location: url.pathname + '/' + url.search }); res.end(); return; }
          file = join(file, 'index.html');
        }
      } catch {
        file = join(root, 'index.html');   // SPA 回退
      }
      try {
        const body = await readFile(file);
        res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
        res.end(body);
      } catch {
        send(res, 404, 'rc-boat-arena: 还没有构建产物，请先在 rc-boat-arena 目录运行 pnpm run build');
      }
    } catch (error) {
      send(res, 500, 'rc-boat-arena: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler }), 'rc-boat-arena: static route');
  ctx.logger?.info?.(`[rc-boat-arena] 面板静态资源: ${prefix}/ ← ${root}`);
}
