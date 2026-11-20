<template>
  <UModal
    :model-value="open"
    :ui="{ width: 'w-full sm:max-w-2xl' }"
    @update:model-value="(v: boolean) => emit('update:open', v)"
  >
    <div class="flex max-h-[80vh] flex-col overflow-hidden rounded-xl bg-white dark:bg-gray-900">
      <div class="overflow-y-auto p-6">
        <div class="flex flex-wrap items-baseline gap-3">
          <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-50">选择拆分方式</h2>
          <span class="text-sm text-gray-500">{{ courseTitle }}</span>
        </div>
        <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
          拆分练习把整句切成意群/子句逐层练熟，最后拼回整句。
          拆分练习不记课程进度、不完成课程，可随时中断。
        </p>

        <div class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-2">
          <button
            v-for="option in SPLIT_OPTIONS"
            :key="option.key"
            :class="[
              'rounded-xl border px-3 py-3 text-left transition-all',
              selectedSplit === option.key
                ? 'border-purple-400 bg-purple-50 dark:bg-purple-900/20'
                : 'border-gray-200 hover:border-purple-300 dark:border-gray-700',
            ]"
            @click="selectSplit(option.key)"
          >
            <span
              :class="
                selectedSplit === option.key
                  ? 'text-sm font-semibold text-purple-600 dark:text-purple-300'
                  : 'text-sm font-semibold text-gray-700 dark:text-gray-200'
              "
            >
              {{ option.label }}
            </span>
            <span class="mt-1 block text-xs text-gray-400">{{ option.hint }}</span>
          </button>
        </div>

        <div
          v-if="selectedSplit !== 'sentence_only'"
          class="mt-5 rounded-xl bg-gray-50 p-4 dark:bg-gray-800/60"
        >
          <div class="flex items-center justify-between">
            <span class="text-sm font-semibold text-gray-800 dark:text-gray-100">
              {{ selectedSplitLabel }}：包含题型
            </span>
            <span class="text-xs text-gray-400">{{ selectedSplitHint }}</span>
          </div>

          <div class="mt-3 flex flex-wrap gap-2">
            <button
              v-for="stage in stageOptions"
              :key="stage.key"
              :disabled="selectedSplit !== 'custom'"
              :class="[
                'rounded-full px-3 py-1 text-xs transition-all',
                customStages.includes(stage.key)
                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-200'
                  : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
                selectedSplit !== 'custom' ? 'cursor-default opacity-80' : 'hover:opacity-100',
              ]"
              @click="toggleStage(stage.key)"
            >
              {{ stage.label }}
            </button>
          </div>

          <p class="mt-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            {{ splitDescription }}
          </p>
          <p
            v-if="selectedSplit === 'custom'"
            class="mt-2 text-xs leading-relaxed text-gray-400"
          >
            只勾「完整句子」时等价于整句练习，但不会完成课程。
          </p>
        </div>
      </div>

      <div class="flex items-center gap-3 border-t border-gray-100 p-4 dark:border-gray-800">
        <button
          class="btn btn-ghost flex-1 sm:flex-none sm:px-8"
          @click="emit('update:open', false)"
        >
          取消
        </button>
        <button
          class="btn flex-1 border-none bg-purple-500 text-white hover:bg-purple-600 sm:flex-none sm:px-16"
          @click="handleStart"
        >
          开始练习
        </button>
      </div>
    </div>
  </UModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import type { SplitMode, SplitStage } from "~/composables/main/splitMode";
import { SPLIT_OPTIONS, stageOptionsFor } from "~/composables/main/splitMode";

const props = defineProps<{
  open: boolean;
  coursePackId: string;
  courseId: string;
  courseTitle?: string;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "start", payload: { splitMode: SplitMode; customStages: SplitStage[] }): void;
}>();

const selectedSplit = ref<SplitMode>("word_first");
const customStages = ref<SplitStage[]>(["phrase", "core_chunk", "combo_chunk", "full_sentence"]);

const selectedSplitLabel = computed(
  () => SPLIT_OPTIONS.find((option) => option.key === selectedSplit.value)?.label ?? "",
);
const selectedSplitHint = computed(
  () => SPLIT_OPTIONS.find((option) => option.key === selectedSplit.value)?.hint ?? "",
);
const splitDescription = computed(
  () => SPLIT_OPTIONS.find((option) => option.key === selectedSplit.value)?.description ?? "",
);
const stageOptions = computed(() => stageOptionsFor(selectedSplit.value));

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    const cached = localStorage.getItem("splitMode") as SplitMode | null;
    if (cached && SPLIT_OPTIONS.some((option) => option.key === cached)) {
      selectedSplit.value = cached;
    }
  },
);

function selectSplit(key: SplitMode) {
  selectedSplit.value = key;
  localStorage.setItem("splitMode", key);
  if (key !== "custom" && key !== "sentence_only") {
    customStages.value = stageOptionsFor(key)
      .filter((stage) => stage.enabled)
      .map((stage) => stage.key);
  }
}

function toggleStage(stage: SplitStage) {
  if (selectedSplit.value !== "custom") return;
  const index = customStages.value.indexOf(stage);
  if (index >= 0) {
    if (customStages.value.length === 1) return;
    customStages.value.splice(index, 1);
  } else {
    customStages.value.push(stage);
  }
}

function handleStart() {
  const stages =
    selectedSplit.value === "custom"
      ? [...customStages.value]
      : stageOptionsFor(selectedSplit.value)
          .filter((stage) => stage.enabled)
          .map((stage) => stage.key);

  emit("start", {
    splitMode: selectedSplit.value,
    customStages: stages,
  });
  emit("update:open", false);
}
</script>
