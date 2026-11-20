import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { AuthGuard, UncheckAuth } from "../guards/auth.guard";
import { TranslateService } from "./translate.service";

@ApiBearerAuth()
@ApiTags("Translate")
@Controller("translate")
export class TranslateController {
  constructor(private readonly translateService: TranslateService) {}

  /** 批量翻译英文片段（拆分练习的中文提示） */
  @UncheckAuth()
  @UseGuards(AuthGuard)
  @Post()
  async translate(@Body() body: { texts?: string[] }) {
    const texts = Array.isArray(body?.texts) ? body.texts.slice(0, 50) : [];
    return { translations: await this.translateService.translateMany(texts) };
  }
}
