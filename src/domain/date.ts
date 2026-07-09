export function toLocalDateKey(date: Date | string): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addLocalDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function getRecentDateKeys(days: number, now = new Date()): string[] {
  const today = startOfLocalDay(now);
  return Array.from({ length: days }, (_, index) => {
    const offset = index - days + 1;
    return toLocalDateKey(addLocalDays(today, offset));
  });
}

export function getWeekStart(now = new Date()): Date {
  const start = startOfLocalDay(now);
  const day = start.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addLocalDays(start, mondayOffset);
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}시간 ${minutes}분`;
  }
  if (minutes > 0) {
    return `${minutes}분`;
  }
  return `${remainingSeconds}초`;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export function weekdayLabel(date: Date | string): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  return WEEKDAYS[value.getDay()];
}

/** MM:SS, or H:MM:SS once an hour has elapsed. Used by the running timer. */
export function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (n: number) => `${n}`.padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`;
}

/** e.g. "오후 7:24" */
export function formatClock(date: Date | string): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  const hours = value.getHours();
  const meridiem = hours < 12 ? '오전' : '오후';
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${meridiem} ${displayHour}:${`${value.getMinutes()}`.padStart(2, '0')}`;
}

/** e.g. "7월 9일 (수)" */
export function formatDateK(date: Date | string): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  return `${value.getMonth() + 1}월 ${value.getDate()}일 (${weekdayLabel(value)})`;
}

/** e.g. "7월 9일 수요일" */
export function formatDateFull(date: Date | string): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  return `${value.getMonth() + 1}월 ${value.getDate()}일 ${weekdayLabel(value)}요일`;
}

export function getEndOfLocalDay(date: Date): Date {
  const end = startOfLocalDay(date);
  end.setDate(end.getDate() + 1);
  end.setMilliseconds(end.getMilliseconds() - 1);
  return end;
}
