<template>
  <div class="flex min-h-[350px]">
    <!-- Loading -->
    <div
      v-if="isLoading"
      class="flex flex-1 items-center justify-center"
    >
      <span class="loading loading-dots loading-md"></span>
    </div>
    <div
      v-else
      class="w-full"
    >
      <div
        v-if="coursePacks.length"
        class="grid w-full grid-cols-1 gap-4 min-[500px]:grid-cols-2 md:grid-cols-1 min-[850px]:grid-cols-2 xl:grid-cols-3"
      >
        <template v-for="coursePack in coursePacks">
          <CoursePackCard
            :coursePack="{
              id: coursePack.coursePackId,
              title: coursePack.title,
              description: coursePack.description,
              cover: coursePack.cover,
              isFree: coursePack.isFree,
            }"
          >
            <template #actions>
              <div class="mt-2 flex justify-between">
                <button
                  class="btn btn-sm tw-btn-blue"
                  @click.stop="gotoCourseList(coursePack.coursePackId)"
                >
                  课程列表
                </button>
                <button
                  class="btn btn-success btn-sm text-white"
                  @click.stop="handleContinue(coursePack)"
                >
                  继续游戏
                </button>
              </div>
            </template>
          </CoursePackCard>
        </template>
      </div>
      <template v-else>
        <div class="flex h-full w-full flex-1 items-center justify-center text-slate-500">
          暂无记录，<NuxtLink
            href="/course-pack"
            class="link text-blue-500 no-underline hover:opacity-75"
            >先学习一课， </NuxtLink
          >再来看看吧~
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { navigateTo } from "#app";
import { ref } from "vue";

import CoursePackCard from "~/components/courses/CoursePackCard.vue";
import { loadLastPracticeForPack } from "~/composables/courses/lastPractice";
import { useNavigation } from "~/composables/useNavigation";
import { useRecentCoursePack } from "./helper";

const { gotoCourseList } = useNavigation();
const { coursePacks, fetchCoursePacks } = useRecentCoursePack();
const isLoading = ref(false);

/**
 * 继续游戏：优先恢复上次练习的那节课 + 模式/难度/拆分方式。
 * 拆分练习不写服务端进度，只靠服务端的「最近课程」会跳到整句，
 * 所以这里用本地记录的上次练习覆盖 courseId 和 query。
 */
function handleContinue(coursePack: { coursePackId: string; courseId: string }) {
  void continueGame(coursePack);
}

async function continueGame(coursePack: { coursePackId: string; courseId: string }) {
  // 本地优先（并顺手迁移到服务端），本地没有再从数据库恢复
  const last = await loadLastPracticeForPack(coursePack.coursePackId);
  const courseId = last?.courseId || coursePack.courseId;

  const params = new URLSearchParams();
  if (last) {
    params.set("mode", last.mode);
    params.set("difficulty", last.difficulty);
    if (last.splitMode !== "sentence_only") {
      params.set("split", last.splitMode);
      if (last.stages.length) params.set("stages", last.stages.join(","));
    }
  }

  const queryString = params.toString();
  navigateTo(`/game/${coursePack.coursePackId}/${courseId}${queryString ? `?${queryString}` : ""}`);
}

setup();

async function setup() {
  if (coursePacks.value.length === 0) {
    isLoading.value = true;
    await fetchCoursePacks();
    isLoading.value = false;
  } else {
    await fetchCoursePacks();
  }
}
</script>

<style scoped></style>
