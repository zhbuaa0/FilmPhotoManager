# -*- coding: utf-8 -*-
"""
EXIF信息提取工具
专门处理胶片扫描件的EXIF信息
"""

import json
from pathlib import Path
from typing import Optional, Dict, Any

import exifread


class ExifUtils:
    """EXIF信息提取工具类"""

    # EXIF字段映射（中文化）
    FIELD_MAPPING = {
        'EXIF DateTimeOriginal': '拍摄时间',
        'EXIF ExposureTime': '曝光时间',
        'EXIF FNumber': '光圈值',
        'EXIF ISOSpeedRatings': '感光度',
        'EXIF FocalLength': '焦距',
        'EXIF FocalLengthIn35mmFilm': '等效焦距',
        'EXIF LensModel': '镜头型号',
        'EXIF LensSpecification': '镜头规格',
        'EXIF Make': '相机厂商',
        'EXIF Model': '相机型号',
        'EXIF Software': '软件',
        'EXIF WhiteBalance': '白平衡',
        'EXIF Flash': '闪光灯',
        'EXIF MeteringMode': '测光模式',
        'EXIF ExposureProgram': '曝光程序',
        'EXIF ExposureMode': '曝光模式',
        'EXIF BrightnessValue': '亮度值',
        'EXIF Contrast': '对比度',
        'EXIF Saturation': '饱和度',
        'EXIF Sharpness': '锐度',
        'EXIF SceneCaptureType': '场景类型',
        'EXIF SubjectDistanceRange': '主体距离范围',
        'Image ImageWidth': '图像宽度',
        'Image ImageLength': '图像高度',
        'Image BitsPerSample': '位深',
        'Image Compression': '压缩方式',
        'Image PhotometricInterpretation': '光度解释',
        'Image Orientation': '方向',
        'GPS GPSLatitude': 'GPS纬度',
        'GPS GPSLongitude': 'GPS经度',
        'GPS GPSAltitude': 'GPS高度',
    }

    @staticmethod
    def extract_exif(file_path: str) -> Optional[Dict[str, Any]]:
        """
        从图片文件中提取EXIF信息
        返回字典，失败返回None
        """
        try:
            path = Path(file_path)
            if not path.exists():
                return None

            with open(file_path, 'rb') as f:
                tags = exifread.process_file(f, details=False)

            if not tags:
                return None

            exif_data = {}
            for tag, value in tags.items():
                # 转换值为字符串
                val_str = str(value)
                # 跳过空值和缩略图
                if val_str and ' thumbnail' not in tag.lower():
                    exif_data[tag] = val_str

            return exif_data if exif_data else None

        except Exception as e:
            print(f"提取EXIF失败 {file_path}: {e}")
            return None

    @staticmethod
    def extract_exif_chinese(file_path: str) -> Optional[Dict[str, str]]:
        """
        提取EXIF信息并转换为中文标签
        返回中文标签字典，失败返回None
        """
        raw_data = ExifUtils.extract_exif(file_path)
        if not raw_data:
            return None

        chinese_data = {}
        for tag, value in raw_data.items():
            # 查找中文名称
            chinese_name = ExifUtils.FIELD_MAPPING.get(tag, tag)
            chinese_data[chinese_name] = value

        return chinese_data if chinese_data else None

    @staticmethod
    def get_camera_info(file_path: str) -> Dict[str, str]:
        """
        获取相机信息（厂商和型号）
        返回 {'make': '', 'model': ''}
        """
        info = {'make': '', 'model': ''}

        try:
            with open(file_path, 'rb') as f:
                tags = exifread.process_file(f, details=False)

            if tags.get('EXIF Make'):
                info['make'] = str(tags['EXIF Make']).strip()
            if tags.get('EXIF Model'):
                info['model'] = str(tags['EXIF Model']).strip()

        except Exception:
            pass

        return info

    @staticmethod
    def get_shoot_datetime(file_path: str) -> Optional[str]:
        """
        获取拍摄时间
        返回格式: "YYYY:MM:DD HH:MM:SS" 或 None
        """
        try:
            with open(file_path, 'rb') as f:
                tags = exifread.process_file(f, details=False)

            if tags.get('EXIF DateTimeOriginal'):
                return str(tags['EXIF DateTimeOriginal'])

        except Exception:
            pass

        return None

    @staticmethod
    def format_exif_for_display(exif_json: str) -> list:
        """
        格式化EXIF JSON字符串为显示列表
        返回 [{'label': '名称', 'value': '值'}, ...]
        """
        if not exif_json:
            return []

        try:
            data = json.loads(exif_json)
        except Exception:
            return []

        display_fields = [
            ('date_time_original', '拍摄时间'),
            ('exposure_time', '曝光时间'),
            ('f_number', '光圈'),
            ('iso', 'ISO'),
            ('focal_length', '焦距'),
            ('lens_model', '镜头'),
            ('make', '相机厂商'),
            ('model', '相机型号'),
            ('white_balance', '白平衡'),
            ('flash', '闪光灯'),
        ]

        result = []
        for key, label in display_fields:
            if key in data and data[key]:
                result.append({'label': label, 'value': data[key]})

        return result

    @staticmethod
    def has_exif(file_path: str) -> bool:
        """检查文件是否包含EXIF信息"""
        try:
            with open(file_path, 'rb') as f:
                tags = exifread.process_file(f, details=False)
                return bool(tags)
        except Exception:
            return False