<template>
  <div class="flex w-full flex-col pt-2">
    <template v-if="isLoading">
      <Loading></Loading>
    </template>
    <template v-else>
      <MainTool />
      <MainGame />
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { toast } from "vue-sonner";

import type { CourseProgressScope } from "~/composables/courses/courseProgress";
import type { SplitMode, SplitStage } from "~/composables/main/splitMode";
import type { PracticeDifficulty, PracticeMode } from "~/types/models/learning-path";
import {
  clearCourseProgress,
  readCourseProgress,
  saveCourseProgress,
} from "~/composables/courses/courseProgress";
import { flushLastPractice, saveLastPractice } from "~/composables/courses/lastPractice";
import {
  fetchPracticeStateIndex,
  flushPracticeState,
  schedulePracticeStateSave,
} from "~/composables/courses/practiceStateSync";
import { primeEnglishAudio } from "~/composables/main/englishSound";
import { primeFragmentTranslations } from "~/composables/main/fragmentTranslation";
import { useGameMode } from "~/composables/main/game";
import { splitStatements } from "~/composables/main/splitMode";
import { splitSession } from "~/composables/main/splitSession";
import { useSummary } from "~/composables/main/summary";
import { useNavigation } from "~/composables/useNavigation";
import { toGamePlayMode, toPracticeMode, useGamePlayMode } from "~/composables/user/gamePlayMode";
import { isAuthenticated } from "~/services/auth";
import { useCourseStore } from "~/store/course";
import { useCoursePackStore } from "~/store/coursePack";
import { useLearningPathStore } from "~/store/learningPath";
import { useMasteredElementsStore } from "~/store/masteredElements";
import { permitSaveStatement, preventSaveStatement } from "~/store/statement";

const isLoading = ref(true);
const route = useRoute();
const coursePackStore = useCoursePackStore();
const courseStore = useCourseStore();
const masteredElementsStore = useMasteredElementsStore();
const learningPathStore = useLearningPathStore();
const { toggleGamePlayMode, currentGamePlayMode } = useGamePlayMode();
const { gotoCourseList } = useNavigation();
const { showQuestion } = useGameMode();
const { showModal } = useSummary();

let localProgressScope: CourseProgressScope | null = null;
let localProgressEnabled = false;
let lastPracticeReady = false;

// 当前这次会话的拆分设置（用于主页「继续游戏」恢复上次练习）
const activeSplitMode = ref<SplitMode>("sentence_only");
const activeStages = ref<SplitStage[]>([]);

function persistLastPractice() {
  const { coursePackId, id } = route.params;
  if (!courseStore.currentCourse) return;
  saveLastPractice({
    coursePackId: coursePackId as string,
    courseId: id as string,
    mode: learningPathStore.currentMode,
    difficulty: learningPathStore.currentDifficulty,
    splitMode: activeSplitMode.value,
    stages: activeStages.value,
    statementIndex: courseStore.statementIndex,
  });
}

const AUDIO_PRIME_AHEAD = 12;

/** 拆分片段不在全库预生成里，提前把接下来十几题的音频拉一遍 */
function primeSplitAudioWindow(index: number) {
  const statements = courseStore.currentCourse?.statements;
  if (!statements?.length) return;
  const start = Math.max(0, index - 1);
  const end = Math.min(statements.length, index + AUDIO_PRIME_AHEAD);
  primeEnglishAudio(statements.slice(start, end).map((statement) => statement.english));
}

// 拆分练习没有服务端进度（题列表是动态生成的），改记 localStorage
watch(
  () => courseStore.statementIndex,
  (index) => {
    if (localProgressEnabled && localProgressScope) {
      saveCourseProgress(localProgressScope, index);
      schedulePracticeStateSave(localProgressScope, index);
      primeSplitAudioWindow(index);
    }
    if (lastPracticeReady) persistLastPractice();
  },
);

// 本轮拆分练习完成（结算面板打开）后清掉本地进度，下次从头开始
watch(showModal, (visible) => {
  if (visible && localProgressScope) {
    clearCourseProgress(localProgressScope);
  }
});

onUnmounted(() => {
  // 离开前把拆分进度和上次练习立刻同步到服务端
  if (localProgressScope) {
    flushPracticeState(localProgressScope, courseStore.statementIndex);
  }
  flushLastPractice();

  // 拆分练习会关闭服务端进度保存，离开页面时需要恢复
  permitSaveStatement();
  splitSession.value = { enabled: false, mode: "sentence_only", stages: [] };
});

showQuestion();

onMounted(async () => {
  const { coursePackId, id } = route.params;
  const query = route.query as {
    mode?: PracticeMode;
    difficulty?: PracticeDifficulty;
    split?: SplitMode;
    stages?: string;
  };

  // 从学习路径 / 复习 / 模式选择对话框进入时，query 里带 mode
  if (query.mode) {
    toggleGamePlayMode(toGamePlayMode(query.mode));
    learningPathStore.currentMode = query.mode;
  } else {
    // 直接进游戏页时，把本地模式同步给学习路径，结算上报才不会是错的模式
    learningPathStore.currentMode = toPracticeMode(currentGamePlayMode.value) as PracticeMode;
  }
  if (query.difficulty) {
    learningPathStore.currentDifficulty = query.difficulty;
  }

  // 游戏页是 SPA 路由：结算面板「下一课」换参数但不重新挂载，
  // 新打开页面时以 query 为准，同一会话内沿用 splitSession 里上一次的选择
  const fromEntry = Boolean(query.mode);
  const fromQuery = query.split && query.split !== "sentence_only";
  const splitMode: SplitMode = fromEntry
    ? query.split ?? "sentence_only"
    : fromQuery
      ? query.split!
      : splitSession.value.mode;
  const customStages = (
    fromEntry
      ? query.stages?.split(",").filter(Boolean) ?? []
      : fromQuery
        ? query.stages?.split(",").filter(Boolean) ?? []
        : splitSession.value.stages
  ) as SplitStage[];
  const isSplit = splitMode !== "sentence_only";

  activeSplitMode.value = splitMode;
  activeStages.value = [...customStages];

  if (fromEntry || fromQuery) {
    splitSession.value = { enabled: isSplit, mode: splitMode, stages: customStages };
  }
  splitSession.value.enabled = isSplit;

  if (isSplit) {
    // 拆分练习时不能沿用原课程的 statementIndex，否则会写坏真实进度
    preventSaveStatement();
  }

  if (isAuthenticated()) {
    await masteredElementsStore.setup();
  }
  await courseStore.setup(coursePackId as string, id as string, { skipAutoSave: isSplit });
  await coursePackStore.setupCoursePack(coursePackId as string);

  if (isSplit && courseStore.currentCourse) {
    courseStore.currentCourse.statements = splitStatements(
      courseStore.currentCourse.statements,
      splitMode,
      customStages,
    );
    // 重新按英文文本匹配收藏，整句在收藏里时整句题仍显示「已掌握」
    courseStore.updateMarketedStatements();

    // 预取所有片段的中文翻译（后端有磁盘缓存），逐题切换时基本不用等
    void primeFragmentTranslations(
      courseStore.currentCourse.statements
        .filter((statement) => statement.isFragment && !statement.chinese)
        .map((statement) => statement.english),
    );
  }

  // 拆分练习（片段列表是动态生成的）没有服务端进度，使用本地缓存
  if (isSplit && courseStore.currentCourse) {
    localProgressScope = {
      coursePackId: coursePackId as string,
      courseId: id as string,
      splitMode,
      stages: customStages,
      practiceMode: learningPathStore.currentMode,
    };

    const total = courseStore.currentCourse.statements.length;
    const cachedIndex = readCourseProgress(localProgressScope);
    if (cachedIndex !== null && cachedIndex < total) {
      courseStore.toSpecificStatement(cachedIndex);
      // 本地有旧缓存时顺手同步到服务端（迁移）
      schedulePracticeStateSave(localProgressScope, cachedIndex);
    } else {
      // 本地没有缓存（清了浏览器数据/换浏览器）→ 从数据库恢复
      const serverIndex = await fetchPracticeStateIndex(localProgressScope);
      if (serverIndex !== null && serverIndex < total) {
        courseStore.toSpecificStatement(serverIndex);
        saveCourseProgress(localProgressScope, serverIndex);
      }
    }

    localProgressEnabled = true;
    primeSplitAudioWindow(courseStore.statementIndex);
  }

  // 记下这次练习的模式/难度/拆分方式和位置，主页「继续游戏」按原样恢复
  lastPracticeReady = true;
  persistLastPractice();

  if (courseStore.isAllMastered()) {
    toast.info("你已经全部都掌握 自动帮你跳转到课程列表啦", {
      duration: 1500,
      onAutoClose: () => {
        gotoCourseList(coursePackId as string);
      },
    });
    return;
  }
  isLoading.value = false;
});
</script>
