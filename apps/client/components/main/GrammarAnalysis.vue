<template>
  <div
    v-if="analysis && analysis.segments.length"
    class="grammar-card"
  >
    <div
      v-for="(segment, index) in analysis.segments"
      :key="`${segment.role}-${index}`"
      class="segment"
      :style="{
        borderColor: withAlpha(roleColor(segment.role), '66'),
        backgroundColor: withAlpha(roleColor(segment.role), '0f'),
      }"
      :title="segment.explanation"
    >
      <span
        class="role-badge"
        :style="{ backgroundColor: roleColor(segment.role) }"
      >
        {{ segment.role }}
      </span>

      <div
        v-if="segment.words && segment.words.length"
        class="words"
      >
        <div
          v-for="word in segment.words"
          :key="word.text"
          class="word"
        >
          <span class="phonetic">{{ word.phonetic }}</span>
          <span class="word-text">{{ word.text }}</span>
          <span
            class="underline"
            :style="{ backgroundColor: posColor(word.pos) }"
          ></span>
          <span class="meaning">{{ word.meaning }}</span>
          <span class="pos">{{ word.pos }}</span>
        </div>
      </div>

      <p
        v-else
        class="structure-explanation"
      >
        {{ segment.explanation }}
      </p>
    </div>
  </div>
  <div
    v-else
    class="empty"
  >
    该句还没有语法成分标注
  </div>
</template>

<script setup lang="ts">
import type { StatementAnalysis } from "~/types/models/statement-analysis";

defineProps<{
  analysis: StatementAnalysis | null | undefined;
}>();

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
  插入语: "#7b8a80",
  语法结构: "#7b8a80",
};

/** 词性颜色：和参考应用一致，名词蓝、动词绿、形容词/介词紫、连词粉、副词橙、限定词青 */
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
};

function roleColor(role: string) {
  return ROLE_COLORS[role] ?? "#7b8a80";
}

function posColor(pos: string) {
  return POS_COLORS[pos] ?? "#94a3b8";
}

function withAlpha(hex: string, alpha: string) {
  return `${hex}${alpha}`;
}
</script>

<style scoped>
.grammar-card {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 30px 22px;
  padding: 30px 24px 20px;
  border-radius: 20px;
  background-color: #f2f9f0;
}

.segment {
  position: relative;
  min-width: 0;
  padding: 24px 24px 14px;
  border: 1px solid;
  border-radius: 18px;
  overflow: visible;
}

.role-badge {
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

.words {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: center;
  column-gap: 22px;
  row-gap: 14px;
}

.word {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 58px;
}

.phonetic {
  font-size: 12px;
  line-height: 1.4;
  color: #8b9a92;
  white-space: nowrap;
}

.word-text {
  margin-top: 2px;
  font-size: 30px;
  font-weight: 700;
  line-height: 1.08;
  color: #16232b;
  white-space: nowrap;
}

.underline {
  width: 100%;
  height: 5px;
  margin: 7px 0 5px;
  border-radius: 999px;
}

.meaning {
  font-size: 14px;
  line-height: 1.4;
  color: #40524a;
  text-align: center;
}

.pos {
  margin-top: 2px;
  font-size: 11.5px;
  line-height: 1.4;
  color: #9aa89f;
}

.structure-explanation {
  max-width: 860px;
  font-size: 14px;
  line-height: 1.75;
  color: #3f5249;
}

.empty {
  padding: 18px;
  border-radius: 14px;
  background-color: #f4f4f8;
  text-align: center;
  font-size: 13px;
  color: #8a8a99;
}

@media (max-width: 720px) {
  .grammar-card {
    gap: 24px 14px;
    padding: 24px 14px 14px;
  }

  .segment {
    padding: 20px 14px 12px;
  }

  .words {
    column-gap: 14px;
  }

  .word-text {
    font-size: 22px;
  }

  .meaning {
    font-size: 12.5px;
  }
}

.dark .grammar-card {
  background-color: #1d2822;
}

.dark .word-text {
  color: #eef4ef;
}

.dark .phonetic,
.dark .pos {
  color: #8ba095;
}

.dark .meaning {
  color: #cfdcd3;
}

.dark .structure-explanation {
  color: #cfdcd3;
}

.dark .empty {
  background-color: #26262f;
  color: #8a8a9e;
}
</style>
