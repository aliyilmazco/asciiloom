import './style.css';
import { createBrowserApp } from './browser/app.js';
import { createDemoImage, loadImageFile, prepareImageData } from './browser/image.js';

createBrowserApp({
  document,
  window,
  navigator,
  urlApi: URL,
  createWorker: () =>
    new Worker(new URL('./browser/ascii.worker.ts', import.meta.url), { type: 'module' }),
  createInitialImage: createDemoImage,
  loadImage: loadImageFile,
  prepareImage: prepareImageData,
});
