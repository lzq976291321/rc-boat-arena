import { createBinaryCache } from './binary-cache.js';
import { disposeObjects } from '../rendering/resources.js';

export const modelBytes = createBinaryCache();
let loaderPromise;
function getLoader() {
  return loaderPromise ??= import('three/addons/loaders/GLTFLoader.js')
    .then(({ GLTFLoader }) => new GLTFLoader())
    .catch(error => { loaderPromise = undefined; throw error; });
}
// Every consumer owns its parsed scene. Source bytes and parser code are reused;
// transforms/material edits and disposal in one viewer cannot corrupt another.
export async function loadGLTF(url, { signal, onProgress } = {}) {
  const absolute = new URL(url, document.baseURI).href;
  const [loader, data] = await Promise.all([getLoader(), modelBytes.read(absolute, { signal, onProgress })]);
  signal?.throwIfAborted();
  let gltf;
  try { gltf = await loader.parseAsync(data, new URL('.', absolute).href); }
  catch (error) { modelBytes.clear(absolute); throw error; }
  if (signal?.aborted) { disposeObjects(gltf.scenes); signal.throwIfAborted(); }
  return gltf;
}
