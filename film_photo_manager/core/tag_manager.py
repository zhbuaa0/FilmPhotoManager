# -*- coding: utf-8 -*-
"""
标签管理模块
负责标签的CRUD操作和照片标签关联
"""

from typing import List, Optional

from ..database.db_manager import DBManager
from ..database.models import Tag


class TagManager:
    """标签管理器"""

    def __init__(self):
        self.db = DBManager()

    def create_tag(self, name: str, color: str = "#FFFFFF") -> Optional[Tag]:
        """创建标签"""
        try:
            tag = Tag(name=name, color=color)
            tag_id = self.db.create_tag(tag)
            tag.id = tag_id
            return tag
        except Exception:
            return None

    def get_all_tags(self) -> List[Tag]:
        """获取所有标签"""
        return self.db.get_all_tags()

    def get_tag(self, tag_id: int) -> Optional[Tag]:
        """获取标签"""
        return self.db.get_tag(tag_id)

    def update_tag(self, tag: Tag) -> bool:
        """更新标签"""
        return self.db.update_tag(tag)

    def delete_tag(self, tag_id: int) -> bool:
        """删除标签"""
        return self.db.delete_tag(tag_id)

    def add_tag_to_photo(self, photo_id: int, tag_id: int) -> bool:
        """给照片添加标签"""
        return self.db.add_photo_tag(photo_id, tag_id)

    def remove_tag_from_photo(self, photo_id: int, tag_id: int) -> bool:
        """移除照片的标签"""
        return self.db.remove_photo_tag(photo_id, tag_id)

    def get_photo_tags(self, photo_id: int) -> List[Tag]:
        """获取照片的所有标签"""
        return self.db.get_photo_tags(photo_id)

    def get_tags_by_photo_ids(self, photo_ids: List[int]) -> dict:
        """批量获取照片的标签"""
        return self.db.get_tags_by_photo_ids(photo_ids)

    def add_tags_to_photos(self, photo_ids: List[int], tag_id: int) -> bool:
        """批量给照片添加标签"""
        try:
            for photo_id in photo_ids:
                self.db.add_photo_tag(photo_id, tag_id)
            return True
        except Exception:
            return False

    def remove_tags_from_photos(self, photo_ids: List[int], tag_id: int) -> bool:
        """批量移除照片的标签"""
        try:
            for photo_id in photo_ids:
                self.db.remove_photo_tag(photo_id, tag_id)
            return True
        except Exception:
            return False