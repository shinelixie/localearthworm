import { Module } from "@nestjs/common";

import { ReviewSettingModule } from "../review-setting/review-setting.module";
import { ReviewController } from "./review.controller";
import { ReviewService } from "./review.service";

@Module({
  imports: [ReviewSettingModule],
  controllers: [ReviewController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
