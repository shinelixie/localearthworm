# 数据库内容导出

`earthworm-content.sql.gz` 是本机 Postgres 里**课程内容**的导出（COPY 格式，约 900 KB），包含：

| 表                     | 内容                                                                 |
| ---------------------- | -------------------------------------------------------------------- |
| `course_packs`         | 课程包（星荣、雅思、托福、考研、四六级）                             |
| `courses`              | 分段/一句一课                                                        |
| `statements`           | 句子原文、翻译、音标、`analysis`（语法分析）、`split_tree`（拆分树） |
| `fragment_translation` | 运行时片段翻译缓存                                                   |

**不包含**（有意排除）：

- `tts_audio`（约 109 MB 的 MP3，可由 `POST /tts/prewarm` 重新合成，或直接保留本机 `storage/tts`）
- 个人学习数据：`user_course_progress`、`practice_state`、`review_card`、`last_practice` 等

## 恢复

先建表：`pnpm db:init`，然后导入（按需先清空四张表）：

```bash
# 如果库里已有数据，先清空（会级联清掉引用这些课程的用户进度）
# psql -c 'TRUNCATE statements, courses, course_packs, fragment_translation CASCADE;'

# Linux / macOS（docker-compose 起库）
gzip -dc data/earthworm-content.sql.gz | docker compose exec -T db psql -U postgres -d earthworm

# 使用本机 psql
gzip -dc data/earthworm-content.sql.gz | psql "postgres://postgres@127.0.0.1:5434/earthworm"
```

Windows 便携版同理，把 `psql` 换成 `tools\pgsql\bin\psql.exe` 即可。

恢复后如需要语音，调用 `POST /tts/prewarm` 重新合成（会写入 `tts_audio` 和 `storage/tts`），已缓存的会跳过。
