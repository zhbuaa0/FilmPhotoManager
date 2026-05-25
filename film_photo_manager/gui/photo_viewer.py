# -*- coding: utf-8 -*-
"""
单张照片查看器
支持缩放、旋转、全屏
"""

from PyQt6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QLabel,
                             QScrollArea, QPushButton, QSlider, QMessageBox,
                             QDialog, QApplication, QMenu)
from PyQt6.QtCore import Qt, pyqtSignal, QSize
from PyQt6.QtGui import QPixmap, QImage, QTransform

from ..database.db_manager import DBManager
from ..database.models import Photo
from ..core.photo_processor import PhotoProcessor


class PhotoViewer(QDialog):
    """照片查看器对话框"""

    closed = pyqtSignal()

    def __init__(self, photo: Photo, parent=None):
        super().__init__(parent)
        self.photo = photo
        self.current_scale = 1.0
        self.current_rotation = 0
        self.init_ui()
        self.load_photo()

    def init_ui(self):
        """初始化UI"""
        self.setWindowTitle(self.photo.title or self.photo.file_name)
        self.setMinimumSize(800, 600)
        self.setWindowFlags(Qt.WindowType.Window)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        # 工具栏
        toolbar = QHBoxLayout()
        toolbar.setContentsMargins(8, 8, 8, 8)
        toolbar.setSpacing(16)

        # 缩放控制
        toolbar.addWidget(QLabel("缩放:"))
        self.zoom_slider = QSlider(Qt.Orientation.Horizontal)
        self.zoom_slider.setMinimum(10)
        self.zoom_slider.setMaximum(500)
        self.zoom_slider.setValue(100)
        self.zoom_slider.setFixedWidth(200)
        self.zoom_slider.valueChanged.connect(self._on_zoom_changed)
        toolbar.addWidget(self.zoom_slider)

        self.zoom_label = QLabel("100%")
        toolbar.addWidget(self.zoom_label)

        # 旋转按钮
        rotate_left_btn = QPushButton("↺ 左旋")
        rotate_left_btn.clicked.connect(lambda: self._rotate(-90))
        toolbar.addWidget(rotate_left_btn)

        rotate_right_btn = QPushButton("右旋 ↻")
        rotate_right_btn.clicked.connect(lambda: self._rotate(90))
        toolbar.addWidget(rotate_right_btn)

        # 适应窗口按钮
        fit_btn = QPushButton("适应窗口")
        fit_btn.clicked.connect(self._fit_to_window)
        toolbar.addWidget(fit_btn)

        # 重置按钮
        reset_btn = QPushButton("重置")
        reset_btn.clicked.connect(self._reset_view)
        toolbar.addWidget(reset_btn)

        toolbar.addStretch()

        # 关闭按钮
        close_btn = QPushButton("关闭")
        close_btn.clicked.connect(self.close)
        toolbar.addWidget(close_btn)

        layout.addLayout(toolbar)

        # 图片滚动区域
        self.scroll_area = QScrollArea()
        self.scroll_area.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.scroll_area.setBackgroundRole(QApplication.ColorRole.Dark)

        self.image_label = QLabel()
        self.image_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.image_label.setMinimumSize(1, 1)

        self.scroll_area.setWidget(self.image_label)
        layout.addWidget(self.scroll_area)

        # 底部信息栏
        info_layout = QHBoxLayout()
        info_layout.setContentsMargins(8, 4, 8, 4)
        info_layout.addWidget(QLabel(f"帧号: {self.photo.frame_number or '?'}"))

        if self.photo.rating > 0:
            stars = "★" * self.photo.rating
            info_layout.addWidget(QLabel(f"评分: {stars}"))

        if self.photo.is_favorite:
            info_layout.addWidget(QLabel("♥ 收藏"))

        # 显示EXIF信息
        exif_display = PhotoProcessor.get_display_exif(self.photo.exif_data)
        if exif_display:
            info_layout.addWidget(QLabel(f"光圈: {exif_display.get('光圈', 'N/A')}"))
            info_layout.addWidget(QLabel(f"快门: {exif_display.get('曝光时间', 'N/A')}"))
            info_layout.addWidget(QLabel(f"ISO: {exif_display.get('ISO', 'N/A')}"))

        info_layout.addStretch()

        self.info_label = QLabel(f"文件: {self.photo.file_name}")
        info_layout.addWidget(self.info_label)

        layout.addLayout(info_layout)

    def load_photo(self):
        """加载照片"""
        # 优先使用原始文件
        from pathlib import Path
        file_path = self.photo.file_path

        if not Path(file_path).exists():
            QMessageBox.warning(self, "错误", "找不到原始文件！")
            return

        pixmap = QPixmap(file_path)
        if pixmap.isNull():
            QMessageBox.warning(self, "错误", "无法加载图片！")
            return

        self.original_pixmap = pixmap
        self._apply_transform()

    def _apply_transform(self):
        """应用变换"""
        if not hasattr(self, 'original_pixmap') or self.original_pixmap.isNull():
            return

        # 创建变换
        transform = QTransform()

        # 应用旋转
        if self.current_rotation != 0:
            transform.rotate(self.current_rotation)

        # 应用缩放
        scaled_pixmap = self.original_pixmap.scaled(
            int(self.original_pixmap.width() * self.current_scale),
            int(self.original_pixmap.height() * self.current_scale),
            Qt.AspectRatioMode.KeepAspectRatio,
            Qt.TransformationMode.SmoothTransformation
        )

        # 应用旋转变换后的图像
        if self.current_rotation != 0:
            rotated_pixmap = scaled_pixmap.transformed(transform)
            self.image_label.setPixmap(rotated_pixmap)
            self.image_label.resize(rotated_pixmap.size())
        else:
            self.image_label.setPixmap(scaled_pixmap)
            self.image_label.resize(scaled_pixmap.size())

    def _on_zoom_changed(self, value: int):
        """缩放改变"""
        self.current_scale = value / 100.0
        self.zoom_label.setText(f"{value}%")
        self._apply_transform()

    def _rotate(self, degrees: int):
        """旋转图片"""
        self.current_rotation = (self.current_rotation + degrees) % 360
        self._apply_transform()

    def _fit_to_window(self):
        """适应窗口大小"""
        if not hasattr(self, 'original_pixmap') or self.original_pixmap.isNull():
            return

        # 计算适应窗口的缩放比例
        view_size = self.scroll_area.viewport().size()
        pixmap_size = self.original_pixmap.size()

        scale_w = view_size.width() / pixmap_size.width()
        scale_h = view_size.height() / pixmap_size.height()
        scale = min(scale_w, scale_h) * 0.95

        self.current_scale = scale
        self.zoom_slider.setValue(int(scale * 100))

    def _reset_view(self):
        """重置视图"""
        self.current_scale = 1.0
        self.current_rotation = 0
        self.zoom_slider.setValue(100)
        self._apply_transform()

    def wheelEvent(self, event):
        """鼠标滚轮缩放"""
        if event.modifiers() & Qt.KeyboardModifier.ControlModifier:
            delta = event.angleDelta().y()
            if delta > 0:
                self.zoom_slider.setValue(self.zoom_slider.value() + 20)
            else:
                self.zoom_slider.setValue(self.zoom_slider.value() - 20)
            event.accept()
        else:
            super().wheelEvent(event)

    def closeEvent(self, event):
        """关闭事件"""
        self.closed.emit()
        super().closeEvent(event)