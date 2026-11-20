import { defineStore } from "pinia";
import { computed, ref } from "vue";

import type {
  ReviewCard,
  ReviewGrade,
  ReviewSignals,
  ReviewSubmitResult,
  ReviewSummary,
} from "~/types/models/review";
import {
  fetchDueReviewCards,
  fetchReviewSummary,
  postReviewGraduate,
  postReviewSubmit,
} from "~/api/review";
import { isAuthenticated } from "~/services/auth";

export const GRADE_LABELS: Record<ReviewGrade, string> = {
  again: "忘记了",
  hard: "有点难",
  good: "记得",
  easy: "很熟",
};

export const useReviewStore = defineStore("review", () => {
  const summary = ref<ReviewSummary>({ total: 0, due: 0, graduated: 0, learning: 0 });
  const cards = ref<ReviewCard[]>([]);
  const currentIndex = ref(0);
  const isLoading = ref(false);
  const lastResult = ref<ReviewSubmitResult | null>(null);

  const currentCard = computed(() => cards.value[currentIndex.value] ?? null);
  const isFinished = computed(
    () => cards.value.length > 0 && currentIndex.value >= cards.value.length,
  );
  const progress = computed(() =>
    cards.value.length === 0 ? 0 : Math.round((currentIndex.value / cards.value.length) * 100),
  );

  async function load(coursePackId: string, limit = 20) {
    if (!isAuthenticated()) return;
    isLoading.value = true;
    try {
      const [nextSummary, nextCards] = await Promise.all([
        fetchReviewSummary(coursePackId),
        fetchDueReviewCards(coursePackId, limit),
      ]);
      summary.value = nextSummary;
      cards.value = nextCards;
      currentIndex.value = 0;
      lastResult.value = null;
    } finally {
      isLoading.value = false;
    }
  }

  async function refreshSummary(coursePackId: string) {
    if (!isAuthenticated()) return;
    summary.value = await fetchReviewSummary(coursePackId);
  }

  /** 提交行为信号，由服务端按 FSRS 排下一次（不自动翻页，由页面控制） */
  async function submit(signals: ReviewSignals) {
    const card = currentCard.value;
    if (!card) return undefined;

    const result = await postReviewSubmit(card.id, signals);
    lastResult.value = result;
    return result;
  }

  async function graduate() {
    const card = currentCard.value;
    if (!card) return;
    await postReviewGraduate(card.id);
  }

  function skip() {
    currentIndex.value += 1;
  }

  function reset() {
    cards.value = [];
    currentIndex.value = 0;
    lastResult.value = null;
  }

  return {
    summary,
    cards,
    currentIndex,
    currentCard,
    isFinished,
    progress,
    isLoading,
    lastResult,
    load,
    refreshSummary,
    submit,
    graduate,
    skip,
    reset,
  };
});
