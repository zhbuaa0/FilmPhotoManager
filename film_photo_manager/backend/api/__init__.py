# -*- coding: utf-8 -*-
"""
API 模块初始化
"""

from .rolls import rolls_bp
from .photos import photos_bp
from .tags import tags_bp

__all__ = ['rolls_bp', 'photos_bp', 'tags_bp']