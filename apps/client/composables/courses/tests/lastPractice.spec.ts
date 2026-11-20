import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadLastPracticeForPack } from "../lastPractice";

vi.mock("~/api/practice-state", () => ({
  putLastPracticeApi: vi.fn(async () => ({ success: true })),
  fetchLastPracticeForPack: vi.fn(async () => null),
}));

const STORAGE_KEY = "earthwormLastPracticeV1";

describe("lastPractice legacy CET migration", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("maps an old 50-sentence course cached position to the new one-sentence course", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        "cet4-500:cet4-500_c01": {
          coursePackId: "cet4-500",
          courseId: "cet4-500_c01",
          mode: "chinese_to_english",
          difficulty: "beginner",
          splitMode: "sentence_only",
          stages: [],
          statementIndex: 14,
          updatedAt: 1,
        },
      }),
    );

    const last = await loadLastPracticeForPack("cet4-500");

    expect(last?.courseId).toBe("cet4-500_c015");
    expect(last?.statementIndex).toBe(0);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored["cet4-500:cet4-500_c015"]).toBeTruthy();
    expect(stored["cet4-500:cet4-500_c01"]).toBeUndefined();
  });

  it("leaves already-migrated three-digit course ids alone", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        "cet6-500:cet6-500_c397": {
          coursePackId: "cet6-500",
          courseId: "cet6-500_c397",
          mode: "dictation",
          difficulty: "intermediate",
          splitMode: "word_first",
          stages: ["phrase"],
          statementIndex: 0,
          updatedAt: 1,
        },
      }),
    );

    const last = await loadLastPracticeForPack("cet6-500");
    expect(last?.courseId).toBe("cet6-500_c397");
  });
});
