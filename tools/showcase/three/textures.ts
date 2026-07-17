import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
} from 'three';
import type { ShowcaseCardSpec, ShowcaseState, WidgetKind } from '../config';
import {
  BODY_PARTS,
  DETAIL_DAYS,
  MONTH_DAYS,
  PHASES,
  ROUTINE,
  WEEK,
  YEAR_LEVELS,
} from '../fixtures';

const TEXTURE_SCALE = 4;
const FONT_FAMILY = '"SF Pro Display", "SF Pro Rounded", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const SURFACE_DESIGN_SIZE: Record<WidgetKind, { width: number; height: number }> = {
  workout: { width: 232, height: 232 },
  week: { width: 232, height: 232 },
  routine: { width: 232, height: 232 },
  year: { width: 438, height: 204 },
  month: { width: 232, height: 232 },
  body: { width: 232, height: 232 },
  detail: { width: 438, height: 204 },
  next: { width: 240, height: 150 },
  streak: { width: 174, height: 174 },
  summary: { width: 240, height: 150 },
  quick: { width: 174, height: 174 },
  recent: { width: 298, height: 150 },
  monthHeat: { width: 438, height: 204 },
  lockWorkoutCircle: { width: 96, height: 96 },
  lockWeekCircle: { width: 96, height: 96 },
  lockWorkoutRect: { width: 154, height: 102 },
  lockRoutineRect: { width: 154, height: 102 },
  phone: { width: 360, height: 740 },
};

export interface ShowcasePalette {
  card: string;
  cardRaised: string;
  screen: string;
  surface: string;
  text: string;
  text2: string;
  text3: string;
  textFaint: string;
  border: string;
  borderStrong: string;
  nav: string;
  navBorder: string;
  heroStart: string;
  heroEnd: string;
  accent: string;
  accentInk: string;
  danger: string;
}

export interface CardSurface {
  canvas: HTMLCanvasElement;
  texture: CanvasTexture;
  redraw(state: ShowcaseState): void;
  dispose(): void;
}

function parseHex(color: string): [number, number, number] {
  const normalized = color.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((part) => `${part}${part}`).join('')
    : normalized;
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function mixColor(first: string, second: string, amount: number): string {
  const a = parseHex(first);
  const b = parseHex(second);
  return `rgb(${a.map((channel, index) => Math.round(channel + (b[index] - channel) * amount)).join(', ')})`;
}

function accentInk(accent: string): string {
  const [red, green, blue] = parseHex(accent);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 148 ? '#0b0d08' : '#ffffff';
}

export function paletteFor(state: ShowcaseState): ShowcasePalette {
  if (state.theme === 'dark') {
    return {
      card: '#141416',
      cardRaised: '#18181d',
      screen: '#050506',
      surface: '#1b1b1f',
      text: '#f4f4f2',
      text2: '#c9c9ce',
      text3: '#7c7c82',
      textFaint: '#5c5c62',
      border: '#26262a',
      borderStrong: '#2a2a2f',
      nav: '#0c0c0e',
      navBorder: '#1c1c20',
      heroStart: mixColor('#18181d', state.accent, 0.04),
      heroEnd: mixColor('#101013', state.accent, 0.02),
      accent: state.accent,
      accentInk: accentInk(state.accent),
      danger: '#c87a7a',
    };
  }

  return {
    card: '#f5f5f6',
    cardRaised: '#fcfcfd',
    screen: '#e6e6e9',
    surface: '#ededef',
    text: '#17171a',
    text2: '#3a3a40',
    text3: '#78787f',
    textFaint: '#a2a2a8',
    border: '#e4e4e7',
    borderStrong: '#dbdbdf',
    nav: '#fbfbfc',
    navBorder: '#e7e7ea',
    heroStart: mixColor('#fcfcfd', state.accent, 0.04),
    heroEnd: mixColor('#f0f0f2', state.accent, 0.02),
    accent: state.accent,
    accentInk: accentInk(state.accent),
    danger: '#c0392b',
  };
}

function roundedPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function fillRounded(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string | CanvasGradient
): void {
  roundedPath(context, x, y, width, height, radius);
  context.fillStyle = fill;
  context.fill();
}

function strokeRounded(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  stroke: string,
  lineWidth = 1
): void {
  roundedPath(context, x, y, width, height, radius);
  context.strokeStyle = stroke;
  context.lineWidth = lineWidth;
  context.stroke();
}

function drawText(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  weight: number,
  color: string,
  align: CanvasTextAlign = 'left'
): void {
  context.fillStyle = color;
  context.font = `${weight} ${size}px ${FONT_FAMILY}`;
  context.textAlign = align;
  context.textBaseline = 'alphabetic';
  context.fillText(value, x, y);
}

function drawCardBase(
  context: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  context.clearRect(0, 0, width, height);
}

function drawEyebrow(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  palette: ShowcasePalette,
  accent = false
): void {
  drawText(context, value, x, y, 10, 800, accent ? palette.accent : palette.text3);
}

function drawWorkout(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: ShowcaseState,
  palette: ShowcasePalette
): void {
  const phase = PHASES[state.phase];
  drawEyebrow(context, phase.eyebrow, 19, 31, palette, state.phase !== 'before');
  drawText(context, phase.title, 19, state.phase === 'active' ? 78 : 73, state.phase === 'active' ? 37 : 31, 850, palette.text);
  drawText(context, phase.meta, 19, 99, 12, 620, palette.text2);

  if (state.phase === 'completed') {
    context.fillStyle = palette.border;
    context.fillRect(19, height - 64, width - 38, 1);
    drawText(context, '1시간 8분', 19, height - 30, 16, 800, palette.text);
    return;
  }

  const buttonColor = state.phase === 'active' ? palette.surface : palette.accent;
  const buttonText = state.phase === 'active' ? palette.text : palette.accentInk;
  fillRounded(context, 19, height - 59, width - 38, 40, 13, buttonColor);
  drawText(context, phase.action, width / 2, height - 33, 12, 820, buttonText, 'center');
}

function heatColor(level: number, palette: ShowcasePalette): string {
  if (level === 3) return palette.accent;
  if (level === 2) return mixColor(palette.surface, palette.accent, 0.58);
  if (level === 1) return mixColor(palette.surface, palette.accent, 0.28);
  return palette.surface;
}

function drawWeek(
  context: CanvasRenderingContext2D,
  width: number,
  palette: ShowcasePalette
): void {
  drawEyebrow(context, '최근 7일', 18, 29, palette);
  drawText(context, '이번 주 흐름', 18, 48, 14, 800, palette.text);
  drawText(context, '4회', width - 18, 43, 15, 850, palette.accent, 'right');

  const gap = 5;
  const cell = (width - 36 - gap * 6) / 7;
  WEEK.forEach((item, index) => {
    const x = 18 + index * (cell + gap);
    fillRounded(context, x, 76, cell, cell, 6, heatColor(item.level, palette));
    drawText(context, item.day, x + cell / 2, 76 + cell + 14, 8, 750, palette.text3, 'center');
  });

  const stats = [
    ['횟수', '4회'],
    ['총 시간', '3h 42m'],
    ['평균', '55m'],
  ];
  stats.forEach(([label, value], index) => {
    const x = 18 + index * ((width - 36) / 3);
    drawText(context, label, x, 177, 8, 700, palette.text3);
    drawText(context, value, x, 194, 11, 800, palette.text);
  });
}

function drawRoutine(
  context: CanvasRenderingContext2D,
  width: number,
  palette: ShowcasePalette
): void {
  drawEyebrow(context, '루틴 진행', 18, 29, palette);
  drawText(context, '다음 운동', 18, 48, 14, 800, palette.text);
  drawText(context, '2 / 3', width - 18, 43, 15, 850, palette.accent, 'right');

  ROUTINE.forEach((item, index) => {
    const y = 68 + index * 47;
    const rowColor = item.current ? mixColor(palette.surface, palette.accent, 0.18) : mixColor(palette.card, palette.surface, 0.7);
    fillRounded(context, 18, y, width - 36, 39, 11, rowColor);
    fillRounded(context, 27, y + 8, 23, 23, 8, palette.cardRaised);
    const rowText = item.current ? palette.text : palette.text3;
    drawText(context, String(index + 1), 38.5, y + 23, 9, 850, rowText, 'center');
    drawText(context, item.title, 59, y + 17, 11, 800, rowText);
    drawText(context, item.meta, 59, y + 30, 8, 700, rowText);
    drawText(context, item.when, width - 27, y + 24, 8, 700, rowText, 'right');
  });
}

function drawYear(
  context: CanvasRenderingContext2D,
  width: number,
  palette: ShowcasePalette
): void {
  drawEyebrow(context, '지난 6개월', 20, 27, palette);
  drawText(context, '꾸준히 쌓인 운동', 20, 46, 14, 800, palette.text);
  drawText(context, '운동', width - 112, 24, 8, 700, palette.text3, 'right');
  drawText(context, '48회', width - 20, 24, 12, 820, palette.text, 'right');
  drawText(context, '총 시간', width - 112, 42, 8, 700, palette.text3, 'right');
  drawText(context, '41h 20m', width - 20, 42, 12, 820, palette.text, 'right');

  const columns = 27;
  const rows = 7;
  const gap = 3;
  const gridX = 20;
  const gridY = 66;
  const gridWidth = width - 40;
  const cell = (gridWidth - gap * (columns - 1)) / columns;
  YEAR_LEVELS.forEach((level, index) => {
    const column = Math.floor(index / rows);
    const row = index % rows;
    fillRounded(
      context,
      gridX + column * (cell + gap),
      gridY + row * (cell + gap),
      cell,
      cell,
      2.4,
      heatColor(level, palette)
    );
  });

  ['2월', '3월', '4월', '5월', '6월', '7월'].forEach((label, index) => {
    drawText(context, label, 20 + index * ((width - 40) / 5), 184, 7, 700, palette.text3, index === 5 ? 'right' : 'left');
  });
}

function drawMonth(
  context: CanvasRenderingContext2D,
  width: number,
  palette: ShowcasePalette
): void {
  drawEyebrow(context, '이번 달', 18, 29, palette);
  drawText(context, '7월 · 9회', 18, 48, 14, 800, palette.text);
  fillRounded(context, width - 45, 17, 27, 27, 14, palette.accent);
  drawText(context, '14', width - 31.5, 35, 10, 850, palette.accentInk, 'center');

  const columns = 7;
  const gap = 4;
  const cell = (width - 36 - gap * 6) / columns;
  ['일', '월', '화', '수', '목', '금', '토'].forEach((day, index) => {
    drawText(context, day, 18 + index * (cell + gap) + cell / 2, 78, 8, 800, palette.text3, 'center');
  });
  MONTH_DAYS.forEach((item, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = 18 + column * (cell + gap);
    const y = 88 + row * 27;
    const fill = item.outside ? 'rgba(0,0,0,0)' : item.workout ? palette.accent : palette.surface;
    if (!item.outside) fillRounded(context, x, y, cell, 22, 7, fill);
    if (item.today) strokeRounded(context, x, y, cell, 22, 7, palette.text, 1.2);
    drawText(
      context,
      String(item.day),
      x + cell / 2,
      y + 15,
      8,
      760,
      item.workout ? palette.accentInk : palette.text3,
      'center'
    );
  });
}

function drawBodyParts(
  context: CanvasRenderingContext2D,
  width: number,
  palette: ShowcasePalette
): void {
  drawEyebrow(context, '최근 30일', 18, 29, palette);
  drawText(context, '부위별 운동 시간', 18, 48, 14, 800, palette.text);

  BODY_PARTS.forEach((item, index) => {
    const y = 82 + index * 34;
    drawText(context, item.label, 18, y + 7, 9, 760, palette.text);
    fillRounded(context, 69, y, width - 123, 8, 4, palette.surface);
    fillRounded(context, 69, y, (width - 123) * item.value, 8, 4, palette.accent);
    drawText(context, item.duration, width - 18, y + 7, 9, 760, palette.text, 'right');
  });
}

function drawDetail(
  context: CanvasRenderingContext2D,
  width: number,
  palette: ShowcasePalette
): void {
  drawEyebrow(context, '지난 4주 상세', 20, 27, palette);
  drawText(context, '어떤 운동을 했는지 한눈에', 20, 46, 14, 800, palette.text);
  drawText(context, '12회', width - 20, 39, 15, 850, palette.accent, 'right');

  const columns = 7;
  const gap = 4;
  const cell = (width - 40 - gap * 6) / columns;
  ['일', '월', '화', '수', '목', '금', '토'].forEach((day, index) => {
    drawText(context, day, 20 + index * (cell + gap) + cell / 2, 72, 8, 800, palette.text3, 'center');
  });

  DETAIL_DAYS.forEach((item, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = 20 + column * (cell + gap);
    const y = 80 + row * 27;
    const fill = item.workout ? mixColor('#ffffff', palette.accent, 0.82) : palette.surface;
    fillRounded(context, x, y, cell, 23, 6, fill);
    drawText(context, String(item.day), x + cell / 2, y + 9, 7, 760, item.workout ? palette.accentInk : palette.text3, 'center');
    if (item.label) {
      drawText(context, item.label, x + cell / 2, y + 19, 5.8, 740, palette.accentInk, 'center');
    }
  });
}

function drawNext(
  context: CanvasRenderingContext2D,
  width: number,
  palette: ShowcasePalette
): void {
  drawEyebrow(context, '다음 운동', 18, 28, palette);
  drawText(context, 'Pull', 18, 57, 24, 850, palette.text);
  drawText(context, '등 · 이두 · 45분', 18, 78, 10, 700, palette.text2);
  fillRounded(context, width - 53, 20, 35, 35, 18, palette.accent);
  drawText(context, '▶', width - 35.5, 43, 12, 900, palette.accentInk, 'center');
  fillRounded(context, 18, 111, width - 36, 8, 4, palette.surface);
  fillRounded(context, 18, 111, (width - 36) * 0.66, 8, 4, palette.accent);
  drawText(context, '루틴 진행 2 / 3', 18, 137, 8, 750, palette.text3);
}

function drawStreak(
  context: CanvasRenderingContext2D,
  width: number,
  palette: ShowcasePalette
): void {
  drawEyebrow(context, '연속 운동', 17, 27, palette);
  drawText(context, '12', 17, 80, 39, 900, palette.text);
  drawText(context, '일', 72, 78, 13, 800, palette.text2);
  drawText(context, '이번 주 4회', width - 17, 76, 9, 760, palette.accent, 'right');
  const values = [0.42, 0.72, 0.54, 0.86, 0.48, 1, 0.66];
  values.forEach((value, index) => {
    const x = 17 + index * 20;
    fillRounded(context, x, 126 - value * 24, 10, value * 24, 5, palette.accent);
    drawText(context, ['월', '화', '수', '목', '금', '토', '일'][index], x + 5, 148, 7, 700, palette.text3, 'center');
  });
}

function drawSummary(
  context: CanvasRenderingContext2D,
  width: number,
  palette: ShowcasePalette
): void {
  drawEyebrow(context, '이번 주', 18, 28, palette);
  drawText(context, '4회', 18, 58, 24, 880, palette.text);
  drawText(context, '3h 42m', width - 18, 55, 14, 820, palette.text, 'right');
  drawText(context, '총 운동 시간', width - 18, 72, 8, 700, palette.text3, 'right');
  const values = [0.28, 0.62, 0.36, 0.78, 0.5, 0.92, 0.7];
  const gap = 8;
  const barWidth = (width - 36 - gap * 6) / 7;
  values.forEach((value, index) => {
    const x = 18 + index * (barWidth + gap);
    fillRounded(context, x, 124 - value * 35, barWidth, value * 35, 4, index === 5 ? palette.accent : palette.surface);
    drawText(context, ['월', '화', '수', '목', '금', '토', '일'][index], x + barWidth / 2, 140, 7, 700, palette.text3, 'center');
  });
}

function drawQuick(
  context: CanvasRenderingContext2D,
  width: number,
  palette: ShowcasePalette
): void {
  drawEyebrow(context, '빠른 시작', 17, 27, palette);
  fillRounded(context, width / 2 - 29, 47, 58, 58, 29, palette.accent);
  drawText(context, '▶', width / 2 + 2, 84, 19, 900, palette.accentInk, 'center');
  drawText(context, '운동 시작', width / 2, 132, 13, 850, palette.text, 'center');
  drawText(context, '다음 운동 · Pull', width / 2, 151, 8, 720, palette.text3, 'center');
}

function drawRecent(
  context: CanvasRenderingContext2D,
  width: number,
  palette: ShowcasePalette
): void {
  drawEyebrow(context, '최근 완료', 18, 28, palette);
  drawText(context, 'Push', 18, 57, 22, 860, palette.text);
  drawText(context, '가슴 · 어깨 · 삼두', 18, 77, 9, 700, palette.text2);
  fillRounded(context, width - 78, 21, 60, 28, 14, mixColor(palette.surface, palette.accent, 0.28));
  drawText(context, '완료', width - 48, 39, 9, 850, palette.text, 'center');
  context.fillStyle = palette.border;
  context.fillRect(18, 96, width - 36, 1);
  drawText(context, '운동 시간', 18, 119, 8, 700, palette.text3);
  drawText(context, '1h 08m', 18, 140, 14, 830, palette.text);
  drawText(context, '오늘 08:42', width - 18, 137, 9, 740, palette.text2, 'right');
}

function drawMonthHeat(
  context: CanvasRenderingContext2D,
  width: number,
  palette: ShowcasePalette
): void {
  drawEyebrow(context, '지난 5주', 20, 27, palette);
  drawText(context, '최근 운동 흐름', 20, 47, 14, 820, palette.text);
  drawText(context, '12회 · 총 10h 24m', width - 20, 40, 11, 800, palette.accent, 'right');
  const columns = 7;
  const rows = 5;
  const gap = 5;
  const cellWidth = (width - 40 - gap * (columns - 1)) / columns;
  ['일', '월', '화', '수', '목', '금', '토'].forEach((day, index) => {
    drawText(context, day, 20 + index * (cellWidth + gap) + cellWidth / 2, 69, 7, 750, palette.text3, 'center');
  });
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const level = YEAR_LEVELS[row * columns + column] ?? 0;
      fillRounded(
        context,
        20 + column * (cellWidth + gap),
        78 + row * 24,
        cellWidth,
        19,
        6,
        heatColor(level, palette)
      );
    }
  }
}

function drawSurfaceCard(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  palette: ShowcasePalette
): void {
  fillRounded(context, x, y, width, height, radius, palette.card);
  strokeRounded(context, x, y, width, height, radius, palette.border, 1);
}

function drawHeroSurface(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  palette: ShowcasePalette
): void {
  const gradient = context.createLinearGradient(
    x + width * 0.39,
    y,
    x + width * 0.61,
    y + height
  );
  gradient.addColorStop(0, palette.heroStart);
  gradient.addColorStop(1, palette.heroEnd);
  fillRounded(context, x, y, width, height, 24, gradient);
  strokeRounded(context, x, y, width, height, 24, palette.border, 1);
}

function drawPhoneStatusBar(
  context: CanvasRenderingContext2D,
  width: number,
  palette: ShowcasePalette
): void {
  drawText(context, '9:41', 28, 31, 10, 800, palette.text);

  const statusRightInset = 28;
  const statusIconGap = 8;
  const batteryWidth = 19;
  const batteryX = width - statusRightInset - batteryWidth - 2;
  const wifiCenterX = batteryX - statusIconGap - 7;
  const signalX = wifiCenterX - 7 - statusIconGap - 14;

  context.save();
  context.fillStyle = palette.text;
  [4, 6, 8, 10].forEach((barHeight, index) => {
    fillRounded(context, signalX + index * 4, 29 - barHeight, 2.5, barHeight, 1.2, palette.text);
  });
  context.strokeStyle = palette.text;
  context.lineWidth = 1.4;
  context.lineCap = 'round';
  context.beginPath();
  context.arc(wifiCenterX, 27, 7, Math.PI * 1.16, Math.PI * 1.84);
  context.stroke();
  context.beginPath();
  context.arc(wifiCenterX, 28, 3.8, Math.PI * 1.16, Math.PI * 1.84);
  context.stroke();
  context.beginPath();
  context.arc(wifiCenterX, 28.5, 0.8, 0, Math.PI * 2);
  context.fill();
  strokeRounded(context, batteryX, 21, batteryWidth, 10, 3, palette.text, 1.2);
  fillRounded(context, batteryX + 2, 23, batteryWidth - 5, 6, 1.5, palette.text);
  fillRounded(context, batteryX + batteryWidth + 1, 24, 1.5, 4, 0.7, palette.text);
  context.restore();

  // The imported camera lenses render below this texture. Overscan the
  // capsule slightly so the complete Dynamic Island remains a single shape.
  fillRounded(context, width / 2 - 60, 9, 120, 31, 15.5, '#050506');
}

function drawPhoneButton(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  palette: ShowcasePalette,
  variant: 'accent' | 'neutral' = 'accent'
): void {
  const fill = variant === 'accent' ? palette.accent : palette.surface;
  const color = variant === 'accent' ? palette.accentInk : palette.text2;
  fillRounded(context, x, y, width, height, 16, fill);
  drawText(context, label, x + width / 2, y + height / 2 + 5.5, 14, 800, color, 'center');
}

function drawPhoneTabIcon(
  context: CanvasRenderingContext2D,
  kind: 'home' | 'records' | 'dashboard' | 'settings',
  x: number,
  y: number,
  color: string
): void {
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 1.5;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  if (kind === 'home') {
    context.beginPath();
    context.moveTo(x - 7, y);
    context.lineTo(x, y - 6);
    context.lineTo(x + 7, y);
    context.lineTo(x + 5.5, y + 7);
    context.lineTo(x + 1.5, y + 7);
    context.lineTo(x + 1.5, y + 2);
    context.lineTo(x - 1.5, y + 2);
    context.lineTo(x - 1.5, y + 7);
    context.lineTo(x - 5.5, y + 7);
    context.closePath();
    context.stroke();
  } else if (kind === 'records') {
    [-5, 0, 5].forEach((offset) => {
      context.beginPath();
      context.arc(x - 6, y + offset, 1, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.moveTo(x - 2, y + offset);
      context.lineTo(x + 7, y + offset);
      context.stroke();
    });
  } else if (kind === 'dashboard') {
    fillRounded(context, x - 7, y + 1, 3, 6, 1.5, color);
    fillRounded(context, x - 1.5, y - 6, 3, 13, 1.5, color);
    fillRounded(context, x + 4, y - 2, 3, 9, 1.5, color);
  } else {
    context.beginPath();
    context.arc(x, y, 6.5, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.arc(x, y, 2.2, 0, Math.PI * 2);
    context.stroke();
    [0, Math.PI / 2, Math.PI, Math.PI * 1.5].forEach((angle) => {
      context.beginPath();
      context.moveTo(x + Math.cos(angle) * 7.5, y + Math.sin(angle) * 7.5);
      context.lineTo(x + Math.cos(angle) * 9, y + Math.sin(angle) * 9);
      context.stroke();
    });
  }
  context.restore();
}

function drawPhoneTabBar(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: ShowcasePalette
): void {
  const top = height - 73;
  context.fillStyle = palette.nav;
  context.fillRect(0, top, width, height - top);
  context.fillStyle = palette.navBorder;
  context.fillRect(0, top, width, 1);
  const tabs = [
    ['home', '홈'],
    ['records', '기록'],
    ['dashboard', '대시보드'],
    ['settings', '설정'],
  ] as const;
  tabs.forEach(([kind, label], index) => {
    const x = width * ((index + 0.5) / tabs.length);
    const color = index === 0 ? palette.accent : palette.textFaint;
    drawPhoneTabIcon(context, kind, x, top + 22, color);
    drawText(context, label, x, top + 48, 7, 700, color, 'center');
  });
  fillRounded(context, width / 2 - 48, height - 8, 96, 4, 2, palette.text);
}

function drawPhoneStats(
  context: CanvasRenderingContext2D,
  y: number,
  width: number,
  palette: ShowcasePalette
): void {
  const gap = 12;
  const tileWidth = (width - 40 - gap) / 2;
  const tiles = [
    ['이번 주', '4회'],
    ['총 운동 시간', '41시간 20분'],
  ];
  tiles.forEach(([label, value], index) => {
    const x = 20 + index * (tileWidth + gap);
    drawSurfaceCard(context, x, y, tileWidth, 78, 16, palette);
    drawText(context, label, x + 16, y + 26, 10, 700, palette.text3);
    drawText(context, value, x + 16, y + 57, index === 0 ? 24 : 18, 800, palette.text);
  });
}

function drawPhoneWeekCard(
  context: CanvasRenderingContext2D,
  y: number,
  width: number,
  palette: ShowcasePalette
): void {
  drawSurfaceCard(context, 20, y, width - 40, 110, 16, palette);
  drawText(context, '최근 7일', 36, y + 25, 10, 700, palette.text3);
  drawText(context, '더보기', width - 36, y + 25, 10, 700, palette.text3, 'right');
  const gap = 5;
  const cellWidth = (width - 72 - gap * 6) / 7;
  WEEK.forEach((item, index) => {
    const x = 36 + index * (cellWidth + gap);
    drawText(context, item.day, x + cellWidth / 2, y + 48, 7, 700, palette.textFaint, 'center');
    fillRounded(context, x, y + 58, cellWidth, 30, 5, heatColor(item.level, palette));
  });
}

function drawPhoneRecentRecord(
  context: CanvasRenderingContext2D,
  y: number,
  width: number,
  palette: ShowcasePalette
): void {
  drawText(context, '최근 기록', 20, y + 12, 12, 800, palette.text);
  drawText(context, '전체보기', width - 20, y + 12, 10, 700, palette.text3, 'right');
  drawSurfaceCard(context, 20, y + 23, width - 40, 61, 16, palette);
  drawText(context, 'Push', 36, y + 47, 12, 800, palette.text);
  strokeRounded(context, 76, y + 35, 30, 16, 4, palette.borderStrong, 1);
  drawText(context, '루틴', 91, y + 46.5, 7, 700, palette.textFaint, 'center');
  drawText(context, '7월 14일 (화)', 36, y + 68, 9, 600, palette.text3);
  drawText(context, '1시간 8분', width - 36, y + 48, 11, 800, palette.accent, 'right');
  drawText(context, '완료', width - 36, y + 68, 9, 700, palette.text3, 'right');
}

function drawPhoneBefore(
  context: CanvasRenderingContext2D,
  width: number,
  palette: ShowcasePalette
): void {
  drawText(context, '7월 14일 화요일', 20, 65, 10, 600, palette.text3);
  drawText(context, '오늘은 당기는 날', 20, 91, 22, 800, palette.text);

  drawHeroSurface(context, 20, 107, width - 40, 214, palette);
  fillRounded(context, 40, 129, 7, 7, 4, palette.accent);
  drawText(context, '다음 운동', 55, 137, 10, 700, palette.text3);
  drawText(context, 'Pull', 40, 181, 42, 800, palette.text);
  drawText(context, '등 · 이두', 40, 205, 14, 600, palette.text3);
  drawPhoneButton(context, 40, 222, width - 80, 47, '운동 시작', palette);
  drawText(context, '다른 운동 선택 →', 40, 298, 14, 700, palette.text3);

  drawPhoneStats(context, 341, width, palette);
  drawPhoneWeekCard(context, 439, width, palette);
  drawPhoneRecentRecord(context, 570, width, palette);
}

function drawPhoneCompleted(
  context: CanvasRenderingContext2D,
  width: number,
  palette: ShowcasePalette
): void {
  drawText(context, '7월 14일 화요일', 20, 65, 10, 600, palette.text3);
  drawText(context, '푸시 완료, 올라잇!', 20, 91, 22, 800, palette.text);

  drawHeroSurface(context, 20, 107, width - 40, 224, palette);
  fillRounded(context, 40, 127, 30, 30, 15, palette.accent);
  drawText(context, '✓', 55, 148, 15, 900, palette.accentInk, 'center');
  drawText(context, '오늘 운동 완료', 80, 148, 16, 800, palette.text);
  drawText(context, '가슴 · 어깨 · 삼두', 40, 183, 22, 800, palette.text);

  drawText(context, '운동 시간', 40, 207, 10, 700, palette.text3);
  drawText(context, '1시간 8분', 40, 229, 18, 800, palette.accent);
  drawText(context, '시간대', 184, 207, 10, 700, palette.text3);
  drawText(context, '오전 7:34 – 8:42', 184, 229, 12, 700, palette.text2);
  context.fillStyle = palette.border;
  context.fillRect(40, 249, width - 80, 1);
  drawText(context, '다음 운동', 40, 276, 11, 700, palette.text3);
  drawText(context, 'Pull', width - 40, 276, 15, 800, palette.text, 'right');

  drawPhoneStats(context, 351, width, palette);
  drawPhoneWeekCard(context, 449, width, palette);
  drawPhoneRecentRecord(context, 580, width, palette);
}

function drawPhoneActive(
  context: CanvasRenderingContext2D,
  width: number,
  palette: ShowcasePalette
): void {
  fillRounded(context, width / 2 - 48, 185, 7, 7, 4, palette.accent);
  drawText(context, '운동 중', width / 2 - 33, 193, 11, 800, palette.accent);
  drawText(context, '등 · 이두', width / 2, 230, 22, 800, palette.text, 'center');
  drawText(context, '42:10', width / 2, 309, 68, 800, palette.text, 'center');
  drawText(context, '시작 오전 7:34', width / 2, 337, 11, 600, palette.text3, 'center');
  fillRounded(context, width / 2 - 55, 360, 110, 36, 18, palette.surface);
  strokeRounded(context, width / 2 - 55, 360, 110, 36, 18, palette.borderStrong, 1);
  drawText(context, '운동 수정', width / 2, 383, 11, 700, palette.text2, 'center');

  drawPhoneButton(context, 20, 538, width - 40, 54, '운동 종료', palette);
  drawText(context, '운동 취소', width / 2, 628, 12, 800, palette.danger, 'center');
}

function drawPhone(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: ShowcaseState,
  palette: ShowcasePalette
): void {
  context.clearRect(0, 0, width, height);
  context.fillStyle = palette.screen;
  context.fillRect(0, 0, width, height);
  context.save();
  context.beginPath();
  context.rect(0, 0, width, height);
  context.clip();

  if (state.phase === 'active') {
    drawPhoneActive(context, width, palette);
  } else if (state.phase === 'completed') {
    drawPhoneCompleted(context, width, palette);
  } else {
    drawPhoneBefore(context, width, palette);
  }
  drawPhoneTabBar(context, width, height, palette);
  drawPhoneStatusBar(context, width, palette);
  context.restore();
}

function drawLockWorkoutCircle(
  context: CanvasRenderingContext2D,
  width: number,
  palette: ShowcasePalette
): void {
  drawText(context, '다음', width / 2, 26, 8, 760, palette.text3, 'center');
  drawText(context, 'Pull', width / 2, 51, 17, 850, palette.text, 'center');
  fillRounded(context, width / 2 - 19, 61, 38, 17, 8.5, palette.accent);
  drawText(context, '시작', width / 2, 73, 7, 850, palette.accentInk, 'center');
}

function drawLockWeekCircle(
  context: CanvasRenderingContext2D,
  width: number,
  palette: ShowcasePalette
): void {
  const center = width / 2;
  context.save();
  context.lineCap = 'round';
  context.lineWidth = 7;
  context.strokeStyle = palette.surface;
  context.beginPath();
  context.arc(center, center, 32, -Math.PI / 2, Math.PI * 1.5);
  context.stroke();
  context.strokeStyle = palette.accent;
  context.beginPath();
  context.arc(center, center, 32, -Math.PI / 2, Math.PI * 0.65);
  context.stroke();
  context.restore();
  drawText(context, '4회', center, 49, 16, 850, palette.text, 'center');
  drawText(context, '최근 7일', center, 63, 7, 760, palette.text3, 'center');
}

function drawLockWorkoutRect(
  context: CanvasRenderingContext2D,
  width: number,
  palette: ShowcasePalette
): void {
  drawEyebrow(context, '잠금 화면 · 다음 운동', 13, 22, palette, true);
  drawText(context, 'Pull', 13, 49, 20, 850, palette.text);
  drawText(context, '등 · 이두  45분', 13, 66, 8, 650, palette.text2);
  fillRounded(context, width - 42, 39, 28, 28, 14, palette.accent);
  drawText(context, '▶', width - 28, 58, 9, 850, palette.accentInk, 'center');
  drawText(context, '탭하여 시작', 13, 88, 7, 720, palette.text3);
}

function drawLockRoutineRect(
  context: CanvasRenderingContext2D,
  width: number,
  palette: ShowcasePalette
): void {
  drawEyebrow(context, '잠금 화면 · 루틴 진행', 13, 22, palette);
  const items = [
    ['Push', '어제'],
    ['Pull', '오늘'],
    ['Legs', '3일 전'],
  ];
  const columnWidth = (width - 26) / items.length;
  items.forEach(([name, relativeDate], index) => {
    const center = 13 + columnWidth * (index + 0.5);
    const current = index === 1;
    drawText(context, name, center, 51, 10, 820, current ? palette.accent : palette.text2, 'center');
    drawText(context, relativeDate, center, 69, 7, 700, palette.text3, 'center');
    if (current) fillRounded(context, center - 10, 80, 20, 3, 1.5, palette.accent);
  });
}

function renderSurface(
  context: CanvasRenderingContext2D,
  spec: ShowcaseCardSpec,
  state: ShowcaseState
): void {
  const palette = paletteFor(state);
  const designSize = SURFACE_DESIGN_SIZE[spec.kind];
  context.save();
  context.scale(spec.width / designSize.width, spec.height / designSize.height);
  if (spec.kind === 'phone') {
    drawPhone(context, designSize.width, designSize.height, state, palette);
    context.restore();
    return;
  }

  drawCardBase(context, designSize.width, designSize.height);
  switch (spec.kind) {
    case 'workout':
      drawWorkout(context, designSize.width, designSize.height, state, palette);
      break;
    case 'week':
      drawWeek(context, designSize.width, palette);
      break;
    case 'routine':
      drawRoutine(context, designSize.width, palette);
      break;
    case 'year':
      drawYear(context, designSize.width, palette);
      break;
    case 'month':
      drawMonth(context, designSize.width, palette);
      break;
    case 'body':
      drawBodyParts(context, designSize.width, palette);
      break;
    case 'detail':
      drawDetail(context, designSize.width, palette);
      break;
    case 'next':
      drawNext(context, designSize.width, palette);
      break;
    case 'streak':
      drawStreak(context, designSize.width, palette);
      break;
    case 'summary':
      drawSummary(context, designSize.width, palette);
      break;
    case 'quick':
      drawQuick(context, designSize.width, palette);
      break;
    case 'recent':
      drawRecent(context, designSize.width, palette);
      break;
    case 'monthHeat':
      drawMonthHeat(context, designSize.width, palette);
      break;
    case 'lockWorkoutCircle':
      drawLockWorkoutCircle(context, designSize.width, palette);
      break;
    case 'lockWeekCircle':
      drawLockWeekCircle(context, designSize.width, palette);
      break;
    case 'lockWorkoutRect':
      drawLockWorkoutRect(context, designSize.width, palette);
      break;
    case 'lockRoutineRect':
      drawLockRoutineRect(context, designSize.width, palette);
      break;
  }
  context.restore();
}

export function createCardSurface(
  spec: ShowcaseCardSpec,
  initialState: ShowcaseState,
  anisotropy: number
): CardSurface {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(spec.width * TEXTURE_SCALE);
  canvas.height = Math.round(spec.height * TEXTURE_SCALE);
  const context = canvas.getContext('2d');
  if (!context) throw new Error(`2D canvas context를 만들 수 없습니다: ${spec.id}`);

  const redraw = (state: ShowcaseState): void => {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(TEXTURE_SCALE, 0, 0, TEXTURE_SCALE, 0, 0);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    renderSurface(context, spec, state);
  };

  redraw(initialState);
  const texture = new CanvasTexture(canvas);
  texture.name = `${spec.id}-surface`;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = anisotropy;
  texture.magFilter = LinearFilter;
  texture.minFilter = spec.kind === 'phone' ? LinearFilter : LinearMipmapLinearFilter;
  texture.generateMipmaps = spec.kind !== 'phone';

  return {
    canvas,
    texture,
    redraw(state) {
      redraw(state);
      texture.needsUpdate = true;
    },
    dispose() {
      texture.dispose();
    },
  };
}
