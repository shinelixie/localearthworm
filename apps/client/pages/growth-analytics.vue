<template>
  <div class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold dark:text-gray-100">成长分析</h1>
        <p class="mt-1 text-sm text-gray-500">练习时长、正确率与会话明细</p>
      </div>
      <NuxtLink
        to="/course-pack"
        class="text-sm text-gray-500 hover:text-purple-500"
      >
        返回课程
      </NuxtLink>
    </div>

    <div
      v-if="isLoading"
      class="py-16 text-center text-gray-500"
    >
      加载中…
    </div>

    <template v-else>
      <!-- 概览卡 -->
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div
          v-for="card in overviewCards"
          :key="card.label"
          class="rounded-xl border border-gray-200 p-4 dark:border-gray-700"
        >
          <div class="text-xs text-gray-500">{{ card.label }}</div>
          <div class="mt-1 text-2xl font-bold text-gray-800 dark:text-gray-100">
            {{ card.value }}
          </div>
        </div>
      </div>

      <!-- 每日时长 -->
      <div class="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
        <div class="mb-3 flex items-center justify-between">
          <span class="text-sm font-semibold text-gray-700 dark:text-gray-200">最近 30 天</span>
          <span class="text-xs text-gray-400">柱高 = 当天练习时长</span>
        </div>

        <div class="flex h-40 items-end gap-1">
          <div
            v-for="point in daily"
            :key="point.date"
            class="group relative flex-1"
            :title="`${point.date} · ${formatMinutes(point.durationMs)} · ${point.sessions} 次`"
          >
            <div
              class="w-full rounded-t bg-purple-400/80 transition-all group-hover:bg-purple-500"
              :style="{ height: `${barHeight(point.durationMs)}px` }"
            ></div>
          </div>
        </div>

        <div class="mt-2 flex justify-between text-xs text-gray-400">
          <span>{{ daily[0]?.date }}</span>
          <span>{{ daily[daily.length - 1]?.date }}</span>
        </div>
      </div>

      <!-- 最近会话 -->
      <div class="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
        <div class="border-b border-gray-100 px-4 py-3 text-sm font-semibold dark:border-gray-800">
          最近会话
        </div>
        <div
          v-if="sessions.length === 0"
          class="px-4 py-8 text-center text-sm text-gray-500"
        >
          还没有练习记录，完成一节课程后会出现在这里
        </div>
        <table
          v-else
          class="w-full text-sm"
        >
          <thead class="bg-gray-50 text-xs text-gray-500 dark:bg-gray-800">
            <tr>
              <th class="px-3 py-2 text-left font-normal">时间</th>
              <th class="px-3 py-2 text-left font-normal">模式</th>
              <th class="px-3 py-2 text-right font-normal">时长</th>
              <th class="px-3 py-2 text-right font-normal">题量</th>
              <th class="px-3 py-2 text-right font-normal">正确率</th>
              <th class="px-3 py-2 text-right font-normal">评级</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="session in sessions"
              :key="session.id"
              class="border-t border-gray-100 dark:border-gray-800"
            >
              <td class="px-3 py-2 text-gray-600 dark:text-gray-300">
                {{ formatDate(session.startedAt) }}
              </td>
              <td class="px-3 py-2 text-gray-600 dark:text-gray-300">
                {{ MODE_LABELS[session.mode] ?? session.mode }}
              </td>
              <td class="px-3 py-2 text-right text-gray-600 dark:text-gray-300">
                {{ formatMinutes(session.durationMs) }}
              </td>
              <td class="px-3 py-2 text-right text-gray-600 dark:text-gray-300">
                {{ session.answerCount }}
              </td>
              <td class="px-3 py-2 text-right text-gray-600 dark:text-gray-300">
                {{ Math.round(session.correctRate * 100) }}%
              </td>
              <td class="px-3 py-2 text-right font-semibold text-amber-500">
                {{ session.rank ?? "-" }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import type { DailyPoint, SessionOverview, SessionRecord } from "~/types/models/practice-session";
import {
  fetchDailyLearning,
  fetchRecentSessions,
  fetchSessionOverview,
} from "~/api/practice-session";
import { isAuthenticated } from "~/services/auth";

const MODE_LABELS: Record<string, string> = {
  chinese_to_english: "中译英",
  dictation: "听写",
  listening: "听力",
};

const isLoading = ref(true);
const overview = ref<SessionOverview>({
  sessions: 0,
  totalDurationMs: 0,
  totalAnswers: 0,
  totalCorrect: 0,
  completedCourses: 0,
  learningDays: 0,
  avgCorrectRate: 0,
  longestStreak: 0,
});
const daily = ref<DailyPoint[]>([]);
const sessions = ref<SessionRecord[]>([]);

const maxDuration = computed(() => Math.max(...daily.value.map((point) => point.durationMs), 1));

const overviewCards = computed(() => [
  { label: "累计时长", value: formatMinutes(overview.value.totalDurationMs) },
  { label: "练习次数", value: String(overview.value.sessions) },
  { label: "学习天数", value: String(overview.value.learningDays) },
  { label: "最长连续", value: `${overview.value.longestStreak} 天` },
]);

function barHeight(durationMs: number) {
  return Math.max(Math.round((durationMs / maxDuration.value) * 150), durationMs > 0 ? 3 : 0);
}

function formatMinutes(durationMs: number) {
  const minutes = Math.round(durationMs / 60000);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分`;
}

function formatDate(value: string) {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getMonth() + 1}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function setup() {
  if (!isAuthenticated()) {
    isLoading.value = false;
    return;
  }
  isLoading.value = true;
  try {
    const [nextOverview, nextDaily, nextSessions] = await Promise.all([
      fetchSessionOverview(),
      fetchDailyLearning(30),
      fetchRecentSessions(10),
    ]);
    overview.value = nextOverview;
    daily.value = nextDaily;
    sessions.value = nextSessions;
  } finally {
    isLoading.value = false;
  }
}

setup();
</script>
