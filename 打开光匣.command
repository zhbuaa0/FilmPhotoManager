#!/bin/zsh
cd "${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  echo "需要 Node.js 20 或更新版本。请安装后再次打开光匣。"
  read -k 1
  exit 1
fi
if curl -fsS http://127.0.0.1:4317/api/library >/dev/null 2>&1; then
  open http://127.0.0.1:4317
  exit 0
fi
(sleep 1; open http://127.0.0.1:4317) &
node server.mjs
