-- 从上游 earthworm（容器 earthworm-db-1，经共享网络访问）迁移 3 个课程包。
-- 保留原 id（课程进度记录因此可原样搬走）；creator_id 统一成本地身份 local-user。
-- 注意：本地版 statements 没有 analysis 列（上游才有），所以这里不搬该列。
-- 目标库：earthworm（本地版，容器 localearthworm-db-1）。

CREATE EXTENSION IF NOT EXISTS dblink;

-- 1. 课程包
INSERT INTO course_packs (id, "order", title, description, is_free, cover, creator_id, share_level, created_at, updated_at)
SELECT p.id, p."order", p.title, p.description, p.is_free, p.cover,
       'local-user', p.share_level, p.created_at, p.updated_at
FROM dblink(
  'host=earthworm-db-1 port=5432 dbname=earthworm user=postgres password=password',
  $remote$
    SELECT id, "order", title, description, is_free, cover, share_level, created_at, updated_at
    FROM course_packs
    WHERE id IN ('ielts100s7000','toefl100s7000','kaoyan100s5500')
  $remote$
) AS p(id text, "order" int, title text, description text, is_free bool,
       cover text, share_level text, created_at timestamp, updated_at timestamp)
ON CONFLICT (id) DO NOTHING;

-- 2. 课程
INSERT INTO courses (id, title, description, video, "order", course_pack_id, created_at, updated_at)
SELECT c.id, c.title, c.description, c.video, c."order", c.course_pack_id, c.created_at, c.updated_at
FROM dblink(
  'host=earthworm-db-1 port=5432 dbname=earthworm user=postgres password=password',
  $remote$
    SELECT id, title, description, video, "order", course_pack_id, created_at, updated_at
    FROM courses
    WHERE course_pack_id IN ('ielts100s7000','toefl100s7000','kaoyan100s5500')
  $remote$
) AS c(id text, title varchar, description text, video text, "order" int,
       course_pack_id text, created_at timestamp, updated_at timestamp)
ON CONFLICT (id) DO NOTHING;

-- 3. 句子
INSERT INTO statements (id, "order", chinese, english, soundmark, course_id, created_at, updated_at)
SELECT s.id, s."order", s.chinese, s.english, s.soundmark, s.course_id, s.created_at, s.updated_at
FROM dblink(
  'host=earthworm-db-1 port=5432 dbname=earthworm user=postgres password=password',
  $remote$
    SELECT s.id, s."order", s.chinese, s.english, s.soundmark, s.course_id, s.created_at, s.updated_at
    FROM statements s
    JOIN courses c ON s.course_id = c.id
    WHERE c.course_pack_id IN ('ielts100s7000','toefl100s7000','kaoyan100s5500')
  $remote$
) AS s(id text, "order" int, chinese text, english text, soundmark text,
       course_id text, created_at timestamp, updated_at timestamp)
ON CONFLICT (id) DO NOTHING;

-- 4. 学习进度（user_course_progress：两边列完全一致）
INSERT INTO user_course_progress (id, user_id, course_pack_id, course_id, statement_index, created_at, updated_at)
SELECT g.id, 'local-user', g.course_pack_id, g.course_id, g.statement_index, g.created_at, g.updated_at
FROM dblink(
  'host=earthworm-db-1 port=5432 dbname=earthworm user=postgres password=password',
  $remote$
    SELECT id, course_pack_id, course_id, statement_index, created_at, updated_at
    FROM user_course_progress
    WHERE course_pack_id IN ('ielts100s7000','toefl100s7000','kaoyan100s5500')
  $remote$
) AS g(id text, course_pack_id text, course_id text, statement_index int,
       created_at timestamp, updated_at timestamp)
ON CONFLICT (id) DO NOTHING;

-- 校验
SELECT 'course_packs' AS t, count(*) FROM course_packs WHERE id IN ('ielts100s7000','toefl100s7000','kaoyan100s5500')
UNION ALL
SELECT 'courses', count(*) FROM courses WHERE course_pack_id IN ('ielts100s7000','toefl100s7000','kaoyan100s5500')
UNION ALL
SELECT 'statements', count(*) FROM statements s JOIN courses c ON s.course_id=c.id
  WHERE c.course_pack_id IN ('ielts100s7000','toefl100s7000','kaoyan100s5500')
UNION ALL
SELECT 'progress', count(*) FROM user_course_progress
  WHERE course_pack_id IN ('ielts100s7000','toefl100s7000','kaoyan100s5500');
