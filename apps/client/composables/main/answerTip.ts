import { ref } from "vue";

import { useSessionStats } from "./sessionStats";

const answerTip = ref(false);
const { recordShowAnswer } = useSessionStats();

export function useAnswerTip() {
  function showAnswerTip() {
    answerTip.value = true;
  }
  function hiddenAnswerTip() {
    answerTip.value = false;
  }

  function toggleAnswerTip() {
    answerTip.value = !answerTip.value;
    // 手动打开「显示答案」（按钮/快捷键）才计数；
    // 答错 3 次自动弹出走的是 showAnswerTip()，不算。
    if (answerTip.value) recordShowAnswer();
  }

  const isAnswerTip = () => answerTip.value;

  return {
    answerTip,
    showAnswerTip,
    hiddenAnswerTip,
    isAnswerTip,
    toggleAnswerTip,
  };
}
