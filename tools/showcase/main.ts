import {
  CANVAS,
  DEFAULT_STATE,
  DEFAULT_VIEW_CONTROLS,
  SCREENSHOT_LAYOUT,
  type ShowcasePhase,
  type ShowcaseTheme,
  type ShowcaseViewControls,
} from './config';
import {
  composeShowcaseImage,
  downloadShowcaseImage,
  type ShowcaseExportMode,
} from './export';
import { ShowcaseThreeScene } from './three/scene';

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`필수 요소를 찾을 수 없습니다: ${selector}`);
  return element;
}

const body = document.body;
const viewer = requireElement<HTMLElement>('#viewer');
const artboard = requireElement<HTMLElement>('#artboard');
const artboardFrame = requireElement<HTMLElement>('#artboardFrame');
const captureButton = requireElement<HTMLButtonElement>('#captureButton');
const downloadMenu = requireElement<HTMLElement>('#downloadMenu');
const downloadButton = requireElement<HTMLButtonElement>('#downloadButton');
const downloadPopover = requireElement<HTMLElement>('#downloadPopover');
const downloadStatus = requireElement<HTMLElement>('#downloadStatus');
const downloadOptions = Array.from(
  document.querySelectorAll<HTMLButtonElement>('[data-export-mode]')
);
const inspectorToggle = requireElement<HTMLButtonElement>('#inspectorToggle');
const sceneInspector = requireElement<HTMLElement>('#sceneInspector');
const saveSceneControls = requireElement<HTMLButtonElement>('#saveSceneControls');
const resetSceneControls = requireElement<HTMLButtonElement>('#resetSceneControls');
const canvas = requireElement<HTMLCanvasElement>('#showcaseCanvas');
const renderStatus = requireElement<HTMLElement>('#renderStatus');
const appStorePreviewButton = requireElement<HTMLButtonElement>('#appStorePreviewButton');
const appStorePreview = requireElement<HTMLElement>('#appStorePreview');
const appStorePreviewClose = requireElement<HTMLButtonElement>('#appStorePreviewClose');
const appStoreProduct = requireElement<HTMLElement>('.app-store-product');
const appStoreScreenshotRail = requireElement<HTMLElement>('.app-store-screenshot-rail');
const appStoreSearchResults = requireElement<HTMLElement>('.app-store-search-results');
const appStorePreviewModeButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>('[data-store-preview-mode]')
);
const appStorePreviewPages = Array.from(
  document.querySelectorAll<HTMLElement>('[data-store-preview-page]')
);
const appStorePanelCanvases = Array.from(
  document.querySelectorAll<HTMLCanvasElement>('[data-store-panel]')
);
const editorPanelCanvases = Array.from(
  document.querySelectorAll<HTMLCanvasElement>('[data-editor-panel]')
);
document.documentElement.style.setProperty(
  '--editor-panel-gap',
  `${SCREENSHOT_LAYOUT.editorGap}px`
);

let panelCroppingEnabled = true;

let showcase: ShowcaseThreeScene;
try {
  showcase = new ShowcaseThreeScene(canvas, DEFAULT_STATE);
  renderStatus.dataset.state = 'loading';
  renderStatus.textContent = 'IPHONE MODEL LOADING';
  void showcase.ready.then(() => {
    renderStatus.dataset.state = 'ready';
    renderStatus.textContent = 'THREE.JS READY';
    scheduleEditorPanelRefresh();
    if (!appStorePreview.hidden) requestAnimationFrame(refreshAppStoreScreenshots);
  }).catch((error: unknown) => {
    renderStatus.dataset.state = 'error';
    renderStatus.textContent = 'iPhone 3D 모델을 불러오지 못했습니다.';
    console.error(error);
  });
} catch (error) {
  renderStatus.dataset.state = 'error';
  renderStatus.textContent = 'WebGL 장면을 초기화하지 못했습니다.';
  throw error;
}

function selectControl(control: Element, value: string): void {
  control.querySelectorAll<HTMLButtonElement>('button[data-value]').forEach((button) => {
    button.classList.toggle('is-selected', button.dataset.value === value);
  });
}

function contrastColor(hex: string): string {
  const value = hex.replace('#', '');
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 148 ? '#0b0d08' : '#ffffff';
}

document.querySelectorAll<HTMLElement>('[data-control]').forEach((control) => {
  control.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('button[data-value]');
    if (!button?.dataset.value) return;

    const value = button.dataset.value;
    selectControl(control, value);
    if (control.dataset.control === 'phase') {
      body.dataset.phase = value;
      showcase.setState({ phase: value as ShowcasePhase });
      scheduleEditorPanelRefresh();
    }
    if (control.dataset.control === 'theme') {
      body.dataset.theme = value;
      showcase.setState({ theme: value as ShowcaseTheme });
      scheduleEditorPanelRefresh();
    }
    if (control.dataset.control === 'accent') {
      body.style.setProperty('--accent', value);
      body.style.setProperty('--accent-ink', contrastColor(value));
      showcase.setState({ accent: value });
      scheduleEditorPanelRefresh();
    }
    if (control.dataset.control === 'panelCrop') {
      panelCroppingEnabled = value === 'enabled';
      body.dataset.panelCrop = panelCroppingEnabled ? 'enabled' : 'disabled';
      showcase.setPanelCropping(panelCroppingEnabled);
      scheduleEditorPanelRefresh();
      requestAnimationFrame(fitCanvas);
    }
  });
});

type ViewControlKey = keyof ShowcaseViewControls;
const VIEW_CONTROLS_STORAGE_KEY = 'loofit-showcase:view-controls';
const VIEW_CONTROL_KEYS = Object.keys(DEFAULT_VIEW_CONTROLS) as ViewControlKey[];

function formatViewControl(key: ViewControlKey, value: number): string {
  if (key === 'cameraTilt' || key === 'shadowDirection') return `${Math.round(value)}°`;
  if (key === 'cameraAzimuth') return `${value.toFixed(2).replace(/\.00$/, '')}°`;
  if (key === 'lightIntensity') return value.toFixed(2);
  if (key === 'shadowRadius') return value.toFixed(1);
  if (
    key === 'meshDepthScale' ||
    key === 'cornerRadiusScale' ||
    key === 'cameraZoom'
  ) return `${value.toFixed(2)}×`;
  return Math.round(value).toLocaleString('ko-KR');
}

function updateViewOutput(key: ViewControlKey, value: number): void {
  const output = document.querySelector<HTMLOutputElement>(`[data-view-output="${key}"]`);
  if (output) output.value = formatViewControl(key, value);
}

function viewControlInput(key: ViewControlKey): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(`[data-view-control="${key}"]`);
}

function boundedViewControlValue(key: ViewControlKey, value: number): number {
  const input = viewControlInput(key);
  if (!input) return value;
  const minimum = Number(input.min);
  const maximum = Number(input.max);
  return Math.min(maximum, Math.max(minimum, value));
}

function readViewControls(): ShowcaseViewControls {
  const values = { ...DEFAULT_VIEW_CONTROLS };
  VIEW_CONTROL_KEYS.forEach((key) => {
    const input = viewControlInput(key);
    if (input) values[key] = Number(input.value);
  });
  return values;
}

function syncViewControlInputs(values: ShowcaseViewControls): void {
  VIEW_CONTROL_KEYS.forEach((key) => {
    const input = viewControlInput(key);
    if (!input) return;
    input.value = String(values[key]);
    updateViewOutput(key, values[key]);
  });
}

function loadStoredViewControls(): ShowcaseViewControls | null {
  try {
    const stored = localStorage.getItem(VIEW_CONTROLS_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    const values = { ...DEFAULT_VIEW_CONTROLS };
    VIEW_CONTROL_KEYS.forEach((key) => {
      const value = parsed[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        values[key] = boundedViewControlValue(key, value);
      }
    });
    return values;
  } catch {
    return null;
  }
}

let pendingViewControls: Partial<ShowcaseViewControls> = {};
let viewControlFrame = 0;

function queueViewControl(key: ViewControlKey, value: number): void {
  pendingViewControls[key] = value;
  updateViewOutput(key, value);
  if (viewControlFrame) return;
  viewControlFrame = requestAnimationFrame(() => {
    showcase.setViewControls(pendingViewControls);
    pendingViewControls = {};
    viewControlFrame = 0;
    scheduleEditorPanelRefresh();
  });
}

function applyViewControls(values: ShowcaseViewControls): void {
  if (viewControlFrame) cancelAnimationFrame(viewControlFrame);
  viewControlFrame = 0;
  pendingViewControls = {};
  syncViewControlInputs(values);
  showcase.setViewControls({ ...values });
  scheduleEditorPanelRefresh();
}

document.querySelectorAll<HTMLInputElement>('[data-view-control]').forEach((input) => {
  input.addEventListener('input', () => {
    const key = input.dataset.viewControl as ViewControlKey | undefined;
    if (!key) return;
    queueViewControl(key, Number(input.value));
  });
});

inspectorToggle.addEventListener('click', () => {
  const open = inspectorToggle.getAttribute('aria-expanded') !== 'true';
  inspectorToggle.setAttribute('aria-expanded', String(open));
  sceneInspector.hidden = !open;
});

let saveFeedbackTimer = 0;

saveSceneControls.addEventListener('click', () => {
  try {
    localStorage.setItem(VIEW_CONTROLS_STORAGE_KEY, JSON.stringify(readViewControls()));
    saveSceneControls.textContent = '저장됨';
    saveSceneControls.dataset.state = 'saved';
    if (saveFeedbackTimer) window.clearTimeout(saveFeedbackTimer);
    saveFeedbackTimer = window.setTimeout(() => {
      saveSceneControls.textContent = '저장';
      delete saveSceneControls.dataset.state;
      saveFeedbackTimer = 0;
    }, 1400);
  } catch {
    saveSceneControls.textContent = '저장 실패';
  }
});

resetSceneControls.addEventListener('click', () => {
  try {
    localStorage.removeItem(VIEW_CONTROLS_STORAGE_KEY);
  } catch {
    // The code defaults can still be applied when storage is unavailable.
  }
  applyViewControls({ ...DEFAULT_VIEW_CONTROLS });
});

function editorArtboardWidth(capturing: boolean): number {
  if (capturing || !panelCroppingEnabled) return CANVAS.width;
  return CANVAS.width + SCREENSHOT_LAYOUT.editorGap * (SCREENSHOT_LAYOUT.count - 1);
}

function fitCanvas(): void {
  const capturing = body.classList.contains('is-capturing');
  const padding = capturing ? 0 : 24;
  const width = Math.max(0, viewer.clientWidth - padding * 2);
  const height = Math.max(0, viewer.clientHeight - padding * 2);
  const artboardWidth = editorArtboardWidth(capturing);
  const scale = Math.min(width / artboardWidth, height / CANVAS.height, 1);
  artboard.style.width = `${artboardWidth}px`;
  artboardFrame.style.width = `${artboardWidth * scale}px`;
  artboardFrame.style.height = `${CANVAS.height * scale}px`;
  artboard.style.transform = `scale(${scale})`;
}

function setCaptureMode(active: boolean): void {
  body.classList.toggle('is-capturing', active);
  requestAnimationFrame(() => {
    fitCanvas();
    if (!active) scheduleEditorPanelRefresh();
  });
}

function setDownloadMenu(open: boolean): void {
  downloadButton.setAttribute('aria-expanded', String(open));
  downloadPopover.hidden = !open;
}

function setDownloadBusy(busy: boolean, message: string): void {
  downloadMenu.setAttribute('aria-busy', String(busy));
  downloadOptions.forEach((button) => {
    button.disabled = busy;
  });
  downloadStatus.textContent = message;
}

async function exportImage(mode: ShowcaseExportMode): Promise<void> {
  setDownloadBusy(true, '고해상도 이미지 만드는 중');
  try {
    await Promise.all([showcase.ready, document.fonts.ready]);
    showcase.render();
    const styles = getComputedStyle(body);
    const output = composeShowcaseImage({
      source: canvas,
      artboard,
      panelCroppingEnabled,
      backgroundStart: styles.getPropertyValue('--canvas-a').trim(),
      backgroundEnd: styles.getPropertyValue('--canvas-b').trim(),
    });
    await downloadShowcaseImage(mode, output);
    setDownloadBusy(false, mode === 'combined' ? '한 장 PNG 저장됨' : '3장 PNG 묶음 저장됨');
    setDownloadMenu(false);
  } catch (error) {
    console.error(error);
    setDownloadBusy(false, '이미지를 저장하지 못했습니다');
  }
}

function panelIndexForCanvas(target: HTMLCanvasElement): number {
  return Number(target.dataset.storePanel ?? target.dataset.editorPanel);
}

function paintPanelCanvases(targets: readonly HTMLCanvasElement[]): void {
  const styles = getComputedStyle(body);
  const backgroundStart = styles.getPropertyValue('--canvas-a').trim();
  const backgroundEnd = styles.getPropertyValue('--canvas-b').trim();
  const panelWidth = SCREENSHOT_LAYOUT.panelWidth;

  targets.forEach((target) => {
    const context = target.getContext('2d');
    const panel = panelIndexForCanvas(target);
    if (
      !context ||
      !Number.isInteger(panel) ||
      panel < 0 ||
      panel >= SCREENSHOT_LAYOUT.count
    ) return;
    const outputSourceX = panel * panelWidth;
    const sourceFrameWidth = panelCroppingEnabled
      ? SCREENSHOT_LAYOUT.virtualWidth
      : CANVAS.width;
    const sourceFrameX = panelCroppingEnabled
      ? SCREENSHOT_LAYOUT.sourceOffsets[panel]!
      : outputSourceX;
    const targetScale = target.width / panelWidth;
    const gradient = context.createLinearGradient(
      -sourceFrameX * targetScale,
      0,
      (sourceFrameWidth - sourceFrameX) * targetScale,
      target.height
    );
    gradient.addColorStop(0, backgroundStart);
    gradient.addColorStop(1, backgroundEnd);
    context.fillStyle = gradient;
    context.fillRect(0, 0, target.width, target.height);
    context.drawImage(
      canvas,
      outputSourceX,
      0,
      panelWidth,
      CANVAS.height,
      0,
      0,
      target.width,
      target.height
    );
  });
}

function refreshAppStoreScreenshots(): void {
  showcase.render();
  paintPanelCanvases(appStorePanelCanvases);
}

let editorPanelFrame = 0;

function scheduleEditorPanelRefresh(): void {
  if (!panelCroppingEnabled || body.classList.contains('is-capturing')) return;
  if (editorPanelFrame) return;
  editorPanelFrame = requestAnimationFrame(() => {
    editorPanelFrame = 0;
    paintPanelCanvases(editorPanelCanvases);
  });
}

type AppStorePreviewPage = 'product' | 'list';

function setAppStorePreviewPage(page: AppStorePreviewPage): void {
  appStorePreviewModeButtons.forEach((button) => {
    const selected = button.dataset.storePreviewMode === page;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-selected', String(selected));
  });
  appStorePreviewPages.forEach((previewPage) => {
    previewPage.hidden = previewPage.dataset.storePreviewPage !== page;
  });
  appStoreProduct.scrollTop = 0;
  appStoreScreenshotRail.scrollLeft = 0;
  appStoreSearchResults.scrollTop = 0;
  if (!appStorePreview.hidden) requestAnimationFrame(refreshAppStoreScreenshots);
}

function setAppStorePreviewMode(active: boolean): void {
  appStorePreview.hidden = !active;
  body.classList.toggle('is-store-previewing', active);
  if (!active) {
    appStorePreviewButton.focus();
    return;
  }

  setAppStorePreviewPage('product');
  requestAnimationFrame(() => {
    refreshAppStoreScreenshots();
    appStorePreviewClose.focus();
  });
}

captureButton.addEventListener('click', () => setCaptureMode(true));
downloadButton.addEventListener('click', () => {
  setDownloadMenu(Boolean(downloadPopover.hidden));
});
downloadOptions.forEach((button) => {
  button.addEventListener('click', () => {
    const mode = button.dataset.exportMode;
    if (mode === 'combined' || mode === 'split') void exportImage(mode);
  });
});
document.addEventListener('click', (event) => {
  if (event.target instanceof Node && !downloadMenu.contains(event.target)) {
    setDownloadMenu(false);
  }
});
appStorePreviewButton.addEventListener('click', () => setAppStorePreviewMode(true));
appStorePreviewModeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const page = button.dataset.storePreviewMode;
    if (page === 'product' || page === 'list') setAppStorePreviewPage(page);
  });
});
appStorePreviewClose.addEventListener('click', () => setAppStorePreviewMode(false));
appStorePreview.addEventListener('click', (event) => {
  if (event.target === appStorePreview) setAppStorePreviewMode(false);
});
viewer.addEventListener('click', () => {
  if (body.classList.contains('is-capturing')) setCaptureMode(false);
});
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!downloadPopover.hidden) {
    setDownloadMenu(false);
    downloadButton.focus();
    return;
  }
  if (!appStorePreview.hidden) {
    setAppStorePreviewMode(false);
    return;
  }
  setCaptureMode(false);
});
window.addEventListener('beforeunload', () => showcase.dispose(), { once: true });

const initialViewControls = loadStoredViewControls() ?? { ...DEFAULT_VIEW_CONTROLS };
applyViewControls(initialViewControls);
window.addEventListener(
  'pageshow',
  () => {
    const restoredViewControls = loadStoredViewControls() ?? { ...DEFAULT_VIEW_CONTROLS };
    applyViewControls(restoredViewControls);
  },
  { once: true }
);

new ResizeObserver(fitCanvas).observe(viewer);
fitCanvas();
scheduleEditorPanelRefresh();
void document.fonts.ready.then(() => {
  showcase.refreshTextures();
  scheduleEditorPanelRefresh();
  if (!appStorePreview.hidden) requestAnimationFrame(refreshAppStoreScreenshots);
});
