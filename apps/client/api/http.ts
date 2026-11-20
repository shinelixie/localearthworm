import type { $Fetch, FetchOptions } from "ofetch";

import { useRuntimeConfig } from "#app";
import { ofetch } from "ofetch";

import { route } from "~/composables/web/webBackend";
import { getToken } from "~/services/auth";

let http: $Fetch;
let cachedApiBase = "";
/** web（纯前端）模式：apiBase 为空、改由浏览器端后端接管 */
let webMode = false;

export function setupHttp() {
  if (http) return http;

  const config = useRuntimeConfig();
  const baseURL = config.public.apiBase as string;
  cachedApiBase = baseURL;
  webMode = (config.public.web as boolean) === true || !baseURL;

  // 纯前端版：不走 ofetch/真实网络，把请求交给浏览器端后端（composables/web）
  if (webMode) {
    http = createWebFetch();
    return http;
  }

  http = ofetch.create({
    baseURL,
    headers: { "Content-Type": "application/json" },
    async onRequest({ options }) {
      const token = await getToken();
      options.headers = { ...options.headers, Authorization: `Bearer ${token}` };
    },
    async onResponseError({ request, response, options }) {
      const { message } = response._data;
      if (Array.isArray(message)) {
        message.forEach((item) => {
          httpStatusErrorHandler?.(item, response.status);
        });
      } else {
        httpStatusErrorHandler?.(message, response.status);
      }
      return Promise.reject(response._data);
    },
    retry: 3,
    retryDelay: 1000,
  });
}

/**
 * 纯前端版的 $Fetch 替身：解析出 URL 后交给 route() 在浏览器里合成响应。
 * 保持与 ofetch 相同的调用契约（返回解析后的 JSON；>=400 时抛错并触发
 * httpStatusErrorHandler），api/*.ts 无需任何改动。
 */
function createWebFetch(): $Fetch {
  return (async (request: string | URL, options?: FetchOptions) => {
    const method = (options?.method ?? "GET").toUpperCase();
    const body = await parseBody(options?.body);
    // 请求串可能是 "/course-pack" 或 "course-pack/statements/x"，统一成 /api/<path>
    const pathPart = String(request).replace(/^\/+/, "");
    const url = new URL(`${window.location.origin}/api/${pathPart}`);
    const extraQuery = {
      ...((options?.params ?? {}) as Record<string, unknown>),
      ...((options?.query ?? {}) as Record<string, unknown>),
    };
    for (const [key, value] of Object.entries(extraQuery)) {
      if (value == null || value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
    const response = await route(url, method, body);
    const data = await response.json().catch(() => null);
    if (response.status >= 400 && response.status < 600) {
      httpStatusErrorHandler?.((data as { message?: string })?.message, response.status);
      throw data;
    }
    return data;
  }) as unknown as $Fetch;
}

/** 请求体可能是对象（ofetch 会 JSON 化）或字符串，统一成对象 */
async function parseBody(body?: unknown): Promise<Record<string, any>> {
  if (body == null) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as Record<string, any>;
    } catch {
      return {};
    }
  }
  if (typeof body === "object") return body as Record<string, any>;
  return {};
}

type HttpStatusErrorHandler = (message: string, statusCode: number) => void;
let httpStatusErrorHandler: HttpStatusErrorHandler;

export function injectHttpStatusErrorHandler(handler: HttpStatusErrorHandler) {
  httpStatusErrorHandler = handler;
}

export function getHttp() {
  if (!http) {
    throw new Error("HTTP client not initialized. Call setupHttp first.");
  }
  return http;
}

/**
 * 后端基地址。发音接口（/tts/speak）要拼成绝对地址交给 <audio> 播放，
 * 而它可能在 setup 之外被调用，所以这里缓存一份 setupHttp 时的值。
 */
export function getApiBase() {
  if (cachedApiBase) return cachedApiBase.replace(/\/$/, "");
  const runtime = (globalThis as any).__NUXT__?.config?.public?.apiBase as string | undefined;
  return (runtime || "").replace(/\/$/, "");
}
