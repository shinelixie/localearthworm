import { computed, ref } from "vue";

import { getApiBase } from "~/api/http";

/**
 * 课程管理门禁（纯前端版，仅 /manage 页内）
 * ------------------------------------------------------------
 * 入口按钮常显，进页后要求 PIN 才能操作。
 * 静态站点没有服务端身份，这里做的是「门槛」不是「安全」：
 * 拦住误点和好奇的人，挡不住想翻包的人（PIN 编译进前端 JS）。
 * 只锁 web 模式（apiBase 为空）；本地后端版是用户自己机器，不设门。
 */
const MANAGE_PIN = "980211";
const UNLOCK_KEY = "manage-unlocked";

const unlocked = ref(false);

function isWebMode() {
  return typeof window !== "undefined" && !getApiBase();
}

export function useManageAccess() {
  function readState() {
    if (typeof window === "undefined") return;
    try {
      unlocked.value = localStorage.getItem(UNLOCK_KEY) === "1";
    } catch {
      unlocked.value = false;
    }
  }

  readState();

  /** 本地版恒 true；web 版需已解锁（响应式：解锁后入口按钮/页面随之打开） */
  const canManage = computed(() => !isWebMode() || unlocked.value);

  function verify(pin: string) {
    readState();
    if (!isWebMode()) return true;
    if (pin.trim() !== MANAGE_PIN) return false;
    try {
      localStorage.setItem(UNLOCK_KEY, "1");
    } catch {
      /* 隐私模式等写不了就本次会话内有效 */
    }
    unlocked.value = true;
    return true;
  }

  function clear() {
    try {
      localStorage.removeItem(UNLOCK_KEY);
    } catch {
      /* 忽略 */
    }
    unlocked.value = false;
  }

  return { canManage, unlocked, verify, clear };
}
