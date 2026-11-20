import { Module } from "@nestjs/common";

import { PracticeStateController } from "./practice-state.controller";
import { PracticeStateService } from "./practice-state.service";

@Module({
  controllers: [PracticeStateController],
  providers: [PracticeStateService],
  exports: [PracticeStateService],
})
export class PracticeStateModule {}
