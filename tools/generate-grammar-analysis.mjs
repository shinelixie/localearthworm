/**
 * 用本地大模型为每句生成「逐词语法成分标注」，写入 statements.analysis
 *
 * 目标效果（参考应用的三张图）：
 *   每个语法成分一个圆角框（主语/谓语/宾语/状语…），框内每个词带
 *   音标、词性（名词/动词/形容词/介词…）、语境中文释义和彩色下划线。
 *
 * 规则：
 *   1. words 必须按原句顺序覆盖所有单词，不重复、不漏词（本地按字母数字片段校验）
 *   2. 每个词给符合语境的简短中文（apply 用「应用/施加」而不是生僻的「涂」）
 *   3. 失败自动重试 3 次；已有多词标注的句子默认跳过（--force 可重做）
 *
 * 用法：
 *   node tools/generate-grammar-analysis.mjs [--pack packId] [--limit 50]
 *        [--force] [--concurrency 6]
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const API_BASE = process.env.API_BASE || "http://127.0.0.1:3101";
const LOCAL_TOKEN = process.env.LOCAL_TOKEN || "earthworm-local-token";
const LLM_URL = (process.env.TRANSLATE_LLM_URL || "http://127.0.0.1:7000/v1").replace(/\/$/, "");
const LLM_MODEL = process.env.TRANSLATE_LLM_MODEL || "qwen3.8-27b";
const FAILURE_FILE = path.resolve(ROOT, "tools/.grammar-analysis-failures.json");

const args = process.argv.slice(2);
function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}
const LIMIT = Number(argValue("--limit", "0")) || 0;
const FORCE = args.includes("--force");
const CONCURRENCY = Math.max(1, Number(argValue("--concurrency", "6")) || 6);
const PACK = argValue("--pack", "");

// ---------------- 读库 ----------------
function findPsql() {
  const isWin = process.platform === "win32";
  const binName = isWin ? "psql.exe" : "psql";
  const bundled = path.join(ROOT, "tools/pgsql/bin", binName);
  if (fs.existsSync(bundled)) return bundled;
  return "psql";
}
function runSql(sql) {
  const psql = findPsql();
  const baseArgs = [
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
  ];
  try {
    return execFileSync(psql, baseArgs, {
      encoding: "utf8",
      env: { ...process.env, PGCLIENTENCODING: "UTF8" },
    });
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

const detailCondition = `coalesce((
  select sum(jsonb_array_length(coalesce(seg->'words','[]')))
  from jsonb_array_elements(s.analysis->'segments') seg
), 0) > 0`;
const where = [];
if (!FORCE) where.push(`(s.analysis is null or not (${detailCondition}))`);
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

// ---------------- 句子 → tokens ----------------
function tokenize(raw) {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((chunk) => {
      const leading = (chunk.match(/^[^A-Za-z0-9']+/) || [""])[0];
      const trailing = (chunk.match(/[^A-Za-z0-9']+$/) || [""])[0];
      const end = trailing ? chunk.length - trailing.length : chunk.length;
      const word = chunk.slice(leading.length, Math.max(leading.length, end));
      return { word, punct: `${leading}${trailing}` };
    });
}
function wordSegments(word) {
  return (
    String(word ?? "")
      .toLowerCase()
      .match(/[a-z0-9]+/g) || []
  );
}
function stripPunct(word) {
  return String(word ?? "").replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, "");
}

/** 扁平化模型输出，按字母数字片段与原句对齐 */
function validateAndClean(parsed, sentence) {
  if (!parsed || !Array.isArray(parsed.segments) || !parsed.segments.length) {
    return { error: "缺少 segments" };
  }
  const tokens = tokenize(sentence).filter((token) => token.word);
  const ourSegments = tokens.flatMap((token) => wordSegments(token.word));

  const modelWords = [];
  for (const segment of parsed.segments) {
    if (!segment || typeof segment.role !== "string" || !segment.role.trim()) {
      return { error: "成分缺少 role" };
    }
    if (!Array.isArray(segment.words) || !segment.words.length) {
      return { error: "成分缺少 words" };
    }
    for (const word of segment.words) {
      const text = stripPunct(word?.text);
      if (!text) return { error: "words 里有空词" };
      if (typeof word.meaning !== "string" || !word.meaning.trim()) {
        return { error: `词 ${text} 缺少中文释义` };
      }
      if (typeof word.pos !== "string" || !word.pos.trim()) {
        return { error: `词 ${text} 缺少词性` };
      }
      modelWords.push({
        text,
        phonetic: typeof word.phonetic === "string" ? word.phonetic.trim() : "",
        meaning: word.meaning.trim(),
        pos: word.pos.trim(),
      });
    }
  }

  const modelSegments = modelWords.flatMap((word) => wordSegments(word.text));
  if (
    modelSegments.length !== ourSegments.length ||
    modelSegments.some((segment, index) => segment !== ourSegments[index])
  ) {
    return { error: "words 与原句单词不一致（漏词/重复/顺序不对）" };
  }

  // 单词数量一致时用原句拼写（去掉标点、修正大小写）
  if (modelWords.length === tokens.length) {
    modelWords.forEach((word, index) => {
      word.text = tokens[index].word;
    });
  }

  // 按原顺序把 words 放回各 segment，并重算 text
  let cursor = 0;
  const segments = parsed.segments.map((segment) => {
    const count = segment.words.length;
    const words = modelWords.slice(cursor, cursor + count);
    cursor += count;
    return {
      role: segment.role.trim(),
      roleEn: typeof segment.roleEn === "string" ? segment.roleEn.trim() : "",
      text: words.map((word) => word.text).join(" "),
      explanation: typeof segment.explanation === "string" ? segment.explanation.trim() : "",
      words,
    };
  });

  return { analysis: { segments } };
}

// ---------------- LLM ----------------
const SYSTEM_PROMPT = `你是英语语法分析器。把英文句子拆成语法成分，只输出紧凑 JSON（不要缩进换行、不要解释、不要 Markdown）：
{"segments":[{"role":"主语","roleEn":"subject","text":"Many studies of longevity","explanation":"...","words":[{"text":"Many","phonetic":"/ˈmeni/","meaning":"许多","pos":"限定词"}]}]}
规则：
1. 按完整短语划分成分（主语/谓语/宾语/状语/定语/表语/宾语从句/定语从句/状语从句等），一句通常 3~6 个成分；不要把同一个短语拆成多个成分。例如 "Many studies of longevity show" 应拆成「主语 Many studies of longevity」+「谓语 show」，不要把 Many/studies/of/longevity 拆成四个成分。
2. 成分之间按原句顺序排列；words 连续覆盖整句，不重复、不漏词；标点不要放进 words。
3. 每个词给符合语境的中文 meaning（如 apply 用「应用/施加」，不要取「涂」这类生僻义项）、中文 pos（名词/动词/形容词/副词/介词/限定词/代词/连词/助动词/数词/冠词/关系副词/从属连词等）、/.../ 形式的音标 phonetic。
4. explanation 用一两句中文说明该成分的语法作用。
5. 输出必须能完整覆盖整句。`;

async function requestAnalysis(sentence, chinese, tokens, hint = "") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000);
  try {
    const tokenList = tokens.map((token, index) => `${index}:${token.word}`).join(" ");
    const userContent = [
      `英文：${sentence}`,
      chinese ? `整句中文参考：${chinese}` : "",
      `Tokens（按顺序覆盖整句，共 ${tokens.length} 个）：${tokenList}`,
      hint ? `上次输出不合格：${hint}。请严格按规则重新输出。` : "",
      "请把每个词分配到合适的语法成分里，不要漏词。",
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
    return (data?.choices?.[0]?.message?.content ?? "").trim();
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

async function saveAnalysis(statementId, analysis) {
  const response = await fetch(`${API_BASE}/grammar-analysis/${statementId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOCAL_TOKEN}`,
    },
    body: JSON.stringify({ analysis }),
  });
  if (!response.ok) throw new Error(`保存失败 HTTP ${response.status}`);
}

// ---------------- 并发处理 ----------------
const failures = [];
let done = 0;
let failed = 0;
let cursor = 0;
const startedAt = Date.now();

async function processOne(row) {
  const tokens = tokenize(row.english).filter((token) => token.word);
  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const content = await requestAnalysis(
        row.english,
        row.chinese,
        tokens,
        attempt > 1 ? lastError : "",
      );
      const parsed = parseJson(content);
      if (!parsed) {
        lastError = `输出不是合法 JSON（末尾：${content.slice(-160)}）`;
        continue;
      }
      const result = validateAndClean(parsed, row.english);
      if (result.error) {
        lastError = result.error;
        continue;
      }
      await saveAnalysis(row.id, result.analysis);
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
    if (ok) done += 1;
    else failed += 1;

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
