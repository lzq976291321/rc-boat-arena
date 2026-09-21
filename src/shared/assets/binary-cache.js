// Cache immutable source bytes, never mutable scene instances or GPU resources.
export function createBinaryCache({ maxBytes = 16 * 1024 * 1024, maxEntries = 8, fetcher = (...args) => fetch(...args) } = {}) {
  const cached = new Map(), pending = new Map();
  let bytes = 0;
  function remember(url, buffer) {
    if (buffer.byteLength > maxBytes) return;
    cached.set(url, buffer); bytes += buffer.byteLength;
    while (bytes > maxBytes || cached.size > maxEntries) {
      const oldest = cached.keys().next().value;
      bytes -= cached.get(oldest).byteLength; cached.delete(oldest);
    }
  }
  function read(url, { signal, onProgress } = {}) {
    if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    if (cached.has(url)) {
      const value = cached.get(url); cached.delete(url); cached.set(url, value);
      onProgress?.({ loaded: value.byteLength, total: value.byteLength });
      return Promise.resolve(value);
    }
    let request = pending.get(url);
    if (!request) {
      request = { controller: new AbortController(), consumers: new Set() };
      pending.set(url, request);
      request.promise = (async () => {
        const response = await fetcher(url, { signal: request.controller.signal });
        if (!response.ok) throw new Error(`Model request failed: HTTP ${response.status}`);
        const total = Number(response.headers.get('content-length')) || 0;
        const chunks = []; let loaded = 0;
        if (response.body) {
          const reader = response.body.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read(); if (done) break;
              chunks.push(value); loaded += value.byteLength;
              for (const consumer of request.consumers) consumer.onProgress?.({ loaded, total });
            }
          } finally { reader.releaseLock(); }
        } else { const value = new Uint8Array(await response.arrayBuffer()); chunks.push(value); loaded = value.byteLength; }
        request.controller.signal.throwIfAborted();
        const data = new Uint8Array(loaded); let offset = 0;
        for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
        remember(url, data.buffer);
        return data.buffer;
      })().finally(() => { if (pending.get(url) === request) pending.delete(url); });
    }
    return new Promise((resolve, reject) => {
      const consumer = { onProgress }; let settled = false;
      const finish = (callback, value) => {
        if (settled) return; settled = true;
        signal?.removeEventListener('abort', cancel); request.consumers.delete(consumer); callback(value);
      };
      const cancel = () => {
        finish(reject, new DOMException('Aborted', 'AbortError'));
        if (!request.consumers.size) {
          request.controller.abort();
          if (pending.get(url) === request) pending.delete(url);
        }
      };
      request.consumers.add(consumer);
      signal?.addEventListener('abort', cancel, { once: true });
      request.promise.then(value => finish(resolve, value), error => finish(reject, error));
    });
  }
  return { read, clear(url) { if (url === undefined) { cached.clear(); bytes = 0; } else if (cached.has(url)) { bytes -= cached.get(url).byteLength; cached.delete(url); } }, info: () => ({ bytes, entries: cached.size, pending: pending.size, maxBytes, maxEntries }) };
}
