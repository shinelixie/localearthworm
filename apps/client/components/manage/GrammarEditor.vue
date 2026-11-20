<template>
  <div class="flex h-full flex-col">
    <div
      class="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-3 dark:border-gray-700"
    >
      <button
        :class="tabClass(mode === 'visual')"
        @click="switchMode('visual')"
      >
        可视化编辑
      </button>
      <button
        :class="tabClass(mode === 'json')"
        @click="switchMode('json')"
      >
        JSON 编辑
      </button>
      <span class="mx-2 h-5 w-px bg-gray-200 dark:bg-gray-700"></span>
      <button
        class="btn btn-ghost btn-sm"
        @click="addSegment"
      >
        + 成分
      </button>
      <button
        class="btn btn-ghost btn-sm"
        @click="rebuildFromEnglish"
      >
        从英文重建
      </button>
      <button
        class="btn btn-ghost btn-sm"
        @click="resetDraft"
      >
        重置
      </button>
      <div class="ml-auto flex items-center gap-2">
        <span
          :class="validation.ok ? 'text-emerald-600' : 'text-amber-600'"
          class="text-xs"
        >
          {{ validation.message }}
        </span>
        <button
          class="btn btn-sm border-none bg-purple-500 text-white hover:bg-purple-600"
          :disabled="saving || !canSave"
          @click="save"
        >
          {{ saving ? "保存中…" : "保存语法分析" }}
        </button>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto pt-3">
      <template v-if="mode === 'visual'">
        <div
          v-if="!draft.segments.length"
          class="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400 dark:border-gray-700"
        >
          还没有语法分析。可以点「从英文重建」生成单词列表，再按成分分组。
        </div>

        <div class="space-y-3">
          <div
            v-for="(segment, segmentIndex) in draft.segments"
            :key="segmentIndex"
            class="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900"
          >
            <div class="flex flex-wrap items-center gap-2">
              <input
                v-model="segment.role"
                class="input input-xs input-bordered w-28"
                placeholder="成分（主语）"
              />
              <input
                v-model="segment.roleEn"
                class="input input-xs input-bordered w-32"
                placeholder="roleEn"
              />
              <span class="text-xs text-gray-400">#{{ segmentIndex + 1 }}</span>
              <div class="ml-auto flex items-center gap-1">
                <button
                  class="btn btn-ghost btn-xs"
                  :disabled="segmentIndex === 0"
                  @click="moveSegment(segmentIndex, -1)"
                >
                  ↑
                </button>
                <button
                  class="btn btn-ghost btn-xs"
                  :disabled="segmentIndex === draft.segments.length - 1"
                  @click="moveSegment(segmentIndex, 1)"
                >
                  ↓
                </button>
                <button
                  class="btn btn-ghost btn-xs text-red-500"
                  @click="removeSegment(segmentIndex)"
                >
                  删除
                </button>
              </div>
            </div>

            <textarea
              v-model="segment.explanation"
              class="textarea textarea-bordered mt-2 w-full text-sm"
              rows="2"
              placeholder="这一成分的讲解"
            ></textarea>

            <div class="mt-2 space-y-1">
              <div
                v-for="(word, wordIndex) in segment.words"
                :key="wordIndex"
                class="grid grid-cols-[minmax(90px,1.1fr)_minmax(90px,1fr)_minmax(110px,1.2fr)_minmax(70px,0.8fr)_auto] gap-2"
              >
                <input
                  v-model="word.text"
                  class="input input-xs input-bordered"
                  placeholder="单词"
                />
                <input
                  v-model="word.phonetic"
                  class="input input-xs input-bordered"
                  placeholder="/音标/"
                />
                <input
                  v-model="word.meaning"
                  class="input input-xs input-bordered"
                  placeholder="中文释义"
                />
                <input
                  v-model="word.pos"
                  class="input input-xs input-bordered"
                  placeholder="词性"
                />
                <button
                  class="btn btn-ghost btn-xs text-red-500"
                  @click="removeWord(segmentIndex, wordIndex)"
                >
                  ×
                </button>
              </div>

              <button
                class="btn btn-ghost btn-xs"
                @click="addWord(segmentIndex)"
              >
                + 单词
              </button>
            </div>

            <p class="mt-2 text-xs text-gray-400">
              原文片段：{{
                segment.words
                  .map((word) => word.text)
                  .filter(Boolean)
                  .join(" ") || "—"
              }}
            </p>
          </div>
        </div>

        <div class="mt-5">
          <h3 class="mb-2 text-sm font-semibold text-gray-600 dark:text-gray-300">效果预览</h3>
          <div
            class="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-950"
          >
            <GrammarAnalysis :analysis="draft" />
          </div>
        </div>
      </template>

      <template v-else>
        <p class="mb-2 text-xs text-gray-500">
          直接编辑完整 JSON。每个成分包含 role / roleEn / text / explanation / words。
        </p>
        <textarea
          v-model="jsonText"
          class="textarea textarea-bordered h-[60vh] w-full font-mono text-xs"
          spellcheck="false"
        ></textarea>
        <div class="mt-2 flex items-center gap-2">
          <button
            class="btn btn-sm border-none bg-gray-700 text-white hover:bg-gray-800"
            @click="applyJson"
          >
            应用 JSON 到编辑器
          </button>
          <span
            v-if="jsonParse.error || jsonError"
            class="text-xs text-red-500"
          >
            {{ jsonParse.error || jsonError }}
          </span>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import type { Statement } from "~/types";
import type { AnalysisSegment, StatementAnalysis } from "~/types/models/statement-analysis";
import GrammarAnalysis from "~/components/main/GrammarAnalysis.vue";
import {
  analysisMeaningMap,
  parseJsonObject,
  tokenizeSentence,
  validateAnalysisWords,
} from "~/composables/manage/splitTreeTools";

const props = defineProps<{
  statement: Statement;
  saving?: boolean;
}>();

const emit = defineEmits<{
  (e: "save", analysis: StatementAnalysis): void;
}>();

const mode = ref<"visual" | "json">("visual");
const jsonText = ref("");
const jsonError = ref("");

function cloneAnalysis(): StatementAnalysis {
  const source = props.statement.analysis;
  if (!source?.segments) return { segments: [] };
  return JSON.parse(JSON.stringify(source));
}

const draft = ref<StatementAnalysis>(cloneAnalysis());

const validation = computed(() => validateAnalysisWords(props.statement.english, draft.value));
const jsonParse = computed(() => parseJsonObject(jsonText.value));
const canSave = computed(() => {
  if (mode.value === "visual") return true;
  return !jsonParse.value.error && Array.isArray(jsonParse.value.value?.segments);
});

watch(
  () => props.statement.id,
  () => {
    draft.value = cloneAnalysis();
    jsonText.value = "";
    jsonError.value = "";
    mode.value = "visual";
  },
);

function tabClass(active: boolean) {
  return active
    ? "rounded-lg bg-purple-500 px-3 py-1.5 text-sm text-white"
    : "rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-600 hover:bg-purple-50 dark:bg-gray-800 dark:text-gray-300";
}

function switchMode(next: "visual" | "json") {
  if (next === "json" && mode.value !== "json") {
    jsonText.value = JSON.stringify(draft.value, null, 2);
    jsonError.value = "";
  }
  mode.value = next;
}

function addSegment() {
  draft.value.segments.push({
    role: "成分",
    roleEn: "",
    text: "",
    explanation: "",
    words: [],
  });
}

function removeSegment(index: number) {
  draft.value.segments.splice(index, 1);
}

function moveSegment(index: number, delta: number) {
  const next = index + delta;
  if (next < 0 || next >= draft.value.segments.length) return;
  const [segment] = draft.value.segments.splice(index, 1);
  draft.value.segments.splice(next, 0, segment);
}

function addWord(segmentIndex: number) {
  draft.value.segments[segmentIndex].words.push({
    text: "",
    phonetic: "",
    meaning: "",
    pos: "",
  });
}

function removeWord(segmentIndex: number, wordIndex: number) {
  draft.value.segments[segmentIndex].words.splice(wordIndex, 1);
}

/** 按英文重建一个覆盖全句的单词列表；尽量保留已有释义 */
function rebuildFromEnglish() {
  const keep = analysisMeaningMap(props.statement.analysis);
  const tokens = tokenizeSentence(props.statement.english).filter((token) => token.word);
  const words = tokens.map((token) => ({
    text: token.word,
    phonetic: "",
    meaning: keep.get(token.word.toLowerCase().replace(/[^a-z0-9]/g, "")) ?? "",
    pos: "",
  }));
  draft.value = {
    segments: [
      {
        role: "句子",
        roleEn: "sentence",
        text: words.map((word) => word.text).join(" "),
        explanation: "先把单词列出来，再按语法成分分组。",
        words,
      },
    ],
  };
}

function resetDraft() {
  draft.value = cloneAnalysis();
}

function applyJson() {
  const parsed = parseJsonObject(jsonText.value);
  if (parsed.error) {
    jsonError.value = parsed.error;
    return;
  }
  if (!Array.isArray(parsed.value?.segments)) {
    jsonError.value = "JSON 里必须有 segments 数组";
    return;
  }
  const value = parsed.value as StatementAnalysis;
  draft.value = {
    ...value,
    segments: value.segments.map((segment) => ({
      ...segment,
      role: String(segment.role ?? ""),
      roleEn: String(segment.roleEn ?? ""),
      explanation: String(segment.explanation ?? ""),
      words: Array.isArray(segment.words) ? segment.words : [],
    })),
  };
  jsonError.value = "";
}

function save() {
  let source = draft.value;
  if (mode.value === "json") {
    const parsed = jsonParse.value;
    if (parsed.error || !Array.isArray(parsed.value?.segments)) {
      jsonError.value = parsed.error || "JSON 里必须有 segments 数组";
      return;
    }
    source = parsed.value as StatementAnalysis;
    draft.value = source;
  }

  const analysis: StatementAnalysis = {
    ...source,
    segments: source.segments.map((segment: AnalysisSegment) => ({
      ...segment,
      words: (segment.words ?? [])
        .map((word) => ({
          text: String(word.text ?? "").trim(),
          phonetic: String(word.phonetic ?? ""),
          meaning: String(word.meaning ?? ""),
          pos: String(word.pos ?? ""),
        }))
        .filter((word) => word.text),
      text: (segment.words ?? [])
        .map((word) => String(word.text ?? "").trim())
        .filter(Boolean)
        .join(" "),
    })),
  };
  emit("save", analysis);
}
</script>
