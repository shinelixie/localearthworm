import { getHttp } from "./http";

export interface TranslateApiResponse {
  translations: Record<string, string>;
}

/** 批量翻译英文片段（后端带磁盘缓存） */
export async function fetchTranslations(texts: string[]) {
  const http = getHttp();
  return (await http<TranslateApiResponse>(`/translate`, {
    method: "post",
    body: { texts },
  })) as TranslateApiResponse;
}
