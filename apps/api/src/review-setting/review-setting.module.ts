import { Module } from "@nestjs/common";

import { ReviewSettingController } from "./review-setting.controller";
import { ReviewSettingService } from "./review-setting.service";

@Module({
  controllers: [ReviewSettingController],
  providers: [ReviewSettingService],
  exports: [ReviewSettingService],
})
export class ReviewSettingModule {}
