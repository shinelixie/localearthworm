import { ref } from "vue";

const inputEl = ref<HTMLInputElement>();
const focusing = ref(true);
/** 当前输入光标位置（用于在词块里画可见光标） */
const cursorPosition = ref(0);

export function useQuestionInput() {
  function focusInput() {
    focusing.value = true;
    inputEl.value?.focus();
  }

  function blurInput() {
    focusing.value = false;
    inputEl.value?.blur();
  }

  function setInputCursorPosition(position: number) {
    inputEl.value?.setSelectionRange(position, position);
    cursorPosition.value = position;
  }

  function getInputCursorPosition() {
    const position = inputEl.value?.selectionStart || 0;
    cursorPosition.value = position;
    return position;
  }

  /** 浏览器原生光标移动（方向键）后同步一次位置 */
  function syncCursorPosition() {
    cursorPosition.value = inputEl.value?.selectionStart || 0;
    return cursorPosition.value;
  }

  return {
    inputEl,
    focusing,
    cursorPosition,
    focusInput,
    blurInput,
    setInputCursorPosition,
    getInputCursorPosition,
    syncCursorPosition,
  };
}

export function getWordWidth(word: string) {
  const ZERO_POINT_FIVE = 0.5;
  const ZERO_POINT_SIX = 0.6;
  const ZERO_POINT_SEVEN = 0.7;
  const ZERO_POINT_EIGHT = 0.8;
  const ZERO_POINT_NINE = 0.9;
  const ONE_POINT_ONE = 1.1;
  const ONE_POINT_FIVE = 1.5;
  const OTHER_LETTER_WIDTH = 1;

  const letterWidths: { [key: string]: number } = {
    w: ONE_POINT_FIVE,
    m: ONE_POINT_FIVE,
    s: ZERO_POINT_EIGHT,
    t: ZERO_POINT_SEVEN,
    r: ZERO_POINT_SEVEN,
    f: ZERO_POINT_SEVEN,
    j: ZERO_POINT_SIX,
    i: ZERO_POINT_FIVE,
    l: ZERO_POINT_FIVE,
    u: ONE_POINT_ONE,
    o: ONE_POINT_ONE,
    p: ONE_POINT_ONE,
    q: ONE_POINT_ONE,
    n: ONE_POINT_ONE,
    h: ONE_POINT_ONE,
    g: ONE_POINT_ONE,
    d: ONE_POINT_ONE,
    b: ONE_POINT_ONE,
    z: ZERO_POINT_NINE,
    y: ZERO_POINT_NINE,
    x: ZERO_POINT_NINE,
    v: ZERO_POINT_NINE,
    c: ZERO_POINT_NINE,
    "'": ZERO_POINT_FIVE,
  };

  // 字符串宽度
  const width = word
    .toLocaleLowerCase()
    .split("")
    .reduce((totalWidth, letter) => totalWidth + (letterWidths[letter] || OTHER_LETTER_WIDTH), 0);

  // 左右留白
  return width + 1;
}
