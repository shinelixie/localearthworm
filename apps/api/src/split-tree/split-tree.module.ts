import { Module } from "@nestjs/common";

import { SplitTreeController } from "./split-tree.controller";
import { SplitTreeService } from "./split-tree.service";

@Module({
  controllers: [SplitTreeController],
  providers: [SplitTreeService],
  exports: [SplitTreeService],
})
export class SplitTreeModule {}
