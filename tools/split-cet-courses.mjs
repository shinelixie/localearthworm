/**
 * 把四六级课程包从「每 50 句一课」改成「一句一课」，与雅思/托福/考研包一致。
 *
 * 做四件事（单事务）：
 *   1. 每条 statement 建一节同名课程（Sentence 01、Sentence 02 …）
 *   2. 把 statement 移到新课程下，order 归 1
 *   3. 迁移 practice_state / last_practice / review_card 里的旧 course_id
 *   4. 删除原来的 50 句合辑课程
 *
 * 可重复执行：只处理 id 形如 cet4-500_c01 / cet6-500_c08 的旧课程。
 *
 * 用法：node tools/split-cet-courses.mjs [--dry-run]
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DRY_RUN = process.argv.includes("--dry-run");
const PACKS = ["cet4-500", "cet6-500"];

const sql = `
begin;

create temp table cet_map on commit drop as
select
  s.id as statement_id,
  c.course_pack_id as pack_id,
  c.id as old_course_id,
  (row_number() over (partition by c.id order by s."order") - 1)::int as old_index,
  row_number() over (
    partition by c.course_pack_id
    order by c."order", s."order"
  )::int as new_index
from statements s
join courses c on c.id = s.course_id
where c.course_pack_id in (${PACKS.map((pack) => `'${pack}'`).join(", ")})
  and c.id ~ '^cet[46]-500_c[0-9]{2}$';

select count(*) as statements_to_move, count(distinct pack_id) as packs from cet_map;

insert into courses (id, title, description, video, "order", course_pack_id, created_at, updated_at)
select
  pack_id || '_c' || lpad(new_index::text, 3, '0'),
  'Sentence ' || case when new_index < 10 then '0' || new_index::text else new_index::text end,
  '',
  '',
  new_index,
  pack_id,
  now(),
  now()
from cet_map;

update statements s
set
  course_id = m.pack_id || '_c' || lpad(m.new_index::text, 3, '0'),
  "order" = 1,
  updated_at = now()
from cet_map m
where s.id = m.statement_id;

update practice_state p
set
  course_id = m.pack_id || '_c' || lpad(m.new_index::text, 3, '0'),
  statement_index = 0,
  updated_at = now()
from cet_map m
where p.course_pack_id = m.pack_id
  and p.course_id = m.old_course_id
  and p.statement_index = m.old_index;

update last_practice p
set
  course_id = m.pack_id || '_c' || lpad(m.new_index::text, 3, '0'),
  statement_index = 0,
  updated_at = now()
from cet_map m
where p.course_pack_id = m.pack_id
  and p.course_id = m.old_course_id
  and p.statement_index = m.old_index;

update review_card rc
set course_id = s.course_id, updated_at = now()
from statements s
where s.id = rc.statement_id
  and rc.course_pack_id in (${PACKS.map((pack) => `'${pack}'`).join(", ")});

delete from courses
where id in (select distinct old_course_id from cet_map);

commit;
`;

const checkSql = `
select
  cp.id as pack,
  count(distinct c.id) as courses,
  count(s.id) as statements,
  count(*) filter (where per_course.n = 1) as one_sentence_courses
from course_packs cp
join courses c on c.course_pack_id = cp.id
join statements s on s.course_id = c.id
join lateral (select count(*) as n from statements x where x.course_id = c.id) per_course on true
where cp.id in (${PACKS.map((pack) => `'${pack}'`).join(", ")})
group by cp.id
order by cp.id;
`;

function runPsql(input) {
  return execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "db",
      "psql",
      "-U",
      "postgres",
      "-d",
      "earthworm",
      "-v",
      "ON_ERROR_STOP=1",
      "-P",
      "pager=off",
    ],
    { cwd: ROOT, input, encoding: "utf8" },
  );
}

if (DRY_RUN) {
  console.log("SQL（dry-run 不执行）：\n");
  console.log(sql);
  console.log(checkSql);
  process.exit(0);
}

const backupDir = path.join(ROOT, "tools");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
const backupFile = path.join(backupDir, `backup-cet-courses-${stamp}.csv`);
const backup = runPsql(
  `copy (select * from courses where course_pack_id in (${PACKS.map((pack) => `'${pack}'`).join(", ")})) to stdout with csv header;\n`,
);
fs.writeFileSync(backupFile, backup, "utf8");
console.log(`已备份旧课程表：${backupFile}`);

console.log("开始迁移……");
console.log(runPsql(sql));
console.log("迁移完成，校验：");
console.log(runPsql(checkSql));
