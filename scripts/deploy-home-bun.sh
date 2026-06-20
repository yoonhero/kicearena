#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="${BRANCH:-}"
LABEL="${KICE_LAUNCHD_LABEL:-dev.yoonhero.kice-arena}"
PLIST_PATH="${HOME}/Library/LaunchAgents/${LABEL}.plist"
RUN_DIR="${ROOT_DIR}/.deploy"
RUNNER_PATH="${RUN_DIR}/run-home-server.sh"
LOG_DIR="${RUN_DIR}/logs"

usage() {
  cat <<'USAGE'
Usage: scripts/deploy-home-bun.sh [--branch <branch>]

Deploys the home-server runtime without building or pulling a Docker image.
Postgres and Redis stay in Docker Compose; the app runs directly on macOS Bun
under launchd.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --branch)
      BRANCH="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "Missing required command: $name" >&2
    exit 1
  fi
}

ensure_bun() {
  if command -v bun >/dev/null 2>&1; then
    return 0
  fi

  echo "Bun is not installed for this deploy user. Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="${HOME}/.bun"
  export PATH="${BUN_INSTALL}/bin:${PATH}"

  if ! command -v bun >/dev/null 2>&1; then
    echo "Bun install completed but bun is still not on PATH." >&2
    exit 1
  fi
}

ensure_docker() {
  if [ "${KICE_DOCKER_BACKEND:-}" = "colima" ]; then
    require_command colima
    colima status >/dev/null 2>&1 || colima start
    export DOCKER_HOST="unix://${HOME}/.colima/default/docker.sock"
  fi

  if docker info >/dev/null 2>&1; then
    return 0
  fi

  if command -v colima >/dev/null 2>&1; then
    colima status >/dev/null 2>&1 || colima start
    export DOCKER_HOST="unix://${HOME}/.colima/default/docker.sock"
    docker info >/dev/null 2>&1 && return 0
  fi

  echo "Docker daemon is not running or not reachable." >&2
  exit 1
}

load_env_file() {
  if [ -f "${ROOT_DIR}/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    . "${ROOT_DIR}/.env"
    set +a
  fi
}

default_database_url() {
  local db="${POSTGRES_DB:-kice_arena}"
  local user="${POSTGRES_USER:-kice_arena}"
  local password="${POSTGRES_PASSWORD:-kice_arena}"
  local port="${POSTGRES_HOST_PORT:-5432}"
  printf 'postgresql://%s:%s@127.0.0.1:%s/%s' "$user" "$password" "$port" "$db"
}

default_redis_url() {
  local port="${REDIS_HOST_PORT:-6379}"
  printf 'redis://127.0.0.1:%s' "$port"
}

validate_branch() {
  if [ -z "$BRANCH" ]; then
    return 0
  fi
  case "$BRANCH" in
    *[!A-Za-z0-9._/-]* | -* | */../* | ../* | */..)
      echo "Invalid branch: $BRANCH" >&2
      exit 1
      ;;
  esac
}

sync_branch() {
  if [ -z "$BRANCH" ]; then
    return 0
  fi

  git fetch --prune origin
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
}

write_runner() {
  mkdir -p "$RUN_DIR" "$LOG_DIR"
  cat > "$RUNNER_PATH" <<'RUNNER'
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

    export PATH="${HOME}/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

if [ -f "${ROOT_DIR}/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "${ROOT_DIR}/.env"
  set +a
fi

POSTGRES_DB="${POSTGRES_DB:-kice_arena}"
POSTGRES_USER="${POSTGRES_USER:-kice_arena}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-kice_arena}"
POSTGRES_HOST_PORT="${POSTGRES_HOST_PORT:-5432}"
REDIS_HOST_PORT="${REDIS_HOST_PORT:-6379}"

export NODE_ENV=production
export PORT="${PORT:-${HOST_PORT:-3001}}"
export DATABASE_URL="${DATABASE_URL:-postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_HOST_PORT}/${POSTGRES_DB}}"
export REDIS_URL="${REDIS_URL:-redis://127.0.0.1:${REDIS_HOST_PORT}}"

exec bun server/index.ts
RUNNER
  chmod 755 "$RUNNER_PATH"
}

write_launchd_plist() {
  mkdir -p "$(dirname "$PLIST_PATH")"
  cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${RUNNER_PATH}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${ROOT_DIR}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${LOG_DIR}/home-server.out.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/home-server.err.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${HOME}/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
</dict>
</plist>
PLIST
}

restart_launchd_service() {
  local domain="gui/$(id -u)"
  launchctl bootout "$domain" "$PLIST_PATH" >/dev/null 2>&1 || true
  launchctl bootstrap "$domain" "$PLIST_PATH"
  launchctl kickstart -k "${domain}/${LABEL}"
}

wait_for_health() {
  local port="${PORT:-${HOST_PORT:-3001}}"
  local url="http://127.0.0.1:${port}/api/health"
  local attempt=1

  while [ "$attempt" -le 40 ]; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "Home server is healthy: $url"
      return 0
    fi
    sleep 2
    attempt=$((attempt + 1))
  done

  echo "Home server did not become healthy: $url" >&2
  tail -n 120 "${LOG_DIR}/home-server.err.log" 2>/dev/null || true
  return 1
}

main() {
  export PATH="${HOME}/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH}"

  require_command git
  require_command curl
  ensure_bun
  require_command docker
  require_command launchctl

  validate_branch
  cd "$ROOT_DIR"
  sync_branch
  load_env_file

  export NODE_ENV=production
  export PORT="${PORT:-${HOST_PORT:-3001}}"
  export DATABASE_URL="${DATABASE_URL:-$(default_database_url)}"
  export REDIS_URL="${REDIS_URL:-$(default_redis_url)}"

  ensure_docker
  docker compose stop kice-arena kice-arena-blue kice-arena-green kice-arena-gateway kice-arena-seed >/dev/null 2>&1 || true
  docker compose up -d postgres redis

  bun install --frozen-lockfile
  bun run build
  bun run db:seed

  write_runner
  write_launchd_plist
  restart_launchd_service
  wait_for_health
}

main "$@"
