import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import type { StatementAnalysis } from "@earthworm/schema";
import { AuthGuard } from "../guards/auth.guard";
import { GrammarAnalysisService } from "./grammar-analysis.service";

@ApiBearerAuth()
@ApiTags("GrammarAnalysis")
@Controller("grammar-analysis")
export class GrammarAnalysisController {
  constructor(private readonly grammarAnalysisService: GrammarAnalysisService) {}

  /** 离线批处理脚本回写某句的逐词语法标注 */
  @UseGuards(AuthGuard)
  @Post(":statementId")
  save(@Param("statementId") statementId: string, @Body() body: { analysis: StatementAnalysis }) {
    return this.grammarAnalysisService.save(statementId, body.analysis);
  }
}
