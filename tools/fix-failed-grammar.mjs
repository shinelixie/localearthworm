/**
 * 手工语法分析脚本（不走 vLLM）
 * 针对模型按「逐词覆盖」校验失败的 4 句长难句，直接给出成分与逐词释义。
 */
import fs from "node:fs";

const API_BASE = process.env.API_BASE || "http://127.0.0.1:3101";
const TOKEN = process.env.LOCAL_TOKEN || "earthworm-local-token";
const DICT = JSON.parse(
  fs.readFileSync("/home/xzh/localearthworm/apps/client/public/dict/wordinfo.json", "utf8"),
);

const SENTENCES = {
  ielts100s7000_s066:
    "Not only was a monopoly of cinnamon becoming impossible, but the spice trade overall was diminishing in economic potential, and was eventually superseded by the rise of trade in coffee, tea, chocolate, and sugar.",
  ielts100s7000_s098:
    "Participants in the online debate argued that our biggest challenge is to address the underlying causes of the agricultural system's inability to ensure inability food for all, and they identified as drivers of this problem our dependency on fossil fuels and unsupportive government policies.",
  kaoyan100s5500_s095:
    "Moreover, average overall margins are higher in wholesale than in retail; wholesale demand from the food service sector is growing quickly as more Europeans eat out more often; and changes in the competitive dynamics of this fragmented industry are at last making it feasible for wholesalers to consolidate.",
  kaoyan100s5500_s098:
    "Precisely because readers from different historical periods, places and social experiences produce different but overlapping readings of the same words on the page—including for texts that engage with fundamental human concerns—debates about texts can play an important role in social discussion of beliefs and values.",
};

function tokenize(raw) {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((chunk, idx) => {
      const leading = (chunk.match(/^[^A-Za-z0-9']+/) || [""])[0];
      const trailing = (chunk.match(/[^A-Za-z0-9']+$/) || [""])[0];
      const end = trailing ? chunk.length - trailing.length : chunk.length;
      const word = chunk.slice(leading.length, Math.max(leading.length, end));
      return { idx, word, punct: `${leading}${trailing}` };
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

// 语境释义 / 词性（覆盖 ECDICT 里容易取错的首义项）
const OVERRIDES = {
  monopoly: ["垄断", "名词"],
  cinnamon: ["肉桂", "名词"],
  spice: ["香料", "名词"],
  diminishing: ["减少", "动词"],
  potential: ["潜力", "名词"],
  superseded: ["取代", "动词"],
  rise: ["增长/兴起", "名词"],
  overall: ["总体上", "副词"],
  eventually: ["最终", "副词"],
  becoming: ["变得", "动词"],
  impossible: ["不可能的", "形容词"],
  participants: ["参与者", "名词"],
  online: ["在线的", "形容词"],
  debate: ["辩论", "名词"],
  argued: ["主张/认为", "动词"],
  biggest: ["最大的", "形容词"],
  challenge: ["挑战", "名词"],
  address: ["应对/解决", "动词"],
  underlying: ["根本的", "形容词"],
  causes: ["原因", "名词"],
  agricultural: ["农业的", "形容词"],
  "system's": ["系统的", "名词"],
  inability: ["无力/无法", "名词"],
  ensure: ["确保", "动词"],
  identified: ["认定", "动词"],
  drivers: ["驱动因素", "名词"],
  dependency: ["依赖", "名词"],
  fossil: ["化石", "名词"],
  fuels: ["燃料", "名词"],
  unsupportive: ["不支持的", "形容词"],
  government: ["政府", "名词"],
  policies: ["政策", "名词"],
  moreover: ["此外", "副词"],
  average: ["平均的", "形容词"],
  margins: ["利润", "名词"],
  higher: ["更高的", "形容词"],
  wholesale: ["批发", "名词"],
  retail: ["零售", "名词"],
  demand: ["需求", "名词"],
  service: ["服务", "名词"],
  sector: ["部门", "名词"],
  growing: ["增长", "动词"],
  quickly: ["迅速地", "副词"],
  europeans: ["欧洲人", "名词"],
  out: ["外出", "副词"],
  often: ["经常", "副词"],
  changes: ["变化", "名词"],
  competitive: ["竞争的", "形容词"],
  dynamics: ["动态/格局", "名词"],
  fragmented: ["分散的", "形容词"],
  industry: ["行业", "名词"],
  feasible: ["可行的", "形容词"],
  wholesalers: ["批发商", "名词"],
  consolidate: ["合并/巩固", "动词"],
  making: ["使", "动词"],
  last: ["最终", "名词"],
  precisely: ["恰恰/正是", "副词"],
  readers: ["读者", "名词"],
  historical: ["历史的", "形容词"],
  periods: ["时期", "名词"],
  places: ["地方", "名词"],
  social: ["社会的", "形容词"],
  experiences: ["经历", "名词"],
  produce: ["产生", "动词"],
  overlapping: ["重叠的", "形容词"],
  readings: ["解读", "名词"],
  same: ["相同的", "形容词"],
  words: ["文字", "名词"],
  pageincluding: ["页面——包括", "名词"],
  texts: ["文本", "名词"],
  engage: ["涉及", "动词"],
  fundamental: ["基本的", "形容词"],
  human: ["人类的", "形容词"],
  concernsdebates: ["关注点——争论", "名词"],
  play: ["发挥", "动词"],
  important: ["重要的", "形容词"],
  role: ["作用", "名词"],
  discussion: ["讨论", "名词"],
  beliefs: ["信仰", "名词"],
  values: ["价值观", "名词"],
};

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

const SEGMENTS = {
  ielts100s7000_s066: [
    [
      0,
      1,
      "状语",
      "adverbial",
      "not only ... but ... 构成并列结构，not only 置于句首引起部分倒装。",
    ],
    [2, 2, "谓语", "predicate", "系动词 was 与后面的 becoming 构成进行时谓语。"],
    [3, 6, "主语", "subject", "名词短语作主语，of cinnamon 后置修饰 monopoly。"],
    [7, 8, "表语", "predicative", "becoming impossible 构成系表结构，说明主语状态的变化。"],
    [9, 9, "连词", "conjunction", "but 连接前后两个并列分句。"],
    [10, 13, "主语", "subject", "名词短语作主语，overall 后置修饰 the spice trade。"],
    [14, 18, "谓语", "predicate", "过去进行时谓语，in economic potential 表示方面状语。"],
    [19, 19, "连词", "conjunction", "and 连接第二个和第三个谓语。"],
    [
      20,
      33,
      "谓语",
      "predicate",
      "被动语态谓语，by 短语说明动作发出者，trade in ... 是介词短语作定语。",
    ],
  ],
  ielts100s7000_s098: [
    [
      0,
      4,
      "主语",
      "subject",
      "Participants in the online debate 作主语，in 短语后置修饰 Participants。",
    ],
    [5, 5, "谓语", "predicate", "argued 是主句谓语动词。"],
    [
      6,
      26,
      "宾语从句",
      "object clause",
      "that 引导宾语从句，说明 argued 的内容；从句主语 our biggest challenge，系动词 is，表语是不定式 to address...",
    ],
    [27, 27, "连词", "conjunction", "and 连接两个并列分句。"],
    [28, 29, "谓语", "predicate", "they identified 是第二个分句的主谓部分。"],
    [30, 34, "状语", "adverbial", "as drivers of this problem 说明 identified 的对象身份。"],
    [
      35,
      43,
      "宾语",
      "object",
      "our dependency on fossil fuels and unsupportive government policies 是 identified 的宾语（后置）。",
    ],
  ],
  kaoyan100s5500_s095: [
    [0, 0, "状语", "adverbial", "Moreover 是连接副词，表示递进。"],
    [1, 3, "主语", "subject", "average overall margins 作主语。"],
    [4, 5, "谓语", "predicate", "are higher 是系表结构谓语。"],
    [6, 10, "状语", "adverbial", "in wholesale than in retail 是比较状语。"],
    [11, 17, "主语", "subject", "wholesale demand from the food service sector 作分句主语。"],
    [18, 20, "谓语", "predicate", "is growing quickly 是进行时谓语。"],
    [21, 27, "状语从句", "adverbial clause", "as 引导原因/时间状语从句，说明需求增长的原因。"],
    [28, 28, "连词", "conjunction", "and 连接第三个并列分句。"],
    [
      29,
      37,
      "主语",
      "subject",
      "changes in the competitive dynamics of this fragmented industry 作主语。",
    ],
    [38, 43, "谓语", "predicate", "are at last making it feasible 是谓语，it 为形式宾语。"],
    [
      44,
      47,
      "状语",
      "adverbial",
      "for wholesalers to consolidate 是不定式复合结构，作真正宾语/状语。",
    ],
  ],
  kaoyan100s5500_s098: [
    [0, 1, "状语", "adverbial", "Precisely because 引导原因状语从句，precisely 加强语气。"],
    [
      2,
      10,
      "主语",
      "subject",
      "readers from different historical periods, places and social experiences 是从句主语。",
    ],
    [11, 11, "谓语", "predicate", "produce 是从句谓语。"],
    [
      12,
      22,
      "宾语",
      "object",
      "different but overlapping readings of the same words on the page—including 是从句宾语，including 引出插入语。",
    ],
    [
      23,
      30,
      "插入语",
      "parenthesis",
      "for texts that engage with fundamental human concerns—debates 是破折号插入语，说明 readings 的适用范围；debates 同时是主句主语。",
    ],
    [
      31,
      44,
      "谓语",
      "predicate",
      "about texts can play an important role in social discussion of beliefs and values 是主句谓语部分，about texts 修饰 debates。",
    ],
  ],
};

function build(id) {
  const sentence = SENTENCES[id];
  const tokens = tokenize(sentence);
  const segments = SEGMENTS[id].map(([start, end, role, roleEn, explanation]) => {
    const words = tokens.slice(start, end + 1).map((token) => wordInfo(token.word));
    return {
      role,
      roleEn,
      text: words.map((word) => word.text).join(" "),
      explanation,
      words,
    };
  });
  return { sentence, tokens, analysis: { segments } };
}

function validate(id, built) {
  const analysisSegments = built.analysis.segments.flatMap((segment) =>
    segment.words.flatMap((word) => wordSegments(word.text)),
  );
  const sentenceSegments = built.tokens.flatMap((token) => wordSegments(token.word));
  if (analysisSegments.length !== sentenceSegments.length) {
    throw new Error(`${id}: 单词数量不一致`);
  }
  for (let i = 0; i < analysisSegments.length; i += 1) {
    if (analysisSegments[i] !== sentenceSegments[i]) {
      throw new Error(
        `${id}: 第 ${i} 个片段不一致 ${analysisSegments[i]} != ${sentenceSegments[i]}`,
      );
    }
  }
}

for (const id of Object.keys(SENTENCES)) {
  const built = build(id);
  validate(id, built);
  const response = await fetch(`${API_BASE}/grammar-analysis/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ analysis: built.analysis }),
  });
  console.log(
    `${id}: ${built.tokens.length} words, ${built.analysis.segments.length} segments, HTTP ${response.status}`,
  );
  if (!response.ok) {
    console.log(await response.text());
  }
}
