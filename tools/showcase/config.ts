const SCREENSHOT_COUNT = 3;
const SCREENSHOT_PANEL_WIDTH = 1320;
const SCREENSHOT_PANEL_HEIGHT = 2868;
const SCREENSHOT_CAROUSEL_GAP_POINTS = 8;
const APP_STORE_LIST_VIEWPORT_POINTS = 430;
const APP_STORE_LIST_HORIZONTAL_PADDING_RATIO = 0.048;
const APP_STORE_LIST_SCREENSHOT_POINTS = (
  APP_STORE_LIST_VIEWPORT_POINTS *
    (1 - APP_STORE_LIST_HORIZONTAL_PADDING_RATIO * 2) -
  SCREENSHOT_CAROUSEL_GAP_POINTS * (SCREENSHOT_COUNT - 1)
) / SCREENSHOT_COUNT;
const SCREENSHOT_CAROUSEL_GAP_RATIO =
  SCREENSHOT_CAROUSEL_GAP_POINTS / APP_STORE_LIST_SCREENSHOT_POINTS;
const SCREENSHOT_GUTTER = Math.round(
  SCREENSHOT_PANEL_WIDTH * SCREENSHOT_CAROUSEL_GAP_RATIO
);
const SCREENSHOT_SOURCE_OFFSETS = Object.freeze(
  Array.from(
    { length: SCREENSHOT_COUNT },
    (_, panel) => panel * (SCREENSHOT_PANEL_WIDTH + SCREENSHOT_GUTTER)
  )
);

export const SCREENSHOT_LAYOUT = Object.freeze({
  count: SCREENSHOT_COUNT,
  panelWidth: SCREENSHOT_PANEL_WIDTH,
  panelHeight: SCREENSHOT_PANEL_HEIGHT,
  gutter: SCREENSHOT_GUTTER,
  carouselGapPoints: SCREENSHOT_CAROUSEL_GAP_POINTS,
  carouselGapRatio: SCREENSHOT_CAROUSEL_GAP_RATIO,
  editorGap: SCREENSHOT_GUTTER,
  virtualWidth:
    SCREENSHOT_PANEL_WIDTH * SCREENSHOT_COUNT +
    SCREENSHOT_GUTTER * (SCREENSHOT_COUNT - 1),
  sourceOffsets: SCREENSHOT_SOURCE_OFFSETS,
});
export const CANVAS = Object.freeze({
  width: SCREENSHOT_LAYOUT.panelWidth * SCREENSHOT_LAYOUT.count,
  height: SCREENSHOT_LAYOUT.panelHeight,
});
export const STAGE = Object.freeze({ width: 1491.6318, height: 1080, scale: 0.88 });
export const CAMERA = Object.freeze({
  distance: 14000,
  tilt: 50,
  azimuth: -17.25,
  perspectiveOriginY: 0.46,
});
export const PHONE_MODEL = Object.freeze({
  url: '/models/iphone-17-pro-max-silver/scene.gltf',
  screenMaterial: '17ProMax_Screen',
  frameMaterial: '17ProMax_color',
  backSurfaceMaterial: '17ProMax_Logo',
  rearCameraMaterials: Object.freeze([
    '17ProMax_black1',
    '17ProMax_21',
    '17ProMax_22',
    '17ProMax_Lens',
  ]),
  frameColors: Object.freeze({
    light: '#d6d6d2',
    dark: '#071b2e',
  }),
  metalness: 0.86,
  roughness: 0.28,
  environmentIntensity: 1.35,
});

export type ShowcasePhase = 'before' | 'active' | 'completed';
export type ShowcaseTheme = 'light' | 'dark';
export type WidgetKind =
  | 'workout'
  | 'week'
  | 'routine'
  | 'year'
  | 'month'
  | 'body'
  | 'detail'
  | 'next'
  | 'streak'
  | 'summary'
  | 'quick'
  | 'recent'
  | 'monthHeat'
  | 'lockWorkoutCircle'
  | 'lockWeekCircle'
  | 'lockWorkoutRect'
  | 'lockRoutineRect'
  | 'phone';

export interface ShowcaseState {
  phase: ShowcasePhase;
  theme: ShowcaseTheme;
  accent: string;
}

export interface ShowcaseViewControls {
  cameraTilt: number;
  cameraAzimuth: number;
  cameraDistance: number;
  cameraZoom: number;
  shadowDirection: number;
  shadowSpread: number;
  lightIntensity: number;
  shadowRadius: number;
  meshDepthScale: number;
  cornerRadiusScale: number;
  meshZ: number;
}

export interface ShowcaseCardSpec {
  id: string;
  kind: WidgetKind;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  radius: number;
}

export const SHOWCASE_GAP = 40;

export const CARD_SPECS: readonly ShowcaseCardSpec[] = Object.freeze([
  { id: 'lock-workout-circle', kind: 'lockWorkoutCircle', x: 276, y: 40, width: 96, height: 96, depth: 16, radius: 48 },
  { id: 'streak', kind: 'streak', x: 412, y: 1, width: 174, height: 174, depth: 18, radius: 20 },
  { id: 'summary', kind: 'summary', x: 626, y: 25, width: 240, height: 150, depth: 20, radius: 20 },
  { id: 'quick', kind: 'quick', x: 906, y: 1, width: 174, height: 174, depth: 18, radius: 20 },
  { id: 'lock-week-circle', kind: 'lockWeekCircle', x: 1120, y: 40, width: 96, height: 96, depth: 16, radius: 48 },
  { id: 'year', kind: 'year', x: 158, y: 215, width: 390, height: 182, depth: 20, radius: 22 },
  { id: 'workout', kind: 'workout', x: 342, y: 437, width: 206, height: 206, depth: 18, radius: 22 },
  { id: 'detail', kind: 'detail', x: 158, y: 683, width: 390, height: 182, depth: 20, radius: 22 },
  { id: 'phone', kind: 'phone', x: 588, y: 215, width: 316, height: 650, depth: 30, radius: 52 },
  { id: 'month-heat', kind: 'monthHeat', x: 944, y: 215, width: 377, height: 176, depth: 20, radius: 22 },
  { id: 'routine', kind: 'routine', x: 944, y: 431, width: 197, height: 197, depth: 18, radius: 22 },
  { id: 'body', kind: 'body', x: 944, y: 668, width: 197, height: 197, depth: 18, radius: 22 },
  { id: 'lock-workout-rect', kind: 'lockWorkoutRect', x: 49, y: 929, width: 154, height: 102, depth: 16, radius: 20 },
  { id: 'month', kind: 'month', x: 243, y: 905, width: 174, height: 174, depth: 18, radius: 20 },
  { id: 'next', kind: 'next', x: 457, y: 905, width: 240, height: 150, depth: 20, radius: 20 },
  { id: 'week', kind: 'week', x: 737, y: 905, width: 174, height: 174, depth: 18, radius: 20 },
  { id: 'recent', kind: 'recent', x: 951, y: 905, width: 298, height: 150, depth: 20, radius: 20 },
  { id: 'lock-routine-rect', kind: 'lockRoutineRect', x: 1289, y: 929, width: 154, height: 102, depth: 16, radius: 20 },
]);

export const DEFAULT_STATE: ShowcaseState = Object.freeze({
  phase: 'before',
  theme: 'light',
  accent: '#c9f31d',
});

export const DEFAULT_VIEW_CONTROLS: ShowcaseViewControls = Object.freeze({
  cameraTilt: CAMERA.tilt,
  cameraAzimuth: CAMERA.azimuth,
  cameraDistance: CAMERA.distance,
  cameraZoom: 1,
  shadowDirection: 90,
  shadowSpread: 24,
  lightIntensity: 1,
  shadowRadius: 5,
  meshDepthScale: 1,
  cornerRadiusScale: 1,
  meshZ: 0,
});
