<template>
  <div class="answer-panel">
    <!-- 上一题回顾 -->
    <div
      v-if="prevStatement"
      class="prev-line"
    >
      <span class="prev-label">上一题</span>
      <span class="prev-sep">|</span>
      <span class="prev-en">{{ prevStatement.english }}</span>
      <UIcon
        name="i-ph-check-bold"
        class="prev-check"
      />
      <span class="prev-cn">{{ prevStatement.chinese }}</span>
    </div>

    <!-- 中文主句 -->
    <div class="thesis-wrap">
      <h1
        class="thesis"
        :class="{ 'is-long': thesisLength > 14 }"
      >
        {{ thesis }}
      </h1>
      <button
        class="sound-btn"
        title="播放整句发音"
        @click="handlePlayEnglishSound"
      >
        <UIcon
          name="i-ph-speaker-simple-high"
          class="h-5 w-5"
        />
      </button>
    </div>

    <!-- 逐词拆解：有语法标注时按成分框选当前题目的单词 -->
    <div class="grammar-row">
      <div
        v-for="(group, gi) in displayGroups"
        :key="gi"
        class="segment-box"
        :class="{ 'no-role': !group.role }"
        :style="
          group.role
            ? {
                borderColor: withAlpha(roleColor(group.role), '66'),
                backgroundColor: withAlpha(roleColor(group.role), '0f'),
              }
            : undefined
        "
      >
        <span
          v-if="group.role"
          class="segment-badge"
          :style="{ backgroundColor: roleColor(group.role) }"
          >{{ group.role }}</span
        >
        <div
          class="word-row"
          :class="{ 'is-dense': cards.length > 9 }"
        >
          <div
            v-for="(card, index) in group.cards"
            :key="`${card.text}-${index}`"
            class="word-col"
            @click="handlePlayWordSound(card.text)"
          >
            <div class="word-phonetic">{{ card.phonetic || " " }}</div>
            <div class="word-en">{{ card.text }}</div>
            <div
              class="word-rule"
              :style="{ backgroundColor: posColor(card.pos) }"
            ></div>
            <div class="word-cn">{{ card.translation || " " }}</div>
            <div class="word-pos">{{ card.pos || " " }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 统计 -->
    <div class="stat-row">
      <div class="stat-pill">
        已答对 <b>{{ stats.correctCount.value }}</b>
      </div>
      <div class="stat-pill">
        已答错 <b>{{ stats.wrongCount.value }}</b>
      </div>
      <div class="stat-pill">
        实时正确率 <b>{{ stats.accuracy.value }}%</b>
      </div>
    </div>

    <!-- 操作 -->
    <div class="action-row">
      <button
        class="pill-btn"
        @click="goToPreviousQuestion"
      >
        上一题
      </button>
      <button
        class="pill-btn"
        @click="showQuestion"
      >
        重新听写
      </button>
      <button
        class="pill-btn"
        @click="skipQuestion"
      >
        跳过本题
      </button>
      <button
        v-if="!courseStore.currentStatement?.isFragment"
        class="pill-btn"
        @click="markStatementAsMastered"
      >
        <UIcon
          name="i-ph-star"
          class="star-icon"
        />
        收藏
      </button>
      <button
        class="primary-btn"
        @click="goToNextQuestion"
      >
        下一题
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";

import type { WordCard } from "~/composables/main/wordInfo";
import {
  recentlyPlayedDetached,
  useCurrentStatementEnglishSound,
} from "~/composables/main/englishSound";
import { usePlayWordSound } from "~/composables/main/englishSound/audio";
import { useGameMode } from "~/composables/main/game";
import { useGrammarAnalysis } from "~/composables/main/grammarAnalysis";
import { useSessionStats } from "~/composables/main/sessionStats";
import { useMastered } from "~/composables/main/useMastered";
import { buildWordCards, useWordInfo } from "~/composables/main/wordInfo";
import { useAutoPronunciation } from "~/composables/user/sound";
import { useCourseStore } from "~/store/course";
import { cancelShortcut, registerShortcut } from "~/utils/keyboardShortcuts";
import { useAnswer } from "./QuestionInput/useAnswer";

const courseStore = useCourseStore();
const { handlePlayWordSound } = usePlayWordSound();
const { showQuestion } = useGameMode();
const { goToNextQuestion } = useAnswer();
const { markStatementAsMastered } = useMastered();
const stats = useSessionStats();
const { isVisible: isGrammarVisible } = useGrammarAnalysis();

// ---------- 逐词拆解 ----------
const { isReady, load, lookup } = useWordInfo();

const cards = computed(() => {
  // 依赖 isReady，词表加载完成后重新计算
  if (!isReady.value) return [];
  const statement = courseStore.currentStatement;
  if (!statement) return [];
  return buildWordCards(statement.english, statement.soundmark, lookup, statement.analysis);
});

const thesis = computed(() => courseStore.currentStatement?.chinese || "");
const thesisLength = computed(() => thesis.value.length);

// ---------- 按语法成分框选当前题目的单词 ----------
/**
 * 字母数字片段粒度：按任意非字母数字字符（空格/连字符/撇号）切开。
 * 语法标注里偶有多词词条（如 "Foreign Office"）或连字符词，
 * 与显示卡片必须用同一套粒度，否则对不上。
 */
const wordAtoms = (text: string) => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

const grammarGroups = computed<{ role: string; segmentIndex: number; cards: WordCard[] }[]>(() => {
  const statement = courseStore.currentStatement;
  const segments = statement?.analysis?.segments;
  if (!isGrammarVisible.value || !segments?.length) return [];

  const cardsList = cards.value;
  if (!cardsList.length) return [];

  const analysisWords: { segmentIndex: number; role: string; norm: string }[] = [];
  segments.forEach((segment, segmentIndex) => {
    (segment.words ?? []).forEach((word) => {
      // 多词词条（Foreign Office）/连字符词按字母数字片段拆开，与显示卡片同粒度
      wordAtoms(word.text).forEach((norm) =>
        analysisWords.push({ segmentIndex, role: segment.role, norm }),
      );
    });
  });
  if (!analysisWords.length) return [];

  // 一个显示卡片可能被语法标注拆成多个词（如 unique—a → unique / a），
  // 因此按“字母数字片段”展平后再对齐，卡片仍作为整体显示。
  const cardSegments = cardsList.map((card) => wordAtoms(card.text));
  const target = cardSegments.flat();
  if (!target.length) return [];

  // 当前题目可能是整句，也可能是某个片段：在整句标注里找连续匹配的单词区间
  let start = -1;
  for (let i = 0; i + target.length <= analysisWords.length; i += 1) {
    let matched = true;
    for (let j = 0; j < target.length; j += 1) {
      if (analysisWords[i + j].norm !== target[j]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      start = i;
      break;
    }
  }
  if (start < 0) return [];

  const groups: { role: string; segmentIndex: number; cards: WordCard[] }[] = [];
  let offset = start;
  cardsList.forEach((card, cardIndex) => {
    const first = analysisWords[offset];
    const last = groups[groups.length - 1];
    if (last && last.segmentIndex === first.segmentIndex) {
      last.cards.push(card);
    } else {
      groups.push({ role: first.role, segmentIndex: first.segmentIndex, cards: [card] });
    }
    offset += cardSegments[cardIndex].length;
  });
  return groups;
});

const displayGroups = computed(() =>
  grammarGroups.value.length
    ? grammarGroups.value
    : [{ role: "", segmentIndex: -1, cards: cards.value }],
);

// ---------- 上一题 ----------
const prevStatement = computed(() => {
  const list = courseStore.currentCourse?.statements;
  const index = courseStore.statementIndex;
  if (!list || index <= 0) return null;
  return list[index - 1] || null;
});

// ---------- 词性配色 ----------
const POS_COLORS: Record<string, string> = {
  名词: "#3b82f6",
  动词: "#22c55e",
  助动词: "#22c55e",
  形容词: "#a855f7",
  副词: "#f59e0b",
  介词: "#a855f7",
  限定词: "#14b8a6",
  冠词: "#14b8a6",
  代词: "#3b82f6",
  数词: "#3b82f6",
  连词: "#ec4899",
  从属连词: "#ec4899",
  关系副词: "#f59e0b",
  感叹词: "#f59e0b",
  缩写: "#94a3b8",
};

function posColor(pos: string) {
  return POS_COLORS[pos] || "#7c8798";
}

// 语法成分颜色（与解析卡片一致）
const ROLE_COLORS: Record<string, string> = {
  主语: "#e8a13c",
  谓语: "#e05252",
  宾语: "#4b7bec",
  表语: "#2d9cdb",
  定语: "#22a06b",
  状语: "#9b51e0",
  补语: "#219653",
  连词: "#ec4899",
  宾语从句: "#4b7bec",
  定语从句: "#22a06b",
  状语从句: "#9b51e0",
  目的状语: "#9b51e0",
  原因状语: "#9b51e0",
  条件状语: "#9b51e0",
  时间状语: "#9b51e0",
  地点状语: "#9b51e0",
  方式状语: "#9b51e0",
  语法结构: "#7b8a80",
};

function roleColor(role: string) {
  return ROLE_COLORS[role] || "#7b8a80";
}

function withAlpha(hex: string, alpha: string) {
  return `${hex}${alpha}`;
}

// ---------- 操作 ----------
function goToPreviousQuestion() {
  courseStore.toPreviousStatement();
  showQuestion();
}

function skipQuestion() {
  courseStore.toNextStatement();
  showQuestion();
}

registerShortcutKeyForNextQuestion();

function usePlayEnglishSound() {
  const { playSound } = useCurrentStatementEnglishSound();
  const { isAutoPlaySound } = useAutoPronunciation();

  onMounted(() => {
    // 答对的那一刻已经用独立音轨读过一遍了，这里别再重播
    if (isAutoPlaySound() && !recentlyPlayedDetached()) {
      playSound();
    }
  });

  return {
    handlePlayEnglishSound() {
      playSound();
    },
  };
}

const { handlePlayEnglishSound } = usePlayEnglishSound();

function registerShortcutKeyForNextQuestion() {
  function handleKeydown(e: KeyboardEvent) {
    e.preventDefault(); // 阻止到下一个页面的默认按键动作
    goToNextQuestion();
  }
  onMounted(() => {
    registerShortcut(" ", handleKeydown);
    registerShortcut("enter", handleKeydown);
    load();
  });

  onUnmounted(() => {
    cancelShortcut(" ", handleKeydown);
    cancelShortcut("enter", handleKeydown);
  });
}
</script>

<style scoped>
.answer-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 980px;
  margin: 0 auto;
  padding: 0 24px;
}

/* 上一题 */
.prev-line {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 20px;
  font-size: 12.5px;
  color: #5f83a0;
}

.prev-label {
  color: #7b9ab3;
}

.prev-sep {
  color: #a8c4d8;
}

.prev-en {
  color: #4a7593;
}

.prev-check {
  width: 12px;
  height: 12px;
  color: #35b56a;
}

.prev-cn {
  color: #4a7593;
}

/* 中文主句 */
.thesis-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 30px;
}

.thesis {
  font-size: 48px;
  line-height: 1.32;
  font-weight: 700;
  letter-spacing: 3px;
  color: #16293a;
  text-align: center;
}

.thesis.is-long {
  font-size: 36px;
  letter-spacing: 1.5px;
}

.sound-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  margin-left: 12px;
  border-radius: 999px;
  color: #4a7593;
  opacity: 0;
  transition: opacity 0.18s ease;
}

.thesis-wrap:hover .sound-btn {
  opacity: 0.75;
}

.sound-btn:hover {
  opacity: 1;
  background-color: rgba(255, 255, 255, 0.7);
}

/* 单词行 */
.word-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: center;
  gap: 56px;
  margin-top: 34px;
  width: 100%;
}

.word-row.is-dense {
  gap: 34px;
}

/* 语法成分框选：每个成分一个圆角框 + 顶部标签 */
.grammar-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: center;
  gap: 36px 26px;
  margin-top: 34px;
  width: 100%;
}

.segment-box {
  position: relative;
  padding: 26px 24px 10px;
  border: 1px solid;
  border-radius: 18px;
}

.segment-box.no-role {
  padding: 0;
  border: none;
  background: transparent;
}

.segment-badge {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 3px 13px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.5;
  color: #fff;
  white-space: nowrap;
  box-shadow: 0 2px 6px rgba(20, 40, 30, 0.12);
}

.segment-box .word-row {
  margin-top: 0;
  width: auto;
  gap: 36px;
}

.segment-box .word-row.is-dense {
  gap: 26px;
}

.segment-box.no-role .word-row {
  width: 100%;
  gap: 56px;
}

.segment-box.no-role .word-row.is-dense {
  gap: 34px;
}

.word-col {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 70px;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.word-col:hover {
  transform: translateY(-2px);
}

.word-en {
  font-family: Georgia, "Times New Roman", "Songti SC", serif;
  font-size: 46px;
  font-weight: 700;
  line-height: 1.12;
  color: #17493b;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

.is-dense .word-en {
  font-size: 34px;
}

.word-rule {
  width: 100%;
  height: 4px;
  margin: 7px 0 5px;
  border-radius: 999px;
  background-color: rgba(23, 73, 59, 0.38);
}

.word-phonetic {
  font-size: 12px;
  line-height: 1.4;
  letter-spacing: 0.4px;
  color: #5c7f99;
  white-space: nowrap;
}

.word-cn {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 15px;
  font-weight: 500;
  line-height: 1.35;
  color: #17493b;
  white-space: nowrap;
}

.is-dense .word-cn {
  max-width: 150px;
  font-size: 13.5px;
}

.word-pos {
  margin-top: 2px;
  font-size: 11.5px;
  line-height: 1.4;
  color: #9aa89f;
}

.is-dense .word-pos {
  font-size: 10.5px;
}

/* 统计 */
.stat-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  margin-top: 40px;
}

.stat-pill {
  display: flex;
  align-items: baseline;
  gap: 7px;
  padding: 8px 20px;
  border-radius: 999px;
  background-color: rgba(255, 255, 255, 0.55);
  font-size: 13.5px;
  color: #2c5d7c;
  white-space: nowrap;
}

.stat-pill b {
  font-size: 17px;
  font-weight: 700;
  color: #12293c;
  font-variant-numeric: tabular-nums;
}

/* 操作 */
.action-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 13px;
  margin-top: 26px;
  padding-bottom: 40px;
}

.pill-btn {
  display: inline-flex;
  align-items: center;
  padding: 9px 25px;
  border-radius: 9px;
  background-color: rgba(255, 255, 255, 0.88);
  font-size: 15px;
  color: #17493b;
  box-shadow: 0 1px 2px rgba(23, 73, 59, 0.08);
  transition:
    background-color 0.15s ease,
    transform 0.1s ease;
}

.pill-btn:hover {
  background-color: #fff;
}

.pill-btn:active {
  transform: scale(0.98);
}

.star-icon {
  width: 15px;
  height: 15px;
  margin-right: 5px;
}

.primary-btn {
  padding: 9px 30px;
  border-radius: 9px;
  background-color: #2fb344;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  box-shadow: 0 2px 6px rgba(47, 179, 68, 0.28);
  transition:
    background-color 0.15s ease,
    transform 0.1s ease;
}

.primary-btn:hover {
  background-color: #29a03c;
}

.primary-btn:active {
  transform: scale(0.98);
}

@media (max-width: 720px) {
  .thesis {
    font-size: 30px;
  }
  .grammar-row {
    gap: 28px 14px;
  }
  .segment-box {
    padding: 22px 12px 8px;
  }
  .word-en {
    font-size: 28px;
  }
  .is-dense .word-en {
    font-size: 22px;
  }
  .word-row,
  .segment-box.no-role .word-row {
    gap: 22px;
  }
  .segment-box .word-row {
    gap: 18px;
  }
  .word-cn {
    max-width: 120px;
    font-size: 13px;
  }
}
</style>
