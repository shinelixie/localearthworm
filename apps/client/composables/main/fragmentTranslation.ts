import { fetchTranslations } from "~/api/translate";

/**
 * 拆分片段的中文翻译（前端缓存 + 进课预取）
 *
 * 片段是运行时生成的，没有现成译文。后端按需调用在线翻译并落盘缓存，
 * 这里再做一层内存缓存：同一片段反复练（不同拆分方式/阶段）不会再发请求。
 */

const cache = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();
const BATCH_SIZE = 20;

function normalize(text: string) {
  return (text ?? "").trim();
}

export function getCachedTranslation(text: string): string | null {
  return cache.get(normalize(text)) ?? null;
}

export async function translateFragment(text: string): Promise<string> {
  const key = normalize(text);
  if (!key) return "";

  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const running = inFlight.get(key);
  if (running) return running;

  const task = fetchTranslations([key])
    .then((res) => {
      const value = (res.translations?.[key] ?? "").trim();
      if (value) cache.set(key, value);
      return value;
    })
    .catch(() => "")
    .finally(() => inFlight.delete(key));

  inFlight.set(key, task);
  return task;
}

/** 进课时把当前课程所有片段的中文预取好，逐题切换基本无等待 */
export async function primeFragmentTranslations(texts: string[]) {
  const unique = [...new Set(texts.map(normalize).filter(Boolean))].filter(
    (text) => !cache.has(text),
  );

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetchTranslations(batch);
      for (const text of batch) {
        const value = (res.translations?.[text] ?? "").trim();
        if (value) cache.set(text, value);
      }
    } catch {
      // 预取失败无所谓：单题出现时还会再请求一次
    }
  }
}
