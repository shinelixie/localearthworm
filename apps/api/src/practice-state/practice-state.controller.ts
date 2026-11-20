import { Body, Controller, Get, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { AuthGuard } from "../guards/auth.guard";
import { User, UserEntity } from "../user/user.decorators";
import {
  LastPracticeInput,
  PracticeStateInput,
  PracticeStateService,
  RouteNodeInput,
} from "./practice-state.service";

@ApiBearerAuth()
@ApiTags("PracticeState")
@Controller("practice-state")
export class PracticeStateController {
  constructor(private readonly service: PracticeStateService) {}

  /** 拆分练习续练位置（upsert） */
  @UseGuards(AuthGuard)
  @Put()
  upsertState(@User() user: UserEntity, @Body() body: PracticeStateInput) {
    return this.service.upsertState(user.userId, body);
  }

  @UseGuards(AuthGuard)
  @Get()
  getState(
    @User() user: UserEntity,
    @Query("coursePackId") coursePackId: string,
    @Query("courseId") courseId: string,
    @Query("practiceMode") practiceMode: string,
    @Query("splitMode") splitMode: string,
    @Query("stagesKey") stagesKey?: string,
  ) {
    return this.service.getState(user.userId, {
      coursePackId,
      courseId,
      practiceMode,
      splitMode,
      stagesKey,
    });
  }

  /** 上次练习（主页继续游戏） */
  @UseGuards(AuthGuard)
  @Put("last-practice")
  upsertLastPractice(@User() user: UserEntity, @Body() body: LastPracticeInput) {
    return this.service.upsertLastPractice(user.userId, body);
  }

  @UseGuards(AuthGuard)
  @Get("last-practice")
  getLastPractice(@User() user: UserEntity, @Query("coursePackId") coursePackId: string) {
    return this.service.getLastPracticeForPack(user.userId, coursePackId);
  }

  /** 学习路线完成记录 */
  @UseGuards(AuthGuard)
  @Put("route")
  markRouteNode(@User() user: UserEntity, @Body() body: RouteNodeInput) {
    return this.service.markRouteNode(user.userId, body);
  }

  @UseGuards(AuthGuard)
  @Get("route/summary")
  getRouteSummary(
    @User() user: UserEntity,
    @Query("coursePackId") coursePackId: string,
    @Query("practiceMode") practiceMode?: string,
  ) {
    return this.service.getRouteSummary(user.userId, coursePackId, practiceMode);
  }

  @UseGuards(AuthGuard)
  @Get("route")
  getRouteNodes(
    @User() user: UserEntity,
    @Query("coursePackId") coursePackId: string,
    @Query("courseId") courseId: string,
    @Query("practiceMode") practiceMode: string,
  ) {
    return this.service.getRouteNodes(user.userId, { coursePackId, courseId, practiceMode });
  }
}
