import { Rating, State } from "ts-fsrs";

import {
  GRADUATE_SCHEDULED_DAYS,
  newCardState,
  scheduleCard,
  signalsToRating,
  toFsrsCard,
} from "../review.fsrs";

describe("signalsToRating", () => {
  it("跳过 -> Again", () => {
    expect(signalsToRating({ skipped: true })).toBe(Rating.Again);
  });

  it("首答错误 -> Again", () => {
    expect(signalsToRating({ firstAttemptCorrect: false })).toBe(Rating.Again);
  });

  it("看了答案：默认算错 -> Again", () => {
    expect(signalsToRating({ firstAttemptCorrect: true, showFullAnswer: 1 })).toBe(Rating.Again);
  });

  it("看了答案但设置里不算错 -> Hard", () => {
    expect(
      signalsToRating(
        { firstAttemptCorrect: true, showFullAnswer: 1 },
        { countShownAnswerAsError: false },
      ),
    ).toBe(Rating.Hard);
  });

  it("重试达到阈值 -> Again，未达阈值 -> Hard", () => {
    expect(signalsToRating({ firstAttemptCorrect: true, attemptCount: 3 })).toBe(Rating.Again);
    expect(signalsToRating({ firstAttemptCorrect: true, attemptCount: 2 })).toBe(Rating.Hard);
    expect(
      signalsToRating({ firstAttemptCorrect: true, attemptCount: 3 }, { wrongRoundsThreshold: 5 }),
    ).toBe(Rating.Hard);
  });

  it("错字多 -> Hard", () => {
    expect(signalsToRating({ firstAttemptCorrect: true, typoCount: 2 })).toBe(Rating.Hard);
  });

  it("反复听 / 用了提示 -> Hard", () => {
    expect(signalsToRating({ firstAttemptCorrect: true, audioPlayCount: 3 })).toBe(Rating.Hard);
    expect(signalsToRating({ firstAttemptCorrect: true, showWordHint: 1 })).toBe(Rating.Hard);
  });

  it("一次答对且无提示 -> Good", () => {
    expect(signalsToRating({ firstAttemptCorrect: true, attemptCount: 1 })).toBe(Rating.Good);
  });

  it("不会自动给出 Easy", () => {
    const all = [
      {},
      { firstAttemptCorrect: true },
      { firstAttemptCorrect: true, attemptCount: 1, audioPlayCount: 0 },
    ];
    for (const signals of all) {
      expect(signalsToRating(signals)).not.toBe(Rating.Easy);
    }
  });
});

describe("scheduleCard", () => {
  const fresh = () => ({
    ...newCardState(new Date()),
    dueAt: new Date(),
  });

  it("新卡答对后进入 Learning/Review 并排到未来", () => {
    const before = fresh();
    expect(before.state).toBe(State.New);

    const after = scheduleCard(before, Rating.Good, new Date());
    expect(after.reps).toBe(1);
    expect(after.dueAt.getTime()).toBeGreaterThan(Date.now() - 1000);
    expect([State.Learning, State.Review]).toContain(after.state);
  });

  it("Again 不会排到很远", () => {
    const learned = scheduleCard(fresh(), Rating.Good, new Date());
    const after = scheduleCard({ ...learned, dueAt: new Date() }, Rating.Again, new Date());

    expect(after.reps).toBeGreaterThan(learned.reps);
    expect(after.scheduledDays).toBeLessThan(GRADUATE_SCHEDULED_DAYS);
    expect(after.dueAt.getTime()).toBeLessThan(Date.now() + 2 * 24 * 60 * 60 * 1000);
  });

  it("卡片进入 Review 后遗忘才累计 lapses", () => {
    let row = { ...scheduleCard(fresh(), Rating.Good, new Date()), dueAt: new Date() };

    // 连续答对直到进入 Review 状态
    for (let i = 0; i < 8 && row.state !== State.Review; i++) {
      row = { ...scheduleCard(row, Rating.Good, new Date()), dueAt: new Date() };
    }

    expect(row.state).toBe(State.Review);

    const after = scheduleCard(row, Rating.Again, new Date());
    expect(after.lapses).toBe(row.lapses + 1);
    expect(after.state).toBe(State.Relearning);
  });

  it("连续 Good 会把间隔拉长", () => {
    let row = { ...scheduleCard(fresh(), Rating.Good, new Date()), dueAt: new Date() };
    const first = row.scheduledDays;

    for (let i = 0; i < 3; i++) {
      row = { ...scheduleCard(row, Rating.Good, new Date()), dueAt: new Date() };
    }

    expect(row.scheduledDays).toBeGreaterThan(first);
  });

  it("toFsrsCard 能还原已复习过的卡", () => {
    const card = scheduleCard(fresh(), Rating.Good, new Date());
    const restored = toFsrsCard(card);
    expect(restored.stability).toBe(card.stability);
    expect(restored.reps).toBe(card.reps);
  });
});
