# -*- coding: utf-8 -*-
"""
胶卷管理核心逻辑
负责胶卷的创建、导入、编辑、删除和导出
"""

import os
import re
import shutil
import zipfile
from pathlib import Path
from typing import List, Optional, Tuple, Callable
from datetime import datetime

from ..config import SUPPORTED_IMAGE_FORMATS, ROLL_MIN_PHOTOS, ROLL_MAX_PHOTOS, THUMBNAILS_DIR
from ..database.db_manager import DBManager
from ..database.models import Roll, Photo
from .photo_processor import PhotoProcessor


class RollManager:
    """胶卷管理器"""

    def __init__(self):
        self.db = DBManager()
        self.photo_processor = PhotoProcessor()

    def create_roll(self, roll_data: dict) -> Optional[Roll]:
        """创建新胶卷"""
        try:
            roll = Roll(
                roll_number=roll_data.get('roll_number', ''),
                film_type=roll_data.get('film_type', ''),
                camera=roll_data.get('camera'),
                lens=roll_data.get('lens'),
                shoot_date=roll_data.get('shoot_date'),
                develop_date=roll_data.get('develop_date'),
                scan_date=roll_data.get('scan_date'),
                lab=roll_data.get('lab'),
                notes=roll_data.get('notes'),
                photo_count=roll_data.get('photo_count', 36)
            )
            roll_id = self.db.create_roll(roll)
            roll.id = roll_id
            return roll
        except Exception as e:
            print(f"创建胶卷失败: {e}")
            return None

    def get_all_rolls(self) -> List[Roll]:
        """获取所有胶卷"""
        return self.db.get_all_rolls()

    def get_roll(self, roll_id: int) -> Optional[Roll]:
        """获取胶卷"""
        return self.db.get_roll(roll_id)

    def update_roll(self, roll: Roll) -> bool:
        """更新胶卷"""
        return self.db.update_roll(roll)

    def delete_roll(self, roll_id: int, delete_files: bool = False) -> bool:
        """删除胶卷"""
        photos = self.db.get_photos_by_roll(roll_id)

        if delete_files:
            for photo in photos:
                try:
                    Path(photo.file_path).unlink(missing_ok=True)
                except Exception:
                    pass
                self.photo_processor.delete_thumbnail(photo.id)

        return self.db.delete_roll(roll_id, delete_files)

    def get_cover_photo(self, roll: Roll) -> Optional[Photo]:
        """获取胶卷封面照片"""
        if roll.cover_photo_id:
            return self.db.get_photo(roll.cover_photo_id)

        photos = self.db.get_photos_by_roll(roll.id)
        return photos[0] if photos else None

    def set_cover_photo(self, roll_id: int, photo_id: int) -> bool:
        """设置胶卷封面照片"""
        roll = self.db.get_roll(roll_id)
        if roll:
            roll.cover_photo_id = photo_id
            return self.db.update_roll(roll)
        return False

    def export_roll_to_zip(self, roll_id: int, output_path: str, progress_callback: Optional[Callable] = None) -> bool:
        """
        导出胶卷为ZIP压缩包
        progress_callback: 进度回调函数，参数为 (当前进度, 总数)
        """
        try:
            roll = self.db.get_roll(roll_id)
            if not roll:
                return False

            photos = self.db.get_photos_by_roll(roll_id)
            if not photos:
                return False

            with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for i, photo in enumerate(photos):
                    if Path(photo.file_path).exists():
                        arcname = f"{roll.roll_number}_{photo.file_name}"
                        zipf.write(photo.file_path, arcname)

                    if progress_callback:
                        progress_callback(i + 1, len(photos))

            return True

        except Exception as e:
            print(f"导出胶卷失败: {e}")
            return False

    def search_rolls(self, keyword: str) -> List[Roll]:
        """搜索胶卷"""
        return self.db.search_rolls(keyword)

    @staticmethod
    def generate_roll_number() -> str:
        """生成默认胶卷编号"""
        date_str = datetime.now().strftime("%Y%m%d")

        # 检查数据库中今天已有多少卷
        return f"{date_str}-01"

    def get_next_roll_number(self) -> str:
        """获取下一个可用的胶卷编号"""
        date_str = datetime.now().strftime("%Y%m%d")
        base_number = f"{date_str}-"

        rolls = self.db.get_all_rolls()
        max_seq = 0

        for roll in rolls:
            if roll.roll_number.startswith(base_number):
                try:
                    seq = int(roll.roll_number.split('-')[-1])
                    if seq > max_seq:
                        max_seq = seq
                except ValueError:
                    pass

        return f"{date_str}-{max_seq + 1:02d}"

    def scan_directory_for_photos(self, directory: str) -> List[str]:
        """
        扫描目录获取所有支持的照片文件
        返回文件路径列表
        """
        photo_files = []

        try:
            path = Path(directory)
            if not path.exists() or not path.is_dir():
                return []

            for ext in SUPPORTED_IMAGE_FORMATS:
                photo_files.extend(sorted(path.glob(f"*{ext}")))
                photo_files.extend(sorted(path.glob(f"*{ext.upper()}")))

            # 去除重复并排序
            photo_files = list(set(photo_files))

            # 按文件名排序
            photo_files.sort(key=lambda x: x.name)

        except Exception as e:
            print(f"扫描目录失败: {e}")

        return [str(p) for p in photo_files]

    def group_photos_into_rolls(self, photo_files: List[str]) -> List[List[str]]:
        """
        将照片文件列表分组为多个胶卷
        智能识别：30-40张连续编号的照片为一卷
        """
        if not photo_files:
            return []

        rolls = []
        current_roll = []
        last_num = None

        for file_path in photo_files:
            file_name = Path(file_path).stem

            # 尝试从文件名提取数字
            num = self._extract_number_from_filename(file_name)

            if num is None:
                # 无法提取数字，作为独立文件处理
                if current_roll:
                    rolls.append(current_roll)
                current_roll = [file_path]
                last_num = None
            elif last_num is None:
                # 第一张照片
                current_roll = [file_path]
                last_num = num
            elif num == last_num + 1:
                # 连续编号，加入当前卷
                current_roll.append(file_path)
                last_num = num
            else:
                # 编号不连续，可能是新的一卷
                if ROLL_MIN_PHOTOS <= len(current_roll) <= ROLL_MAX_PHOTOS:
                    rolls.append(current_roll)
                current_roll = [file_path]
                last_num = num

        # 处理最后一卷
        if current_roll and ROLL_MIN_PHOTOS <= len(current_roll) <= ROLL_MAX_PHOTOS:
            rolls.append(current_roll)
        elif current_roll and len(current_roll) < ROLL_MIN_PHOTOS:
            # 照片太少，合并到前一卷（如果存在）
            if rolls:
                rolls[-1].extend(current_roll)
            else:
                rolls.append(current_roll)

        return rolls

    @staticmethod
    def _extract_number_from_filename(filename: str) -> Optional[int]:
        """
        从文件名中提取数字
        支持多种格式：IMG_001, DSC0001, 001, photo1 等
        """
        # 尝试匹配常见的数字模式
        patterns = [
            r'(\d{3,})',  # 3位及以上连续数字
            r'_(\d+)',    # 下划线后的数字
            r'(\d+)',     # 任何数字
        ]

        for pattern in patterns:
            match = re.search(pattern, filename)
            if match:
                try:
                    return int(match.group(1))
                except ValueError:
                    continue

        return None

    def import_photos_from_directory(self, directory: str, roll_data: dict,
                                    progress_callback: Optional[Callable] = None,
                                    cancel_event: Optional[callable] = None) -> List[Roll]:
        """
        从目录导入照片
        directory: 照片所在目录
        roll_data: 胶卷信息字典
        progress_callback: 进度回调 (当前数, 总数, 状态文字)
        cancel_event: 取消事件检测函数
        返回导入的胶卷列表
        """
        photo_files = self.scan_directory_for_photos(directory)

        if not photo_files:
            return []

        photo_groups = self.group_photos_into_rolls(photo_files)
        imported_rolls = []

        total_photos = len(photo_files)
        processed = 0

        for group_idx, group in enumerate(photo_groups):
            if cancel_event and cancel_event():
                break

            # 生成胶卷编号
            roll_data['roll_number'] = roll_data.get('roll_number') or self.get_next_roll_number()

            # 创建胶卷
            roll = self.create_roll(roll_data)
            if not roll:
                continue

            imported_rolls.append(roll)

            # 导入组内的照片
            for frame_num, file_path in enumerate(group, 1):
                if cancel_event and cancel_event():
                    break

                photo = self.photo_processor.process_photo(file_path, roll.id, frame_num)
                processed += 1

                if photo and progress_callback:
                    progress_callback(processed, total_photos, f"正在导入: {Path(file_path).name}")

            # 更新胶卷照片数量
            roll.photo_count = len(self.db.get_photos_by_roll(roll.id))
            self.db.update_roll(roll)

            # 更新roll_data中的编号递增
            if group_idx < len(photo_groups) - 1:
                seq = int(roll_data['roll_number'].split('-')[-1])
                date_part = roll_data['roll_number'].rsplit('-', 1)[0]
                roll_data['roll_number'] = f"{date_part}-{seq + 1:02d}"

        return imported_rolls

    def import_photos_from_files(self, file_paths: List[str], roll_data: dict) -> Optional[Roll]:
        """
        从文件列表导入照片（用于拖拽导入）
        所有文件导入到同一个胶卷
        """
        if not file_paths:
            return None

        # 创建胶卷
        roll_data['roll_number'] = roll_data.get('roll_number') or self.get_next_roll_number()
        roll = self.create_roll(roll_data)
        if not roll:
            return None

        for frame_num, file_path in enumerate(file_paths, 1):
            self.photo_processor.process_photo(file_path, roll.id, frame_num)

        # 更新胶卷照片数量
        roll.photo_count = len(self.db.get_photos_by_roll(roll.id))
        self.db.update_roll(roll)

        return roll