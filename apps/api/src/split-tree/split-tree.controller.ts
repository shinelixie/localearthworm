import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import type { SplitTree } from "@earthworm/schema";
import { AuthGuard } from "../guards/auth.guard";
import { SplitTreeService } from "./split-tree.service";

@ApiBearerAuth()
@ApiTags("SplitTree")
@Controller("split-tree")
export class SplitTreeController {
  constructor(private readonly splitTreeService: SplitTreeService) {}

  /** 离线批处理脚本回写某句的拆分树 */
  @UseGuards(AuthGuard)
  @Post(":statementId")
  save(@Param("statementId") statementId: string, @Body() body: { tree: SplitTree }) {
    return this.splitTreeService.save(statementId, body.tree);
  }

  @UseGuards(AuthGuard)
  @Get(":statementId")
  get(@Param("statementId") statementId: string) {
    return this.splitTreeService.get(statementId);
  }
}
