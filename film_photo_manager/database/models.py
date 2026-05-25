# -*- coding: utf-8 -*-
"""
数据模型定义
定义胶卷、照片、标签的数据结构
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional, List


@dataclass
class Roll:
    """胶卷数据模型"""
    id: Optional[int] = None
    roll_number: str = ""
    film_type: str = ""
    camera: Optional[str] = None
    lens: Optional[str] = None
    shoot_date: Optional[str] = None
    develop_date: Optional[str] = None
    scan_date: Optional[str] = None
    lab: Optional[str] = None
    notes: Optional[str] = None
    photo_count: int = 36
    cover_photo_id: Optional[int] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    @classmethod
    def from_dict(cls, data: dict) -> 'Roll':
        """从字典创建Roll对象"""
        return cls(
            id=data.get('id'),
            roll_number=data.get('roll_number', ''),
            film_type=data.get('film_type', ''),
            camera=data.get('camera'),
            lens=data.get('lens'),
            shoot_date=data.get('shoot_date'),
            develop_date=data.get('develop_date'),
            scan_date=data.get('scan_date'),
            lab=data.get('lab'),
            notes=data.get('notes'),
            photo_count=data.get('photo_count', 36),
            cover_photo_id=data.get('cover_photo_id'),
            created_at=data.get('created_at'),
            updated_at=data.get('updated_at')
        )


@dataclass
class Photo:
    """照片数据模型"""
    id: Optional[int] = None
    roll_id: int = 0
    file_path: str = ""
    file_name: str = ""
    file_size: Optional[int] = None
    file_format: Optional[str] = None
    frame_number: Optional[int] = None
    title: Optional[str] = None
    description: Optional[str] = None
    rating: int = 0
    is_favorite: bool = False
    exif_data: Optional[str] = None
    thumbnail_path: Optional[str] = None

    @classmethod
    def from_dict(cls, data: dict) -> 'Photo':
        """从字典创建Photo对象"""
        return cls(
            id=data.get('id'),
            roll_id=data.get('roll_id', 0),
            file_path=data.get('file_path', ''),
            file_name=data.get('file_name', ''),
            file_size=data.get('file_size'),
            file_format=data.get('file_format'),
            frame_number=data.get('frame_number'),
            title=data.get('title'),
            description=data.get('description'),
            rating=data.get('rating', 0),
            is_favorite=bool(data.get('is_favorite', False)),
            exif_data=data.get('exif_data'),
            thumbnail_path=data.get('thumbnail_path')
        )


@dataclass
class Tag:
    """标签数据模型"""
    id: Optional[int] = None
    name: str = ""
    color: str = "#FFFFFF"
    created_at: Optional[str] = None

    @classmethod
    def from_dict(cls, data: dict) -> 'Tag':
        """从字典创建Tag对象"""
        return cls(
            id=data.get('id'),
            name=data.get('name', ''),
            color=data.get('color', '#FFFFFF'),
            created_at=data.get('created_at')
        )