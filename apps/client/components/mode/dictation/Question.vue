<template>
  <div>
    <div
      v-if="currentStatement?.chinese"
      class="mx-auto mb-4 max-w-3xl text-center text-2xl text-gray-500"
    >
      {{ currentStatement.chinese }}
    </div>
    <MainQuestionInput />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from "vue";

import { useCurrentStatementEnglishSound } from "~/composables/main/englishSound";
import { useCourseStore } from "~/store/course";

usePlayEnglishSound();
const { playSound } = useCurrentStatementEnglishSound();
const currentStatement = computed(() => courseStore.currentStatement);

function usePlayEnglishSound() {
  onMounted(() => {
    const pauseSound = playSound();
    const courseStore = useCourseStore();

    watch(
      () => courseStore.statementIndex,
      () => {
        pauseSound();
        playSound();
      },
    );

    onUnmounted(() => {
      pauseSound();
    });
  });
}
</script>
