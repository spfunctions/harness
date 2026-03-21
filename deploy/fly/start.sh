#!/bin/bash
set -e

CLOUDFLARE_URL="${CLOUDFLARE_URL}"
HARNESS_TOKEN="${HARNESS_TOKEN}"

mkdir -p ~/sparkco-server/{repo,logs,issues,signals}

# Clone repo if not present
if [ ! -d ~/sparkco-server/repo/.git ]; then
  git clone https://github.com/patrickliu0077/sparkco-agent.git ~/sparkco-server/repo || true
  cd ~/sparkco-server/repo && npm install || true
fi

# Write config
cat > ~/sparkco-server/config.json << EOF
{
  "role": "server",
  "cloudflareUrl": "${CLOUDFLARE_URL}",
  "token": "${HARNESS_TOKEN}",
  "workDir": "/root/sparkco-server"
}
EOF

# Start server daemon (foreground — Fly.io manages lifecycle)
exec npx tsx /app/bin/sparkco.ts daemon start --role server --work-dir /root/sparkco-server
