#!/usr/bin/env bash
# Linux/macOS 版一键停止，对应 stop-earthworm.bat。
# 按记录在 .earthworm-*.pid 的进程停 API/Web（连同它们的子进程，
# 比如 TTS 的 Python worker），再停 Docker 里的 PostgreSQL / Redis。
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

for pair in ".earthworm-web.pid:Web server" ".earthworm-api.pid:API server"; do
  pidfile="${pair%%:*}"
  name="${pair##*:}"
  if [ -f "$pidfile" ]; then
    pid=$(cat "$pidfile" 2>/dev/null || echo "")
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      # 外壳是进程组组长：按组杀，才能把 node 和 TTS worker 一起带走
      # （只 kill 外壳会让 node 变孤儿继续占端口）
      kill -- "-$pid" 2>/dev/null || { pkill -P "$pid" 2>/dev/null; kill "$pid" 2>/dev/null; }
      echo "[launcher] $name 已停止 (pid $pid)"
    else
      echo "[launcher] $name 未在运行"
    fi
    rm -f "$pidfile"
  else
    echo "[launcher] 没有 $name 的 pid 记录（可能不是本启动器拉起的）"
  fi
done

# 孤儿进程兜底：pidfile 丢了但 node 还占着端口
for port_script in "3101:apps/api/dist/src/main" "3100:apps/client/server-start.mjs"; do
  port="${port_script%%:*}"
  script="${port_script##*:}"
  orphan=$(ss -ltnp 2>/dev/null | awk -v p=":$port" '$4 ~ p"$" {print $0}' | grep -oP "pid=\K[0-9]+" | sort -u)
  if [ -n "$orphan" ]; then
    for op in $orphan; do
      # 只认本项目路径下的进程，避免误伤上游 /home/xzh/earthworm
      cwd=$(readlink "/proc/$op/cwd" 2>/dev/null || echo "")
      case "$cwd" in
        "$ROOT"*)
          kill "$op" 2>/dev/null && echo "[launcher] 清理孤儿进程 pid $op ($script)"
          ;;
      esac
    done
  fi
done

# ---- 数据库（docker）：停容器，不删数据 ----
if docker compose ps --status running --services 2>/dev/null | grep -q .; then
  echo "[launcher] 停止 PostgreSQL / Redis 容器（数据保留）..."
  docker compose stop db redis >/dev/null 2>&1 || true
fi

echo
echo "============================================"
echo "  全部服务已停止"
echo "============================================"
