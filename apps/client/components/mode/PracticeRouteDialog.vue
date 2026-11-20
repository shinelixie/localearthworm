<template>
  <UModal
    :model-value="open"
    :ui="{ width: 'w-full sm:max-w-4xl' }"
    @update:model-value="(value: boolean) => emit('update:open', value)"
  >
    <div class="flex max-h-[82vh] flex-col rounded-xl bg-white dark:bg-gray-900">
      <CommonModalHeader
        title="学习路线"
        @close="emit('update:open', false)"
      />

      <div class="-mt-2 px-6 text-center text-sm text-gray-500">
        {{ courseTitle }}
      </div>
      <div class="mt-1 px-6 text-center text-xs text-gray-400">
        当前模式 {{ routeNodes.length }} 项 · 全部
        {{ modes.length * difficulties.length * ROUTE_SPLIT_MODES.length }} 项（模式 × 拆分方式 ×
        难度）
      </div>

      <!-- 练习模式：路线按 拆分方式 × 难度 展开，完成状态按模式分开 -->
      <div class="mt-4 flex flex-wrap items-center justify-center gap-2 px-6">
        <button
          v-for="mode in modes"
          :key="mode"
          :class="[
            'rounded-full px-4 py-1.5 text-sm transition-all',
            selectedMode === mode
              ? 'bg-purple-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-purple-50 dark:bg-gray-800 dark:text-gray-300',
          ]"
          @click="selectMode(mode)"
        >
          {{ MODE_LABELS[mode] }}
        </button>
      </div>

      <div class="mt-4 flex-1 overflow-y-auto px-6 pb-4">
        <div
          v-for="row in rows"
          :key="row.splitMode"
          class="mb-4 rounded-xl border border-gray-200 p-4 dark:border-gray-700"
        >
          <div class="mb-3 flex flex-wrap items-baseline gap-2">
            <span class="text-sm font-semibold text-gray-800 dark:text-gray-100">
              {{ row.label }}
            </span>
            <span class="text-xs text-gray-400">{{ row.hint }}</span>
          </div>

          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="difficulty in difficulties"
              :key="difficulty"
              :class="[
                'relative flex flex-col items-center justify-center gap-1 rounded-lg border px-2 py-3 text-sm transition-all',
                isComplete(row.splitMode, difficulty)
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                  : isNext(row.splitMode, difficulty)
                    ? 'border-purple-400 bg-purple-50 text-purple-700 ring-2 ring-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:ring-purple-800'
                    : 'border-gray-200 text-gray-600 hover:border-purple-300 dark:border-gray-700 dark:text-gray-300',
              ]"
              @click="startNode(row.splitMode, difficulty)"
            >
              <span class="font-medium">{{ DIFFICULTY_LABELS[difficulty] }}</span>
              <span
                v-if="isComplete(row.splitMode, difficulty)"
                class="flex items-center gap-1 text-xs"
              >
                <UIcon
                  name="i-ph-check-circle"
                  class="h-3.5 w-3.5"
                />
                已完成
              </span>
              <span
                v-else-if="isNext(row.splitMode, difficulty)"
                class="text-xs"
              >
                下一项
              </span>
              <span
                v-else
                class="text-xs text-gray-400"
              >
                开始
              </span>
            </button>
          </div>
        </div>
      </div>

      <div
        class="flex items-center justify-end gap-3 border-t border-gray-100 p-4 dark:border-gray-800"
      >
        <button
          class="btn btn-ghost"
          @click="emit('update:open', false)"
        >
          关闭
        </button>
        <button
          v-if="nextNode"
          class="btn border-none bg-purple-500 text-white hover:bg-purple-600"
          @click="startNode(nextNode.splitMode, nextNode.difficulty)"
        >
          从下一项开始
        </button>
      </div>
    </div>
  </UModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import type { SplitMode } from "~/composables/main/splitMode";
import type { PracticeDifficulty, PracticeMode } from "~/types/models/learning-path";
import CommonModalHeader from "~/components/common/ModalHeader.vue";
import {
  getCompletedRouteNodes,
  getPracticeRoute,
  loadCompletedRouteNodes,
  ROUTE_SPLIT_MODES,
} from "~/composables/courses/practiceRoute";
import { SPLIT_OPTIONS } from "~/composables/main/splitMode";
import { toPracticeMode, useGamePlayMode } from "~/composables/user/gamePlayMode";
import { DIFFICULTY_LABELS, MODE_LABELS, useLearningPathStore } from "~/store/learningPath";

const props = defineProps<{
  open: boolean;
  coursePackId: string;
  courseId: string;
  courseTitle?: string;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (
    e: "start",
    payload: { mode: PracticeMode; difficulty: PracticeDifficulty; splitMode: SplitMode },
  ): void;
}>();

const learningPathStore = useLearningPathStore();
const { currentGamePlayMode } = useGamePlayMode();

const selectedMode = ref<PracticeMode>(toPracticeMode(currentGamePlayMode.value) as PracticeMode);
const version = ref(0);

const modes = computed(() => learningPathStore.config.modes);
const difficulties = computed(() => learningPathStore.config.difficulties);
const routeNodes = computed(() => getPracticeRoute(difficulties.value));

const rows = computed(() =>
  ROUTE_SPLIT_MODES.map((splitMode) => {
    const option = SPLIT_OPTIONS.find((item) => item.key === splitMode);
    return {
      splitMode,
      label: option?.label ?? splitMode,
      hint: option?.hint ?? "",
    };
  }),
);

const completedSet = computed(() => {
  // 打开/切换模式时刷新
  void version.value;
  return new Set(getCompletedRouteNodes(props.coursePackId, props.courseId, selectedMode.value));
});

function isComplete(splitMode: SplitMode, difficulty: PracticeDifficulty) {
  return completedSet.value.has(`${splitMode}:${difficulty}`);
}

const nextNode = computed(() => {
  void version.value;
  return routeNodes.value.find((node) => !isComplete(node.splitMode, node.difficulty)) ?? null;
});

function isNext(splitMode: SplitMode, difficulty: PracticeDifficulty) {
  return nextNode.value?.splitMode === splitMode && nextNode.value?.difficulty === difficulty;
}

function selectMode(mode: PracticeMode) {
  selectedMode.value = mode;
  version.value += 1;
  void refreshFromServer();
}

async function refreshFromServer() {
  await loadCompletedRouteNodes(props.coursePackId, props.courseId, selectedMode.value);
  version.value += 1;
}

function startNode(splitMode: SplitMode, difficulty: PracticeDifficulty) {
  emit("start", { mode: selectedMode.value, difficulty, splitMode });
  emit("update:open", false);
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    selectedMode.value = toPracticeMode(currentGamePlayMode.value) as PracticeMode;
    version.value += 1;
    void refreshFromServer();
  },
);
</script>
