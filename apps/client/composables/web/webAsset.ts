/**
 * 纯前端版部署在 GitHub Pages 的子路径下（/localearthworm/），
 * 直接写死的 "/xxx" 绝对路径会变成站点根的 /xxx 而 404。
 * 这里用运行时 app.baseURL 把 public 资源补上 base 前缀。
 *
 * 本地后端版 baseURL 是 "/"，webBase() 返回 ""，行为与原来完全一致。
 *
 * 刻意不 import http.ts：保持零依赖，任何模块都能安全引用。
 */

function webBase(): string {
  try {
    const base = (globalThis as any).__NUXT__?.config?.app?.baseURL as string | undefined;
    if (!base) return "";
    return base.replace(/\/?$/, ""); // "/localearthworm/" → "/localearthworm"
  } catch {
    return "";
  }
}

/**
 * public 下的资源：/logo.png → /localearthworm/logo.png（本地版原样）。
 * 外链（http/https/data）原样返回，避免被错误地加上 base 前缀。
 */
export function webAsset(path: string): string {
  if (
    !path ||
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("data:")
  ) {
    return path;
  }
  return `${webBase()}${path}`;
}
