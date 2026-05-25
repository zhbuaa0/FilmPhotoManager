# -*- coding: utf-8 -*-
"""
胶卷列表组件
左侧导航栏显示所有胶卷，采用卡片式布局
"""

from PyQt6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QScrollArea,
                             QFrame, QLabel, QPushButton, QMenu, QMessageBox)
from PyQt6.QtCore import Qt, pyqtSignal, QSize
from PyQt6.QtGui import QPixmap, QPainter, QColor, QBrush

from ..database.db_manager import DBManager
from ..database.models import Roll
from ..core.roll_manager import RollManager
from ..core.photo_processor import PhotoProcessor


class RollCard(QFrame):
    """胶卷卡片组件"""

    clicked = pyqtSignal(int)  # 胶卷ID
    deleted = pyqtSignal(int)  # 删除胶卷ID
    edit_requested = pyqtSignal(int)  # 编辑胶卷ID

    def __init__(self, roll: Roll, parent=None):
        super().__init__(parent)
        self.roll = roll
        self.init_ui()

    def init_ui(self):
        """初始化UI"""
        self.setFrameStyle(QFrame.Shape.Box | QFrame.Shadow.Raised)
        self.setLineWidth(1)
        self.setFixedHeight(120)
        self.setMinimumWidth(280)
        self.setCursor(Qt.CursorShape.PointingHandCursor)

        # 根据是否为选中状态设置样式
        self._is_selected = False

        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 12, 12, 12)
        layout.setSpacing(8)

        # 顶部：封面图 + 信息
        top_layout = QHBoxLayout()
        top_layout.setSpacing(12)

        # 封面图
        self.cover_label = QLabel()
        self.cover_label.setFixedSize(80, 80)
        self.cover_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.cover_label.setStyleSheet("background-color: #f0f0f0; border: 1px solid #ddd;")
        self._load_cover()
        top_layout.addWidget(self.cover_label)

        # 信息区域
        info_layout = QVBoxLayout()
        info_layout.setSpacing(4)

        self.number_label = QLabel(self.roll.roll_number)
        self.number_label.setStyleSheet("font-weight: bold; font-size: 14px;")
        info_layout.addWidget(self.number_label)

        self.type_label = QLabel(self.roll.film_type or "未指定胶卷类型")
        self.type_label.setStyleSheet("color: #666; font-size: 12px;")
        info_layout.addWidget(self.type_label)

        self.date_label = QLabel(self.roll.shoot_date or "未指定拍摄日期")
        self.date_label.setStyleSheet("color: #999; font-size: 11px;")
        info_layout.addWidget(self.date_label)

        self.count_label = QLabel(f"{self.roll.photo_count} 张照片")
        self.count_label.setStyleSheet("color: #999; font-size: 11px;")
        info_layout.addWidget(self.count_label)

        info_layout.addStretch()
        top_layout.addLayout(info_layout)

        layout.addLayout(top_layout)

        # 底部按钮
        bottom_layout = QHBoxLayout()
        bottom_layout.addStretch()

        edit_btn = QPushButton("编辑")
        edit_btn.setFixedSize(60, 24)
        edit_btn.clicked.connect(lambda: self.edit_requested.emit(self.roll.id))
        bottom_layout.addWidget(edit_btn)

        delete_btn = QPushButton("删除")
        delete_btn.setFixedSize(60, 24)
        delete_btn.clicked.connect(lambda: self._confirm_delete())
        bottom_layout.addWidget(delete_btn)

        layout.addLayout(bottom_layout)

    def _load_cover(self):
        """加载封面图"""
        db = DBManager()
        photo_processor = PhotoProcessor()

        # 尝试获取封面
        if self.roll.cover_photo_id:
            photo = db.get_photo(self.roll.cover_photo_id)
            if photo and photo.thumbnail_path:
                pixmap = QPixmap(photo.thumbnail_path)
                if not pixmap.isNull():
                    self.cover_label.setPixmap(pixmap.scaled(
                        80, 80, Qt.AspectRatioMode.KeepAspectRatio,
                        Qt.TransformationMode.SmoothTransformation
                    ))
                    return

        # 尝试使用第一张照片
        photos = db.get_photos_by_roll(self.roll.id)
        if photos and photos[0].thumbnail_path:
            pixmap = QPixmap(photos[0].thumbnail_path)
            if not pixmap.isNull():
                self.cover_label.setPixmap(pixmap.scaled(
                    80, 80, Qt.AspectRatioMode.KeepAspectRatio,
                    Qt.TransformationMode.SmoothTransformation
                ))
                return

        # 无封面显示占位符
        self.cover_label.setText("无封面")

    def set_selected(self, selected: bool):
        """设置选中状态"""
        self._is_selected = selected
        if selected:
            self.setStyleSheet("""
                QFrame {
                    background-color: #e3f2fd;
                    border: 2px solid #1976d2;
                    border-radius: 8px;
                }
            """)
        else:
            self.setStyleSheet("""
                QFrame {
                    background-color: white;
                    border: 1px solid #ddd;
                    border-radius: 8px;
                }
                QFrame:hover {
                    background-color: #f5f5f5;
                }
            """)

    def mousePressEvent(self, event):
        """鼠标点击"""
        if event.button() == Qt.MouseButton.LeftButton:
            self.clicked.emit(self.roll.id)
        super().mousePressEvent(event)

    def _confirm_delete(self):
        """确认删除"""
        msg = QMessageBox()
        msg.setIcon(QMessageBox.Icon.Question)
        msg.setText(f"确定要删除胶卷 {self.roll.roll_number} 吗？")
        msg.setInformativeText("删除后可以通过备份恢复")
        msg.setStandardButtons(QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        msg.setDefaultButton(QMessageBox.StandardButton.No)

        if msg.exec() == QMessageBox.StandardButton.Yes:
            self.deleted.emit(self.roll.id)


class RollListWidget(QWidget):
    """胶卷列表组件"""

    roll_selected = pyqtSignal(int)  # 选中胶卷ID
    roll_deleted = pyqtSignal(int)  # 删除胶卷ID
    edit_roll_requested = pyqtSignal(int)  # 编辑胶卷请求

    def __init__(self, parent=None):
        super().__init__(parent)
        self.selected_roll_id = None
        self.init_ui()

    def init_ui(self):
        """初始化UI"""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(8, 8, 8, 8)
        layout.setSpacing(8)

        # 标题栏
        title_layout = QHBoxLayout()
        title = QLabel("胶卷列表")
        title.setStyleSheet("font-weight: bold; font-size: 14px;")
        title_layout.addWidget(title)
        title_layout.addStretch()
        layout.addLayout(title_layout)

        # 滚动区域
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)

        self.cards_container = QWidget()
        self.cards_layout = QVBoxLayout(self.cards_container)
        self.cards_layout.setContentsMargins(0, 0, 0, 0)
        self.cards_layout.setSpacing(8)
        self.cards_layout.addStretch()

        scroll.setWidget(self.cards_container)
        layout.addWidget(scroll)

    def load_rolls(self, rolls: list):
        """加载胶卷列表"""
        # 清除现有卡片
        while self.cards_layout.count() > 1:
            item = self.cards_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        # 添加新卡片
        for roll in rolls:
            card = RollCard(roll)
            card.clicked.connect(self._on_card_clicked)
            card.deleted.connect(self._on_card_deleted)
            card.edit_requested.connect(self._on_edit_requested)
            self.cards_layout.insertWidget(self.cards_layout.count() - 1, card)

    def _on_card_clicked(self, roll_id: int):
        """卡片点击"""
        self.selected_roll_id = roll_id
        self.roll_selected.emit(roll_id)

    def _on_card_deleted(self, roll_id: int):
        """卡片删除"""
        self.roll_deleted.emit(roll_id)

    def _on_edit_requested(self, roll_id: int):
        """编辑请求"""
        self.edit_roll_requested.emit(roll_id)

    def clear_selection(self):
        """清除选中状态"""
        self.selected_roll_id = None
        for i in range(self.cards_layout.count() - 1):
            widget = self.cards_layout.itemAt(i).widget()
            if widget:
                widget.set_selected(False)