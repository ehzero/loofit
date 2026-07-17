import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CARD_SPECS,
  SCREENSHOT_LAYOUT,
  SHOWCASE_GAP,
} from './config';
import {
  COMBINED_EXPORT_FILENAME,
  SHOWCASE_EXPORT_SLICES,
  SPLIT_EXPORT_FILENAME,
} from './export';
import { createRoundedPrismGeometry } from './three/geometry';

const html = fs.readFileSync('tools/showcase/index.html', 'utf8');
const css = fs.readFileSync('tools/showcase/showcase.css', 'utf8');
const entry = fs.readFileSync('tools/showcase/main.ts', 'utf8');
const imageExport = fs.readFileSync('tools/showcase/export.ts', 'utf8');
const config = fs.readFileSync('tools/showcase/config.ts', 'utf8');
const scene = fs.readFileSync('tools/showcase/three/scene.ts', 'utf8');
const geometry = fs.readFileSync('tools/showcase/three/geometry.ts', 'utf8');
const textures = fs.readFileSync('tools/showcase/three/textures.ts', 'utf8');
const rootPackage = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const showcasePackage = JSON.parse(fs.readFileSync('tools/showcase/package.json', 'utf8'));
const easIgnore = fs.readFileSync('.easignore', 'utf8');
const phoneModelRoot = 'tools/showcase/public/models/iphone-17-pro-max-silver';
const phoneModel = JSON.parse(fs.readFileSync(`${phoneModelRoot}/scene.gltf`, 'utf8'));
const phoneLicense = fs.readFileSync(`${phoneModelRoot}/license.txt`, 'utf8');

describe('Three.js showcase', () => {
  it('uses the exact three-panel App Store canvas', () => {
    expect(html).toContain('data-canvas-width="3960"');
    expect(html).toContain('data-canvas-height="2868"');
    expect(html).toContain('width="3960"');
    expect(html).toContain('height="2868"');
    expect(css).toContain('--canvas-width: 3960px');
    expect(css).toContain('--canvas-height: 2868px');
    expect(html).not.toContain('panel-guide');
    expect(css).not.toContain('.panel-guide');
    expect(css).toContain('linear-gradient(135deg, var(--canvas-a), var(--canvas-b))');
    expect(css).toContain('--canvas-a: #f2f3f5');
    expect(css).toContain('--canvas-b: #e9ebee');
    expect(css).toContain('--canvas-a: #191b1e');
    expect(css).toContain('--canvas-b: #121417');
    expect(css).not.toContain('radial-gradient(circle at 82% 77%');
    expect(css).not.toContain('radial-gradient(circle at 84% 76%');
  });

  it('renders three camera windows while omitting virtual carousel gutters', () => {
    expect(SCREENSHOT_LAYOUT.count).toBe(3);
    expect(SCREENSHOT_LAYOUT.panelWidth).toBe(1320);
    expect(SCREENSHOT_LAYOUT.panelHeight).toBe(2868);
    expect(SCREENSHOT_LAYOUT.gutter).toBe(85);
    expect(SCREENSHOT_LAYOUT.carouselGapPoints).toBe(8);
    expect(SCREENSHOT_LAYOUT.carouselGapRatio).toBeCloseTo(0.0644, 4);
    expect(SCREENSHOT_LAYOUT.editorGap).toBeCloseTo(85, 0);
    expect(SCREENSHOT_LAYOUT.editorGap).toBe(SCREENSHOT_LAYOUT.gutter);
    expect(SCREENSHOT_LAYOUT.virtualWidth).toBe(4130);
    expect(SCREENSHOT_LAYOUT.sourceOffsets).toEqual([0, 1405, 2810]);
    SCREENSHOT_LAYOUT.sourceOffsets.slice(1).forEach((offset, index) => {
      const previous = SCREENSHOT_LAYOUT.sourceOffsets[index]!;
      expect(offset - previous - SCREENSHOT_LAYOUT.panelWidth).toBe(
        SCREENSHOT_LAYOUT.gutter
      );
    });
    expect(
      SCREENSHOT_LAYOUT.sourceOffsets.at(-1)! + SCREENSHOT_LAYOUT.panelWidth
    ).toBe(SCREENSHOT_LAYOUT.virtualWidth);
    expect(scene).toContain('SCREENSHOT_LAYOUT.sourceOffsets.forEach');
    expect(scene).toContain('this.camera.setViewOffset(');
    expect(scene).toContain('this.renderer.setViewport(');
    expect(scene).toContain('this.renderer.setScissor(');
    expect(scene).toContain('this.camera.clearViewOffset()');
    expect(entry).toContain('const panelWidth = SCREENSHOT_LAYOUT.panelWidth');
  });

  it('toggles continuous and cropped panel rendering in the editor', () => {
    expect(html).toContain('data-panel-crop="enabled"');
    expect(html).toContain('data-control="panelCrop"');
    expect(html).toContain('data-value="enabled"');
    expect(html).toContain('data-value="disabled"');
    expect(html.match(/data-editor-panel=/g)).toHaveLength(3);
    expect(css).toContain('.editor-panel-strip');
    expect(css).toContain('gap: var(--editor-panel-gap, 85px)');
    expect(css).toContain('body[data-panel-crop="enabled"]:not(.is-capturing)');
    expect(entry).toContain("body.dataset.panelCrop = panelCroppingEnabled ? 'enabled' : 'disabled'");
    expect(entry).toContain('showcase.setPanelCropping(panelCroppingEnabled)');
    expect(entry).toContain('function editorArtboardWidth(capturing: boolean): number');
    expect(scene).toContain('setPanelCropping(enabled: boolean): void');
    expect(scene).toContain('if (!this.panelCroppingEnabled)');
  });

  it('renders first and last panel copy as HTML outside the Three.js scene', () => {
    expect(html).toContain('service-copy--first');
    expect(html).toContain('service-copy--last');
    expect(html).toContain('내 루틴대로,');
    expect(html).toContain('기록은 간단하게,');
    expect(html).not.toContain('service-copy__kicker');
    expect(css).toContain('.service-copy--first');
    expect(css).toContain('left: 160px');
    expect(css).toContain('.service-copy--last');
    expect(css).toContain('right: 160px');
    expect(scene).not.toContain('내 루틴대로,');
    expect(textures).not.toContain('기록은 간단하게,');
  });

  it('downloads the finished artwork as one PNG or three panel PNGs', () => {
    expect(html).toContain('id="downloadButton"');
    expect(html).toContain('data-export-mode="split"');
    expect(html).toContain('data-export-mode="combined"');
    expect(html).toContain('1320×2868 PNG 3장 · ZIP');
    expect(html).toContain('3960×2868 PNG');
    expect(entry).toContain('await Promise.all([showcase.ready, document.fonts.ready])');
    expect(entry).toContain('composeShowcaseImage({');
    expect(entry).toContain('downloadShowcaseImage(mode, output)');
    expect(imageExport).toContain("export type ShowcaseExportMode = 'combined' | 'split'");
    expect(imageExport).toContain("'loofit-showcase-3960x2868.png'");
    expect(imageExport).toContain("'loofit-showcase-1320x2868-3pack.zip'");
    expect(imageExport).toContain("canvas.toBlob((blob)");
    expect(imageExport).toContain("}, 'image/png')");
    expect(imageExport).toContain('zipSync(archiveEntries, { level: 0 })');
    expect(imageExport).toContain('URL.revokeObjectURL(url)');
    expect(COMBINED_EXPORT_FILENAME).toBe('loofit-showcase-3960x2868.png');
    expect(SPLIT_EXPORT_FILENAME).toBe('loofit-showcase-1320x2868-3pack.zip');
    expect(SHOWCASE_EXPORT_SLICES).toEqual([
      { panel: 0, x: 0, y: 0, width: 1320, height: 2868, filename: 'loofit-showcase-01.png' },
      { panel: 1, x: 1320, y: 0, width: 1320, height: 2868, filename: 'loofit-showcase-02.png' },
      { panel: 2, x: 2640, y: 0, width: 1320, height: 2868, filename: 'loofit-showcase-03.png' },
    ]);
    expect(SHOWCASE_EXPORT_SLICES.at(-1)!.x + SCREENSHOT_LAYOUT.panelWidth).toBe(3960);
  });

  it('contains only a canvas instead of legacy HTML cards', () => {
    expect(html.match(/<canvas/g)).toHaveLength(10);
    expect(html.match(/data-store-panel=/g)).toHaveLength(6);
    expect(html).not.toContain('<article');
    expect(html).not.toContain('iso-scene');
    expect(html).not.toContain('solid__');
    expect(html).not.toContain('data-grid=');
    expect(css).not.toContain('preserve-3d');
    expect(css).not.toContain('.solid');
    expect(css).not.toContain('.phone__');
    expect(fs.existsSync('tools/showcase/showcase.js')).toBe(false);
    expect(fs.existsSync('tools/showcase/fixtures.js')).toBe(false);
  });

  it('previews the three live panels inside an App Store iPhone product page', () => {
    expect(html).toContain('id="appStorePreviewButton"');
    expect(html).toContain('id="appStorePreview"');
    expect(html).toContain('class="app-store-device"');
    expect(html).toContain('App Store에서 보이는 모습');
    expect(html).toContain('class="app-store-screenshot-rail"');
    expect(css).toContain('.app-store-device__screen');
    expect(css).toContain('aspect-ratio: 430 / 900');
    expect(css).toContain('border: clamp(8px, 1.2vh, 12px) solid #111318');
    expect(css).toContain('overflow-x: auto');
    expect(css).toContain('scroll-snap-type: x mandatory');
    expect(entry).toContain('function refreshAppStoreScreenshots(): void');
    expect(entry).toContain('context.drawImage(');
    expect(entry).toContain('const outputSourceX = panel * panelWidth');
    expect(entry).toContain('const sourceFrameX = panelCroppingEnabled');
    expect(entry).toContain('SCREENSHOT_LAYOUT.sourceOffsets[panel]!');
    expect(entry).toContain('paintPanelCanvases(appStorePanelCanvases)');
    expect(entry).toContain('function setAppStorePreviewMode(active: boolean): void');
  });

  it('previews the first three screenshots together in an App Store list result', () => {
    expect(html.match(/data-store-preview-mode=/g)).toHaveLength(2);
    expect(html.match(/data-store-preview-page=/g)).toHaveLength(2);
    expect(html.match(/class="app-store-list-shot"/g)).toHaveLength(3);
    expect(html).toContain('data-store-preview-mode="product"');
    expect(html).toContain('data-store-preview-mode="list"');
    expect(html).toContain('class="app-store-page app-store-page--list"');
    expect(html).toContain('검색 결과 스크린샷 3장');
    expect(css).toContain('.app-store-list-shots');
    expect(css).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(css).toContain('gap: 1.86cqw');
    expect(css).toContain('.app-store-list-shot');
    expect(css).toContain('.app-store-list-shot .app-store-shot__copy strong');
    expect(css).toContain('font-size: 12.4cqw');
    expect(entry).toContain("type AppStorePreviewPage = 'product' | 'list'");
    expect(entry).toContain('function setAppStorePreviewPage(page: AppStorePreviewPage): void');
    expect(entry).toContain("setAppStorePreviewPage('product')");
  });

  it('mirrors the selected light or dark appearance inside the App Store device', () => {
    expect(css).toContain('--store-bg: #f7f7fa');
    expect(css).toContain('body[data-theme="dark"] .app-store-device');
    expect(css).toContain('--store-bg: #000000');
    expect(css).toContain('--store-control: #1c1c1e');
    expect(css).toContain('--store-text: #f5f5f7');
    expect(css).toContain('background: var(--store-bg)');
    expect(css).toContain('background: var(--store-tabbar)');
    expect(css).toContain('background: var(--store-home-indicator)');
  });

  it('builds widgets as meshes and loads the licensed phone under one camera', () => {
    expect(entry).toContain("from './three/scene'");
    expect(scene).toContain('new WebGLRenderer');
    expect(scene).toContain('new PerspectiveCamera');
    expect(scene).toContain("spec.kind !== 'phone'");
    expect(scene).toContain('createRoundedPrismGeometry');
    expect(scene).toContain('new GLTFLoader().loadAsync(PHONE_MODEL.url)');
    expect(config).toContain("screenMaterial: '17ProMax_Screen'");
    expect(scene).not.toContain('new CanvasTexture');
    expect(scene).not.toContain('front.position.z');
    expect(scene).not.toContain(':canvas-texture');
    expect(textures).toContain('new CanvasTexture');
    expect(geometry).toContain('new ExtrudeGeometry');
    expect(geometry).not.toContain('RoundedBoxGeometry');
    expect(config.match(/kind: '/g)).toHaveLength(18);
    expect(config).toContain('distance: 14000');
    expect(config).toContain('tilt: 35');
    expect(config).toContain('azimuth: -17.25');
    expect(scene).toContain('MathUtils.degToRad(-this.viewControls.cameraTilt)');
    expect(scene).toContain('MathUtils.degToRad(-this.viewControls.cameraAzimuth)');
  });

  it('keeps one clearance token while mixing widget sizes around the phone', () => {
    expect(SHOWCASE_GAP).toBe(40);
    expect(CARD_SPECS).toHaveLength(18);
    expect(new Set(CARD_SPECS.map(({ width, height }) => `${width}x${height}`)).size).toBeGreaterThanOrEqual(5);

    CARD_SPECS.forEach((first, firstIndex) => {
      CARD_SPECS.slice(firstIndex + 1).forEach((second) => {
        const horizontalGap = Math.max(
          second.x - (first.x + first.width),
          first.x - (second.x + second.width),
          0
        );
        const verticalGap = Math.max(
          second.y - (first.y + first.height),
          first.y - (second.y + second.height),
          0
        );
        expect(
          Math.hypot(horizontalGap, verticalGap),
          `${first.id}와 ${second.id}의 간격`
        ).toBeGreaterThanOrEqual(SHOWCASE_GAP);
      });
    });

    const phone = CARD_SPECS.find(({ kind }) => kind === 'phone');
    expect(phone).toBeDefined();
    if (!phone) return;
    const widgets = CARD_SPECS.filter(({ kind }) => kind !== 'phone');
    const overlapsVertically = (card: (typeof CARD_SPECS)[number]) => (
      card.y < phone.y + phone.height && card.y + card.height > phone.y
    );
    expect(widgets.filter((card) => card.y + card.height <= phone.y)).toHaveLength(5);
    expect(widgets.filter((card) => card.y >= phone.y + phone.height)).toHaveLength(6);
    expect(widgets.filter((card) => card.x + card.width <= phone.x && overlapsVertically(card))).toHaveLength(3);
    expect(widgets.filter((card) => card.x >= phone.x + phone.width && overlapsVertically(card))).toHaveLength(3);

    const assertPhoneHeightStack = (column: typeof widgets): void => {
      const ordered = [...column].sort((first, second) => first.y - second.y);
      expect(ordered).toHaveLength(3);
      expect(ordered[0]?.y).toBe(phone.y);
      expect(ordered.at(-1)!.y + ordered.at(-1)!.height).toBe(phone.y + phone.height);
      ordered.slice(1).forEach((card, index) => {
        const previous = ordered[index]!;
        expect(card.y - (previous.y + previous.height)).toBe(SHOWCASE_GAP);
      });
    };
    assertPhoneHeightStack(widgets.filter((card) => card.x + card.width <= phone.x && overlapsVertically(card)));
    assertPhoneHeightStack(widgets.filter((card) => card.x >= phone.x + phone.width && overlapsVertically(card)));

    widgets.forEach((widget) => {
      const nearestGap = Math.min(...CARD_SPECS.filter(({ id }) => id !== widget.id).map((other) => {
        const horizontalGap = Math.max(
          other.x - (widget.x + widget.width),
          widget.x - (other.x + other.width),
          0
        );
        const verticalGap = Math.max(
          other.y - (widget.y + widget.height),
          widget.y - (other.y + other.height),
          0
        );
        return Math.hypot(horizontalGap, verticalGap);
      }));
      expect(nearestGap, `${widget.id}의 최근접 간격`).toBe(SHOWCASE_GAP);
    });
  });

  it('adds circular and rectangular lock-screen widget meshes', () => {
    const circular = CARD_SPECS.filter(({ kind }) => (
      kind === 'lockWorkoutCircle' || kind === 'lockWeekCircle'
    ));
    const rectangular = CARD_SPECS.filter(({ kind }) => (
      kind === 'lockWorkoutRect' || kind === 'lockRoutineRect'
    ));
    expect(circular).toHaveLength(2);
    circular.forEach((card) => {
      expect(card.width).toBe(card.height);
      expect(card.radius).toBe(card.width / 2);
    });
    expect(rectangular).toHaveLength(2);
    rectangular.forEach((card) => expect(card.width).toBeGreaterThan(card.height));
    expect(geometry).toContain('shape.absarc(0, 0, halfWidth');
    expect(textures).toContain('drawLockWorkoutCircle');
    expect(textures).toContain('drawLockWeekCircle');
    expect(textures).toContain('drawLockWorkoutRect');
    expect(textures).toContain('drawLockRoutineRect');
  });

  it('keeps the widget texture on group 4 and adds a restrained edge bevel', () => {
    const roundedBox = createRoundedPrismGeometry({
      width: 232,
      height: 232,
      depth: 23,
      radius: 24,
    });
    expect(roundedBox.groups.map((group) => group.materialIndex)).toEqual([5, 4, 0]);
    expect(geometry).toContain('bevelSegments: 2');
    expect(geometry).toContain('edgeBevel = 1.25');

    const normals = roundedBox.getAttribute('normal');
    const frontGroup = roundedBox.groups[1];
    const sideGroup = roundedBox.groups[2];
    expect(normals.getZ(frontGroup.start)).toBe(1);
    expect(Math.abs(normals.getZ(sideGroup.start))).toBeGreaterThan(0);
    expect(Math.abs(normals.getZ(sideGroup.start))).toBeLessThan(1);
    roundedBox.dispose();
  });

  it('preserves model attribution and replaces its dedicated screen material', () => {
    expect(phoneModel.asset.extras.title).toBe('iphone 17 pro max silver');
    expect(phoneModel.asset.extras.author).toContain('TechFreak');
    expect(phoneModel.asset.extras.license).toContain('CC-BY-4.0');
    expect(phoneModel.materials.some((material: { name?: string }) => (
      material.name === '17ProMax_Screen'
    ))).toBe(true);
    expect(phoneLicense).toContain('Author must be credited. Commercial use is allowed.');
    expect(phoneLicense).toContain('TechFreak');
    expect(entry).toContain('showcase.ready.then');
    expect(scene).toContain('depthTest: false');
    expect(scene).toContain('transparent: true');
    expect(scene).toContain('object.renderOrder = 100');
    expect(config).not.toContain('frontOverlayMaterials');
    expect(scene).not.toContain('object.renderOrder = 110');
    expect(scene).not.toContain('frontOverlayMaterials');
    expect(textures).toContain("texture.minFilter = spec.kind === 'phone' ? LinearFilter : LinearMipmapLinearFilter");
    expect(textures).toContain("texture.generateMipmaps = spec.kind !== 'phone'");
    expect(config).toContain("backSurfaceMaterial: '17ProMax_Logo'");
    expect(config).toContain("'17ProMax_black1'");
    expect(config).toContain("'17ProMax_Lens'");
    expect(scene).toContain('const backSurfaceMeshes: Mesh[] = []');
    expect(scene).toContain('private removeRearCameraGeometry(model: Group, backSurfaceZ: number): void');
    expect(scene).toContain('this.removeRearCameraGeometry(model, modelGroundZ)');
    expect(scene).toContain('object.visible = false');
    expect(scene).toContain('vertex.z = backSurfaceZ');
    expect(scene).toContain('model.position.z = modelGroundZ * baseScale');
  });

  it('uses a neutral reflection environment and an explicit silver frame material', () => {
    expect(config).toContain("frameMaterial: '17ProMax_color'");
    expect(config).toContain("light: '#d6d6d2'");
    expect(config).toContain("dark: '#071b2e'");
    expect(textures).toContain("fillRounded(context, width / 2 - 60, 9, 120, 31, 15.5, '#050506')");
    expect(scene).toContain('new RoomEnvironment()');
    expect(scene).toContain('this.scene.environment = this.environmentTexture');
    expect(scene).toContain('material.color.set(PHONE_MODEL.frameColors[this.state.theme])');
    expect(scene).toContain('private applyPhoneFrameTheme(): void');
    expect(scene).toContain('material.metalness = PHONE_MODEL.metalness');
    expect(scene).toContain('material.roughness = PHONE_MODEL.roughness');
  });

  it('keeps the widget planes legible with restrained fill and tone mapping', () => {
    expect(scene).toContain('this.renderer.toneMapping = ACESFilmicToneMapping');
    expect(scene).not.toContain('AmbientLight');
    expect(scene).not.toContain('HemisphereLight');
    expect(scene).toContain('new DirectionalLight(0xffffff, 1)');
    expect(scene).toContain('this.widgetMaterial = new MeshStandardMaterial');
    expect(scene).toContain('metalness: 0');
    expect(scene).toContain('roughness: 0.68');
    expect(scene).toContain('envMapIntensity: 0.35');
    expect(scene).toContain('private createWidgetSurfaceMaterial(surface: CardSurface): MeshBasicMaterial');
    expect(scene).toContain('toneMapped: false');
    expect(config).toContain('lightIntensity: 0.97');
  });

  it('lets the rounded widget material own the background and highlight', () => {
    expect(scene).toContain('createWidgetSurfaceMaterial');
    expect(scene).toContain('diffuseColor.rgb = mix(diffuseColor.rgb, widgetContent.rgb, widgetContent.a)');
    expect(scene).toContain('new MeshBasicMaterial');
    expect(textures).not.toContain('base.addColorStop');
    expect(textures).not.toContain('shine.addColorStop');
    expect(textures).not.toContain('metal.addColorStop');
  });

  it('fills the six-month widget width with its complete heatmap grid', () => {
    expect(textures).toContain('const gridWidth = width - 40');
    expect(textures).toContain('const cell = (gridWidth - gap * (columns - 1)) / columns');
    expect(textures).not.toContain('Math.min((gridWidth - gap * (columns - 1)) / columns, 9.3)');
  });

  it('keeps theme, accent and phase controls in the Three.js texture pipeline', () => {
    expect(entry).toContain("control.dataset.control === 'phase'");
    expect(entry).toContain("control.dataset.control === 'theme'");
    expect(entry).toContain("control.dataset.control === 'accent'");
    expect(scene).toContain('surface.redraw(this.state)');
    expect(textures).toContain('drawPhone');
    expect(textures).toContain('drawWorkout');
    expect(textures).toContain('drawYear');
    expect(textures).toContain('drawNext');
    expect(textures).toContain('drawStreak');
    expect(textures).toContain('drawSummary');
    expect(textures).toContain('drawQuick');
    expect(textures).toContain('drawRecent');
    expect(textures).toContain('drawMonthHeat');
  });

  it('mirrors the native Home feed and active-session layouts on the phone texture', () => {
    expect(textures).toContain("screen: '#e6e6e9'");
    expect(textures).toContain("card: '#f5f5f6'");
    expect(textures).toContain("screen: '#050506'");
    expect(textures).toContain("card: '#141416'");
    expect(textures).toContain('drawPhoneBefore');
    expect(textures).toContain('drawPhoneActive');
    expect(textures).toContain('drawPhoneCompleted');
    expect(textures).toContain("drawText(context, '오늘은 당기는 날'");
    expect(textures).toContain("drawText(context, '푸시 완료, 올라잇!'");
    expect(textures).toContain("drawText(context, '최근 7일'");
    expect(textures).toContain("drawText(context, '최근 기록'");
    expect(textures).toContain("drawText(context, '운동 취소'");
    expect(textures).toContain("['dashboard', '대시보드']");
    expect(textures).toContain('const statusRightInset = 28');
    expect(textures).toContain('const statusIconGap = 8');
  });

  it('exposes live camera, perspective and lighting controls', () => {
    expect(html.match(/data-view-control=/g)).toHaveLength(11);
    expect(html).toContain('data-view-control="meshDepthScale"');
    expect(html).toContain('data-view-control="cornerRadiusScale"');
    expect(html).toContain('<span>위젯 두께</span>');
    expect(html).toContain('<span>위젯 라운딩</span>');
    expect(html).toContain('data-view-control="meshZ"');
    expect(html).toContain('data-view-control="cameraTilt"');
    expect(html).toContain('data-view-control="cameraAzimuth"');
    expect(html).toContain('data-view-control="cameraDistance"');
    expect(html).toContain('data-view-control="cameraZoom" type="range" min="0.6" max="1.6" step="0.05" value="1.15"');
    expect(html).toContain('<span>장면 줌</span>');
    expect(html).toContain('data-view-control="shadowDirection"');
    expect(html).toContain('data-view-control="shadowSpread" type="range" min="0" max="80" step="1" value="9"');
    expect(html).toContain('data-view-control="lightIntensity"');
    expect(html).toContain('data-view-control="lightIntensity" type="range" min="0" max="6" step="0.01"');
    expect(html).toContain('data-view-control="shadowRadius"');
    expect(html).not.toContain('data-view-control="shadowDistance"');
    expect(html).not.toContain('data-view-control="lightX"');
    expect(html).not.toContain('data-view-control="lightY"');
    expect(html).not.toContain('data-view-control="lightZ"');
    expect(entry).toContain('queueViewControl');
    expect(entry).toContain('showcase.setViewControls');
    expect(scene).toContain('setViewControls(next: Partial<ShowcaseViewControls>)');
    expect(scene).toContain('this.camera.zoom = this.viewControls.cameraZoom');
    expect(scene).toContain('this.keyLight.shadow.radius = this.viewControls.shadowRadius');
    expect(scene).toContain('private applyScreenSpaceShadowDirection(): void');
    expect(scene).toContain('const desiredY = -Math.sin(angle)');
    expect(scene).toContain('multiplyScalar(this.viewControls.shadowSpread)');
    expect(config).toContain('shadowDirection: 104');
    expect(config).toContain('cameraZoom: 1.15');
    expect(config).toContain('shadowSpread: 9');
    expect(config).toContain('lightIntensity: 0.97');
    expect(config).toContain('shadowRadius: 15');
    expect(config).toContain('meshDepthScale: 0.8');
    expect(config).toContain('meshZ: 20');
    expect(config).not.toContain('shadowDistance:');
    expect(config).not.toContain('lightX:');
    expect(config).not.toContain('lightY:');
    expect(config).not.toContain('lightZ:');
    expect(scene).toContain('private applyMeshControls(rebuildGeometry: boolean)');
    expect(scene).toContain('group.position.z = this.viewControls.meshZ');
    expect(scene).toContain('model.scale.setScalar(baseScale)');
    expect(scene).toContain('model.rotation.y = Math.PI');
    expect(scene).not.toContain('model.scale.set(baseScale, baseScale, -baseScale)');
    expect(scene).not.toContain('-baseScale * depthScale');
    expect(config).not.toContain('lift:');
  });

  it('persists and restores custom scene controls from the inspector', () => {
    expect(html).toContain('id="saveSceneControls"');
    expect(html).toContain('>저장</button>');
    expect(entry).toContain("const VIEW_CONTROLS_STORAGE_KEY = 'loofit-showcase:view-controls'");
    expect(entry).toContain('function readViewControls(): ShowcaseViewControls');
    expect(entry).toContain('function loadStoredViewControls(): ShowcaseViewControls | null');
    expect(entry).toContain('localStorage.setItem(VIEW_CONTROLS_STORAGE_KEY');
    expect(entry).toContain('localStorage.removeItem(VIEW_CONTROLS_STORAGE_KEY)');
    expect(entry).toContain('loadStoredViewControls() ?? { ...DEFAULT_VIEW_CONTROLS }');
    expect(entry).toContain('applyViewControls(initialViewControls)');
    expect(entry).toContain("window.addEventListener(\n  'pageshow'");
    expect(entry).toContain('applyViewControls(restoredViewControls)');
    expect(css).toContain('#saveSceneControls[data-state="saved"]');
  });

  it('keeps web-only dependencies out of the mobile app package', () => {
    expect(rootPackage.dependencies?.three).toBeUndefined();
    expect(rootPackage.devDependencies?.vite).toBeUndefined();
    expect(showcasePackage.dependencies.three).toBeDefined();
    expect(showcasePackage.devDependencies.vite).toBeDefined();
    expect(easIgnore).toMatch(/^\/tools\/showcase\/$/m);
  });
});
