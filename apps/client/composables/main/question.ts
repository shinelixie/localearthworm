import type { WatchStopHandle } from "vue";

import { nextTick, reactive, ref, watchEffect } from "vue";

interface Word {
  text: string;
  isActive: boolean;
  userInput: string;
  incorrect: boolean;
  end: number;
  start: number;
  position: number;
  id: number;
}

interface InputOptions {
  source: () => string;
  setInputCursorPosition: (position: number) => void;
  getInputCursorPosition: () => number;
  inputChangedCallback?: (e: KeyboardEvent) => void;
}

enum Mode {
  Input = "input",
  Fix = "fix",
  Fix_Input = "fix-input",
}

const separator = " ";

const inputValue = ref("");

export function clearQuestionInput() {
  inputValue.value = "";
}

export function isWord(content: string) {
  return /[a-zA-Z0-9]/.test(content);
}

const mode = ref<Mode>(Mode.Input);
let currentEditWord: Word;
const userInputWords = reactive<Word[]>([]);
let stopWatchEffect: WatchStopHandle;

export function useInput({
  source,
  setInputCursorPosition,
  getInputCursorPosition,
  inputChangedCallback,
}: InputOptions) {
  function initialize() {
    // for test unit
    // 每次都需要清空 watchEffect 不然调用多次后就报错了
    // 对于生产环境是不存在这个问题的  因为只会存在调用一次
    stopWatchEffect && stopWatchEffect();
    mode.value = Mode.Input;
    userInputWords.length = 0;
    setupUserInputWords();
    updateActiveWord(getInputCursorPosition());
  }

  function setInputValue(val: string) {
    inputValue.value = val;
    resetAllWordUserInput();
    inputSyncUserInputWords();
    updateActiveWord(val ? getInputCursorPosition() : 0);
  }

  function createWord(word: string, id: number) {
    return reactive({
      text: word,
      isActive: false,
      userInput: "",
      incorrect: false,
      start: 0,
      end: 0,
      position: 0,
      id,
    } as Word);
  }

  function setupUserInputWords() {
    stopWatchEffect = watchEffect(() => {
      resetUserInputWords();

      const english = source();

      let inputWordIndex = 0;
      english.split(separator).forEach((text, index) => {
        if (isWord(text)) {
          const word = createWord(text, index);
          userInputWords[inputWordIndex] = word;
          inputWordIndex === 0 && (userInputWords[0].isActive = true);
          inputWordIndex++;
        }
      });
    });
  }

  function userInputWordsSyncInput() {
    inputValue.value = userInputWords
      .map(({ userInput }) => {
        return userInput;
      })
      .join(separator);
  }

  function inputSyncUserInputWords() {
    let position = 0;
    // 只按固定词数分配，避免用户在中间按空格/粘贴时多出来的片段越界
    const inputs = inputValue.value.split(separator).slice(0, userInputWords.length);

    userInputWords.forEach((word, index) => {
      const input = inputs[index] ?? "";
      word.userInput = input;
      word.start = position;
      word.end = position + input.length;
      position += input.length + 1; // Add 1 for the space after each word
    });
  }

  function resetAllWordUserInput() {
    userInputWords.forEach((word) => {
      word.userInput = "";
    });
  }

  function resetAllWordActive() {
    userInputWords.forEach((word) => {
      word.isActive = false;
    });
  }

  function updateActiveWord(position: number) {
    resetAllWordActive();

    for (let i = 0; i < userInputWords.length; i++) {
      const word = userInputWords[i];
      if (position >= word.start && position <= word.end) {
        word.isActive = true;
        break;
      }
    }
  }

  /** 方向键移动光标后，让高亮词跟随光标 */
  function syncActiveWordFromCursor() {
    updateActiveWord(getInputCursorPosition());
  }

  function checkWordCorrect() {
    return userInputWords.every((w) => !w.incorrect);
  }

  function formatLastWordUserInput(word: Word, index: number) {
    const isLastWord = userInputWords.length - 1 === index;
    if (isLastWord) {
      if (word.userInput.endsWith(".")) {
        word.userInput = word.userInput.slice(0, -1);
      }
    }
  }

  function markIncorrectWord() {
    userInputWords.forEach((word, index) => {
      formatLastWordUserInput(word, index);
      const formattedWord = formatInputText(word.userInput);

      // 标点不参与比对：句号、逗号、问号等写不写都算对
      // （拆分练习的片段常以逗号结尾，让用户必须打标点太苛刻）
      if (stripPunctuation(formattedWord) !== stripPunctuation(word.text.toLocaleLowerCase())) {
        word.incorrect = true;
      } else {
        word.incorrect = false;
      }
    });
  }

  function lastWordIsActive() {
    let len = userInputWords.length;
    return userInputWords[len - 1].isActive;
  }

  function findNextIncorrectWordNew() {
    if (!currentEditWord) return;

    const wordIndex = userInputWords.findIndex((w) => w.id === currentEditWord.id);

    let len = userInputWords.length;
    for (let i = wordIndex + 1; i < len; i++) {
      const word = userInputWords[i];
      if (word.incorrect) {
        return word;
      }
    }
  }

  // 将‘ 转化为', 做模糊匹配, 后续可拓展其他的模糊匹配算法
  function formatInputText(word: string) {
    return word.toLocaleLowerCase().replace(/‘|’|“|"|”/g, "'");
  }

  /** 去掉句读标点，答案比对时忽略（撇号保留，don't / it's 仍然要打对） */
  function stripPunctuation(text: string) {
    return text.replace(/[.,!?;:]+/g, "");
  }

  // 当前编辑的单词是否为最后一个错误单词
  function isLastIncorrectWord() {
    return !findNextIncorrectWordNew();
  }

  function getFirstIncorrectWord() {
    return userInputWords.find((w) => w.incorrect);
  }

  async function clearNextIncorrectWord(word: Word) {
    word.userInput = "";
    currentEditWord = word;

    userInputWordsSyncInput();

    await nextTick();

    setInputCursorPosition(word.start);
    updateActiveWord(word.start);
  }

  function submitAnswer(correctCallback?: () => void, wrongCallback?: () => void) {
    if (mode.value === Mode.Fix) return;
    resetAllWordActive();
    markIncorrectWord();

    if (checkWordCorrect()) {
      mode.value = Mode.Input;
      correctCallback?.(); // 调用输入正确的回调
      inputValue.value = "";
    } else {
      mode.value = Mode.Fix;
      wrongCallback?.(); // 调用输入错误的回调
    }
  }

  async function fixFirstIncorrectWord() {
    if (mode.value === Mode.Fix) {
      mode.value = Mode.Fix_Input;

      await clearNextIncorrectWord(getFirstIncorrectWord()!);
    }
  }

  async function fixNextIncorrectWord() {
    if (mode.value === Mode.Fix_Input) {
      await clearNextIncorrectWord(findNextIncorrectWordNew()!);
    }
  }

  async function fixIncorrectWord() {
    if (mode.value === Mode.Fix) {
      await fixFirstIncorrectWord();
    } else if (mode.value === Mode.Fix_Input) {
      await fixNextIncorrectWord();
    }
  }

  function isEmptyOfCurrentEditWord() {
    return currentEditWord.userInput.length <= 0;
  }

  function findPreviousIncorrectWord() {
    if (!currentEditWord) return;

    const wordIndex = userInputWords.findIndex((w) => w.id === currentEditWord.id);

    for (let i = wordIndex - 1; i >= 0; i--) {
      const word = userInputWords[i];
      if (word.incorrect) {
        return word;
      }
    }
  }

  async function activePreviousIncorrectWord() {
    const previousIncorrectWord = findPreviousIncorrectWord();

    if (previousIncorrectWord) {
      currentEditWord = previousIncorrectWord;

      await nextTick();

      updateActiveWord(previousIncorrectWord.end);
      setInputCursorPosition(previousIncorrectWord.end);
    }
  }

  function handleSpaceSubmitAnswer(
    useSpaceSubmitAnswer: KeyboardInputOptions["useSpaceSubmitAnswer"],
  ) {
    if (useSpaceSubmitAnswer?.enable) {
      submitAnswer(
        () => {
          useSpaceSubmitAnswer?.rightCallback?.();
        },
        () => {
          useSpaceSubmitAnswer?.errorCallback?.();
        },
      );
    }
  }

  interface KeyboardInputOptions {
    useSpaceSubmitAnswer?: {
      enable: boolean;
      rightCallback?: () => void;
      errorCallback?: () => void;
    };
  }

  function handleKeyboardInput(e: KeyboardEvent, options?: KeyboardInputOptions) {
    // 左右键交给浏览器原生光标移动（组件在 keyup 时同步高亮词）；
    // 上下键仍禁用，避免单行输入框把光标跳到行首/行尾。
    if (["ArrowUp", "ArrowDown"].includes(e.code)) {
      e.preventDefault();
      return;
    }
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.code)) {
      return;
    }

    // Fix_Input/Input 下启用空格提交 且 在最后一个单词位置
    if (mode.value !== Mode.Fix && e.code === "Space" && lastWordIsActive()) {
      e.preventDefault();
      e.stopPropagation(); // 阻止事件冒泡
      handleSpaceSubmitAnswer(options?.useSpaceSubmitAnswer);
      return;
    }

    // 空格在「当前词的末尾」才是正常的单词分隔符；
    // 用方向键把光标移到词中间后按空格，会多切出一个空片段，直接忽略。
    // 词尾后面已经有空格时也不重复插入，避免出现连续空格。
    if (mode.value === Mode.Input && e.code === "Space") {
      const position = getInputCursorPosition();
      const activeWord = userInputWords.find((word) => word.isActive);
      const atWordEnd = activeWord ? position === activeWord.end : false;
      const alreadyFollowedBySpace = inputValue.value[position] === " ";
      const repeatingSpace =
        !!activeWord &&
        activeWord.userInput === "" &&
        position > 0 &&
        inputValue.value[position - 1] === " ";
      if (!atWordEnd || alreadyFollowedBySpace || repeatingSpace) {
        e.preventDefault();
      } else {
        inputChangedCallback?.(e);
      }
      return;
    }

    // Fix 模式下 允许用户按下任意键去修改第一个错误的单词
    // 并且按下的这个键直接上屏
    if (mode.value === Mode.Fix) {
      if (e.code === "Space" || e.code === "Backspace") {
        e.preventDefault();
      }
      fixFirstIncorrectWord();
      inputChangedCallback?.(e);
      return;
    }

    // Fix_Input 下启用空格提交 且 在最后一个错误单词位置
    if (mode.value === Mode.Fix_Input && e.code === "Space" && isLastIncorrectWord()) {
      e.preventDefault();
      e.stopPropagation();
      handleSpaceSubmitAnswer(options?.useSpaceSubmitAnswer);
      return;
    }

    // Fix_Input 模式下当前编辑单词为空时，启用退格删除上一个错误单词
    if (mode.value === Mode.Fix_Input && e.code === "Backspace" && isEmptyOfCurrentEditWord()) {
      e.preventDefault();
      activePreviousIncorrectWord();
      inputChangedCallback?.(e);
      return;
    }

    // 空格修复单词
    // Fix → 定位到第一个错误单词并清除
    // Fix_Input → 定位到下一个错误单词并清除
    if (mode.value !== Mode.Input && e.code === "Space") {
      e.preventDefault();
      fixIncorrectWord();
      inputChangedCallback?.(e);
      return;
    }

    inputChangedCallback?.(e);
  }

  function resetUserInputWords() {
    // 避免在 Fix 模式下重置导致用户不能输入
    mode.value = Mode.Input;
    inputValue.value = "";
    userInputWords.splice(0, userInputWords.length);
  }

  function isFixInputMode() {
    return mode.value === Mode.Fix_Input;
  }

  function isFixMode() {
    return mode.value === Mode.Fix;
  }

  function findWordById(id: number) {
    return userInputWords.find((word) => word.id === id);
  }

  return {
    inputValue,
    userInputWords,
    submitAnswer,
    setInputValue,
    activePreviousIncorrectWord,
    handleKeyboardInput,
    syncActiveWordFromCursor,
    fixIncorrectWord,
    fixFirstIncorrectWord,
    resetUserInputWords,
    isFixInputMode,
    isFixMode,
    findWordById,
    initialize,
  };
}
