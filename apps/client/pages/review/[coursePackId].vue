<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold dark:text-gray-100">复习</h1>
      <div class="flex items-center gap-4">
        <button
          class="text-sm text-gray-500 hover:text-purple-500"
          @click="settingsModal?.open()"
        >
          设置
        </button>
        <NuxtLink
          :to="`/course-pack/${coursePackId}`"
          class="text-sm text-gray-500 hover:text-purple-500"
        >
          返回课程列表
        </NuxtLink>
      </div>
    </div>

    <ModeReviewSettingsModal
      ref="settingsModal"
      @saved="handleSettingsSaved"
    />

    <div
      v-if="reviewStore.isLoading"
      class="py-16 text-center text-gray-500"
    >
      加载中…
    </div>

    <template v-else>
      <!-- 空态 -->
      <div
        v-if="!reviewStore.currentCard && !reviewStore.isFinished"
        class="flex flex-col items-center gap-4 py-16"
      >
        <div class="text-lg text-gray-600 dark:text-gray-300">
          {{ emptyText }}
        </div>
        <div class="text-sm text-gray-400">
          总卡片 {{ reviewStore.summary.total }} · 已毕业 {{ reviewStore.summary.graduated }} · 到期
          {{ reviewStore.summary.due }}
        </div>
        <button
          class="btn btn-primary"
          :disabled="reviewStore.summary.due === 0"
          @click="reload"
        >
          再查一次
        </button>
      </div>

      <!-- 完成态 -->
      <div
        v-else-if="reviewStore.isFinished"
        class="flex flex-col items-center gap-4 py-16"
      >
        <div class="text-2xl">🎉 本轮复习完成</div>
        <div class="text-sm text-gray-500">共复习 {{ reviewedCount }} 张卡片</div>
        <div class="flex gap-2">
          <button
            class="btn"
            @click="reload"
          >
            继续复习
          </button>
          <NuxtLink
            class="btn btn-primary"
            :to="`/course-pack/${coursePackId}`"
          >
            回到课程
          </NuxtLink>
        </div>
      </div>

      <!-- 复习中 -->
      <template v-else>
        <div class="flex items-center gap-3 text-sm text-gray-500">
          <span>{{ reviewStore.currentIndex + 1 }} / {{ reviewStore.cards.length }}</span>
          <div class="h-2 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              class="h-full bg-purple-500 transition-all"
              :style="{ width: `${reviewStore.progress}%` }"
            ></div>
          </div>
          <span>复习 {{ reviewStore.currentCard?.reps ?? 0 }} 次</span>
        </div>

        <div class="rounded-xl border border-gray-300 p-6 dark:border-gray-600">
          <div class="min-h-[64px] text-center text-xl dark:text-gray-100">
            {{ activeCard?.chinese }}
          </div>

          <input
            v-model="answer"
            :disabled="revealed"
            class="mt-6 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-3 text-lg outline-none focus:border-purple-500 dark:border-gray-600 dark:text-gray-100"
            placeholder="敲出英文句子，回车提交"
            @keyup.enter="handleSubmit"
          />

          <div
            v-if="revealed"
            :class="[
              'mt-4 rounded-lg px-4 py-3 text-sm',
              isCorrect
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                : 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300',
            ]"
          >
            <div class="font-medium">
              {{ isCorrect ? "回答正确" : "正确答案" }}
            </div>
            <div class="mt-1">{{ activeCard?.english }}</div>
          </div>

          <div
            v-if="submitResult"
            class="mt-3 text-xs text-gray-500 dark:text-gray-400"
          >
            已排入下次复习：
            <span class="font-semibold text-purple-500">
              {{
                submitResult.scheduledDays === 0 ? "今天稍后" : `${submitResult.scheduledDays} 天后`
              }}
            </span>
            <span
              v-if="submitResult.graduated"
              class="ml-2 text-emerald-500"
              >已毕业</span
            >
            <span class="ml-2">（评级 {{ submitResult.rating }}）</span>
          </div>

          <div class="mt-6 flex justify-end gap-2">
            <template v-if="!revealed">
              <button
                class="btn btn-ghost"
                @click="handleSkip"
              >
                跳过
              </button>
              <button
                class="btn btn-primary"
                @click="handleSubmit"
              >
                提交
              </button>
            </template>
            <template v-else>
              <button
                class="btn btn-ghost"
                @click="handleGraduate"
              >
                标记掌握
              </button>
              <button
                class="btn btn-primary"
                @click="handleNext"
              >
                下一张
                <UKbd>↵</UKbd>
              </button>
            </template>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";

import type { ReviewCard, ReviewSubmitResult } from "~/types/models/review";
import { useReviewStore } from "~/store/review";

const route = useRoute();
const coursePackId = route.params.coursePackId as string;
const reviewStore = useReviewStore();

const answer = ref("");
const revealed = ref(false);
const reviewedCount = ref(0);
const activeCard = ref<ReviewCard | null>(null);
const submitResult = ref<ReviewSubmitResult | null>(null);
const settingsModal = ref();

function handleSettingsSaved() {
  reload();
}

const emptyText = computed(() =>
  reviewStore.summary.total === 0
    ? "还没有复习卡片，先完成一次课程练习吧"
    : "当前没有到期的复习卡片",
);

const isCorrect = computed(
  () => normalize(answer.value) === normalize(activeCard.value?.english ?? ""),
);

function normalize(text: string) {
  return text
    .toLocaleLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[.,!?;:]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function handleSubmit() {
  if (revealed.value) return;
  if (!answer.value.trim()) return;

  activeCard.value = reviewStore.currentCard;
  revealed.value = true;

  // 行为信号：首答是否正确、尝试 1 次、未看答案
  submitResult.value =
    (await reviewStore.submit({
      skipped: false,
      firstAttemptCorrect: isCorrect.value,
      attemptCount: 1,
      showFullAnswer: 0,
      showWordHint: 0,
      typoCount: 0,
      audioPlayCount: 0,
    })) ?? null;
}

async function handleSkip() {
  await reviewStore.submit({ skipped: true, firstAttemptCorrect: false });
  reviewedCount.value += 1;
  resetCardState();
  reviewStore.skip();
}

async function handleGraduate() {
  await reviewStore.graduate();
  reviewedCount.value += 1;
  resetCardState();
  reviewStore.skip();
}

async function handleNext() {
  reviewedCount.value += 1;
  resetCardState();
  reviewStore.skip();
}

function resetCardState() {
  answer.value = "";
  revealed.value = false;
  activeCard.value = null;
  submitResult.value = null;
}

function reload() {
  reviewStore.reset();
  reviewedCount.value = 0;
  resetCardState();
  reviewStore.load(coursePackId);
}

reload();
</script>
