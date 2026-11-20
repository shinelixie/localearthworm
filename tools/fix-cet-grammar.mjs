/**
 * 手工补齐 CET 5 句长难句的逐词语法分析（不走 vLLM）
 */
import fs from "node:fs";

const API_BASE = "http://127.0.0.1:3101";
const TOKEN = "earthworm-local-token";
const DICT = JSON.parse(
  fs.readFileSync("/home/xzh/localearthworm/apps/client/public/dict/wordinfo.json", "utf8"),
);

const SENTENCES = {
  "cet4-500_s101":
    "Only in the past 20 years have specialists in language study realized that signed languages are unique—a speech of the hand.",
  "cet4-500_s117": "Never in Chinese history has the idea been accepted that...",
  "cet6-500_s044":
    'She also got heaps of praise for bucking the "helicopter parent" trend: "Good for this Mom," one commenter wrote on the Huffington Post. "This is a much-needed reality check."',
  "cet6-500_s048":
    "For hundreds of millions of years, turtles have struggled out of the sea to lay their eggs on sandy beaches, long before there were nature documentaries to celebrate them, or GPS satellites and marine biologists to track them, or volunteers to hand-carry the hatchlings down to the water's edge lest they become disoriented by headlights and crawl towards a motel parking lot instead.",
  "cet6-500_s180":
    "When labeling games as violent or non-violent, should a hero eating a ghost really be counted as a violent event?",
};

const OVERRIDES = {
  only: ["仅仅", "副词"],
  past: ["过去的", "形容词"],
  specialists: ["专家", "名词"],
  realized: ["意识到", "动词"],
  signed: ["手语的", "形容词"],
  unique: ["独特的", "形容词"],
  speech: ["语言/言语", "名词"],
  hand: ["手", "名词"],
  never: ["从不", "副词"],
  chinese: ["中国的", "形容词"],
  history: ["历史", "名词"],
  idea: ["观点", "名词"],
  accepted: ["被接受", "动词"],
  heaps: ["大量", "名词"],
  praise: ["赞扬", "名词"],
  bucking: ["反对", "动词"],
  helicopter: ["直升机", "名词"],
  parent: ["父母", "名词"],
  trend: ["潮流", "名词"],
  commenter: ["评论者", "名词"],
  wrote: ["写道", "动词"],
  huffington: ["赫芬顿", "专有名词"],
  post: ["邮报", "名词"],
  "much-needed": ["急需的", "形容词"],
  reality: ["现实", "名词"],
  check: ["审视/检查", "名词"],
  hundreds: ["数百", "数词"],
  millions: ["数百万", "数词"],
  turtles: ["海龟", "名词"],
  struggled: ["奋力", "动词"],
  sea: ["海", "名词"],
  lay: ["产（卵）", "动词"],
  eggs: ["卵", "名词"],
  sandy: ["沙质的", "形容词"],
  beaches: ["海滩", "名词"],
  documentaries: ["纪录片", "名词"],
  celebrate: ["赞美/庆祝", "动词"],
  gps: ["全球定位系统", "缩写"],
  satellites: ["卫星", "名词"],
  marine: ["海洋的", "形容词"],
  biologists: ["生物学家", "名词"],
  track: ["追踪", "动词"],
  volunteers: ["志愿者", "名词"],
  "hand-carry": ["手提", "动词"],
  hatchlings: ["幼龟", "名词"],
  "water's": ["水边的", "名词"],
  edge: ["边缘", "名词"],
  lest: ["以免", "连词"],
  disoriented: ["迷失方向的", "形容词"],
  headlights: ["车灯", "名词"],
  crawl: ["爬", "动词"],
  motel: ["汽车旅馆", "名词"],
  parking: ["停车", "名词"],
  lot: ["场地", "名词"],
  instead: ["反而", "副词"],
  labeling: ["贴标签", "动词"],
  games: ["游戏", "名词"],
  violent: ["暴力的", "形容词"],
  "non-violent": ["非暴力的", "形容词"],
  hero: ["英雄", "名词"],
  eating: ["吃掉", "动词"],
  ghost: ["幽灵", "名词"],
  really: ["真的", "副词"],
  counted: ["算作", "动词"],
  event: ["事件", "名词"],
};

const SEGMENTS = {
  "cet4-500_s101": [
    [
      "状语",
      "adverbial",
      "Only 引导的状语前置，主句因此部分倒装。",
      ["Only", "in", "the", "past", "20", "years"],
    ],
    [
      "谓语",
      "predicate",
      "助动词 have 前置构成倒装，与 realized 一起构成现在完成时谓语。",
      ["have"],
    ],
    [
      "主语",
      "subject",
      "主语是 specialists in language study。",
      ["specialists", "in", "language", "study"],
    ],
    ["谓语", "predicate", "realized 是主句谓语动词。", ["realized"]],
    ["连词", "conjunction", "that 引导宾语从句，说明 realized 的内容。", ["that"]],
    ["主语", "subject", "宾语从句的主语是 signed languages。", ["signed", "languages"]],
    ["谓语", "predicate", "are 是从句的系动词。", ["are"]],
    ["表语", "predicative", "unique 作表语。", ["unique"]],
    [
      "同位语",
      "appositive",
      "a speech of the hand 是对 signed languages 的解释。",
      ["a", "speech", "of", "the", "hand"],
    ],
  ],
  "cet4-500_s117": [
    ["状语", "adverbial", "Never 置于句首引起部分倒装，表示强调。", ["Never"]],
    ["状语", "adverbial", "in Chinese history 表示范围。", ["in", "Chinese", "history"]],
    [
      "谓语",
      "predicate",
      "has the idea been accepted 是倒装的被动完成时谓语，主语为 the idea。",
      ["has", "the", "idea", "been", "accepted"],
    ],
    ["连词", "conjunction", "that 引导同位语/宾语从句，后文省略。", ["that"]],
  ],
  "cet6-500_s044": [
    ["主语", "subject", "She 是句子主语。", ["She"]],
    [
      "谓语",
      "predicate",
      "also got heaps of praise 是谓语和宾语。",
      ["also", "got", "heaps", "of", "praise"],
    ],
    [
      "状语",
      "adverbial",
      "for bucking the helicopter parent trend 表示原因。",
      ["for", "bucking", "the", "helicopter", "parent", "trend"],
    ],
    ["引语", "quotation", "冒号后是第一段引语。", ["Good", "for", "this", "Mom"]],
    [
      "引述",
      "reporting clause",
      "one commenter wrote on the Huffington Post 是引述部分。",
      ["one", "commenter", "wrote", "on", "the", "Huffington", "Post"],
    ],
    [
      "引语",
      "quotation",
      "第二段引语作补充说明。",
      ["This", "is", "a", "much-needed", "reality", "check"],
    ],
  ],
  "cet6-500_s048": [
    [
      "状语",
      "adverbial",
      "For hundreds of millions of years 表示时间跨度。",
      ["For", "hundreds", "of", "millions", "of", "years"],
    ],
    ["主语", "subject", "turtles 是主句主语。", ["turtles"]],
    ["谓语", "predicate", "have struggled 是现在完成时谓语。", ["have", "struggled"]],
    ["状语", "adverbial", "out of the sea 表示方向。", ["out", "of", "the", "sea"]],
    ["状语", "adverbial", "to lay their eggs 表示目的。", ["to", "lay", "their", "eggs"]],
    ["状语", "adverbial", "on sandy beaches 表示地点。", ["on", "sandy", "beaches"]],
    ["连词", "conjunction", "long before 引导时间状语从句。", ["long", "before"]],
    ["谓语", "predicate", "there were 是存在句谓语。", ["there", "were"]],
    [
      "主语",
      "subject",
      "nature documentaries to celebrate them 是存在句的主语。",
      ["nature", "documentaries", "to", "celebrate", "them"],
    ],
    ["连词", "conjunction", "or 连接并列成分。", ["or"]],
    [
      "主语",
      "subject",
      "GPS satellites and marine biologists to track them 是并列主语。",
      ["GPS", "satellites", "and", "marine", "biologists", "to", "track", "them"],
    ],
    ["连词", "conjunction", "or 继续并列。", ["or"]],
    [
      "主语",
      "subject",
      "volunteers to hand-carry... 是第三个并列主语。",
      [
        "volunteers",
        "to",
        "hand-carry",
        "the",
        "hatchlings",
        "down",
        "to",
        "the",
        "water's",
        "edge",
      ],
    ],
    ["连词", "conjunction", "lest 引导目的状语从句，表示“以免”。", ["lest"]],
    [
      "谓语",
      "predicate",
      "they become disoriented by headlights and crawl 是从句谓语。",
      ["they", "become", "disoriented", "by", "headlights", "and", "crawl"],
    ],
    [
      "状语",
      "adverbial",
      "towards a motel parking lot instead 表示方向。",
      ["towards", "a", "motel", "parking", "lot", "instead"],
    ],
  ],
  "cet6-500_s180": [
    [
      "状语从句",
      "adverbial clause",
      "When 引导时间/条件状语从句。",
      ["When", "labeling", "games", "as", "violent", "or", "non-violent"],
    ],
    ["主语", "subject", "should a hero 是倒装的主语部分。", ["should", "a", "hero"]],
    ["定语", "attributive", "eating a ghost 是现在分词短语作后置定语。", ["eating", "a", "ghost"]],
    [
      "谓语",
      "predicate",
      "really be counted as a violent event 是谓语。",
      ["really", "be", "counted", "as", "a", "violent", "event"],
    ],
  ],
};

function tokenize(raw) {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((chunk) => {
      const leading = (chunk.match(/^[^A-Za-z0-9']+/) || [""])[0];
      const trailing = (chunk.match(/[^A-Za-z0-9']+$/) || [""])[0];
      const end = trailing ? chunk.length - trailing.length : chunk.length;
      return { word: chunk.slice(leading.length, Math.max(leading.length, end)) };
    });
}
function wordSegments(word) {
  return (
    String(word ?? "")
      .toLowerCase()
      .match(/[a-z0-9]+/g) || []
  );
}
function normalize(word) {
  return String(word ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9']/g, "");
}
function wordInfo(word) {
  const key = normalize(word);
  const override = OVERRIDES[key];
  let dict = DICT[key];
  if (!dict && key.endsWith("'s")) dict = DICT[key.slice(0, -2)];
  return {
    text: word,
    phonetic: dict?.[2] ? `/${dict[2]}/` : "",
    meaning: override?.[0] ?? dict?.[1] ?? "",
    pos: override?.[1] ?? dict?.[0] ?? "",
  };
}

for (const id of Object.keys(SENTENCES)) {
  const sentence = SENTENCES[id];
  const segments = SEGMENTS[id].map(([role, roleEn, explanation, words]) => {
    const infos = words.map((word) => wordInfo(word));
    return {
      role,
      roleEn,
      text: infos.map((info) => info.text).join(" "),
      explanation,
      words: infos,
    };
  });

  const analysisSegments = segments.flatMap((segment) =>
    segment.words.flatMap((word) => wordSegments(word.text)),
  );
  const sentenceSegments = tokenize(sentence).flatMap((token) => wordSegments(token.word));
  if (analysisSegments.length !== sentenceSegments.length) {
    throw new Error(
      `${id}: 单词数量不一致 ${analysisSegments.length} != ${sentenceSegments.length}`,
    );
  }
  for (let i = 0; i < analysisSegments.length; i += 1) {
    if (analysisSegments[i] !== sentenceSegments[i]) {
      throw new Error(
        `${id}: 第 ${i} 个片段不一致 ${analysisSegments[i]} != ${sentenceSegments[i]}`,
      );
    }
  }

  const response = await fetch(`${API_BASE}/grammar-analysis/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ analysis: { segments } }),
  });
  console.log(
    `${id}: ${tokenize(sentence).length} words, ${segments.length} segments, HTTP ${response.status}`,
  );
  if (!response.ok) console.log(await response.text());
}
