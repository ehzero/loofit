export type HomeMessagePhase = 'before' | 'after';

export type HomeMessageTarget = 'chest' | 'back' | 'legs' | 'cardio' | 'default';

const HOME_MESSAGES: Record<HomeMessagePhase, Record<HomeMessageTarget, string[]>> = {
  before: {
    default: [
      '무게보다 중요한 건 다시 온 것',
      '오늘의 드레스코드는 운동복',
      '클럽보다 헬스클럽',
      '프로틴보다 중요한 건 꾸준함',
      '헬스장에 간 내가 이긴 날',
      '중량보다 중요한 건 재등장',
      '헬스장 문턱 넘은 순간 승리',
      '회원권이 흐뭇해지는 날',
      '오늘도 근손실과 거리두기',
      '근손실 출입금지',
      '오운완은 일단 출석부터',
      '오늘도 방향은 헬스장',
      '가볍게 가도 루틴은 루틴',
      '헬스클럽 입장 준비 완료',
      '올라잇, 오늘도 가보자',
    ],
    chest: [
      '오늘은 밀어붙이는 날',
      '가슴이 시킨 일입니다',
      '푸시는 오늘도 정직하게',
      '오늘의 밀기는 꽤 진심',
      '바벨과 가슴의 대화 시간',
    ],
    back: [
      '불금보다 등요일',
      '오늘은 당기는 날',
      '등은 조용히 넓어지는 중',
      '등요일은 배신하지 않아요',
      '오늘은 등이 주인공',
    ],
    legs: [
      '하체는 배신하지 않아요',
      '계단이 알아보는 날',
      '오늘은 다리가 말하는 날',
      '하체한 날엔 이미 이긴 날',
      '스쿼트와 평화 협정 준비',
    ],
    cardio: [
      '비트 대신 심박수',
      '러닝머신 위에서도 앞으로',
      '오늘은 숨이 리듬을 만들어요',
      '심박수 올릴 준비 완료',
      '유산소도 충분히 멋진 운동',
    ],
  },
  after: {
    default: [
      '오운완!',
      '근손실 방어 성공',
      '오늘도 근손실을 막았어요',
      '올라잇!',
      '클럽보다 헬스클럽',
      '무게보다 중요한 건 다시 온 것',
      '오늘도 바벨과 평화 협정',
      '프로틴보다 중요한 건 꾸준함',
      '헬스장에 간 내가 이긴 날',
      '오늘의 드레스코드는 운동복',
      '쇠질은 배신하지 않아요',
      '근손실은 오늘도 실패',
      '오늘도 근육에게 안부 인사',
      '회원권이 흐뭇해하는 날',
      '오운완, 이 맛에 합니다',
      '오늘도 몸은 기억할 거예요',
      '근성장 쪽으로 한 칸',
      '오늘의 승자는 나',
      '가볍게 와서 묵직하게 해냈어요',
      '헬스클럽 입장값 회수',
    ],
    chest: [
      '가슴이 시킨 일, 잘 끝냈어요',
      '오늘도 잘 밀어냈어요',
      '푸시 완료, 올라잇!',
      '오늘 가슴은 할 일을 했어요',
      '밀어낸 만큼 단단해지는 중',
    ],
    back: [
      '등요일 임무 완료',
      '오늘 등은 말없이 해냈어요',
      '당긴 만큼 넓어지는 중',
      '불금보다 등요일, 인정',
      '등은 오늘을 기억할 거예요',
    ],
    legs: [
      '하체한 날엔 이미 이긴 날',
      '계단이 오늘을 기억할 거예요',
      '하체는 오늘도 배신하지 않았어요',
      '오늘 다리는 충분히 말했어요',
      '스쿼트와의 협상 종료',
    ],
    cardio: [
      '심박수 올린 내가 이긴 날',
      '숨은 찼고 방향은 맞았어요',
      '러닝머신 위에서도 앞으로 갔어요',
      '유산소도 오운완입니다',
      '오늘의 심박수는 정직했어요',
    ],
  },
};

export function getHomeMessage({
  phase,
  partNames,
  seed,
}: {
  phase: HomeMessagePhase;
  partNames: string[];
  seed?: string;
}): string {
  const target = getHomeMessageTarget(partNames);
  const messages = getMessagePool(phase, target);
  const index =
    seed === undefined
      ? Math.floor(Math.random() * messages.length)
      : positiveHash(`${phase}:${target}:${partNames.join('|')}:${seed}`) % messages.length;
  return messages[index];
}

export function getHomeMessageTarget(partNames: string[]): HomeMessageTarget {
  const text = partNames.join(' ').toLowerCase();

  if (text.includes('하체') || text.includes('legs') || text.includes('leg')) {
    return 'legs';
  }

  if (text.includes('등') || text.includes('pull') || text.includes('back')) {
    return 'back';
  }

  if (text.includes('가슴') || text.includes('push') || text.includes('chest')) {
    return 'chest';
  }

  if (
    text.includes('유산소') ||
    text.includes('cardio') ||
    text.includes('러닝') ||
    text.includes('런닝')
  ) {
    return 'cardio';
  }

  return 'default';
}

function getMessagePool(phase: HomeMessagePhase, target: HomeMessageTarget): string[] {
  const targetMessages = HOME_MESSAGES[phase][target];
  return targetMessages.length > 0 ? targetMessages : HOME_MESSAGES[phase].default;
}

function positiveHash(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }

  return Math.abs(hash);
}
