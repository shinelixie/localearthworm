#!/usr/bin/env bash
# Linux/macOS 版一键启动，对应 start-earthworm.bat。
# 依赖：node>=20、docker（PostgreSQL:5434 + Redis:6381 走 docker-compose；
# 端口错开是为了和上游 cuixueshe/earthworm 的 5433/6379 共存）。
# 首次使用请先完成（README 快速开始）：
#   pnpm install && cp apps/api/.env.example apps/api/.env \
#     && cp apps/client/.env.example apps/client/.env
#   pnpm db:init && pnpm db:upload
#   pnpm -F api build && pnpm -F client build
#
# 之后日常使用只需：./start-earthworm.sh  →  打开 http://localhost:3100
# 停止：./stop-earthworm.sh
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

PORT_DB=5434
PORT_API=3101
PORT_WEB=3100

log() { echo "[launcher] $*"; }
port_up() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && { exec 3>&-; return 0; } || return 1; }

NODE_BIN=$(command -v node) || { echo "[错误] 找不到 node，请先安装 Node.js >= 20"; exit 1; }

if [ ! -f apps/api/.env ]; then
  log "未找到 apps/api/.env，请参照 README 快速开始章节完成初始化（env / 建库 / 构建）。"
  exit 1
fi
if [ ! -f apps/api/dist/src/main.js ]; then
  log "未找到后端产物 apps/api/dist/src/main.js，请先运行：pnpm -F api build"
  exit 1
fi
if [ ! -f apps/client/.output/server/index.mjs ]; then
  log "未找到前端产物 apps/client/.output，请先运行：pnpm -F client build"
  exit 1
fi

# ---- 1/4. PostgreSQL（docker-compose 里的 db 服务）----
if port_up $PORT_DB; then
  log "PostgreSQL 已在 $PORT_DB 运行"
else
  log "启动 PostgreSQL (docker, 127.0.0.1:$PORT_DB) ..."
  docker compose up -d db
  for _ in $(seq 1 30); do
    docker compose exec -T db pg_isready -U postgres >/dev/null 2>&1 && break
    sleep 1
  done
fi

# ---- 2/4. Redis ----
if port_up 6381; then
  log "Redis 已在 6381 运行"
else
  log "启动 Redis (docker, 127.0.0.1:6381) ..."
  docker compose up -d redis
  sleep 2
fi

# ---- 3/4. API 服务（NestJS, 3101）----
if port_up $PORT_API; then
  log "API 已在 $PORT_API 运行"
else
  log "启动 API 服务 ..."
  ( cd "$ROOT/apps/api" && nohup "$NODE_BIN" --env-file=.env dist/src/main \
      >>"$ROOT/api.log" 2>&1 &
    echo $! >"$ROOT/.earthworm-api.pid" )
fi

# ---- 4/4. Web 服务（Nuxt/Nitro, 3100）----
if port_up $PORT_WEB; then
  log "Web 已在 $PORT_WEB 运行"
else
  log "启动 Web 服务 ..."
  ( cd "$ROOT/apps/client" && nohup "$NODE_BIN" server-start.mjs \
      >>"$ROOT/client.log" 2>&1 &
    echo $! >"$ROOT/.earthworm-web.pid" )
fi

# ---- 等待就绪 ----
for _ in $(seq 1 30); do
  port_up $PORT_WEB && break
  sleep 1
done

if port_up $PORT_WEB; then
  echo
  echo "============================================"
  echo "  就绪！ 打开 http://localhost:$PORT_WEB"
  echo "============================================"
  command -v xdg-open >/dev/null && xdg-open "http://localhost:$PORT_WEB" 2>/dev/null || true
else
  log "[警告] Web 服务尚未监听 $PORT_WEB，几秒后再打开 http://localhost:$PORT_WEB"
fi
log "停止全部服务：$ROOT/stop-earthworm.sh"
