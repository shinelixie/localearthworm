<template>
  <div class="flex w-full flex-col">
    <template v-if="isLoading">
      <Loading></Loading>
    </template>

    <template v-else>
      <h2 class="text-center text-3xl dark:border-gray-600">
        {{ coursePackStore.currentCoursePack?.title }}
      </h2>
      <p
        v-if="courses.length"
        class="list-summary"
      >
        共 {{ courses.length }} 课 · {{ totalStatements }} 句
      </p>

      <div
        v-if="isAuthenticated()"
        class="path-bar"
      >
        <NuxtLink
          :to="`/path/${coursePackId}`"
          class="path-chip"
        >
          学习路径
        </NuxtLink>
        <NuxtLink
          :to="`/review/${coursePackId}`"
          class="path-chip"
          :class="{ 'is-due': reviewStore.summary.due > 0 }"
        >
          复习
          <b>{{ reviewStore.summary.due }}</b>
          张到期 / 共 {{ reviewStore.summary.total }}
        </NuxtLink>
      </div>

      <div class="pack-actions">
        <input
          v-if="courses.length > 60"
          v-model="courseKeyword"
          class="input input-sm input-bordered w-52"
          placeholder="搜索 Sentence 编号"
        />
        <CoursesImportCoursePackDialog
          label="追加课程"
          :default-target-pack-id="coursePackId"
          @imported="onImported"
        />
        <button
          class="btn btn-ghost btn-sm"
          type="button"
          @click="handleResetCoursePack"
        >
          <UIcon
            name="i-ph-arrow-counter-clockwise"
            class="h-4 w-4"
          />
          重置全部进度
        </button>
      </div>
      <div class="h-full scrollbar-hide">
        <div class="course-list scrollbar-hide">
          <CoursesCourseRow
            v-for="course in filteredCourses"
            :key="course.id"
            :index="course.order"
            :title="course.title"
            :description="course.description"
            :id="course.id"
            :count="course.completionCount"
            :statementCount="course.statementCount"
            :learnedCount="course.learnedCount"
            :coursePackId="course.coursePackId"
            :stars="learningPathStore.starsFor(course.id)"
            :routeCompleted="routeCompletedByCourse[course.id] ?? 0"
            :routeTotal="routeTotal"
            @click="handleChangeCourse(course.id)"
            @reset="handleResetCourse(course)"
            @route="openRoute(course)"
          />
        </div>
      </div>
    </template>
  </div>

  <ModeSelectDialog
    v-model:open="isModeDialogOpen"
    :course-pack-id="coursePackId"
    :course-id="pendingCourseId"
    :course-title="pendingCourseTitle"
    @start="handleStartPractice"
  />

  <PracticeRouteDialog
    v-model:open="isRouteDialogOpen"
    :course-pack-id="coursePackId"
    :course-id="routeCourseId"
    :course-title="routeCourseTitle"
    @start="handleStartRoute"
  />
</template>

<script setup lang="ts">
import { navigateTo } from "#app";
import { useModal } from "#imports";
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { toast } from "vue-sonner";

import type { ImportCoursePackResult } from "~/api/course-pack";
import type { SplitMode, SplitStage } from "~/composables/main/splitMode";
import type { PracticeDifficulty, PracticeMode } from "~/types/models/learning-path";
import { fetchRouteSummary } from "~/api/practice-state";
import { fetchResetCoursePackProgress, fetchResetCourseProgress } from "~/api/user-course-progress";
import Dialog from "~/components/common/Dialog.vue";
import CoursesImportCoursePackDialog from "~/components/courses/ImportCoursePackDialog.vue";
import PracticeRouteDialog from "~/components/mode/PracticeRouteDialog.vue";
import { useActiveCourseMap } from "~/composables/courses/activeCourse";
import { clearCourseProgresses } from "~/composables/courses/courseProgress";
import { getCompletedRouteNodes, ROUTE_SPLIT_MODES } from "~/composables/courses/practiceRoute";
import { isAuthenticated } from "~/services/auth";
import { useCoursePackStore } from "~/store/coursePack";
import { useLearningPathStore } from "~/store/learningPath";
import { useReviewStore } from "~/store/review";

const isLoading = ref(false);
const route = useRoute();
const coursePackStore = useCoursePackStore();
const learningPathStore = useLearningPathStore();
const reviewStore = useReviewStore();
const coursePackId = route.params.id as string;
const { updateActiveCourseMap } = useActiveCourseMap();
const modal = useModal();

const isModeDialogOpen = ref(false);
const pendingCourseId = ref("");
const pendingCourseTitle = ref("");

const isRouteDialogOpen = ref(false);
const routeCourseId = ref("");
const routeCourseTitle = ref("");

// 学习路线完成度：练习模式 × 拆分方式 × 难度（3 × 4 × 3 = 36）
const routeCompletedByCourse = ref<Record<string, number>>({});
const routeTotal = computed(
  () =>
    (learningPathStore.config.modes?.length || 3) *
    (learningPathStore.config.difficulties?.length || 3) *
    ROUTE_SPLIT_MODES.length,
);

const courses = computed(() => coursePackStore.currentCoursePack?.courses ?? []);
const courseKeyword = ref("");
const filteredCourses = computed(() => {
  const keyword = courseKeyword.value.trim().toLowerCase();
  if (!keyword) return courses.value;
  return courses.value.filter((course) => {
    if (course.title.toLowerCase().includes(keyword)) return true;
    const order = String(course.order ?? "");
    return order === keyword || order.padStart(2, "0") === keyword;
  });
});
const totalStatements = computed(() =>
  courses.value.reduce((sum, course) => sum + (course.statementCount ?? 0), 0),
);

setup();

async function setup() {
  isLoading.value = true;
  // force：从课程页返回时也要重新拉，进度条才是刚学完的那个数
  await coursePackStore.setupCoursePack(coursePackId, true);
  if (isAuthenticated()) {
    await learningPathStore.setup(coursePackId);
    await reviewStore.refreshSummary(coursePackId);
    await loadRouteProgress();
  }
  isLoading.value = false;
}

/** 每节课的学习路线完成数（全部模式 × 拆分方式 × 难度），合并本地尚未同步的勾选 */
async function loadRouteProgress() {
  if (!isAuthenticated()) return;

  const total = routeTotal.value;
  const modes = learningPathStore.config.modes;
  const counts: Record<string, number> = {};

  try {
    const rows = await fetchRouteSummary(coursePackId);
    for (const row of rows) {
      counts[row.courseId] = (counts[row.courseId] ?? 0) + 1;
    }
  } catch {
    // 后端不可用时只用本地
  }

  for (const course of courses.value) {
    let localCount = 0;
    for (const mode of modes) {
      localCount += getCompletedRouteNodes(coursePackId, course.id, mode).length;
    }
    counts[course.id] = Math.min(total, Math.max(counts[course.id] ?? 0, localCount));
  }

  routeCompletedByCourse.value = counts;
}

function handleChangeCourse(courseId: string) {
  updateActiveCourseMap(coursePackId, courseId);
  pendingCourseId.value = courseId;
  pendingCourseTitle.value =
    coursePackStore.currentCoursePack?.courses.find((course) => course.id === courseId)?.title ??
    "";

  if (!isAuthenticated()) {
    gotoGame(courseId, "chinese_to_english", "beginner");
    return;
  }
  isModeDialogOpen.value = true;
}

/** 对话框「开始练习」：带模式/难度/拆分方式进游戏页 */
function handleStartPractice(payload: {
  mode: PracticeMode;
  difficulty: PracticeDifficulty;
  splitMode: SplitMode;
  customStages: SplitStage[];
}) {
  gotoGame(
    pendingCourseId.value,
    payload.mode,
    payload.difficulty,
    payload.splitMode,
    payload.customStages,
  );
}

function gotoGame(
  courseId: string,
  mode: PracticeMode,
  difficulty: PracticeDifficulty,
  splitMode: SplitMode = "sentence_only",
  customStages: SplitStage[] = [],
) {
  const params = new URLSearchParams({ mode, difficulty, split: splitMode });
  if (splitMode !== "sentence_only" && customStages.length) {
    params.set("stages", customStages.join(","));
  }
  navigateTo(`/game/${coursePackId}/${courseId}?${params.toString()}`);
}

/** 打开某节课的「学习路线」（拆分方式 × 难度） */
function openRoute(course: { id: string; title: string }) {
  routeCourseId.value = course.id;
  routeCourseTitle.value = course.title;
  isRouteDialogOpen.value = true;
}

/** 从学习路线选了一个节点：按该拆分方式/难度进游戏 */
function handleStartRoute(payload: {
  mode: PracticeMode;
  difficulty: PracticeDifficulty;
  splitMode: SplitMode;
}) {
  gotoGame(routeCourseId.value, payload.mode, payload.difficulty, payload.splitMode);
}

/** 追加课程后重新拉本包，课程列表立刻出现新导入的课 */
async function onImported(result: ImportCoursePackResult) {
  await coursePackStore.setupCoursePack(coursePackId);
  if (result.total.statements > 0) {
    toast(`已追加 ${result.total.statements} 句`, {
      description: result.packs
        .flatMap((pack) => pack.courses)
        .map((course) => `${course.title} +${course.added}`)
        .join("，"),
    });
  }
}

/** 重置单课：服务端断点 + 完成次数，以及拆分练习的本地进度 */
function handleResetCourse(course: { id: string; title: string }) {
  modal.open(Dialog, {
    title: "重置本课进度",
    content: `确定把「${course.title}」的进度清零、从第一句重新开始吗？`,
    showCancel: true,
    showConfirm: true,
    async onConfirm() {
      try {
        await fetchResetCourseProgress(coursePackId, course.id);
        clearCourseProgresses(coursePackId, course.id);
        await coursePackStore.setupCoursePack(coursePackId, true);
        toast.success(`已重置「${course.title}」`);
      } catch {
        toast.error("重置失败，请重试");
      }
    },
  });
}

/** 重置整个课程包：本包所有课的进度一起清零 */
function handleResetCoursePack() {
  const packTitle = coursePackStore.currentCoursePack?.title ?? "该课程包";
  modal.open(Dialog, {
    title: "重置全部进度",
    content: `确定把「${packTitle}」下所有课程的进度都清零吗？`,
    showCancel: true,
    showConfirm: true,
    async onConfirm() {
      try {
        await fetchResetCoursePackProgress(coursePackId);
        courses.value.forEach((course) => clearCourseProgresses(coursePackId, course.id));
        await coursePackStore.setupCoursePack(coursePackId, true);
        toast.success("已重置全部进度");
      } catch {
        toast.error("重置失败，请重试");
      }
    },
  });
}
</script>

<style scoped>
.list-summary {
  margin-top: 7px;
  margin-bottom: 18px;
  text-align: center;
  font-size: 13px;
  letter-spacing: 0.3px;
  color: #9a9aa8;
}

.pack-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: 14px;
}

.path-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 12px;
  color: #8a8a99;
}

.path-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 11px;
  border-radius: 999px;
  background-color: #f4f4f8;
  color: inherit;
  text-decoration: none;
  transition:
    background-color 0.16s ease,
    color 0.16s ease;
}

a.path-chip:hover {
  color: #6d28d9;
  background-color: #f3f0ff;
}

.path-chip.is-due {
  background-color: #8b5cf6;
  color: #fff;
}

.path-chip b {
  font-weight: 700;
  color: #6d28d9;
}

.path-chip.is-due b {
  color: #fff;
}

.dark .path-bar {
  color: #8a8a9e;
}

.dark .path-chip {
  background-color: #26262f;
}

.dark .list-summary {
  color: #8a8a9e;
}

.course-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 900px;
  max-height: 76vh;
  margin: 0 auto;
  padding: 2px 4px 40px;
  overflow-y: auto;
  overflow-x: hidden;
}
</style>
