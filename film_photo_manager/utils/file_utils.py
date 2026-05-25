# -*- coding: utf-8 -*-
"""
文件操作工具
提供文件操作的常用辅助函数
"""

import os
import shutil
from pathlib import Path
from typing import List, Optional


class FileUtils:
    """文件操作工具类"""

    @staticmethod
    def ensure_dir_exists(directory: str) -> bool:
        """确保目录存在，不存在则创建"""
        try:
            Path(directory).mkdir(parents=True, exist_ok=True)
            return True
        except Exception:
            return False

    @staticmethod
    def get_file_size(file_path: str) -> int:
        """获取文件大小（字节）"""
        try:
            return Path(file_path).stat().st_size
        except Exception:
            return 0

    @staticmethod
    def format_file_size(size: int) -> str:
        """格式化文件大小为可读字符串"""
        if size < 1024:
            return f"{size} B"
        elif size < 1024 * 1024:
            return f"{size / 1024:.1f} KB"
        elif size < 1024 * 1024 * 1024:
            return f"{size / (1024 * 1024):.1f} MB"
        else:
            return f"{size / (1024 * 1024 * 1024):.2f} GB"

    @staticmethod
    def copy_file(src: str, dst: str) -> bool:
        """复制文件"""
        try:
            shutil.copy2(src, dst)
            return True
        except Exception:
            return False

    @staticmethod
    def move_file(src: str, dst: str) -> bool:
        """移动文件"""
        try:
            shutil.move(src, dst)
            return True
        except Exception:
            return False

    @staticmethod
    def delete_file(file_path: str) -> bool:
        """删除文件"""
        try:
            Path(file_path).unlink(missing_ok=True)
            return True
        except Exception:
            return False

    @staticmethod
    def get_files_in_directory(directory: str, extensions: Optional[List[str]] = None) -> List[str]:
        """
        获取目录下的所有文件
        extensions: 文件扩展名列表，如 ['.jpg', '.png']
        """
        try:
            path = Path(directory)
            if not path.exists() or not path.is_dir():
                return []

            files = []
            for item in path.iterdir():
                if item.is_file():
                    if extensions is None or item.suffix.lower() in extensions:
                        files.append(str(item))

            return sorted(files)

        except Exception:
            return []

    @staticmethod
    def get_directory_size(directory: str) -> int:
        """获取目录总大小（字节）"""
        total = 0
        try:
            for item in Path(directory).rglob('*'):
                if item.is_file():
                    total += item.stat().st_size
        except Exception:
            pass
        return total

    @staticmethod
    def is_valid_image_file(file_path: str) -> bool:
        """检查文件是否为有效的图片文件"""
        try:
            path = Path(file_path)
            if not path.exists() or not path.is_file():
                return False

            # 检查扩展名
            valid_extensions = ['.bmp', '.tif', '.tiff', '.jpg', '.jpeg']
            if path.suffix.lower() not in valid_extensions:
                return False

            # 尝试用PIL打开验证
            from PIL import Image
            with Image.open(file_path) as img:
                img.verify()

            return True

        except Exception:
            return False

    @staticmethod
    def get_available_drive_letter() -> Optional[str]:
        """获取下一个可用的盘符（Windows）"""
        import string
        for letter in string.ascii_uppercase:
            if letter == 'A' or letter == 'B':
                continue
            if not Path(f"{letter}:").exists():
                return f"{letter}:"
        return None