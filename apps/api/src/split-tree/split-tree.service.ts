import { Inject, Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";

import type { SplitTree } from "@earthworm/schema";
import { statement } from "@earthworm/schema";
import { DB, DbType } from "../global/providers/db.provider";

@Injectable()
export class SplitTreeService {
  constructor(@Inject(DB) private readonly db: DbType) {}

  async save(statementId: string, tree: SplitTree) {
    // 用 dollar-quoting + ::jsonb 显式转换，避免 drizzle + postgres-js
    // 把对象二次序列化成 JSON 字符串（jsonb_typeof 会变成 string）
    const json = JSON.stringify(tree);
    const literal = `$split$${json}$split$`;
    const id = String(statementId).replace(/'/g, "''");
    await this.db.execute(
      sql.raw(
        `update statements set split_tree = ${literal}::jsonb, updated_at = now() where id = '${id}'`,
      ),
    );
    return { success: true };
  }

  async get(statementId: string) {
    const row = await this.db.query.statement.findFirst({
      where: eq(statement.id, statementId),
      columns: { id: true, english: true, splitTree: true },
    });
    return row ?? null;
  }
}
