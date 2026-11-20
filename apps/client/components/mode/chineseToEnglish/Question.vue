<template>
  <div class="question-panel">
    <h1
      v-if="chinese"
      class="thesis"
      :class="{ 'is-long': chinese.length > 14 }"
    >
      {{ chinese }}
    </h1>
    <p
      v-else
      class="thesis thesis-fragment"
    >
      {{ fragmentZh || (isTranslating ? "翻译中…" : "（该片段暂无中文提示，按下方提示拼写）") }}
    </p>
    <MainQuestionInput />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";

import { useCurrentStatementEnglishSound } from "~/composables/main/englishSound";
import { getCachedTranslation, translateFragment } from "~/composables/main/fragmentTranslation";
import { fragmentChinese, useWordInfo } from "~/composables/main/wordInfo";
import { useAutoPlayEnglish } from "~/composables/user/sound";
import { useCourseStore } from "~/store/course";
import { useLearningPathStore } from "~/store/learningPath";

const courseStore = useCourseStore();
const learningPathStore = useLearningPathStore();
const { playSound } = useCurrentStatementEnglishSound();
const { isAutoPlayEnglish } = useAutoPlayEnglish();
const { load, lookup } = useWordInfo();

const chinese = computed(() => courseStore.currentStatement?.chinese ?? "");
const currentStatement = computed(() => courseStore.currentStatement);

// 拆分片段没有现成译文：由后端按短句翻译（带缓存，合并后的片段也能重组语序）。
// 翻译失败时才退回词表逐词拼接。
const fragmentZh = ref("");
const isTranslating = ref(false);

watch(
  () => courseStore.currentStatement,
  async (statement) => {
    fragmentZh.value = "";

    if (!statement?.isFragment || statement.chinese) {
      isTranslating.value = false;
      return;
    }

    const statementId = statement.id;
    const cached = getCachedTranslation(statement.english);
    if (cached) {
      fragmentZh.value = cached;
      isTranslating.value = false;
    } else {
      isTranslating.value = true;
    }

    const translated = cached || (await translateFragment(statement.english));
    // 等待翻译期间已经换题了，丢弃旧结果
    if (courseStore.currentStatement?.id !== statementId) return;

    fragmentZh.value = translated || fragmentChinese(statement.english, lookup, statement.analysis);
    isTranslating.value = false;
  },
  { immediate: true },
);

onMounted(() => {
  load();
  handleAutoPlayEnglish();
});

watch(
  () => courseStore.currentStatement,
  () => {
    handleAutoPlayEnglish();
  },
);

function handleAutoPlayEnglish() {
  const difficulty = learningPathStore.currentDifficulty;
  // 难度决定朗读帮助：入门强制自动读；进阶/高阶不自动读
  if (difficulty === "beginner") {
    playSound();
    return;
  }
  if (difficulty === "intermediate" || difficulty === "advanced") return;
  // 没有难度上下文时沿用全局设置
  if (isAutoPlayEnglish()) {
    playSound();
  }
}
</script>

<style scoped>
.question-panel {
  width: 100%;
  max-width: 980px;
  padding: 0 24px;
  text-align: center;
}

.thesis {
  margin: 56px auto 34px;
  font-size: 48px;
  line-height: 1.32;
  font-weight: 700;
  letter-spacing: 3px;
  color: #16293a;
}

.thesis.is-long {
  font-size: 36px;
  letter-spacing: 1.5px;
}

.thesis-fragment {
  font-size: 28px;
  font-weight: 600;
  letter-spacing: 1.5px;
  color: #4a6b82;
}

@media (max-width: 720px) {
  .thesis {
    margin: 30px auto 20px;
    font-size: 30px;
  }
}
</style>
