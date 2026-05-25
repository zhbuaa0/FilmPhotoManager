# -*- coding: utf-8 -*-
"""
Flask 应用入口
"""

import os
import sys

# 添加项目根目录到 Python 路径
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

from flask import Flask
from flask_cors import CORS

from backend.config import DEBUG, CORS_ORIGINS


def create_app():
    """创建 Flask 应用"""
    app = Flask(__name__,
                static_folder='../frontend/dist',
                static_url_path='')

    app.config['SECRET_KEY'] = 'film-photo-manager-secret'
    app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB max

    # CORS 配置
    CORS(app, origins=CORS_ORIGINS, supports_credentials=True)

    # 注册蓝图
    from backend.api.rolls import rolls_bp
    from backend.api.photos import photos_bp
    from backend.api.tags import tags_bp

    app.register_blueprint(rolls_bp, url_prefix='/api/rolls')
    app.register_blueprint(photos_bp, url_prefix='/api/photos')
    app.register_blueprint(tags_bp, url_prefix='/api/tags')

    # 健康检查
    @app.route('/api/health')
    def health():
        return {'status': 'ok'}

    # 提供缩略图
    from backend.config import THUMBNAILS_DIR
    @app.route('/api/thumbnails/<path:filename>')
    def serve_thumbnail(filename):
        from flask import send_from_directory
        return send_from_directory(str(THUMBNAILS_DIR), filename)

    # 提供原图
    @app.route('/api/photos/<int:photo_id>/image')
    def serve_photo(photo_id):
        from flask import send_file
        from .database import DBManager
        db = DBManager()
        photo = db.get_photo(photo_id)
        if photo and photo.file_path:
            return send_file(photo.file_path)
        return {'error': 'Photo not found'}, 404

    return app


if __name__ == '__main__':
    app = create_app()
    app.run(host='0.0.0.0', port=5001, debug=True)