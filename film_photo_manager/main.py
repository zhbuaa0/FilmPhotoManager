# -*- coding: utf-8 -*-
"""
胶片照片管理器
启动脚本 - 同时启动后端和前端
"""

import subprocess
import sys
import os
from pathlib import Path

# 项目根目录
PROJECT_ROOT = Path(__file__).resolve().parent
FRONTEND_DIR = PROJECT_ROOT / "frontend"


def run_backend():
    """启动后端服务"""
    print("启动后端服务 (Flask)...")
    sys.path.insert(0, str(PROJECT_ROOT))

    from backend.app import create_app
    app = create_app()
    app.run(host='0.0.0.0', port=5000, debug=False)


def run_frontend():
    """启动前端开发服务器"""
    print("启动前端开发服务器 (Vite)...")

    # 检查 npm 是否可用
    npm_cmd = "npm"
    if sys.platform == "win32":
        npm_cmd = "npm.cmd"

    # 安装依赖（如果需要）
    if not (FRONTEND_DIR / "node_modules").exists():
        print("安装前端依赖...")
        subprocess.run([npm_cmd, "install"], cwd=str(FRONTEND_DIR))

    # 启动开发服务器
    subprocess.run([npm_cmd, "run", "dev"], cwd=str(FRONTEND_DIR))


if __name__ == "__main__":
    # 确保 data 目录存在
    data_dir = PROJECT_ROOT / "data"
    data_dir.mkdir(exist_ok=True)
    (data_dir / "thumbnails").mkdir(exist_ok=True)
    (data_dir / "photos").mkdir(exist_ok=True)

    print("=" * 50)
    print("胶片照片管理器")
    print("=" * 50)
    print()
    print("后端地址: http://localhost:5000")
    print("前端地址: http://localhost:3000")
    print()
    print("按 Ctrl+C 停止服务")
    print("=" * 50)

    # 先运行后端
    run_backend()