import { Module } from "@nestjs/common";

import { GrammarAnalysisController } from "./grammar-analysis.controller";
import { GrammarAnalysisService } from "./grammar-analysis.service";

@Module({
  controllers: [GrammarAnalysisController],
  providers: [GrammarAnalysisService],
  exports: [GrammarAnalysisService],
})
export class GrammarAnalysisModule {}
