# -*- coding: utf-8 -*-
"""
胶卷 API 路由
"""

from flask import Blueprint, request, jsonify

from backend.database import DBManager
from backend.database.models import Roll

rolls_bp = Blueprint('rolls', __name__)


@rolls_bp.route('', methods=['GET'])
def get_rolls():
    """获取所有胶卷"""
    db = DBManager()
    rolls = db.get_all_rolls()
    return jsonify([{
        'id': r.id,
        'roll_number': r.roll_number,
        'film_type': r.film_type,
        'camera': r.camera,
        'lens': r.lens,
        'shoot_date': r.shoot_date,
        'develop_date': r.develop_date,
        'scan_date': r.scan_date,
        'lab': r.lab,
        'notes': r.notes,
        'photo_count': r.photo_count,
        'cover_photo_id': r.cover_photo_id,
        'created_at': r.created_at,
        'updated_at': r.updated_at
    } for r in rolls])


@rolls_bp.route('', methods=['POST'])
def create_roll():
    """创建胶卷"""
    data = request.get_json()

    roll = Roll(
        roll_number=data.get('roll_number', ''),
        film_type=data.get('film_type', ''),
        camera=data.get('camera'),
        lens=data.get('lens'),
        shoot_date=data.get('shoot_date'),
        develop_date=data.get('develop_date'),
        scan_date=data.get('scan_date'),
        lab=data.get('lab'),
        notes=data.get('notes'),
        photo_count=data.get('photo_count', 36)
    )

    db = DBManager()
    roll_id = db.create_roll(roll)
    roll.id = roll_id

    return jsonify({
        'id': roll.id,
        'roll_number': roll.roll_number,
        'film_type': roll.film_type,
        'message': 'Roll created successfully'
    }), 201


@rolls_bp.route('/<int:roll_id>', methods=['GET'])
def get_roll(roll_id):
    """获取单个胶卷"""
    db = DBManager()
    roll = db.get_roll(roll_id)

    if not roll:
        return jsonify({'error': 'Roll not found'}), 404

    return jsonify({
        'id': roll.id,
        'roll_number': roll.roll_number,
        'film_type': roll.film_type,
        'camera': roll.camera,
        'lens': roll.lens,
        'shoot_date': roll.shoot_date,
        'develop_date': roll.develop_date,
        'scan_date': roll.scan_date,
        'lab': roll.lab,
        'notes': roll.notes,
        'photo_count': roll.photo_count,
        'cover_photo_id': roll.cover_photo_id,
        'created_at': roll.created_at,
        'updated_at': roll.updated_at
    })


@rolls_bp.route('/<int:roll_id>', methods=['PUT'])
def update_roll(roll_id):
    """更新胶卷"""
    data = request.get_json()
    db = DBManager()
    roll = db.get_roll(roll_id)

    if not roll:
        return jsonify({'error': 'Roll not found'}), 404

    # 更新字段
    if 'roll_number' in data:
        roll.roll_number = data['roll_number']
    if 'film_type' in data:
        roll.film_type = data['film_type']
    if 'camera' in data:
        roll.camera = data['camera']
    if 'lens' in data:
        roll.lens = data['lens']
    if 'shoot_date' in data:
        roll.shoot_date = data['shoot_date']
    if 'develop_date' in data:
        roll.develop_date = data['develop_date']
    if 'scan_date' in data:
        roll.scan_date = data['scan_date']
    if 'lab' in data:
        roll.lab = data['lab']
    if 'notes' in data:
        roll.notes = data['notes']
    if 'photo_count' in data:
        roll.photo_count = data['photo_count']
    if 'cover_photo_id' in data:
        roll.cover_photo_id = data['cover_photo_id']

    db.update_roll(roll)

    return jsonify({'message': 'Roll updated successfully'})


@rolls_bp.route('/<int:roll_id>', methods=['DELETE'])
def delete_roll(roll_id):
    """删除胶卷"""
    db = DBManager()
    success = db.delete_roll(roll_id, delete_files=False)

    if success:
        return jsonify({'message': 'Roll deleted successfully'})
    return jsonify({'error': 'Failed to delete roll'}), 400


@rolls_bp.route('/<int:roll_id>/photos', methods=['GET'])
def get_roll_photos(roll_id):
    """获取胶卷的所有照片"""
    db = DBManager()
    photos = db.get_photos_by_roll(roll_id)

    return jsonify([{
        'id': p.id,
        'roll_id': p.roll_id,
        'file_path': p.file_path,
        'file_name': p.file_name,
        'file_size': p.file_size,
        'file_format': p.file_format,
        'frame_number': p.frame_number,
        'title': p.title,
        'description': p.description,
        'rating': p.rating,
        'is_favorite': p.is_favorite,
        'exif_data': p.exif_data,
        'thumbnail_path': p.thumbnail_path
    } for p in photos])


@rolls_bp.route('/search', methods=['GET'])
def search_rolls():
    """搜索胶卷"""
    keyword = request.args.get('q', '')
    db = DBManager()
    rolls = db.search_rolls(keyword)

    return jsonify([{
        'id': r.id,
        'roll_number': r.roll_number,
        'film_type': r.film_type,
        'camera': r.camera,
        'shoot_date': r.shoot_date,
        'photo_count': r.photo_count
    } for r in rolls])


@rolls_bp.route('/stats', methods=['GET'])
def get_stats():
    """获取统计信息"""
    db = DBManager()
    stats = db.get_statistics()
    return jsonify(stats)