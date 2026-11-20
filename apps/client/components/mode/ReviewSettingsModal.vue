<template>
  <UModal v-model="isOpen">
    <UContainer :ui="{ base: 'w-[90vw] flex flex-col', constrained: 'max-w-[560px]' }">
      <CommonModalHeader
        title="复习设置"
        @close="isOpen = false"
      />

      <div class="max-h-[65vh] overflow-y-auto px-4 pb-4">
        <div
          v-if="isLoading"
          class="py-10 text-center text-sm text-gray-500"
        >
          加载中…
        </div>

        <template v-else>
          <!-- 模式 -->
          <section class="mt-4">
            <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-100">纳入复习的模式</h3>
            <div class="mt-2 flex flex-wrap gap-2">
              <button
                v-for="mode in MODES"
                :key="mode.key"
                :class="[
                  'rounded-full px-3 py-1 text-xs transition-all',
                  setting.enabledModes.includes(mode.key)
                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-200'
                    : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
                ]"
                @click="toggleMode(mode.key)"
              >
                {{ mode.label }}
              </button>
            </div>
          </section>

          <!-- 错题策略 -->
          <section class="mt-5 space-y-3 rounded-xl bg-gray-50 p-3 dark:bg-gray-800/60">
            <label class="flex items-center justify-between text-sm">
              <span class="text-gray-700 dark:text-gray-200">只复习错题</span>
              <input
                v-model="setting.errorsOnly"
                type="checkbox"
                class="toggle toggle-sm"
              />
            </label>

            <label class="flex items-center justify-between text-sm">
              <span class="text-gray-700 dark:text-gray-200">看答案算错</span>
              <input
                v-model="setting.countShownAnswerAsError"
                type="checkbox"
                class="toggle toggle-sm"
              />
            </label>

            <label class="flex items-center justify-between gap-3 text-sm">
              <span class="text-gray-700 dark:text-gray-200">错几轮算错题</span>
              <input
                v-model.number="setting.wrongRoundsThreshold"
                type="number"
                min="1"
                max="10"
                class="w-16 rounded-md border border-gray-300 bg-transparent px-2 py-1 text-right dark:border-gray-600"
              />
            </label>
          </section>

          <!-- 每日上限 -->
          <section class="mt-5">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-100">每日复习上限</h3>
              <label class="flex items-center gap-2 text-xs text-gray-500">
                <input
                  v-model="setting.useSystemRecommended"
                  type="checkbox"
                  class="toggle toggle-sm"
                />
                用系统推荐
              </label>
            </div>

            <div class="mt-2 space-y-2">
              <div
                v-for="mode in MODES"
                :key="`limit-${mode.key}`"
                class="flex items-center justify-between text-sm"
              >
                <span class="text-gray-600 dark:text-gray-300">
                  {{ mode.label }}
                  <span class="ml-1 text-xs text-gray-400">
                    今日已复习 {{ todayCounts[mode.key] ?? 0 }}
                  </span>
                </span>
                <input
                  :value="setting.dailyLimitsByMode[mode.key] ?? 0"
                  type="number"
                  min="0"
                  max="200"
                  :disabled="setting.useSystemRecommended"
                  class="w-20 rounded-md border border-gray-300 bg-transparent px-2 py-1 text-right disabled:opacity-50 dark:border-gray-600"
                  @input="handleLimitInput(mode.key, $event)"
                />
              </div>
            </div>
          </section>
        </template>
      </div>

      <div class="flex justify-end gap-2 border-t border-gray-100 p-3 dark:border-gray-800">
        <button
          class="btn btn-ghost btn-sm"
          @click="isOpen = false"
        >
          取消
        </button>
        <button
          class="btn btn-primary btn-sm"
          :disabled="isSaving || isLoading"
          @click="handleSave"
        >
          {{ isSaving ? "保存中…" : "保存" }}
        </button>
      </div>
    </UContainer>
  </UModal>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";

import type { ReviewSetting } from "~/types/models/review-setting";
import { fetchReviewSetting, updateReviewSetting } from "~/api/review-setting";

const emit = defineEmits<{ (e: "saved"): void }>();

const MODES = [
  { key: "chinese_to_english", label: "中译英" },
  { key: "dictation", label: "听写" },
  { key: "listening", label: "听力" },
];

const isOpen = ref(false);
const isLoading = ref(false);
const isSaving = ref(false);
const todayCounts = ref<Record<string, number>>({});

const setting = reactive<ReviewSetting>({
  enabledModes: ["chinese_to_english", "dictation", "listening"],
  errorsOnly: false,
  wrongRoundsThreshold: 3,
  countShownAnswerAsError: true,
  dailyLimitsByMode: { chinese_to_english: 20, dictation: 20, listening: 20 },
  useSystemRecommended: true,
});

function applySetting(next: ReviewSetting) {
  setting.enabledModes = next.enabledModes ?? [];
  setting.errorsOnly = next.errorsOnly ?? false;
  setting.wrongRoundsThreshold = next.wrongRoundsThreshold ?? 3;
  setting.countShownAnswerAsError = next.countShownAnswerAsError ?? true;
  setting.dailyLimitsByMode = { ...setting.dailyLimitsByMode, ...(next.dailyLimitsByMode ?? {}) };
  setting.useSystemRecommended = next.useSystemRecommended ?? true;
  todayCounts.value = next.todayCounts ?? {};
}

function toggleMode(mode: string) {
  const index = setting.enabledModes.indexOf(mode);
  if (index >= 0) {
    if (setting.enabledModes.length === 1) return;
    setting.enabledModes.splice(index, 1);
  } else {
    setting.enabledModes.push(mode);
  }
}

function handleLimitInput(mode: string, event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  setting.dailyLimitsByMode = {
    ...setting.dailyLimitsByMode,
    [mode]: Number.isFinite(value) ? value : 0,
  };
}

async function open() {
  isOpen.value = true;
  isLoading.value = true;
  try {
    applySetting(await fetchReviewSetting());
  } finally {
    isLoading.value = false;
  }
}

async function handleSave() {
  isSaving.value = true;
  try {
    applySetting(await updateReviewSetting({ ...setting }));
    isOpen.value = false;
    emit("saved");
  } finally {
    isSaving.value = false;
  }
}

defineExpose({ open });
</script>
