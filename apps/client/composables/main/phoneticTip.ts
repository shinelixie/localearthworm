import { ref } from "vue";

/**
 * 「音标提示」开关（答题区横线下的逐词音标）。
 * 答题区组件和底部快捷键提示栏共用同一份状态，
 * 所以按 1 或点底部按钮都能同步开/关。
 */
const showPhonetic = ref(false);

export function usePhoneticTip() {
  function toggle() {
    showPhonetic.value = !showPhonetic.value;
  }

  const isOn = () => showPhonetic.value;

  return {
    showPhonetic,
    isOn,
    toggle,
  };
}
