/**
 * 用本地大模型为每句英文生成「嵌套拆分树」，校验后写入 statements.split_tree
 *
 * 设计（对应参考应用的拆合效果）：
 *   1. LLM 只负责输出嵌套树 JSON（不要线性步骤列表），避免跨步丢词/重复边界词
 *   2. 本地代码负责：从原句重建 tokens（单词与标点分离）、按 range 重算 en、
 *      自底向上重算 level、校验父子区间连续无重叠无漏词
 *   3. 校验失败自动重试（最多 3 次），全失败记入 tools/.split-tree-failures.json
 *   4. 已生成过的句子默认跳过（脚本可中断续跑）
 *
 * 用法：
 *   node tools/generate-split-trees.mjs [--limit 50] [--force] [--concurrency 6]
 *        [--ids id1,id2] [--pack packId]
 *
 * 依赖：本地 vLLM（默认 127.0.0.1:7000，模型 qwen3.8-27b）；API 需在 3101 运行
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const API_BASE = process.env.API_BASE || "http://127.0.0.1:3101";
const LOCAL_TOKEN = process.env.LOCAL_TOKEN || "earthworm-local-token";
const LLM_URL = (process.env.TRANSLATE_LLM_URL || "http://127.0.0.1:7000/v1").replace(/\/$/, "");
const LLM_MODEL = process.env.TRANSLATE_LLM_MODEL || "qwen3.8-27b";
const FAILURE_FILE = path.resolve(ROOT, "tools/.split-tree-failures.json");

// ---------------- 参数 ----------------
const args = process.argv.slice(2);
function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}
const LIMIT = Number(argValue("--limit", "0")) || 0;
const FORCE = args.includes("--force");
const CONCURRENCY = Math.max(1, Number(argValue("--concurrency", "6")) || 6);
const IDS = (argValue("--ids", "") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const PACK = argValue("--pack", "");

// ---------------- 读取语句 ----------------
function findPsql() {
  const isWin = process.platform === "win32";
  const binName = isWin ? "psql.exe" : "psql";
  const bundled = path.join(ROOT, "tools/pgsql/bin", binName);
  if (fs.existsSync(bundled)) return bundled;
  return "psql";
}

function runSql(sql) {
  const psql = findPsql();
  try {
    return execFileSync(
      psql,
      [
        "-h",
        "127.0.0.1",
        "-p",
        "5434",
        "-U",
        "postgres",
        "-d",
        "earthworm",
        "-t",
        "-A",
        "-F",
        "\t",
        "-c",
        sql,
      ],
      { encoding: "utf8", env: { ...process.env, PGCLIENTENCODING: "UTF8" } },
    );
  } catch (err) {
    if (String(err.code) === "ENOENT") {
      return execFileSync(
        "docker",
        [
          "compose",
          "exec",
          "-T",
          "db",
          "psql",
          "-U",
          "postgres",
          "-d",
          "earthworm",
          "-t",
          "-A",
          "-F",
          "\t",
          "-c",
          sql,
        ],
        { encoding: "utf8", cwd: ROOT },
      );
    }
    throw err;
  }
}

const where = [];
if (!FORCE) where.push("s.split_tree is null");
if (IDS.length) where.push(`s.id in (${IDS.map((id) => `'${id.replace(/'/g, "''")}'`).join(",")})`);
if (PACK) where.push(`cp.id = '${PACK.replace(/'/g, "''")}'`);

const sql = `
  select s.id, s.english, s.chinese
  from statements s
  join courses c on c.id = s.course_id
  join course_packs cp on cp.id = c.course_pack_id
  ${where.length ? `where ${where.join(" and ")}` : ""}
  order by cp.id, c."order", s."order"
`;
let rows = runSql(sql)
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const [id, english, chinese] = line.split("\t");
    return { id, english, chinese: chinese ?? "" };
  });

if (LIMIT > 0) rows = rows.slice(0, LIMIT);
if (!rows.length) {
  console.log("没有需要处理的句子");
  process.exit(0);
}
console.log(`待处理 ${rows.length} 句，并发 ${CONCURRENCY}`);

// ---------------- 句子 → 确定性 tokens ----------------
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
      const punct = `${leading}${trailing}`;
      return { idx, word, punct };
    });
}

function sameWords(a, b) {
  return (
    a.length === b.length &&
    a.every((word, index) => word.toLowerCase() === String(b[index]?.word ?? "").toLowerCase())
  );
}

/** 把单词拆成字母数字片段：that's → that/s；（）TSA（） → tsa */
function wordSegments(word) {
  return (
    String(word ?? "")
      .toLowerCase()
      .match(/[a-z0-9]+/g) || []
  );
}

/**
 * 建立「模型 token 下标 → 本地 token 下标」的映射。
 * 模型可能把 that's 拆成 that + 's、把（TSA）当成一个词，直接按数组比会误判；
 * 这里按字母数字片段序列对齐，片段序列不一致才判失败。
 */
function buildTokenMapping(ourTokens, modelTokens) {
  const ourSegments = [];
  ourTokens.forEach((token, index) => {
    wordSegments(token.word).forEach((segment) => ourSegments.push({ tokenIndex: index, segment }));
  });
  const modelSegments = [];
  modelTokens.forEach((token, index) => {
    wordSegments(token.word).forEach((segment) =>
      modelSegments.push({ tokenIndex: index, segment }),
    );
  });

  if (ourSegments.length !== modelSegments.length) return null;
  for (let i = 0; i < ourSegments.length; i += 1) {
    if (ourSegments[i].segment !== modelSegments[i].segment) return null;
  }

  const segmentsByModelToken = new Map();
  for (let i = 0; i < modelSegments.length; i += 1) {
    const modelIndex = modelSegments[i].tokenIndex;
    const list = segmentsByModelToken.get(modelIndex) ?? [];
    list.push(ourSegments[i].tokenIndex);
    segmentsByModelToken.set(modelIndex, list);
  }

  const count = modelTokens.length;
  function start(modelIndex) {
    for (let i = Math.max(0, modelIndex); i < count; i += 1) {
      const list = segmentsByModelToken.get(i);
      if (list?.length) return list[0];
    }
    return null;
  }
  function end(modelIndex) {
    for (let i = Math.min(count - 1, modelIndex); i >= 0; i -= 1) {
      const list = segmentsByModelToken.get(i);
      if (list?.length) return list[list.length - 1];
    }
    return null;
  }
  return { start, end };
}

function remapNode(node, mapping) {
  if (!node || !Array.isArray(node.range) || node.range.length !== 2) return null;
  const start = mapping.start(Number(node.range[0]));
  const end = mapping.end(Number(node.range[1]));
  if (start === null || end === null || start > end) return null;
  const children = (Array.isArray(node.children) ? node.children : [])
    .map((child) => remapNode(child, mapping))
    .filter(Boolean);
  return { ...node, range: [start, end], children };
}
// ---------------- 校验 + 归一化 ----------------
function validateNode(node, tokenCount) {
  if (!node || !Array.isArray(node.range) || node.range.length !== 2) return "range 缺失";
  const [start, end] = node.range;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return "range 不是整数";
  if (start < 0 || end >= tokenCount || start > end) return `range 越界 [${start},${end}]`;

  const children = Array.isArray(node.children) ? node.children : [];
  if (!children.length) return null;

  let expected = start;
  for (const child of children) {
    const error = validateNode(child, tokenCount);
    if (error) return error;
    if (child.range[0] !== expected)
      return `子节点不连续/重叠（期望 ${expected}，实际 ${child.range[0]}）`;
    expected = child.range[1] + 1;
  }
  if (expected - 1 !== end) return "子节点未覆盖父节点范围";
  return null;
}

/**
 * 修复模型输出：越界区间裁剪到合法范围；子节点无法连续覆盖父节点时，
 * 丢弃该层子节点、把节点当叶子（保住「不漏词、不重叠」，牺牲一点粒度）。
 */
function repairNode(node, tokenCount) {
  if (!node || !Array.isArray(node.range) || node.range.length !== 2) return null;
  let start = Number(node.range[0]);
  let end = Number(node.range[1]);
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  start = Math.max(0, start);
  end = Math.min(tokenCount - 1, end);
  if (start > end) return null;

  const children = Array.isArray(node.children) ? node.children : [];
  if (!children.length) {
    return { range: [start, end], zh: typeof node.zh === "string" ? node.zh : "", children: [] };
  }

  const repaired = [];
  for (const child of children) {
    const fixed = repairNode(child, tokenCount);
    if (!fixed) continue;
    const childStart = Math.max(start, fixed.range[0]);
    const childEnd = Math.min(end, fixed.range[1]);
    if (childStart > childEnd) continue;
    repaired.push({ ...fixed, range: [childStart, childEnd] });
  }

  let expected = start;
  let covered = true;
  for (const child of repaired) {
    if (child.range[0] !== expected) {
      covered = false;
      break;
    }
    expected = child.range[1] + 1;
  }
  if (!covered || expected - 1 !== end) {
    return { range: [start, end], zh: typeof node.zh === "string" ? node.zh : "", children: [] };
  }

  return {
    range: [start, end],
    zh: typeof node.zh === "string" ? node.zh : "",
    children: repaired,
  };
}

function normalizeNode(node, tokens) {
  const children = (Array.isArray(node.children) ? node.children : []).map((child) =>
    normalizeNode(child, tokens),
  );
  const [start, end] = node.range;
  const en = tokens
    .slice(start, end + 1)
    .map((token) => token.word)
    .filter(Boolean)
    .join(" ");
  const level = children.length ? Math.max(...children.map((child) => child.level)) + 1 : 1;
  const result = { level, range: [start, end], en, zh: String(node.zh).trim() };
  if (children.length) result.children = children;
  return result;
}

function buildTree(rawText, parsed) {
  const tokens = tokenize(rawText);
  if (!parsed || !parsed.tree) return { error: "缺少 tree" };

  const modelTokens = Array.isArray(parsed.tokens) ? parsed.tokens : [];
  const mapping = buildTokenMapping(tokens, modelTokens);
  if (!mapping) {
    if (process.env.DEBUG_TREE) {
      console.error(
        "本地 tokens:",
        tokens.map((token) => token.word || `[${token.punct}]`).join(" | "),
      );
      console.error("模型 tokens:", modelTokens.map((token) => token?.word ?? "?").join(" | "));
    }
    return { error: "tokens 与原句单词不一致" };
  }

  // 先把模型 token 下标映射到本地 token 下标，再强制根节点覆盖整句
  const remappedRoot = remapNode(
    { ...parsed.tree, range: [0, Math.max(modelTokens.length - 1, 0)] },
    mapping,
  );
  if (!remappedRoot) return { error: "根节点无法映射" };
  remappedRoot.range = [0, tokens.length - 1];

  const root = repairNode(remappedRoot, tokens.length);
  if (!root) return { error: "根节点无法修复" };

  const error = validateNode(root, tokens.length);
  if (error) return { error };

  return { tree: { rawText, tokens, tree: normalizeNode(root, tokens) } };
}

// ---------------- LLM ----------------
const SYSTEM_PROMPT = `你是英语教学句法分析器。把英文句子转成「嵌套拆分树」JSON。规则：
1. 先按子句边界切大块（主句/从句/并列分句/目的状语）。
2. 虚词与连接词（in/to/of/that/when/where/and/is 等）在叶子层单独成节点；上一层再与其支配的短语合并。
3. 紧密修饰搭配保持原子化（Many studies、negative stereotypes、become defensive、to boost、our own esteem 等），2~3 词不拆。
4. 树必须是自左向右滚雪球的嵌套结构：每个父节点的子节点按顺序连续排列、不重叠、不漏词；根节点覆盖整句。
5. 每个节点给 en（不含标点、单词间单空格）、zh（自然中文；叶子可直译，合并节点必须按中文语序意译，不能拼接子节点中文）、range=[起始token下标,结束token下标]（闭区间）。
6. tokens 覆盖整句所有词，标点从 word 剥离到 punct，顺序与原文一致。
只输出紧凑 JSON（不要缩进换行、不要解释、不要 Markdown）：
{"rawText":"...","tokens":[{"idx":0,"word":"We","punct":""}],"tree":{"range":[0,15],"en":"...","zh":"...","children":[...]}}`;

async function requestTree(sentence, chinese = "", tokens = [], hint = "") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000);
  try {
    const tokenList = tokens
      .map((token) => `${token.idx}:${token.word}${token.punct ? `[${token.punct}]` : ""}`)
      .join(" ");
    const userContent = [
      `英文：${sentence}`,
      chinese ? `整句中文参考：${chinese}` : "",
      `Tokens（0 基下标，必须原样使用这些下标，共 ${tokens.length} 个）：${tokenList}`,
      hint ? `上次输出不合格：${hint}。请严格按规则重新输出。` : "",
      "range 只能引用上面这些 token 下标；各节点的 zh 与整句中文参考保持用词和语序一致，但不要直接复制整句译文。",
    ]
      .filter(Boolean)
      .join("\n");
    const response = await fetch(`${LLM_URL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        temperature: 0.1,
        max_tokens: 6144,
        response_format: { type: "json_object" },
        chat_template_kwargs: { enable_thinking: false },
      }),
    });
    if (!response.ok) throw new Error(`LLM HTTP ${response.status}`);
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    return content.trim();
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(content) {
  const candidates = [content];
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start !== -1 && end > start) candidates.push(content.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // next
    }
  }
  return null;
}

async function saveTree(statementId, tree) {
  const response = await fetch(`${API_BASE}/split-tree/${statementId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOCAL_TOKEN}`,
    },
    body: JSON.stringify({ tree }),
  });
  if (!response.ok) throw new Error(`保存失败 HTTP ${response.status}`);
}

// ---------------- 并发处理 ----------------
const failures = [];
let done = 0;
let failed = 0;
let cursor = 0;
const startedAt = Date.now();

function retryHint(error) {
  if (!error) return "";
  if (error.includes("tokens")) {
    return "你输出的 tokens 与原句不一致。tokens 数组必须与给定的 Tokens 列表逐项完全一致（单词、顺序、数量都不能改），range 直接使用给定下标";
  }
  if (error.includes("tree") || error.includes("JSON")) {
    return "必须输出合法 JSON，并包含完整的 tree 对象，根节点 range 覆盖整句";
  }
  if (error.includes("子节点") || error.includes("range")) {
    return "每个父节点的子节点必须按顺序连续排列、不重叠、不漏词，根节点覆盖整句";
  }
  return error;
}

async function processOne(row) {
  const tokens = tokenize(row.english);
  let lastError = "";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const content = await requestTree(
        row.english,
        row.chinese,
        tokens,
        attempt > 1 ? retryHint(lastError) : "",
      );
      const parsed = parseJson(content);
      if (!parsed) {
        lastError = `输出不是合法 JSON（末尾：${content.slice(-160)}）`;
        continue;
      }
      const built = buildTree(row.english, parsed);
      if (built.error) {
        lastError = built.error;
        continue;
      }
      await saveTree(row.id, built.tree);
      return true;
    } catch (error) {
      lastError = error?.message || String(error);
    }
  }
  failures.push({ id: row.id, english: row.english, error: lastError });
  return false;
}

async function worker() {
  while (true) {
    const index = cursor;
    cursor += 1;
    if (index >= rows.length) return;
    const ok = await processOne(rows[index]);
    if (ok) {
      done += 1;
    } else {
      failed += 1;
    }
    const total = done + failed;
    if (total % 10 === 0 || total === rows.length) {
      const elapsed = (Date.now() - startedAt) / 1000;
      const speed = total / Math.max(elapsed, 1);
      const eta = speed > 0 ? Math.round((rows.length - total) / speed) : 0;
      console.log(
        `[${total}/${rows.length}] 成功 ${done} 失败 ${failed} · ${speed.toFixed(2)} 句/秒 · 预计剩余 ${Math.round(eta / 60)} 分钟`,
      );
    }
  }
}

await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, () => worker()));

if (failures.length) {
  fs.writeFileSync(FAILURE_FILE, JSON.stringify(failures, null, 2), "utf8");
  console.log(`失败 ${failures.length} 句，已写入 ${FAILURE_FILE}`);
}
console.log(`完成：成功 ${done} / 失败 ${failed} / 共 ${rows.length}`);
