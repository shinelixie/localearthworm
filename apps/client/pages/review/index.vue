<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold dark:text-gray-100">复习</h1>
        <p class="mt-1 text-sm text-gray-500">到期 {{ totalDue }} 张 · 共 {{ totalCards }} 张</p>
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
      <div
        v-if="rows.length === 0"
        class="flex flex-col items-center gap-3 py-16 text-center"
      >
        <div class="text-lg text-gray-600 dark:text-gray-300">还没有复习卡片</div>
        <div class="text-sm text-gray-400">完成一节课后会自动把句子加入复习队列</div>
        <NuxtLink
          class="btn btn-primary btn-sm"
          to="/course-pack"
        >
          去练习
        </NuxtLink>
      </div>

      <ul
        v-else
        class="flex flex-col gap-2"
      >
        <li
          v-for="row in rows"
          :key="row.coursePackId"
        >
          <NuxtLink
            :to="`/review/${row.coursePackId}`"
            class="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 transition-colors hover:border-purple-300 hover:bg-purple-50/40 dark:border-gray-700 dark:hover:bg-purple-900/10"
          >
            <div class="flex flex-col">
              <span class="text-base text-gray-800 dark:text-gray-100">{{ row.title }}</span>
              <span class="mt-0.5 text-xs text-gray-500">
                共 {{ row.total }} 张 · 已毕业 {{ row.graduated }}
              </span>
            </div>
            <span
              :class="[
                'rounded-full px-3 py-1 text-xs font-medium',
                row.due > 0
                  ? 'bg-purple-500 text-white'
                  : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
              ]"
            >
              {{ row.due > 0 ? `${row.due} 张到期` : "暂无到期" }}
            </span>
          </NuxtLink>
        </li>
      </ul>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import { fetchReviewOverview } from "~/api/review-overview";
import { isAuthenticated } from "~/services/auth";
import { useCoursePackStore } from "~/store/coursePack";

const coursePackStore = useCoursePackStore();
const isLoading = ref(true);
const overviewMap = ref<Record<string, { total: number; due: number; graduated: number }>>({});
const packOrder = ref<string[]>([]);

const rows = computed(() =>
  packOrder.value
    .map((id) => {
      const pack = coursePackStore.coursePacks.find((item) => item.id === id);
      const stat = overviewMap.value[id];
      if (!stat) return null;
      return {
        coursePackId: id,
        title: pack?.title ?? "课程包",
        total: stat.total,
        due: stat.due,
        graduated: stat.graduated,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.due - a.due),
);

const totalDue = computed(() => rows.value.reduce((sum, row) => sum + row.due, 0));
const totalCards = computed(() => rows.value.reduce((sum, row) => sum + row.total, 0));

async function setup() {
  if (!isAuthenticated()) {
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  try {
    const [overview] = await Promise.all([
      fetchReviewOverview(),
      coursePackStore.setupCoursePacks(),
    ]);

    const map: Record<string, { total: number; due: number; graduated: number }> = {};
    const order: string[] = [];
    for (const row of overview) {
      map[row.coursePackId] = { total: row.total, due: row.due, graduated: row.graduated };
      order.push(row.coursePackId);
    }
    overviewMap.value = map;
    packOrder.value = order;
  } finally {
    isLoading.value = false;
  }
}

setup();
</script>
