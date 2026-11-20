<template>
  <div class="flex h-full flex-col">
    <div
      class="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-3 dark:border-gray-700"
    >
      <button
        :class="tabClass(mode === 'visual')"
        @click="switchMode('visual')"
      >
        分块编辑
      </button>
      <button
        :class="tabClass(mode === 'json')"
        @click="switchMode('json')"
      >
        树 JSON
      </button>
      <span class="mx-2 h-5 w-px bg-gray-200 dark:bg-gray-700"></span>
      <button
        class="btn btn-ghost btn-sm"
        @click="applyAutoBreaks"
      >
        自动分块
      </button>
      <button
        class="btn btn-ghost btn-sm"
        @click="breakEveryWord"
      >
        每词一块
      </button>
      <button
        class="btn btn-ghost btn-sm"
        @click="mergeAll"
      >
        合成一块
      </button>
      <button
        class="btn btn-ghost btn-sm"
        :disabled="!hasTree"
        @click="loadFromTree"
      >
        载入当前树
      </button>
      <div class="ml-auto flex items-center gap-2">
        <span
          :class="currentTreeValid ? 'text-emerald-600' : 'text-red-500'"
          class="text-xs"
        >
          {{ treeStatus }}
        </span>
        <button
          class="btn btn-sm border-none bg-purple-500 text-white hover:bg-purple-600"
          :disabled="saving || !currentTreeValid"
          @click="save"
        >
          {{ saving ? "保存中…" : "保存拆分树" }}
        </button>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto pt-3">
      <template v-if="mode === 'visual'">
        <p class="mb-3 text-xs text-gray-500">
          点击单词之间的竖线可以「断开/合并」，每个分块填中文。保存后会生成 「整句 → 分块 →
          单词」三层树，供四种练法共用。
        </p>
        <p
          v-if="currentTreeDepth > 3"
          class="mb-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300"
        >
          当前是
          {{
            currentTreeDepth
          }}
          层嵌套树：下面的竖线只表示「最细一层语块」的断点，树里的合并层（例如 over how we should
          react）不会改变竖线；在这里保存会用这些分块重建为三层平铺树。
        </p>

        <div
          class="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-950"
        >
          <div class="flex flex-wrap items-center gap-y-2">
            <template
              v-for="(word, index) in words"
              :key="index"
            >
              <span
                class="rounded-md bg-white px-2 py-1 text-sm text-gray-800 shadow-sm dark:bg-gray-800 dark:text-gray-100"
              >
                {{ word.word }}
              </span>
              <button
                v-if="index < words.length - 1"
                :class="[
                  'mx-1 flex h-6 w-4 items-center justify-center rounded text-xs transition-colors',
                  breaks[index]
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-200 text-gray-400 hover:bg-purple-200 dark:bg-gray-700',
                ]"
                :title="breaks[index] ? '点击合并' : '点击断开'"
                @click="toggleBreak(index)"
              >
                |
              </button>
            </template>
          </div>
        </div>

        <div class="mt-3 space-y-2">
          <div
            v-for="(group, index) in groups"
            :key="`${group.start}-${group.end}`"
            class="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900"
          >
            <div class="flex flex-wrap items-baseline gap-2">
              <span class="text-xs font-semibold text-purple-500">分块 {{ index + 1 }}</span>
              <span class="text-sm text-gray-700 dark:text-gray-200">
                {{
                  words
                    .slice(group.start, group.end + 1)
                    .map((word) => word.word)
                    .join(" ")
                }}
              </span>
            </div>
            <input
              v-model="groupZh[group.start]"
              class="input input-sm input-bordered mt-2 w-full"
              @input="markVisualDirty"
              placeholder="这一块的自然中文（可留空，整句仍用上面的翻译）"
            />
          </div>
        </div>

        <details
          v-if="currentTreeDepth > 3"
          class="mt-3 rounded-lg border border-gray-200 bg-white p-3 text-xs dark:border-gray-700 dark:bg-gray-900"
        >
          <summary class="cursor-pointer text-gray-600 dark:text-gray-300">
            查看当前树的层级结构（{{ treeOutline.length }} 个节点）
          </summary>
          <div class="mt-2 max-h-64 space-y-0.5 overflow-y-auto font-mono text-[11px]">
            <div
              v-for="node in treeOutline"
              :key="node.key"
              :style="{ paddingLeft: `${node.depth * 14}px` }"
              class="flex gap-2"
            >
              <span class="shrink-0 text-gray-400">L{{ node.level }}</span>
              <span class="text-gray-700 dark:text-gray-200">{{ node.en }}</span>
              <span
                v-if="node.zh"
                class="text-gray-400"
              >
                · {{ node.zh }}
              </span>
            </div>
          </div>
        </details>
      </template>

      <template v-else>
        <p class="mb-2 text-xs text-gray-500">
          高级模式：range 是闭区间 token 下标，子节点必须连续覆盖父节点。可以只贴根节点 （level /
          range / en / zh / children），系统会按当前英文自动补 tokens；也可以贴完整 { rawText,
          tokens, tree }。
        </p>
        <div class="mb-2 flex flex-wrap gap-2">
          <button
            class="btn btn-ghost btn-xs"
            @click="jsonFromVisual"
          >
            从当前分块生成 JSON
          </button>
          <button
            class="btn btn-ghost btn-xs"
            :disabled="!hasTree"
            @click="jsonFromStatement"
          >
            载入现有树 JSON
          </button>
        </div>
        <textarea
          v-model="jsonText"
          class="textarea textarea-bordered h-[60vh] w-full font-mono text-xs"
          spellcheck="false"
        ></textarea>
        <p
          v-if="jsonParse.error"
          class="mt-2 text-xs text-red-500"
        >
          {{ jsonParse.error }}
        </p>
      </template>

      <div class="mt-6">
        <h3 class="mb-2 text-sm font-semibold text-gray-600 dark:text-gray-300">
          四种练法的拆分效果
        </h3>
        <div class="grid gap-3 lg:grid-cols-2">
          <div
            v-for="preview in previews"
            :key="preview.mode"
            class="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900"
          >
            <div class="mb-2 flex items-center justify-between">
              <span class="text-sm font-medium">{{ preview.label }}</span>
              <span class="text-xs text-gray-400">{{ preview.items.length }} 题</span>
            </div>
            <div class="max-h-56 space-y-1 overflow-y-auto pr-1">
              <div
                v-for="(item, index) in preview.items"
                :key="index"
                class="rounded bg-gray-50 px-2 py-1 text-xs dark:bg-gray-800"
              >
                <div class="flex items-center gap-2">
                  <span class="text-gray-400">{{ index + 1 }}.</span>
                  <span class="text-gray-700 dark:text-gray-200">{{ item.english }}</span>
                </div>
                <div class="mt-0.5 flex flex-wrap gap-2 text-[11px] text-gray-400">
                  <span v-if="item.chinese">{{ item.chinese }}</span>
                  <span v-if="item.hint">· {{ item.hint }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import type { SplitTree, SplitTreeNode, Statement } from "~/types";
import { isValidSplitTree, SPLIT_OPTIONS, splitStatements } from "~/composables/main/splitMode";
import {
  analysisMeaningMap,
  buildFlatSplitTree,
  defaultBreaks,
  groupsFromBreaks,
  normalizeSplitTreeInput,
  parseJsonObject,
  tokenizeSentence,
  treeChunkGroups,
  treeMaxLevel,
  wordSegments,
} from "~/composables/manage/splitTreeTools";

const props = defineProps<{
  statement: Statement;
  saving?: boolean;
}>();

const emit = defineEmits<{
  (e: "save", tree: SplitTree): void;
}>();

const mode = ref<"visual" | "json">("visual");
const jsonText = ref("");

const tokens = computed(() => tokenizeSentence(props.statement.english));
const words = computed(() => tokens.value.filter((token) => token.word));
const wordCount = computed(() => words.value.length);
const wordZh = computed(() => analysisMeaningMap(props.statement.analysis));

const breaks = ref<boolean[]>([]);
const groupZh = ref<Record<number, string>>({});
/** 分块编辑是否被手动改过；没改过时预览直接用保存的（可能是多层嵌套的）树 */
const visualDirty = ref(false);
/** 「分块编辑」当前对应的树：未改动时是保存/刚粘贴的原始树，改动后是重建的平铺树 */
const sourceTree = ref<SplitTree | null>(null);

const groups = computed(() => groupsFromBreaks(breaks.value, wordCount.value));

const hasTree = computed(() => isValidSplitTree(props.statement.splitTree));

/** 把一棵已保存的树同步回「分块编辑」的断点和中文 */
function applyTreeToVisual(tree: SplitTree | null | undefined) {
  const tokenList = tokenizeSentence(props.statement.english);
  const count = tokenList.filter((token) => token.word).length;
  const chunkGroups = treeChunkGroups(tree);
  const nextBreaks = new Array(Math.max(0, count - 1)).fill(false);
  const nextZh: Record<number, string> = {};

  if (chunkGroups.length > 1) {
    chunkGroups.forEach((group) => {
      if (group.start > 0) nextBreaks[group.start - 1] = true;
      if (group.zh) nextZh[group.start] = group.zh;
    });
  } else {
    const auto = defaultBreaks(tokenList);
    auto.forEach((value, index) => {
      nextBreaks[index] = value;
    });
    if (chunkGroups.length === 1 && chunkGroups[0].zh) {
      nextZh[0] = chunkGroups[0].zh;
    }
  }

  breaks.value = nextBreaks;
  groupZh.value = nextZh;
  sourceTree.value = tree ?? null;
  visualDirty.value = false;
  jsonText.value = tree ? JSON.stringify(tree, null, 2) : "";
}

/** 手动改分块后，预览切到「按当前分块重建的平铺树」 */
function markVisualDirty() {
  visualDirty.value = true;
}

function initFromStatement() {
  applyTreeToVisual(props.statement.splitTree);
  mode.value = "visual";
}

watch(
  () => props.statement.id,
  () => {
    initFromStatement();
  },
  { immediate: true },
);

// 保存 JSON 后父组件会回写 statement.splitTree；同步回分块编辑，
// 避免切回「分块编辑」时还显示保存前的那一套断点。
watch(
  () => props.statement.splitTree,
  (tree) => {
    if (tree) applyTreeToVisual(tree);
  },
);

function tabClass(active: boolean) {
  return active
    ? "rounded-lg bg-purple-500 px-3 py-1.5 text-sm text-white"
    : "rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-600 hover:bg-purple-50 dark:bg-gray-800 dark:text-gray-300";
}

function switchMode(next: "visual" | "json") {
  if (next === "json" && mode.value === "visual") {
    // 分块被改过，或还没有现成 JSON：用当前分块生成一份，保证两个页签的预览一致
    if (visualDirty.value || !jsonText.value.trim()) {
      const tree = buildCurrentVisualTree();
      if (tree) jsonText.value = JSON.stringify(tree, null, 2);
    }
  }
  if (next === "visual" && mode.value === "json") {
    // JSON 里是一棵合法树时，切回分块编辑也同步过去（包括未保存的修改）
    const parsed = jsonParse.value;
    if (parsed.tree && isValidSplitTree(parsed.tree) && treeMatchesEnglish.value) {
      applyTreeToVisual(parsed.tree);
    }
  }
  mode.value = next;
}

function jsonFromVisual() {
  const tree = buildCurrentVisualTree();
  if (tree) applyTreeToVisual(tree);
}

function jsonFromStatement() {
  if (props.statement.splitTree) {
    applyTreeToVisual(props.statement.splitTree);
  }
}

function remapGroupZh(oldBreaks: boolean[], newBreaks: boolean[]) {
  const oldGroups = groupsFromBreaks(oldBreaks, wordCount.value);
  const newGroups = groupsFromBreaks(newBreaks, wordCount.value);
  const nextZh: Record<number, string> = {};
  newGroups.forEach((group) => {
    const overlap = oldGroups.find((old) => group.start <= old.end && old.start <= group.end);
    if (overlap && groupZh.value[overlap.start] !== undefined) {
      nextZh[group.start] = groupZh.value[overlap.start];
    }
  });
  groupZh.value = nextZh;
}

function toggleBreak(index: number) {
  const next = [...breaks.value];
  next[index] = !next[index];
  remapGroupZh(breaks.value, next);
  breaks.value = next;
  markVisualDirty();
}

function applyAutoBreaks() {
  const next = defaultBreaks(tokens.value);
  remapGroupZh(breaks.value, next);
  breaks.value = next;
  markVisualDirty();
}

function breakEveryWord() {
  const next = new Array(Math.max(0, wordCount.value - 1)).fill(true);
  remapGroupZh(breaks.value, next);
  breaks.value = next;
  markVisualDirty();
}

function mergeAll() {
  const next = new Array(Math.max(0, wordCount.value - 1)).fill(false);
  remapGroupZh(breaks.value, next);
  breaks.value = next;
  markVisualDirty();
}

function loadFromTree() {
  initFromStatement();
}

function buildCurrentVisualTree(): SplitTree | null {
  return buildFlatSplitTree({
    english: props.statement.english,
    chinese: props.statement.chinese,
    tokens: tokens.value,
    breaks: breaks.value,
    groupZh: groupZh.value,
    wordZh: wordZh.value,
  });
}

const jsonParse = computed(() => {
  if (mode.value !== "json") return { tree: null as SplitTree | null, error: "" };
  const parsed = parseJsonObject(jsonText.value);
  if (parsed.error) return { tree: null, error: parsed.error };
  const normalized = normalizeSplitTreeInput(parsed.value, props.statement.english);
  if (normalized.error) return { tree: null, error: normalized.error };
  return { tree: normalized.tree, error: "" };
});

const currentTree = computed<SplitTree | null>(() => {
  if (mode.value === "json") return jsonParse.value.tree;
  // 没动过分块时直接沿用保存/粘贴的树（可能是多层嵌套），
  // 这样「四种练法的拆分效果」与树 JSON 页签完全一致；改过才按分块重建平铺树。
  if (!visualDirty.value && sourceTree.value) return sourceTree.value;
  return buildCurrentVisualTree();
});

const currentTreeDepth = computed(() => treeMaxLevel(currentTree.value));

interface TreeOutlineRow {
  key: string;
  depth: number;
  level: number;
  en: string;
  zh: string;
}

/** 当前树的完整层级（只读），用来确认树 JSON 里改的合并层确实生效 */
const treeOutline = computed<TreeOutlineRow[]>(() => {
  const root = currentTree.value?.tree;
  if (!root) return [];
  const rows: TreeOutlineRow[] = [];
  const walk = (node: SplitTreeNode, depth: number) => {
    rows.push({
      key: `${depth}:${node.range?.[0]}-${node.range?.[1]}:${rows.length}`,
      depth,
      level: node.level,
      en: node.en,
      zh: node.zh ?? "",
    });
    (node.children ?? []).forEach((child) => walk(child, depth + 1));
  };
  walk(root, 0);
  return rows;
});

const treeMatchesEnglish = computed(() => {
  const tree = currentTree.value;
  if (!tree) return false;
  const treeWords = tree.tokens.flatMap((token) => wordSegments(token.word)).join(" ");
  const englishWords = tokens.value.flatMap((token) => wordSegments(token.word)).join(" ");
  return treeWords === englishWords;
});

const currentTreeValid = computed(
  () => isValidSplitTree(currentTree.value) && treeMatchesEnglish.value,
);

const treeStatus = computed(() => {
  if (mode.value === "json" && jsonParse.value.error) return jsonParse.value.error;
  const tree = currentTree.value;
  if (!tree) return "还没有拆分树";
  if (!isValidSplitTree(tree)) return "拆分树结构不合法";
  if (!treeMatchesEnglish.value) return "拆分树与当前英文不一致，请重新生成";
  return `共 ${tree.tokens.length} 个 token · ${treeChunkGroups(tree).length} 个分块`;
});

const previews = computed(() => {
  const tree = currentTree.value;
  const statement = tree ? ({ ...props.statement, splitTree: tree } as Statement) : props.statement;
  return SPLIT_OPTIONS.filter((option) => option.key !== "custom").map((option) => ({
    mode: option.key,
    label: option.label,
    items: splitStatements([statement], option.key as any, []),
  }));
});

function save() {
  if (!currentTree.value || !currentTreeValid.value) return;
  emit("save", currentTree.value);
}
</script>
