import { ref } from "vue";

import type { SplitMode, SplitStage } from "./splitMode";

/**
 * 本次练习会话的拆分配置。
 *
 * 游戏页（/game/...）是 SPA 路由：从结算面板点「下一课」「再来一次」
 * 会换路由参数但不重新挂载页面，所以拆分配置要挂在模块级状态上，
 * 下一课时沿用上一次的拆分方式（query 里的参数只在新打开页面时生效）。
 */
export interface SplitSession {
  enabled: boolean;
  mode: SplitMode;
  stages: SplitStage[];
}

export const splitSession = ref<SplitSession>({
  enabled: false,
  mode: "sentence_only",
  stages: [],
});
