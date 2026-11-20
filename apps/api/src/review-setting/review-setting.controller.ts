import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import { AuthGuard } from "../guards/auth.guard";
import { User, UserEntity } from "../user/user.decorators";
import { ReviewSettingService, UpdateReviewSettingInput } from "./review-setting.service";

@ApiBearerAuth()
@ApiTags("ReviewSetting")
@Controller("review-settings")
export class ReviewSettingController {
  constructor(private readonly service: ReviewSettingService) {}

  @ApiOperation({ summary: "获取复习设置（含今日各模式已复习条数）" })
  @UseGuards(AuthGuard)
  @Get("")
  async get(@User() user: UserEntity) {
    const [setting, todayCounts] = await Promise.all([
      this.service.get(user.userId),
      this.service.todayCounts(user.userId),
    ]);
    return { ...setting, todayCounts };
  }

  @ApiOperation({ summary: "更新复习设置" })
  @UseGuards(AuthGuard)
  @Put("")
  update(@User() user: UserEntity, @Body() body: UpdateReviewSettingInput) {
    return this.service.update(user.userId, body);
  }
}
