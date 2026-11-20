import type { CourseApiResponse, StatementApiResponse } from "~/api/course";

export interface Statement extends StatementApiResponse {
  /** 拆分练习时的位置提示，如「第 2 个语块（共 5 段）」 */
  hint?: string;
  /** 是否是拆分出来的片段 */
  isFragment?: boolean;
  /** LLM 生成的层级拆分树 */
  splitTree?: import("./split-tree").SplitTree | null;
}
export interface Course extends CourseApiResponse {
  statements: Statement[];
}
