import { defineStore } from "pinia";
import { ref } from "vue";

import { useLearningTimeTracker } from "~/composables/main/learningTimeTracker";
import { isAuthenticated } from "~/services/auth";

enum GameStatus {
  NOT_PLAYED = "not_played",
  STARTED = "started",
  PAUSED = "paused",
  LEVEL_COMPLETED = "level_completed",
}

export const useGameStore = defineStore("game", () => {
  const { startTracking, stopTracking, todayTotalSeconds } = useLearningTimeTracker();
  const gameStatus = ref<GameStatus>(GameStatus.NOT_PLAYED);

  /** 本次练习会话的墙钟时长（秒）。成长分析的会话/评级用它，和主页同一口径 */
  const sessionSeconds = ref(0);

  function startGame() {
    gameStatus.value = GameStatus.STARTED;
    if (isAuthenticated()) {
      startTracking();
      sessionSeconds.value = todayTotalSeconds.value;
    }
  }

  function exitGame() {
    gameStatus.value = GameStatus.NOT_PLAYED;
    if (isAuthenticated()) {
      stopTracking();
    }
  }

  function pauseGame() {
    if (gameStatus.value === GameStatus.STARTED) {
      gameStatus.value = GameStatus.PAUSED;
      if (isAuthenticated()) {
        stopTracking();
      }
      return true;
    } else {
      console.log("Game is not started or already paused");
      return false;
    }
  }

  function resumeGame() {
    if (gameStatus.value === GameStatus.PAUSED) {
      gameStatus.value = GameStatus.STARTED;
      if (isAuthenticated()) {
        startTracking();
      }
    } else {
      console.log("Game is not paused");
    }
  }

  function completeLevel() {
    if (gameStatus.value === GameStatus.STARTED) {
      gameStatus.value = GameStatus.LEVEL_COMPLETED;
      if (isAuthenticated()) {
        stopTracking();
      }
    } else {
      console.log("Game is not started so cannot complete level");
    }
  }

  function isGameNotPlayed() {
    return gameStatus.value === GameStatus.NOT_PLAYED;
  }

  function isGameStarted() {
    return gameStatus.value === GameStatus.STARTED;
  }

  function isGamePaused() {
    return gameStatus.value === GameStatus.PAUSED;
  }

  function isLevelCompleted() {
    return gameStatus.value === GameStatus.LEVEL_COMPLETED;
  }

  /** 会话墙钟时长（毫秒）：开玩时快照到现在的当日累计差值 */
  function sessionSecondsMs() {
    return Math.max(todayTotalSeconds.value - sessionSeconds.value, 0) * 1000;
  }

  return {
    gameStatus,
    sessionSeconds,
    sessionSecondsMs,
    startGame,
    pauseGame,
    resumeGame,
    exitGame,
    completeLevel,
    isGameNotPlayed,
    isGameStarted,
    isGamePaused,
    isLevelCompleted,
  };
});
