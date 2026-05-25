# -*- coding: utf-8 -*-
"""
照片网格视图组件
显示胶卷中的所有照片网格
"""

from PyQt6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QScrollArea,
                             QLabel, QMenu, QMessageBox, QSlider, QDialog)
from PyQt6.QtCore import Qt, pyqtSignal, QSize
from PyQt6.QtGui import QPixmap, QAction

from ..database.db_manager import DBManager
from ..database.models import Photo
from ..core.tag_manager import TagManager
from .photo_viewer import PhotoViewer


class PhotoThumbnail(QWidget):
    """照片缩略图组件"""

    clicked = pyqtSignal(int)  # 照片ID
    double_clicked = pyqtSignal(int)  # 照片ID
    right_clicked = pyqtSignal(int, object)  # 照片ID, 全局位置

    def __init__(self, photo: Photo, parent=None):
        super().__init__(parent)
        self.photo = photo
        self.is_selected = False
        self.init_ui()

    def init_ui(self):
        """初始化UI"""
        self.setFixedSize(150, 180)
        self.setCursor(Qt.CursorShape.PointingHandCursor)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(4, 4, 4, 4)
        layout.setSpacing(4)

        # 缩略图
        self.image_label = QLabel()
        self.image_label.setFixedSize(142, 142)
        self.image_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.image_label.setStyleSheet("background-color: #f0f0f0; border: 1px solid #ddd;")
        self._load_image()
        layout.addWidget(self.image_label)

        # 帧号和评分
        info_layout = QHBoxLayout()
        info_layout.setSpacing(4)

        self.frame_label = QLabel(f"#{self.photo.frame_number or '?'}")
        self.frame_label.setStyleSheet("color: #666; font-size: 11px;")
        info_layout.addWidget(self.frame_label)

        info_layout.addStretch()

        # 评分星星
        if self.photo.rating > 0:
            stars = "★" * self.photo.rating
            self.rating_label = QLabel(stars)
            self.rating_label.setStyleSheet("color: #ffa500; font-size: 10px;")
            info_layout.addWidget(self.rating_label)

        # 收藏标记
        if self.photo.is_favorite:
            self.fav_label = QLabel("♥")
            self.fav_label.setStyleSheet("color: #e91e63; font-size: 12px;")
            info_layout.addWidget(self.fav_label)

        layout.addLayout(info_layout)

    def _load_image(self):
        """加载缩略图"""
        thumbnail_path = self.photo.thumbnail_path
        if thumbnail_path:
            pixmap = QPixmap(thumbnail_path)
            if not pixmap.isNull():
                self.image_label.setPixmap(pixmap.scaled(
                    142, 142, Qt.AspectRatioMode.KeepAspectRatio,
                    Qt.TransformationMode.SmoothTransformation
                ))
                return

        # 显示文件名占位
        self.image_label.setText(self.photo.file_name[:15] + "..." if len(self.photo.file_name) > 15 else self.photo.file_name)
        self.image_label.setStyleSheet("background-color: #e0e0e0; border: 1px solid #bbb; color: #666; font-size: 10px;")

    def set_selected(self, selected: bool):
        """设置选中状态"""
        self.is_selected = selected
        if selected:
            self.setStyleSheet("""
                QWidget {
                    background-color: #e3f2fd;
                    border: 2px solid #1976d2;
                    border-radius: 4px;
                }
            """)
        else:
            self.setStyleSheet("""
                QWidget {
                    background-color: white;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                }
            """)

    def mousePressEvent(self, event):
        """鼠标事件"""
        if event.button() == Qt.MouseButton.LeftButton:
            self.clicked.emit(self.photo.id)
        elif event.button() == Qt.MouseButton.RightButton:
            self.right_clicked.emit(self.photo.id, event.globalPosition())
        super().mousePressEvent(event)

    def mouseDoubleClickEvent(self, event):
        """双击事件"""
        if event.button() == Qt.MouseButton.LeftButton:
            self.double_clicked.emit(self.photo.id)
        super().mouseDoubleClickEvent(event)


class PhotoGridWidget(QWidget):
    """照片网格组件"""

    photo_selected = pyqtSignal(int)  # 选中照片ID
    photo_opened = pyqtSignal(int)  # 双击打开照片
    photos_changed = pyqtSignal()  # 照片列表变化

    def __init__(self, parent=None):
        super().__init__(parent)
        self.roll_id = None
        self.photos = []
        self.selected_photo_ids = set()
        self.init_ui()

    def init_ui(self):
        """初始化UI"""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(8, 8, 8, 8)
        layout.setSpacing(8)

        # 工具栏
        toolbar_layout = QHBoxLayout()

        self.count_label = QLabel("共 0 张照片")
        self.count_label.setStyleSheet("color: #666; font-size: 12px;")
        toolbar_layout.addWidget(self.count_label)

        toolbar_layout.addStretch()

        # 网格大小调整
        toolbar_layout.addWidget(QLabel("网格大小:"))
        self.grid_slider = QSlider(Qt.Orientation.Horizontal)
        self.grid_slider.setMinimum(3)
        self.grid_slider.setMaximum(10)
        self.grid_slider.setValue(6)
        self.grid_slider.setFixedWidth(150)
        self.grid_slider.valueChanged.connect(self._on_grid_size_changed)
        toolbar_layout.addWidget(self.grid_slider)

        layout.addLayout(toolbar_layout)

        # 照片网格滚动区域
        self.scroll_area = QScrollArea()
        self.scroll_area.setWidgetResizable(True)
        self.scroll_area.setAlignment(Qt.AlignmentFlag.AlignTop)

        self.grid_container = QWidget()
        self.grid_layout = QVBoxLayout(self.grid_container)
        self.grid_layout.setContentsMargins(0, 0, 0, 0)
        self.grid_layout.setSpacing(8)

        self.scroll_area.setWidget(self.grid_container)
        layout.addWidget(self.scroll_area)

        # 空状态提示
        self.empty_label = QLabel("请选择左侧胶卷查看照片")
        self.empty_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.empty_label.setStyleSheet("color: #999; font-size: 14px; padding: 50px;")
        layout.addWidget(self.empty_label)
        self.empty_label.hide()

    def load_photos(self, roll_id: int):
        """加载照片"""
        self.roll_id = roll_id
        db = DBManager()
        self.photos = db.get_photos_by_roll(roll_id)
        self.selected_photo_ids.clear()

        self._update_display()

    def _update_display(self):
        """更新显示"""
        # 清除现有缩略图
        while self.grid_layout.count():
            item = self.grid_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        if not self.photos:
            self.empty_label.show()
            self.count_label.setText("共 0 张照片")
            self.scroll_area.hide()
            return

        self.empty_label.hide()
        self.scroll_area.show()

        # 网格列数
        columns = self.grid_slider.value()

        # 按行添加缩略图
        row = []
        for i, photo in enumerate(self.photos):
            thumbnail = PhotoThumbnail(photo)
            thumbnail.clicked.connect(self._on_thumbnail_clicked)
            thumbnail.double_clicked.connect(self._on_thumbnail_double_clicked)
            thumbnail.right_clicked.connect(self._on_thumbnail_right_clicked)

            if photo.id in self.selected_photo_ids:
                thumbnail.set_selected(True)

            row.append(thumbnail)

            if len(row) == columns:
                # 添加整行
                row_layout = QHBoxLayout()
                row_layout.setSpacing(8)
                for th in row:
                    row_layout.addWidget(th)
                row_layout.addStretch()
                self.grid_layout.addLayout(row_layout)
                row = []

        # 添加剩余行
        if row:
            row_layout = QHBoxLayout()
            row_layout.setSpacing(8)
            for th in row:
                row_layout.addWidget(th)
            row_layout.addStretch()
            self.grid_layout.addLayout(row_layout)

        self.grid_layout.addStretch()
        self.count_label.setText(f"共 {len(self.photos)} 张照片")

    def _on_thumbnail_clicked(self, photo_id: int):
        """缩略图点击"""
        self.photo_selected.emit(photo_id)

    def _on_thumbnail_double_clicked(self, photo_id: int):
        """缩略图双击"""
        self.photo_opened.emit(photo_id)

    def _on_thumbnail_right_clicked(self, photo_id: int, pos):
        """缩略图右键"""
        self._show_context_menu(photo_id, pos)

    def _show_context_menu(self, photo_id: int, pos):
        """显示右键菜单"""
        photo = next((p for p in self.photos if p.id == photo_id), None)
        if not photo:
            return

        menu = QMenu()

        open_action = menu.addAction("打开原始文件")
        copy_path_action = menu.addAction("复制文件路径")
        menu.addSeparator()

        # 评分子菜单
        rating_menu = QMenu("评分")
        for i in range(6):
            rating_menu.addAction(f"{'★' * i} ({i}星)")
        menu.addMenu(rating_menu)

        menu.addSeparator()

        if photo.is_favorite:
            unfav_action = menu.addAction("取消收藏")
        else:
            fav_action = menu.addAction("添加收藏")

        delete_action = menu.addAction("删除")

        action = menu.exec(pos)

        if action == open_action:
            self._open_original_file(photo)
        elif action == copy_path_action:
            from PyQt6.QtWidgets import QApplication
            clipboard = QApplication.clipboard()
            clipboard.setText(photo.file_path)
        elif action == delete_action:
            self._confirm_delete_photo(photo)

    def _open_original_file(self, photo: Photo):
        """打开原始文件"""
        import subprocess
        import sys

        try:
            if sys.platform == 'darwin':
                subprocess.run(['open', photo.file_path])
            elif sys.platform == 'win32':
                subprocess.run(['start', '', photo.file_path], shell=True)
            else:
                subprocess.run(['xdg-open', photo.file_path])
        except Exception as e:
            QMessageBox.warning(self, "错误", f"无法打开文件: {e}")

    def _confirm_delete_photo(self, photo: Photo):
        """确认删除照片"""
        msg = QMessageBox()
        msg.setIcon(QMessageBox.Icon.Question)
        msg.setText(f"确定要删除照片 {photo.file_name} 吗？")
        msg.setStandardButtons(QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        msg.setDefaultButton(QMessageBox.StandardButton.No)

        if msg.exec() == QMessageBox.StandardButton.Yes:
            db = DBManager()
            db.delete_photo(photo.id, delete_file=True)
            self.photos_changed.emit()
            self.load_photos(self.roll_id)

    def _on_grid_size_changed(self, value: int):
        """网格大小改变"""
        self._update_display()

    def clear(self):
        """清空显示"""
        self.roll_id = None
        self.photos = []
        self.selected_photo_ids.clear()

        while self.grid_layout.count():
            item = self.grid_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        self.empty_label.show()
        self.scroll_area.hide()
        self.count_label.setText("共 0 张照片")