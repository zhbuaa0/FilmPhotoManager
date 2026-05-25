# -*- coding: utf-8 -*-
"""
后端配置文件
"""

import os
from pathlib import Path

# 项目根目录
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
THUMBNAILS_DIR = DATA_DIR / "thumbnails"
DATABASE_PATH = DATA_DIR / "film_manager.db"

# 确保运行时目录存在
DATA_DIR.mkdir(parents=True, exist_ok=True)
THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)

# Flask配置
SECRET_KEY = os.environ.get('SECRET_KEY', 'film-photo-manager-secret-key')
DEBUG = True

# CORS配置
CORS_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
]

# 数据库
DB_PATH = str(DATABASE_PATH)

# 缩略图配置
THUMBNAIL_WIDTH = 300
THUMBNAIL_HEIGHT = 200
THUMBNAIL_QUALITY = 85

# 支持的图片格式
SUPPORTED_IMAGE_FORMATS = ['.bmp', '.tif', '.tiff', '.jpg', '.jpeg']

# 胶卷识别配置
ROLL_MIN_PHOTOS = 30
ROLL_MAX_PHOTOS = 40