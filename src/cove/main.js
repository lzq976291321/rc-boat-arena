import { createSunnyCoveViewer, CAMERA_MODES, MOODS } from '../scene-assets/sunny-cove/index.js';
import { createViewingPage } from '../shared/viewing/page.js';

const page = createViewingPage({
  createViewer: createSunnyCoveViewer, moods: MOODS, cameraModes: CAMERA_MODES,
  debugKey: '__COVE__', capturePrefix: 'sunny-cove',
  manifestPath: 'cove/asset-manifest.json', loadingText: '正在准备浅湾与船坞…',
});
if (import.meta.hot) import.meta.hot.dispose(() => page.dispose());
