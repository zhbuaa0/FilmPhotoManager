# -*- coding: utf-8 -*-
"""
照片处理模块
负责生成缩略图和提取EXIF信息
"""

import json
import os
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime

from PIL import Image
import exifread

from ..config import THUMBNAILS_DIR, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, THUMBNAIL_QUALITY, SUPPORTED_IMAGE_FORMATS
from ..database.db_manager import DBManager
from ..database.models import Photo


class PhotoProcessor:
    """照片处理器 - 负责缩略图生成和EXIF提取"""

    def __init__(self):
        self.db = DBManager()
        self.thumbnails_dir = THUMBNAILS_DIR
        self.thumbnails_dir.mkdir(parents=True, exist_ok=True)

    def generate_thumbnail(self, photo: Photo) -> Optional[str]:
        """
        生成缩略图
        返回缩略图路径，失败返回None
        """
        try:
            if not Path(photo.file_path).exists():
                return None

            # 确定缩略图文件名
            thumbnail_name = f"thumb_{photo.id}.jpg"
            thumbnail_path = self.thumbnails_dir / thumbnail_name

            # 读取原图并生成缩略图
            with Image.open(photo.file_path) as img:
                # 转换为RGB（处理PNG等格式）
                if img.mode in ('RGBA', 'P'):
                    img = img.convert('RGB')

                # 使用thumbnail方法保持比例
                img.thumbnail((THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT), Image.Resampling.LANCZOS)

                # 保存缩略图
                img.save(thumbnail_path, 'JPEG', quality=THUMBNAIL_QUALITY, optimize=True)

            return str(thumbnail_path)

        except Exception as e:
            print(f"生成缩略图失败 {photo.file_path}: {e}")
            return None

    def extract_exif(self, file_path: str) -> Optional[Dict[str, Any]]:
        """
        从照片文件中提取EXIF信息
        返回包含EXIF数据的字典
        """
        try:
            if not Path(file_path).exists():
                return None

            exif_data = {}

            with open(file_path, 'rb') as f:
                tags = exifread.process_file(f, details=False)

                # 提取常用EXIF字段
                if tags.get('EXIF DateTimeOriginal'):
                    exif_data['date_time_original'] = str(tags['EXIF DateTimeOriginal'])

                if tags.get('EXIF ExposureTime'):
                    exif_data['exposure_time'] = str(tags['EXIF ExposureTime'])

                if tags.get('EXIF FNumber'):
                    exif_data['f_number'] = str(tags['EXIF FNumber'])

                if tags.get('EXIF ISOSpeedRatings'):
                    exif_data['iso'] = str(tags['EXIF ISOSpeedRatings'])

                if tags.get('EXIF FocalLength'):
                    exif_data['focal_length'] = str(tags['EXIF FocalLength'])

                if tags.get('EXIF LensModel'):
                    exif_data['lens_model'] = str(tags['EXIF LensModel'])

                if tags.get('Image Make'):
                    exif_data['make'] = str(tags['Image Make'])

                if tags.get('Image Model'):
                    exif_data['model'] = str(tags['Image Model'])

                if tags.get('EXIF WhiteBalance'):
                    exif_data['white_balance'] = str(tags['EXIF WhiteBalance'])

                if tags.get('EXIF Flash'):
                    exif_data['flash'] = str(tags['EXIF Flash'])

            return exif_data if exif_data else None

        except Exception as e:
            print(f"提取EXIF失败 {file_path}: {e}")
            return None

    def get_file_info(self, file_path: str) -> Dict[str, Any]:
        """
        获取文件信息
        返回文件大小、格式等基本信息
        """
        info = {
            'file_size': 0,
            'file_format': '',
            'exists': False
        }

        try:
            path = Path(file_path)
            if path.exists():
                info['exists'] = True
                info['file_size'] = path.stat().st_size

                # 获取文件格式
                suffix = path.suffix.lower()
                if suffix in ['.bmp']:
                    info['file_format'] = 'bmp'
                elif suffix in ['.tif', '.tiff']:
                    info['file_format'] = 'tif'
                elif suffix in ['.jpg', '.jpeg']:
                    info['file_format'] = 'jpg'

        except Exception as e:
            print(f"获取文件信息失败 {file_path}: {e}")

        return info

    def process_photo(self, file_path: str, roll_id: int, frame_number: int) -> Optional[Photo]:
        """
        处理单张照片：提取信息、生成缩略图、存入数据库
        返回Photo对象
        """
        try:
            path = Path(file_path)
            if not path.exists():
                return None

            # 检查是否支持的文件格式
            if path.suffix.lower() not in SUPPORTED_IMAGE_FORMATS:
                return None

            # 检查是否已存在
            if self.db.photo_exists(str(path)):
                return None

            # 获取文件信息
            file_info = self.get_file_info(str(path))

            # 提取EXIF
            exif_data = self.extract_exif(str(path))

            # 创建Photo对象
            photo = Photo(
                roll_id=roll_id,
                file_path=str(path),
                file_name=path.name,
                file_size=file_info.get('file_size'),
                file_format=file_info.get('file_format'),
                frame_number=frame_number,
                exif_data=json.dumps(exif_data) if exif_data else None
            )

            # 保存到数据库
            photo_id = self.db.create_photo(photo)
            photo.id = photo_id

            # 生成缩略图
            thumbnail_path = self.generate_thumbnail(photo)
            if thumbnail_path:
                photo.thumbnail_path = thumbnail_path
                self.db.update_photo(photo)

            return photo

        except Exception as e:
            print(f"处理照片失败 {file_path}: {e}")
            return None

    def delete_thumbnail(self, photo_id: int) -> bool:
        """删除照片的缩略图"""
        try:
            thumbnail_path = self.thumbnails_dir / f"thumb_{photo_id}.jpg"
            if thumbnail_path.exists():
                thumbnail_path.unlink()
            return True
        except Exception:
            return False

    @staticmethod
    def get_display_exif(exif_json: str) -> Dict[str, str]:
        """
        将EXIF JSON字符串转换为可显示的字典
        用于在UI中显示
        """
        if not exif_json:
            return {}

        try:
            data = json.loads(exif_json)
            display = {}

            field_names = {
                'date_time_original': '拍摄时间',
                'exposure_time': '曝光时间',
                'f_number': '光圈',
                'iso': 'ISO',
                'focal_length': '焦距',
                'lens_model': '镜头',
                'make': '相机厂商',
                'model': '相机型号',
                'white_balance': '白平衡',
                'flash': '闪光灯'
            }

            for key, name in field_names.items():
                if key in data and data[key]:
                    display[name] = data[key]

            return display

        except Exception:
            return {}