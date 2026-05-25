# -*- coding: utf-8 -*-
"""
全局配置文件
定义应用程序的全局配置、路径和常量
"""

import os
from pathlib import Path

# 应用程序基本信息
APP_NAME = "胶片照片管理器"
APP_VERSION = "1.0.0"
APP_AUTHOR = "胶片摄影师"

# 项目根目录
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
THUMBNAILS_DIR = DATA_DIR / "thumbnails"
DATABASE_PATH = DATA_DIR / "film_manager.db"

# 确保运行时目录存在
DATA_DIR.mkdir(parents=True, exist_ok=True)
THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)

# 缩略图配置
THUMBNAIL_WIDTH = 300
THUMBNAIL_HEIGHT = 200
THUMBNAIL_QUALITY = 85

# 数据库配置
DB_PATH = str(DATABASE_PATH)

# 支持的图片格式
SUPPORTED_IMAGE_FORMATS = ['.bmp', '.tif', '.tiff', '.jpg', '.jpeg']

# 默认下载目录（可配置）
DEFAULT_IMPORT_DIR = str(Path.home() / "Downloads")

# 照片数量范围（用于识别一卷胶卷）
ROLL_MIN_PHOTOS = 30
ROLL_MAX_PHOTOS = 40

# UI配置
WINDOW_MIN_WIDTH = 1200
WINDOW_MIN_HEIGHT = 800
GRID_COLUMNS_DEFAULT = 6
GRID_COLUMNS_MIN = 3
GRID_COLUMNS_MAX = 12

# 评分范围
RATING_MIN = 0
RATING_MAX = 5