#!/bin/zsh
cd "${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  echo "需要 Node.js 20 或更新版本。请安装后再次打开光匣。"
  read -k 1
  exit 1
fi
if ! node -e "for (const name of ['sharp','bmp-js','tesseract.js','@tesseract.js-data/eng','@tesseract.js-data/chi_sim']) require.resolve(name)" >/dev/null 2>&1; then
  npm ci || exit 1
fi
node launcher.mjs
