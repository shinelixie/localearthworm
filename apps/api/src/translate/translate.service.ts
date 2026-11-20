import { Inject, Injectable, Logger } from "@nestjs/common";
import { inArray } from "drizzle-orm";
import { ProxyAgent, fetch as proxyFetch } from "undici";

import { fragmentTranslation } from "@earthworm/schema";
import { DB, DbType } from "../global/providers/db.provider";

/**
 * 片段中文翻译
 * ------------------------------------------------------------
 * 拆分练习的片段是运行时生成的（拆分方式 × 阶段 × 句子），数据库里没有译文。
 * 之前前端用词表逐词硬拼，语义基本不成立（apply negative stereotypes → "涂否定陈套"）。
 * 这里把每个片段当成一个短句翻译，合并后的片段重新翻译一次，中文语序自然：
 *   when criticised → 当受到批评时
 *   合并后 → 当我们受到批评时，我们会变得有防御性并向别人贴上负面标签
 *
 * 翻译链路：
 *   1. 本地大模型（默认 http://127.0.0.1:7000/v1，qwen3.8-27b，可批量）
 *   2. Google 免 key 接口（走 TTS 的代理）
 *   3. MyMemory（直连）
 * 译文缓存在 fragment_translation 表：同一段英文只翻译一次，重启/清缓存都不丢。
 */

const SOURCE_LANG = "en";
const TARGET_LANG = "zh-CN";
const GOOGLE_BATCH_SIZE = 20;
const GOOGLE_TIMEOUT_MS = 12000;
const MYMEMORY_TIMEOUT_MS = 10000;
const LLM_BATCH_SIZE = 8;
const LLM_TIMEOUT_MS = 20000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const LLM_SYSTEM_PROMPT = [
  "你是英语教学翻译助手。",
  "用户会给你一个 JSON 字符串数组，每一项是一个英语片段（可能是不完整的短语、从句或完整句，来自拆分练习）。",
  "请把每一项翻译成自然、简短、符合中文语序的中文，保持原意。",
  "只返回一个 JSON 字符串数组，长度与输入相同，不要解释，不要 Markdown 代码块。",
].join("");

@Injectable()
export class TranslateService {
  private readonly logger = new Logger(TranslateService.name);
  /** 进程内热缓存，命中后不再查库 */
  private readonly memory = new Map<string, string>();

  /** 本地大模型（OpenAI 兼容接口） */
  private readonly llmUrl = (process.env.TRANSLATE_LLM_URL || "http://127.0.0.1:7000/v1").replace(
    /\/$/,
    "",
  );
  private readonly llmModel = process.env.TRANSLATE_LLM_MODEL || "qwen3.8-27b";

  /** 复用 TTS 的代理（Google 在本地网络通常直连不通） */
  private readonly proxy = (process.env.TRANSLATE_PROXY || process.env.TTS_PROXY || "").trim();
  private readonly proxyDispatcher = this.proxy ? new ProxyAgent(this.proxy) : undefined;

  constructor(@Inject(DB) private readonly db: DbType) {}

  async translate(text: string): Promise<string> {
    const normalized = (text ?? "").trim();
    if (!normalized) return "";
    const result = await this.translateMany([normalized]);
    return result[normalized] ?? "";
  }

  /**
   * 批量翻译：内存 → 数据库 → 本地大模型 → Google → MyMemory。
   * 新译出的结果统一写回 fragment_translation 表。
   */
  async translateMany(texts: string[]): Promise<Record<string, string>> {
    const unique = [...new Set((texts ?? []).map((text) => (text ?? "").trim()).filter(Boolean))];
    const result: Record<string, string> = {};
    const missing: string[] = [];

    for (const text of unique) {
      const cached = this.memory.get(text);
      if (cached) {
        result[text] = cached;
      } else {
        missing.push(text);
      }
    }

    let toTranslate = missing;
    if (missing.length) {
      const fromDb = await this.readDb(missing);
      fromDb.forEach((value, key) => {
        this.memory.set(key, value);
        result[key] = value;
      });
      toTranslate = missing.filter((text) => !result[text]);
    }

    if (!toTranslate.length) return result;

    const fresh = new Map<string, string>();

    // 1) 本地大模型批量翻译（质量最好，本地无网络依赖）
    const afterLlm: string[] = [];
    for (let i = 0; i < toTranslate.length; i += LLM_BATCH_SIZE) {
      const batch = toTranslate.slice(i, i + LLM_BATCH_SIZE);
      const values = await this.requestLlm(batch);
      batch.forEach((text, index) => {
        const value = (values[index] ?? "").trim();
        if (value) {
          result[text] = value;
          fresh.set(text, value);
        } else {
          afterLlm.push(text);
        }
      });
    }

    // 2) Google 批量兜底（走代理）
    const afterGoogle: string[] = [];
    for (let i = 0; i < afterLlm.length; i += GOOGLE_BATCH_SIZE) {
      const batch = afterLlm.slice(i, i + GOOGLE_BATCH_SIZE);
      const values = await this.requestGoogle(batch);
      batch.forEach((text, index) => {
        const value = (values[index] ?? "").trim();
        if (value) {
          result[text] = value;
          fresh.set(text, value);
        } else {
          afterGoogle.push(text);
        }
      });
    }

    // 3) MyMemory 逐条兜底（直连）
    for (const text of afterGoogle) {
      const value = await this.requestMyMemory(text);
      if (value) {
        result[text] = value;
        fresh.set(text, value);
      }
    }

    if (fresh.size) await this.saveDb(fresh);

    fresh.forEach((value, key) => this.memory.set(key, value));
    return result;
  }

  private async readDb(texts: string[]): Promise<Map<string, string>> {
    const found = new Map<string, string>();
    if (!texts.length) return found;

    try {
      const rows = await this.db
        .select({
          sourceText: fragmentTranslation.sourceText,
          translation: fragmentTranslation.translation,
        })
        .from(fragmentTranslation)
        .where(inArray(fragmentTranslation.sourceText, texts));
      for (const row of rows) {
        if (row.sourceText && row.translation) found.set(row.sourceText, row.translation);
      }
    } catch (error) {
      this.logger.warn(`读取翻译缓存失败：${(error as Error)?.message ?? error}`);
    }
    return found;
  }

  private async saveDb(entries: Map<string, string>) {
    const values = [...entries].map(([sourceText, translation]) => ({
      sourceText,
      translation,
      sourceLang: SOURCE_LANG,
      targetLang: TARGET_LANG,
    }));
    if (!values.length) return;

    try {
      await this.db.insert(fragmentTranslation).values(values).onConflictDoNothing();
    } catch (error) {
      this.logger.warn(`写入翻译缓存失败：${(error as Error)?.message ?? error}`);
    }
  }

  /** 本地大模型：一次翻译一小批，返回与输入顺序一致的数组 */
  private async requestLlm(texts: string[]): Promise<string[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
    try {
      const response = await proxyFetch(`${this.llmUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.llmModel,
          messages: [
            { role: "system", content: LLM_SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify(texts) },
          ],
          temperature: 0.1,
          max_tokens: Math.min(2048, texts.length * 96 + 128),
          // Qwen3 系列可关掉思考过程，短翻译快很多，也不会污染 JSON 输出
          chat_template_kwargs: { enable_thinking: false },
        }),
      } as any);

      if (!response.ok) {
        this.logger.warn(`本地模型翻译失败：HTTP ${response.status}`);
        return [];
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data?.choices?.[0]?.message?.content ?? "";
      return parseJsonStringArray(content, texts.length);
    } catch (error) {
      this.logger.warn(`本地模型翻译异常：${(error as Error)?.message ?? error}`);
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  /** Google 免 key 接口：q 可重复，返回与 q 顺序一致的数组 */
  private async requestGoogle(texts: string[]): Promise<string[]> {
    const params = new URLSearchParams({
      client: "dict-chrome-ex",
      sl: SOURCE_LANG,
      tl: TARGET_LANG,
    });
    texts.forEach((text) => params.append("q", text));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GOOGLE_TIMEOUT_MS);
    try {
      const response = await proxyFetch(
        `https://clients5.google.com/translate_a/t?${params.toString()}`,
        {
          signal: controller.signal,
          dispatcher: this.proxyDispatcher,
          headers: { "User-Agent": USER_AGENT, "Accept-Language": "zh-CN,zh;q=0.9" },
        } as any,
      );
      if (!response.ok) {
        this.logger.warn(`Google 翻译失败：HTTP ${response.status}`);
        return [];
      }

      const data = (await response.json()) as unknown;
      if (!Array.isArray(data)) return [];
      return data.map((item) => (typeof item === "string" ? item : ""));
    } catch (error) {
      this.logger.warn(`Google 翻译异常：${(error as Error)?.message ?? error}`);
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  /** MyMemory 兜底（直连，免 key） */
  private async requestMyMemory(text: string): Promise<string> {
    const params = new URLSearchParams({
      q: text,
      langpair: `${SOURCE_LANG}|${TARGET_LANG}`,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MYMEMORY_TIMEOUT_MS);
    try {
      const response = await proxyFetch(
        `https://api.mymemory.translated.net/get?${params.toString()}`,
        {
          signal: controller.signal,
          headers: { "User-Agent": USER_AGENT },
        } as any,
      );
      if (!response.ok) {
        this.logger.warn(`MyMemory 翻译失败：HTTP ${response.status}`);
        return "";
      }

      const data = (await response.json()) as {
        responseData?: { translatedText?: string };
        quotaFinished?: boolean;
      };
      const translated = (data?.responseData?.translatedText ?? "").trim();

      // 额度用尽/服务端报错时返回的是英文提示，不要当成译文缓存
      if (
        !translated ||
        data?.quotaFinished ||
        /^MYMEMORY WARNING/i.test(translated) ||
        /^QUERY LENGTH LIMIT/i.test(translated)
      ) {
        return "";
      }
      return translated;
    } catch (error) {
      this.logger.warn(`MyMemory 翻译异常：${(error as Error)?.message ?? error}`);
      return "";
    } finally {
      clearTimeout(timer);
    }
  }
}

/** 解析模型返回的 JSON 字符串数组，长度不符时丢弃走兜底 */
function parseJsonStringArray(content: string, expectedLength: number): string[] {
  const text = (content ?? "").trim();
  if (!text) return [];

  const candidates = [text];
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end > start) candidates.push(text.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate) as unknown;
      if (Array.isArray(value) && value.length === expectedLength) {
        return value.map((item) => (typeof item === "string" ? item : ""));
      }
    } catch {
      // 试下一个候选
    }
  }
  return [];
}
