import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import { AuthGuard } from "../guards/auth.guard";
import { User, UserEntity } from "../user/user.decorators";
import { PracticeSessionService, RecordSessionInput } from "./practice-session.service";

@ApiBearerAuth()
@ApiTags("PracticeSession")
@Controller("practice-session")
export class PracticeSessionController {
  constructor(private readonly service: PracticeSessionService) {}

  @ApiOperation({ summary: "记录一次练习会话" })
  @UseGuards(AuthGuard)
  @Post("record")
  record(@User() user: UserEntity, @Body() body: RecordSessionInput) {
    return this.service.record(user.userId, body);
  }

  @ApiOperation({ summary: "成长分析总览" })
  @UseGuards(AuthGuard)
  @Get("analytics/overview")
  overview(@User() user: UserEntity) {
    return this.service.overview(user.userId);
  }

  @ApiOperation({ summary: "最近 N 天每日学习时长" })
  @UseGuards(AuthGuard)
  @Get("analytics/daily")
  daily(@User() user: UserEntity, @Query("days") days?: string) {
    const parsed = Number(days);
    return this.service.daily(
      user.userId,
      Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 365) : 30,
    );
  }

  @ApiOperation({ summary: "按课程包聚合" })
  @UseGuards(AuthGuard)
  @Get("analytics/by-course-pack")
  byCoursePack(@User() user: UserEntity) {
    return this.service.byCoursePack(user.userId);
  }

  @ApiOperation({ summary: "最近会话明细" })
  @UseGuards(AuthGuard)
  @Get("analytics/sessions")
  sessions(@User() user: UserEntity, @Query("limit") limit?: string) {
    const parsed = Number(limit);
    return this.service.sessions(user.userId, Number.isFinite(parsed) && parsed > 0 ? parsed : 10);
  }
}
