# -*- coding: utf-8 -*-
"""
照片 API 路由
"""

import json
import os
from pathlib import Path
from flask import Blueprint, request, jsonify, send_file

from PIL import Image
import exifread

from backend.config import (THUMBNAILS_DIR, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT,
                      THUMBNAIL_QUALITY, SUPPORTED_IMAGE_FORMATS)
from backend.database import DBManager
from backend.database.models import Photo

photos_bp = Blueprint('photos', __name__)


def generate_thumbnail(photo: Photo) -> str:
    """生成缩略图"""
    try:
        if not Path(photo.file_path).exists():
            return None

        thumbnail_name = f"thumb_{photo.id}.jpg"
        thumbnail_path = THUMBNAILS_DIR / thumbnail_name

        with Image.open(photo.file_path) as img:
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')

            img.thumbnail((THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT), Image.Resampling.LANCZOS)
            img.save(thumbnail_path, 'JPEG', quality=THUMBNAIL_QUALITY, optimize=True)

        return str(thumbnail_path)
    except Exception as e:
        print(f"生成缩略图失败: {e}")
        return None


def extract_exif(file_path: str) -> dict:
    """提取EXIF信息"""
    try:
        with open(file_path, 'rb') as f:
            tags = exifread.process_file(f, details=False)

        exif_data = {}
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

        return exif_data if exif_data else None
    except Exception:
        return None


@photos_bp.route('', methods=['POST'])
def create_photo():
    """创建照片（从上传的文件）"""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    roll_id = request.form.get('roll_id', type=int)
    frame_number = request.form.get('frame_number', type=int)

    if not roll_id:
        return jsonify({'error': 'roll_id is required'}), 400

    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    # 保存原文件
    filename = file.filename
    file_path = THUMBNAILS_DIR.parent / "photos" / filename
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file.save(str(file_path))

    # 获取文件信息
    file_size = file_path.stat().st_size
    suffix = file_path.suffix.lower()
    file_format = 'bmp' if suffix in ['.bmp'] else 'tif' if suffix in ['.tif', '.tiff'] else 'jpg'

    # 提取EXIF
    exif_data = extract_exif(str(file_path))

    # 创建Photo对象
    photo = Photo(
        roll_id=roll_id,
        file_path=str(file_path),
        file_name=filename,
        file_size=file_size,
        file_format=file_format,
        frame_number=frame_number,
        exif_data=json.dumps(exif_data) if exif_data else None
    )

    db = DBManager()
    photo_id = db.create_photo(photo)
    photo.id = photo_id

    # 生成缩略图
    thumbnail_path = generate_thumbnail(photo)
    if thumbnail_path:
        photo.thumbnail_path = thumbnail_path
        db.update_photo(photo)

    return jsonify({
        'id': photo.id,
        'roll_id': photo.roll_id,
        'file_name': photo.file_name,
        'frame_number': photo.frame_number,
        'thumbnail_path': photo.thumbnail_path,
        'message': 'Photo created successfully'
    }), 201


@photos_bp.route('/<int:photo_id>', methods=['GET'])
def get_photo(photo_id):
    """获取照片详情"""
    db = DBManager()
    photo = db.get_photo(photo_id)

    if not photo:
        return jsonify({'error': 'Photo not found'}), 404

    return jsonify({
        'id': photo.id,
        'roll_id': photo.roll_id,
        'file_path': photo.file_path,
        'file_name': photo.file_name,
        'file_size': photo.file_size,
        'file_format': photo.file_format,
        'frame_number': photo.frame_number,
        'title': photo.title,
        'description': photo.description,
        'rating': photo.rating,
        'is_favorite': photo.is_favorite,
        'exif_data': photo.exif_data,
        'thumbnail_path': photo.thumbnail_path
    })


@photos_bp.route('/<int:photo_id>', methods=['PUT'])
def update_photo(photo_id):
    """更新照片"""
    data = request.get_json()
    db = DBManager()
    photo = db.get_photo(photo_id)

    if not photo:
        return jsonify({'error': 'Photo not found'}), 404

    if 'title' in data:
        photo.title = data['title']
    if 'description' in data:
        photo.description = data['description']
    if 'rating' in data:
        photo.rating = data['rating']
    if 'is_favorite' in data:
        photo.is_favorite = data['is_favorite']
    if 'thumbnail_path' in data:
        photo.thumbnail_path = data['thumbnail_path']

    db.update_photo(photo)

    return jsonify({'message': 'Photo updated successfully'})


@photos_bp.route('/<int:photo_id>', methods=['DELETE'])
def delete_photo(photo_id):
    """删除照片"""
    db = DBManager()
    photo = db.get_photo(photo_id)

    if not photo:
        return jsonify({'error': 'Photo not found'}), 404

    # 删除文件
    try:
        if Path(photo.file_path).exists():
            Path(photo.file_path).unlink()
    except Exception:
        pass

    # 删除缩略图
    if photo.thumbnail_path:
        try:
            Path(photo.thumbnail_path).unlink(missing_ok=True)
        except Exception:
            pass

    db.delete_photo(photo_id, delete_file=False)

    return jsonify({'message': 'Photo deleted successfully'})


@photos_bp.route('/<int:photo_id>/image', methods=['GET'])
def get_photo_image(photo_id):
    """获取照片原图"""
    db = DBManager()
    photo = db.get_photo(photo_id)

    if not photo or not Path(photo.file_path).exists():
        return jsonify({'error': 'Photo not found'}), 404

    return send_file(photo.file_path)


@photos_bp.route('/<int:photo_id>/thumbnail', methods=['GET'])
def get_photo_thumbnail(photo_id):
    """获取照片缩略图"""
    db = DBManager()
    photo = db.get_photo(photo_id)

    if not photo or not photo.thumbnail_path:
        return jsonify({'error': 'Thumbnail not found'}), 404

    return send_file(photo.thumbnail_path)


@photos_bp.route('/batch/update', methods=['POST'])
def batch_update_photos():
    """批量更新照片"""
    data = request.get_json()
    photo_ids = data.get('photo_ids', [])
    updates = data.get('updates', {})

    db = DBManager()
    db.update_photos_batch(photo_ids, **updates)

    return jsonify({'message': f'Updated {len(photo_ids)} photos'})