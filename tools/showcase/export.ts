import { zipSync } from 'fflate';
import { CANVAS, SCREENSHOT_LAYOUT } from './config';

export type ShowcaseExportMode = 'combined' | 'split';

export interface ShowcaseExportSlice {
  panel: number;
  x: number;
  y: number;
  width: number;
  height: number;
  filename: string;
}

export const COMBINED_EXPORT_FILENAME = 'loofit-showcase-3960x2868.png';
export const SPLIT_EXPORT_FILENAME = 'loofit-showcase-1320x2868-3pack.zip';

export const SHOWCASE_EXPORT_SLICES: readonly ShowcaseExportSlice[] = Object.freeze(
  Array.from({ length: SCREENSHOT_LAYOUT.count }, (_, panel) => Object.freeze({
    panel,
    x: panel * SCREENSHOT_LAYOUT.panelWidth,
    y: 0,
    width: SCREENSHOT_LAYOUT.panelWidth,
    height: SCREENSHOT_LAYOUT.panelHeight,
    filename: `loofit-showcase-${String(panel + 1).padStart(2, '0')}.png`,
  }))
);

interface ComposeShowcaseImageOptions {
  source: HTMLCanvasElement;
  artboard: HTMLElement;
  panelCroppingEnabled: boolean;
  backgroundStart: string;
  backgroundEnd: string;
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function requireContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('이미지 합성용 Canvas를 만들 수 없습니다.');
  return context;
}

function fillGradient(
  context: CanvasRenderingContext2D,
  destinationX: number,
  destinationWidth: number,
  sourceFrameX: number,
  sourceFrameWidth: number,
  start: string,
  end: string
): void {
  const gradient = context.createLinearGradient(
    destinationX - sourceFrameX,
    0,
    destinationX + sourceFrameWidth - sourceFrameX,
    CANVAS.height
  );
  gradient.addColorStop(0, start);
  gradient.addColorStop(1, end);
  context.fillStyle = gradient;
  context.fillRect(destinationX, 0, destinationWidth, CANVAS.height);
}

function paintBackground(
  context: CanvasRenderingContext2D,
  panelCroppingEnabled: boolean,
  start: string,
  end: string
): void {
  if (!panelCroppingEnabled) {
    fillGradient(context, 0, CANVAS.width, 0, CANVAS.width, start, end);
    return;
  }

  SHOWCASE_EXPORT_SLICES.forEach(({ panel, x, width }) => {
    fillGradient(
      context,
      x,
      width,
      SCREENSHOT_LAYOUT.sourceOffsets[panel]!,
      SCREENSHOT_LAYOUT.virtualWidth,
      start,
      end
    );
  });
}

function textLines(element: HTMLElement): string[] {
  const lines: string[] = [''];
  element.childNodes.forEach((node) => {
    if (node instanceof HTMLBRElement) {
      lines.push('');
      return;
    }
    lines[lines.length - 1] += node.textContent ?? '';
  });
  return lines;
}

function pixelValue(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function paintTextElement(
  context: CanvasRenderingContext2D,
  copy: HTMLElement,
  element: HTMLElement,
  originX: number
): void {
  const styles = getComputedStyle(element);
  const fontSize = pixelValue(styles.fontSize, 16);
  const lineHeight = pixelValue(styles.lineHeight, fontSize * 1.2);
  const textAlign = styles.textAlign === 'right'
    ? 'right'
    : styles.textAlign === 'center'
      ? 'center'
      : 'left';
  const x = originX + copy.offsetLeft + (
    textAlign === 'right'
      ? element.offsetLeft + element.offsetWidth
      : textAlign === 'center'
        ? element.offsetLeft + element.offsetWidth / 2
        : element.offsetLeft
  );
  const y = copy.offsetTop + element.offsetTop;

  context.save();
  context.fillStyle = styles.color;
  context.font = `${styles.fontStyle} ${styles.fontWeight} ${styles.fontSize} ${styles.fontFamily}`;
  context.textAlign = textAlign;
  context.textBaseline = 'top';
  const contextWithSpacing = context as CanvasRenderingContext2D & {
    letterSpacing?: string;
  };
  if ('letterSpacing' in contextWithSpacing) {
    contextWithSpacing.letterSpacing = styles.letterSpacing;
  }
  textLines(element).forEach((line, index) => {
    context.fillText(line.trim(), x, y + lineHeight * index);
  });
  context.restore();
}

function paintServiceCopy(
  context: CanvasRenderingContext2D,
  artboard: HTMLElement,
  panelCroppingEnabled: boolean
): void {
  const copies = panelCroppingEnabled
    ? Array.from(artboard.querySelectorAll<HTMLElement>('.editor-panel > .service-copy'))
    : Array.from(artboard.children).filter((child): child is HTMLElement => (
        child instanceof HTMLElement && child.classList.contains('service-copy')
      ));

  copies.forEach((copy) => {
    const panel = panelCroppingEnabled
      ? Number(copy.parentElement?.querySelector<HTMLCanvasElement>('[data-editor-panel]')?.dataset.editorPanel)
      : 0;
    const originX = Number.isInteger(panel) ? panel * SCREENSHOT_LAYOUT.panelWidth : 0;
    copy.querySelectorAll<HTMLElement>('h2, p').forEach((element) => {
      paintTextElement(context, copy, element, originX);
    });
  });
}

export function composeShowcaseImage({
  source,
  artboard,
  panelCroppingEnabled,
  backgroundStart,
  backgroundEnd,
}: ComposeShowcaseImageOptions): HTMLCanvasElement {
  const output = createCanvas(CANVAS.width, CANVAS.height);
  const context = requireContext(output);
  paintBackground(
    context,
    panelCroppingEnabled,
    backgroundStart,
    backgroundEnd
  );
  context.drawImage(source, 0, 0, CANVAS.width, CANVAS.height);
  paintServiceCopy(context, artboard, panelCroppingEnabled);
  return output;
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('PNG 이미지 인코딩에 실패했습니다.'));
    }, 'image/png');
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadSplitImages(source: HTMLCanvasElement): Promise<void> {
  const panelCanvas = createCanvas(
    SCREENSHOT_LAYOUT.panelWidth,
    SCREENSHOT_LAYOUT.panelHeight
  );
  const context = requireContext(panelCanvas);
  const archiveEntries: Record<string, Uint8Array> = {};

  for (const slice of SHOWCASE_EXPORT_SLICES) {
    context.clearRect(0, 0, panelCanvas.width, panelCanvas.height);
    context.drawImage(
      source,
      slice.x,
      slice.y,
      slice.width,
      slice.height,
      0,
      0,
      slice.width,
      slice.height
    );
    const blob = await canvasToPng(panelCanvas);
    archiveEntries[slice.filename] = new Uint8Array(await blob.arrayBuffer());
  }

  const archive = zipSync(archiveEntries, { level: 0 });
  const archiveBytes = archive.buffer.slice(
    archive.byteOffset,
    archive.byteOffset + archive.byteLength
  ) as ArrayBuffer;
  downloadBlob(new Blob([archiveBytes], { type: 'application/zip' }), SPLIT_EXPORT_FILENAME);
}

export async function downloadShowcaseImage(
  mode: ShowcaseExportMode,
  source: HTMLCanvasElement
): Promise<void> {
  if (mode === 'combined') {
    downloadBlob(await canvasToPng(source), COMBINED_EXPORT_FILENAME);
    return;
  }
  await downloadSplitImages(source);
}
