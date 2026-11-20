import { RedisModule } from "@nestjs-modules/ioredis";
import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";

import { CourseHistoryModule } from "../course-history/course-history.module";
import { CoursePackModule } from "../course-pack/course-pack.module";
import { CourseModule } from "../course/course.module";
import { CronJobModule } from "../cron-job/cron-job.module";
import { GlobalModule } from "../global/global.module";
import { GrammarAnalysisModule } from "../grammar-analysis/grammar-analysis.module";
import { LearningPathModule } from "../learning-path/learning-path.module";
import { LogtoModule } from "../logto/logto.module";
import { MasteredElementModule } from "../mastered-element/mastered-element.module";
import { MembershipModule } from "../membership/membership.module";
import { PracticeSessionModule } from "../practice-session/practice-session.module";
import { PracticeStateModule } from "../practice-state/practice-state.module";
import { RankModule } from "../rank/rank.module";
import { ReviewSettingModule } from "../review-setting/review-setting.module";
import { ReviewModule } from "../review/review.module";
import { SplitTreeModule } from "../split-tree/split-tree.module";
import { ToolModule } from "../tool/tool.module";
import { TranslateModule } from "../translate/translate.module";
import { TtsModule } from "../tts/tts.module";
import { UserCourseProgressModule } from "../user-course-progress/user-course-progress.module";
import { UserLearningActivityModule } from "../user-learning-activity/user-learning-activity.module";
import { UserModule } from "../user/user.module";

@Module({
  imports: [
    GlobalModule,
    LogtoModule,
    UserModule,
    CoursePackModule,
    CourseModule,
    UserCourseProgressModule,
    UserLearningActivityModule,
    ToolModule,
    RankModule,
    CronJobModule,
    CourseHistoryModule,
    MembershipModule,
    MasteredElementModule,
    PracticeSessionModule,
    PracticeStateModule,
    LearningPathModule,
    ReviewModule,
    ReviewSettingModule,
    SplitTreeModule,
    GrammarAnalysisModule,
    TtsModule,
    TranslateModule,
    RedisModule.forRootAsync({
      useFactory: () => ({
        type: "single",
        url: process.env.REDIS_URL,
        options: {
          password: process.env.REDIS_PASSWORD,
        },
      }),
    }),
    ScheduleModule.forRoot(),
  ],
})
export class AppModule {}
