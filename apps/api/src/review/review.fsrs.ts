import type { Card, Grade } from "ts-fsrs";

import { createEmptyCard, fsrs, generatorParameters, Rating, State } from "ts-fsrs";

/** 间隔达到这个天数就视为「毕业」，不再进队列 */
export const GRADUATE_SCHEDULED_DAYS = 21;

const scheduler = fsrs(generatorParameters({ enable_fuzz: false }));

/**
 * 复习作答时采集的行为信号（对齐 julebu 的 submitReview 入参）。
 * 注意：不提供手动「忘记/记得」按钮，评分由信号推导。
 */
export interface ReviewSignals {
  skipped?: boolean;
  firstAttemptCorrect?: boolean;
  attemptCount?: number;
  showFullAnswer?: number;
  showWordHint?: number;
  typoCount?: number;
  audioPlayCount?: number;
}

export interface RatingOptions {
  /** 看了答案是否算错（默认 true） */
  countShownAnswerAsError?: boolean;
  /** 错几轮算错题（默认 3） */
  wrongRoundsThreshold?: number;
}

/**
 * 行为信号 -> FSRS 评分。
 * 只看「有没有真的想起来」，不做主观打分：
 * - 跳过 / 首答错  -> Again
 * - 看答案（且设置里算错）/ 错过 N 轮 -> Again
 * - 靠提示 / 多次重试 / 反复听 -> Hard
 * - 一次答对且无提示 -> Good
 * Easy 不自动给出，避免虚高排期。
 */
export function signalsToRating(signals: ReviewSignals, options: RatingOptions = {}): Grade {
  const wrongRounds = options.wrongRoundsThreshold ?? 3;
  const countShownAnswerAsError = options.countShownAnswerAsError ?? true;

  if (signals.skipped) return Rating.Again as Grade;
  if (signals.firstAttemptCorrect === false) return Rating.Again as Grade;

  const shownAnswer = signals.showFullAnswer ?? 0;
  if (countShownAnswerAsError && shownAnswer > 0) return Rating.Again as Grade;
  if ((signals.attemptCount ?? 1) >= wrongRounds) return Rating.Again as Grade;

  if (shownAnswer > 0) return Rating.Hard as Grade;
  if ((signals.typoCount ?? 0) >= 2) return Rating.Hard as Grade;
  if ((signals.attemptCount ?? 1) >= 2) return Rating.Hard as Grade;
  if ((signals.showWordHint ?? 0) > 0) return Rating.Hard as Grade;
  if ((signals.audioPlayCount ?? 0) >= 3) return Rating.Hard as Grade;

  return Rating.Good as Grade;
}

export function ratingLabel(rating: Grade) {
  switch (rating) {
    case Rating.Again:
      return "again";
    case Rating.Hard:
      return "hard";
    case Rating.Good:
      return "good";
    default:
      return "easy";
  }
}

export interface ReviewCardRow {
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: number;
  dueAt: Date;
  lastReviewAt: Date | null;
}

/** 数据库行 -> FSRS Card */
export function toFsrsCard(row: ReviewCardRow, fallbackNow = new Date()): Card {
  if (row.reps === 0 && row.stability === 0 && row.state === State.New) {
    const empty = createEmptyCard(fallbackNow);
    return { ...empty, due: row.dueAt ?? empty.due };
  }

  return {
    due: row.dueAt,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsedDays,
    scheduled_days: row.scheduledDays,
    learning_steps: row.learningSteps ?? 0,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as State,
    last_review: row.lastReviewAt ?? undefined,
  };
}

/** FSRS Card -> 可写入数据库的字段 */
export function fromFsrsCard(card: Card) {
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps ?? 0,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    dueAt: card.due,
    lastReviewAt: card.last_review ?? new Date(),
    graduated: card.state === State.Review && card.scheduled_days >= GRADUATE_SCHEDULED_DAYS,
  };
}

/** 用一次评分推进卡片 */
export function scheduleCard(row: ReviewCardRow, rating: Grade, now = new Date()) {
  const card = toFsrsCard(row, now);
  const { card: next } = scheduler.next(card, now, rating);
  return fromFsrsCard(next);
}

/** 新卡（入队时） */
export function newCardState(now = new Date()) {
  const empty = createEmptyCard(now);
  return {
    stability: empty.stability,
    difficulty: empty.difficulty,
    elapsedDays: empty.elapsed_days,
    scheduledDays: empty.scheduled_days,
    learningSteps: empty.learning_steps ?? 0,
    reps: empty.reps,
    lapses: empty.lapses,
    state: empty.state,
    dueAt: empty.due,
    lastReviewAt: null as Date | null,
    graduated: false,
  };
}
