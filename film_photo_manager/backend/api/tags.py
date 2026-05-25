# -*- coding: utf-8 -*-
"""
标签 API 路由
"""

from flask import Blueprint, request, jsonify

from backend.database import DBManager
from backend.database.models import Tag

tags_bp = Blueprint('tags', __name__)


@tags_bp.route('', methods=['GET'])
def get_tags():
    """获取所有标签"""
    db = DBManager()
    tags = db.get_all_tags()

    return jsonify([{
        'id': t.id,
        'name': t.name,
        'color': t.color,
        'created_at': t.created_at
    } for t in tags])


@tags_bp.route('', methods=['POST'])
def create_tag():
    """创建标签"""
    data = request.get_json()
    name = data.get('name', '').strip()
    color = data.get('color', '#FFFFFF')

    if not name:
        return jsonify({'error': 'Tag name is required'}), 400

    db = DBManager()
    tag = Tag(name=name, color=color)
    tag_id = db.create_tag(tag)

    return jsonify({
        'id': tag_id,
        'name': name,
        'color': color,
        'message': 'Tag created successfully'
    }), 201


@tags_bp.route('/<int:tag_id>', methods=['PUT'])
def update_tag(tag_id):
    """更新标签"""
    data = request.get_json()
    db = DBManager()
    tag = db.get_tag(tag_id)

    if not tag:
        return jsonify({'error': 'Tag not found'}), 404

    if 'name' in data:
        tag.name = data['name']
    if 'color' in data:
        tag.color = data['color']

    db.update_tag(tag)

    return jsonify({'message': 'Tag updated successfully'})


@tags_bp.route('/<int:tag_id>', methods=['DELETE'])
def delete_tag(tag_id):
    """删除标签"""
    db = DBManager()
    success = db.delete_tag(tag_id)

    if success:
        return jsonify({'message': 'Tag deleted successfully'})
    return jsonify({'error': 'Failed to delete tag'}), 400


@tags_bp.route('/<int:tag_id>/photos', methods=['GET'])
def get_tag_photos(tag_id):
    """获取带有特定标签的所有照片"""
    db = DBManager()
    photos = db.search_photos(tag_id=tag_id)

    return jsonify([{
        'id': p.id,
        'roll_id': p.roll_id,
        'file_name': p.file_name,
        'frame_number': p.frame_number,
        'rating': p.rating,
        'is_favorite': p.is_favorite,
        'thumbnail_path': p.thumbnail_path
    } for p in photos])


@tags_bp.route('/photos/<int:photo_id>/tags', methods=['POST'])
def add_tag_to_photo(photo_id):
    """给照片添加标签"""
    data = request.get_json()
    tag_id = data.get('tag_id')

    if not tag_id:
        return jsonify({'error': 'tag_id is required'}), 400

    db = DBManager()
    success = db.add_photo_tag(photo_id, tag_id)

    if success:
        return jsonify({'message': 'Tag added to photo'})
    return jsonify({'error': 'Failed to add tag'}), 400


@tags_bp.route('/photos/<int:photo_id>/tags/<int:tag_id>', methods=['DELETE'])
def remove_tag_from_photo(photo_id, tag_id):
    """移除照片的标签"""
    db = DBManager()
    success = db.remove_photo_tag(photo_id, tag_id)

    if success:
        return jsonify({'message': 'Tag removed from photo'})
    return jsonify({'error': 'Failed to remove tag'}), 400


@tags_bp.route('/photos/<int:photo_id>/tags', methods=['GET'])
def get_photo_tags(photo_id):
    """获取照片的所有标签"""
    db = DBManager()
    tags = db.get_photo_tags(photo_id)

    return jsonify([{
        'id': t.id,
        'name': t.name,
        'color': t.color
    } for t in tags])