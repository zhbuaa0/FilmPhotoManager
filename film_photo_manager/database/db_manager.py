# -*- coding: utf-8 -*-
"""
数据库连接与通用 CRUD 操作
负责数据库初始化、连接和所有数据表的增删改查操作
"""

import sqlite3
from contextlib import contextmanager
from typing import Optional, List, Dict, Any
from pathlib import Path

from ..config import DB_PATH
from .models import Roll, Photo, Tag


class DBManager:
    """数据库管理器 - 单例模式"""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self.db_path = DB_PATH
        self._init_database()

    @contextmanager
    def get_connection(self):
        """获取数据库连接的上下文管理器"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()

    def _init_database(self):
        """初始化数据库，创建所有表"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            # 创建胶卷表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS rolls (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    roll_number TEXT UNIQUE NOT NULL,
                    film_type TEXT NOT NULL,
                    camera TEXT,
                    lens TEXT,
                    shoot_date TEXT,
                    develop_date TEXT,
                    scan_date TEXT,
                    lab TEXT,
                    notes TEXT,
                    photo_count INTEGER DEFAULT 36,
                    cover_photo_id INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')

            # 创建照片表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS photos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    roll_id INTEGER NOT NULL,
                    file_path TEXT UNIQUE NOT NULL,
                    file_name TEXT NOT NULL,
                    file_size INTEGER,
                    file_format TEXT,
                    frame_number INTEGER,
                    title TEXT,
                    description TEXT,
                    rating INTEGER DEFAULT 0,
                    is_favorite BOOLEAN DEFAULT 0,
                    exif_data TEXT,
                    thumbnail_path TEXT,
                    FOREIGN KEY (roll_id) REFERENCES rolls(id) ON DELETE CASCADE
                )
            ''')

            # 创建标签表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS tags (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    color TEXT DEFAULT '#FFFFFF',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')

            # 创建照片标签关联表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS photo_tags (
                    photo_id INTEGER NOT NULL,
                    tag_id INTEGER NOT NULL,
                    PRIMARY KEY (photo_id, tag_id),
                    FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE,
                    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
                )
            ''')

            # 创建索引以提高查询性能
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_photos_roll_id ON photos(roll_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_photos_rating ON photos(rating)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_photos_is_favorite ON photos(is_favorite)')

    # ==================== 胶卷操作 ====================

    def create_roll(self, roll: Roll) -> int:
        """创建胶卷"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO rolls (roll_number, film_type, camera, lens, shoot_date,
                                   develop_date, scan_date, lab, notes, photo_count,
                                   cover_photo_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ''', (roll.roll_number, roll.film_type, roll.camera, roll.lens, roll.shoot_date,
                  roll.develop_date, roll.scan_date, roll.lab, roll.notes, roll.photo_count,
                  roll.cover_photo_id))
            return cursor.lastrowid

    def get_roll(self, roll_id: int) -> Optional[Roll]:
        """获取胶卷"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM rolls WHERE id = ?', (roll_id,))
            row = cursor.fetchone()
            return Roll.from_dict(dict(row)) if row else None

    def get_all_rolls(self) -> List[Roll]:
        """获取所有胶卷，按创建时间倒序"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM rolls ORDER BY created_at DESC')
            return [Roll.from_dict(dict(row)) for row in cursor.fetchall()]

    def update_roll(self, roll: Roll) -> bool:
        """更新胶卷"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE rolls SET roll_number=?, film_type=?, camera=?, lens=?,
                                 shoot_date=?, develop_date=?, scan_date=?, lab=?,
                                 notes=?, photo_count=?, cover_photo_id=?, updated_at=CURRENT_TIMESTAMP
                WHERE id=?
            ''', (roll.roll_number, roll.film_type, roll.camera, roll.lens, roll.shoot_date,
                  roll.develop_date, roll.scan_date, roll.lab, roll.notes, roll.photo_count,
                  roll.cover_photo_id, roll.id))
            return cursor.rowcount > 0

    def delete_roll(self, roll_id: int, delete_files: bool = False) -> bool:
        """删除胶卷"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            if delete_files:
                cursor.execute('SELECT file_path FROM photos WHERE roll_id=?', (roll_id,))
                for row in cursor.fetchall():
                    try:
                        Path(row['file_path']).unlink(missing_ok=True)
                    except Exception:
                        pass

            cursor.execute('DELETE FROM rolls WHERE id=?', (roll_id,))
            return cursor.rowcount > 0

    def search_rolls(self, keyword: str) -> List[Roll]:
        """搜索胶卷"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            pattern = f'%{keyword}%'
            cursor.execute('''
                SELECT * FROM rolls
                WHERE roll_number LIKE ? OR film_type LIKE ? OR camera LIKE ? OR notes LIKE ?
                ORDER BY created_at DESC
            ''', (pattern, pattern, pattern, pattern))
            return [Roll.from_dict(dict(row)) for row in cursor.fetchall()]

    # ==================== 照片操作 ====================

    def create_photo(self, photo: Photo) -> int:
        """创建照片"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO photos (roll_id, file_path, file_name, file_size, file_format,
                                    frame_number, title, description, rating, is_favorite,
                                    exif_data, thumbnail_path)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (photo.roll_id, photo.file_path, photo.file_name, photo.file_size,
                  photo.file_format, photo.frame_number, photo.title, photo.description,
                  photo.rating, photo.is_favorite, photo.exif_data, photo.thumbnail_path))
            return cursor.lastrowid

    def get_photo(self, photo_id: int) -> Optional[Photo]:
        """获取照片"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM photos WHERE id=?', (photo_id,))
            row = cursor.fetchone()
            return Photo.from_dict(dict(row)) if row else None

    def get_photos_by_roll(self, roll_id: int) -> List[Photo]:
        """获取胶卷的所有照片"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM photos WHERE roll_id=? ORDER BY frame_number',
                          (roll_id,))
            return [Photo.from_dict(dict(row)) for row in cursor.fetchall()]

    def update_photo(self, photo: Photo) -> bool:
        """更新照片"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE photos SET title=?, description=?, rating=?, is_favorite=?,
                                  thumbnail_path=? WHERE id=?
            ''', (photo.title, photo.description, photo.rating, photo.is_favorite,
                  photo.thumbnail_path, photo.id))
            return cursor.rowcount > 0

    def delete_photo(self, photo_id: int, delete_file: bool = False) -> bool:
        """删除照片"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            if delete_file:
                cursor.execute('SELECT file_path FROM photos WHERE id=?', (photo_id,))
                row = cursor.fetchone()
                if row:
                    try:
                        Path(row['file_path']).unlink(missing_ok=True)
                    except Exception:
                        pass

            cursor.execute('DELETE FROM photos WHERE id=?', (photo_id,))
            return cursor.rowcount > 0

    def update_photos_batch(self, photo_ids: List[int], **kwargs) -> bool:
        """批量更新照片"""
        if not photo_ids:
            return False

        valid_fields = ['title', 'description', 'rating', 'is_favorite']
        updates = {k: v for k, v in kwargs.items() if k in valid_fields}

        if not updates:
            return False

        set_clause = ', '.join([f'{k}=?' for k in updates.keys()])
        values = list(updates.values()) + photo_ids

        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(f'UPDATE photos SET {set_clause} WHERE id IN ({",".join(["?"]*len(photo_ids))})',
                          values)
            return cursor.rowcount > 0

    def search_photos(self, roll_id: Optional[int] = None, tag_id: Optional[int] = None,
                     rating: Optional[int] = None, is_favorite: Optional[bool] = None,
                     keyword: str = "") -> List[Photo]:
        """搜索照片"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            query = 'SELECT DISTINCT p.* FROM photos p'
            conditions = []
            params = []

            if tag_id is not None:
                query += ' JOIN photo_tags pt ON p.id = pt.photo_id'
                conditions.append('pt.tag_id = ?')
                params.append(tag_id)

            if roll_id is not None:
                conditions.append('p.roll_id = ?')
                params.append(roll_id)

            if rating is not None:
                conditions.append('p.rating >= ?')
                params.append(rating)

            if is_favorite is not None:
                conditions.append('p.is_favorite = ?')
                params.append(is_favorite)

            if keyword:
                conditions.append('(p.title LIKE ? OR p.description LIKE ? OR p.file_name LIKE ?)')
                pattern = f'%{keyword}%'
                params.extend([pattern, pattern, pattern])

            if conditions:
                query += ' WHERE ' + ' AND '.join(conditions)

            query += ' ORDER BY p.frame_number'

            cursor.execute(query, params)
            return [Photo.from_dict(dict(row)) for row in cursor.fetchall()]

    # ==================== 标签操作 ====================

    def create_tag(self, tag: Tag) -> int:
        """创建标签"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('INSERT INTO tags (name, color) VALUES (?, ?)',
                          (tag.name, tag.color))
            return cursor.lastrowid

    def get_tag(self, tag_id: int) -> Optional[Tag]:
        """获取标签"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM tags WHERE id=?', (tag_id,))
            row = cursor.fetchone()
            return Tag.from_dict(dict(row)) if row else None

    def get_all_tags(self) -> List[Tag]:
        """获取所有标签"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM tags ORDER BY name')
            return [Tag.from_dict(dict(row)) for row in cursor.fetchall()]

    def update_tag(self, tag: Tag) -> bool:
        """更新标签"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('UPDATE tags SET name=?, color=? WHERE id=?',
                          (tag.name, tag.color, tag.id))
            return cursor.rowcount > 0

    def delete_tag(self, tag_id: int) -> bool:
        """删除标签"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM tags WHERE id=?', (tag_id,))
            return cursor.rowcount > 0

    def add_photo_tag(self, photo_id: int, tag_id: int) -> bool:
        """给照片添加标签"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('INSERT OR IGNORE INTO photo_tags (photo_id, tag_id) VALUES (?, ?)',
                              (photo_id, tag_id))
                return True
        except Exception:
            return False

    def remove_photo_tag(self, photo_id: int, tag_id: int) -> bool:
        """移除照片的标签"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM photo_tags WHERE photo_id=? AND tag_id=?',
                          (photo_id, tag_id))
            return cursor.rowcount > 0

    def get_photo_tags(self, photo_id: int) -> List[Tag]:
        """获取照片的所有标签"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT t.* FROM tags t
                JOIN photo_tags pt ON t.id = pt.tag_id
                WHERE pt.photo_id=?
            ''', (photo_id,))
            return [Tag.from_dict(dict(row)) for row in cursor.fetchall()]

    def get_tags_by_photo_ids(self, photo_ids: List[int]) -> Dict[int, List[Tag]]:
        """批量获取照片的标签"""
        if not photo_ids:
            return {}

        placeholders = ','.join(['?'] * len(photo_ids))
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(f'''
                SELECT pt.photo_id, t.* FROM tags t
                JOIN photo_tags pt ON t.id = pt.tag_id
                WHERE pt.photo_id IN ({placeholders})
            ''', photo_ids)

            result = {pid: [] for pid in photo_ids}
            for row in cursor.fetchall():
                result[row['photo_id']].append(Tag.from_dict(dict(row)))
            return result

    # ==================== 统计操作 ====================

    def get_statistics(self) -> Dict[str, int]:
        """获取统计数据"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            stats = {}

            cursor.execute('SELECT COUNT(*) FROM rolls')
            stats['total_rolls'] = cursor.fetchone()[0]

            cursor.execute('SELECT COUNT(*) FROM photos')
            stats['total_photos'] = cursor.fetchone()[0]

            cursor.execute('SELECT COUNT(*) FROM tags')
            stats['total_tags'] = cursor.fetchone()[0]

            cursor.execute('SELECT COUNT(*) FROM photos WHERE is_favorite=1')
            stats['favorite_photos'] = cursor.fetchone()[0]

            return stats

    def roll_exists(self, roll_number: str) -> bool:
        """检查胶卷编号是否已存在"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT 1 FROM rolls WHERE roll_number=?', (roll_number,))
            return cursor.fetchone() is not None

    def photo_exists(self, file_path: str) -> bool:
        """检查照片是否已存在"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT 1 FROM photos WHERE file_path=?', (file_path,))
            return cursor.fetchone() is not None