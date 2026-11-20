/**
 * 从本机 Postgres 导出「纯前端版」要用的课程内容 JSON，
 * 输出到 apps/client/public/data/courses.json（随前端一起发布到 GitHub Pages）。
 *
 * 只导内容（课程包 / 课程 / 句子），学习进度、复习卡等个人数据由前端落到 IndexedDB，
 * 不进这份文件。analysis / split_tree 原样带上，前端拆分练习与语法展示直接用。
 *
 * 取数方式：三张扁平查询，每行是一个自包含的紧凑 JSON 对象（json_build_object 输出
 * 不含真实换行，文本里的换行会被转义成 \n），按行解析最稳，不依赖 | 之类分隔符。
 *
 * 跨平台：优先仓库内免安装 psql；没有就退回 PATH 上的 psql。
 * 用法：node tools/build-web-data.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(ROOT, "apps/client/public/data/courses.json");

/** 找 psql：仓库内免安装版 → PATH 上的 psql → docker compose 的 db 容器 */
function findPsql() {
  const isWin = process.platform === "win32";
  const binName = isWin ? "psql.exe" : "psql";
  const bundled = path.join(ROOT, "tools/pgsql/bin", binName);
  if (fs.existsSync(bundled)) return bundled;
  return "psql";
}

function isWinPlatform() {
  return process.platform === "win32";
}

/** 跑一段 SQL，按行返回（-t -A 去表头纯文本）。每行应是 json_build_object 产出的一个 JSON 对象。 */
function runSql(sql) {
  const dbUrl = process.env.DATABASE_URL || "postgres://postgres@127.0.0.1:5434/earthworm";
  const url = new URL(dbUrl);
  const db = url.pathname.replace(/^\//, "");
  const base = ["-t", "-A", "-U", url.username || "postgres", "-d", db, "-c", sql];
  const hostArgs = ["-h", url.hostname || "127.0.0.1", "-p", url.port || "5434"];

  let command;
  let args;
  if (isWinPlatform()) {
    command = findPsql();
    args = [...hostArgs, ...base];
  } else {
    // Linux/macOS：优先 docker 容器（本地版默认这样起库），没有容器再退回 psql 直连
    let dockerDb;
    try {
      const names = execFileSync("docker", ["compose", "ps", "-q", "db"], {
        encoding: "utf8",
        cwd: ROOT,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      dockerDb = names.split("\n")[0];
    } catch {
      dockerDb = "";
    }
    if (dockerDb) {
      command = "docker";
      args = ["exec", "-i", dockerDb, "psql", ...base];
    } else {
      command = findPsql();
      args = [...hostArgs, ...base];
    }
  }

  const raw = execFileSync(command, args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 512 });
  return raw
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line !== "" && !line.startsWith("psql:"));
}

// ---- 1. 课程包 ----
const packs = runSql(`
  select json_build_object(
    'id', id, 'order', "order", 'title', title,
    'description', coalesce(description,''), 'isFree', is_free,
    'cover', coalesce(cover,''), 'shareLevel', share_level
  )
  from course_packs order by "order";
`).map((line) => JSON.parse(line));

// ---- 2. 课程（含所属包、句子数） ----
const courses = runSql(`
  select json_build_object(
    'id', c.id, 'title', c.title, 'description', coalesce(c.description,''),
    'video', coalesce(c.video,''), 'order', c."order", 'coursePackId', c.course_pack_id,
    'statementCount', (select count(*) from statements s where s.course_id = c.id)
  )
  from courses c order by c.course_pack_id, c."order";
`).map((line) => JSON.parse(line));

// ---- 3. 句子（含 analysis / split_tree） ----
const statements = runSql(`
  select json_build_object(
    'id', s.id, 'order', s."order", 'english', s.english, 'chinese', s.chinese,
    'soundmark', s.soundmark, 'courseId', s.course_id, 'isMastered', false,
    'analysis', s.analysis, 'splitTree', s.split_tree
  )
  from statements s order by s.course_id, s."order";
`).map((line) => JSON.parse(line));

// ---- 组装：pack.courses[]、course.statements[] ----
const coursesByPack = {};
for (const course of courses) (coursesByPack[course.coursePackId] ??= []).push(course);
const statementsByCourse = {};
for (const stmt of statements) (statementsByCourse[stmt.courseId] ??= []).push(stmt);

for (const pack of packs) {
  pack.courses = (coursesByPack[pack.id] ?? []).map((course) => ({
    ...course,
    // 前端 findCourse 用的就是这份 statements
    statements: statementsByCourse[course.id] ?? [],
  }));
}

const result = {
  version: 1,
  exportedAt: new Date().toISOString(),
  packs,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const size = JSON.stringify(result).length;
fs.writeFileSync(OUT, JSON.stringify(result));
console.log(`已导出 ${path.relative(ROOT, OUT)}`);
console.log(
  `  课程包 ${packs.length} 个 / 课程 ${courses.length} 节 / 句子 ${statements.length} 句 / ${(size / 1024 / 1024).toFixed(1)} MB`,
);
