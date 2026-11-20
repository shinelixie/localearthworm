import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import type { StatementAnalysis } from "@earthworm/schema";
import { DB, DbType } from "../global/providers/db.provider";

@Injectable()
export class GrammarAnalysisService {
  constructor(@Inject(DB) private readonly db: DbType) {}

  async save(statementId: string, analysis: StatementAnalysis) {
    // dollar-quote + ::jsonb，避免 drizzle + postgres-js 把对象二次序列化成字符串
    const json = JSON.stringify(analysis);
    const literal = `$ga$${json}$ga$`;
    const id = String(statementId).replace(/'/g, "''");
    await this.db.execute(
      sql.raw(
        `update statements set analysis = ${literal}::jsonb, updated_at = now() where id = '${id}'`,
      ),
    );
    return { success: true };
  }
}
