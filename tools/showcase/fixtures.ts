import type { ShowcasePhase } from './config';

export const WEEK = [
  { day: '화', level: 2 },
  { day: '수', level: 0 },
  { day: '목', level: 3 },
  { day: '금', level: 1 },
  { day: '토', level: 2 },
  { day: '일', level: 0 },
  { day: '월', level: 3 },
] as const;

export const ROUTINE = [
  { title: 'Push', meta: '가슴 · 어깨', when: '3일 전', current: false },
  { title: 'Pull', meta: '등 · 이두', when: '오늘', current: true },
  { title: 'Legs', meta: '하체 · 코어', when: '6일 전', current: false },
] as const;

export const BODY_PARTS = [
  { label: '등', duration: '4h 12m', value: 1 },
  { label: '하체', duration: '3h 05m', value: 0.74 },
  { label: '가슴', duration: '2h 38m', value: 0.63 },
  { label: '어깨', duration: '1h 44m', value: 0.42 },
] as const;

export const YEAR_LEVELS = Array.from({ length: 189 }, (_, index) => {
  const wave = (index * 7 + Math.floor(index / 11) * 3) % 17;
  if (wave === 0 || wave === 3) return 3;
  if (wave === 6 || wave === 9 || wave === 13) return 2;
  if (wave === 2 || wave === 5 || wave === 15) return 1;
  return 0;
});

const workoutDays = new Set([2, 4, 7, 8, 10, 12, 14, 18, 23]);

export const MONTH_DAYS = Array.from({ length: 35 }, (_, index) => {
  const day = index - 1;
  const outside = day < 1 || day > 31;
  return {
    day: outside ? (day < 1 ? 30 + day : day - 31) : day,
    outside,
    today: day === 14,
    workout: workoutDays.has(day),
  };
});

export const DETAIL_DAYS = Array.from({ length: 28 }, (_, index) => {
  const labels = ['가슴', '등', '하체', '어깨', '등·이두', '하체', '가슴'];
  const workout = [1, 3, 6, 8, 11, 14, 16, 19, 21, 24, 26].includes(index);
  return {
    day: index + 17 > 31 ? index - 14 : index + 17,
    label: workout ? labels[index % labels.length] : '',
    workout,
  };
});

export const PHONE_HEAT_LEVELS = Array.from({ length: 35 }, (_, index) => {
  const active = [1, 3, 6, 8, 11, 14, 16, 19, 21, 24, 26, 30, 33];
  return active.includes(index) ? (index % 3) + 1 : 0;
});

export const PHASES: Record<
  ShowcasePhase,
  { eyebrow: string; title: string; meta: string; action: string; count: string; time: string }
> = {
  before: {
    eyebrow: '다음 운동',
    title: 'Pull',
    meta: '등 · 이두',
    action: '운동 시작',
    count: '2 / 3',
    time: '48m',
  },
  active: {
    eyebrow: '운동 중',
    title: '42:10',
    meta: 'Pull · 등 · 이두',
    action: '운동 종료',
    count: '2 / 3',
    time: '42m',
  },
  completed: {
    eyebrow: '운동 완료',
    title: 'Push',
    meta: '1시간 8분 · 저장됨',
    action: '다음 운동 Pull',
    count: '3 / 3',
    time: '1h 08m',
  },
};
