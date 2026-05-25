# -*- coding: utf-8 -*-
"""
主窗口
采用经典三栏布局：左侧导航栏 + 中间内容区 + 右侧属性面板
"""

from PyQt6.QtWidgets import (QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
                             QSplitter, QMenuBar, QMenu, QToolBar, QStatusBar,
                             QLabel, QMessageBox, QDockWidget, QListWidget,
                             QListWidgetItem, QDialog, QLineEdit, QPushButton,
                             QColorDialog, QInputDialog, QFileDialog, QComboBox,
                             QDateEdit, QTextEdit, QGroupBox, QScrollArea,
                             QApplication)
from PyQt6.QtCore import Qt, QTimer, QDate
from PyQt6.QtGui import QAction, QKeySequence

from ..config import APP_NAME, APP_VERSION, DEFAULT_IMPORT_DIR
from ..database.db_manager import DBManager
from ..database.models import Roll, Photo, Tag
from ..core.roll_manager import RollManager
from ..core.tag_manager import TagManager
from ..core.photo_processor import PhotoProcessor
from .roll_list_widget import RollListWidget
from .photo_grid_widget import PhotoGridWidget
from .import_dialog import ImportDialog
from .photo_viewer import PhotoViewer


class RollEditDialog(QDialog):
    """胶卷编辑对话框"""

    def __init__(self, roll: Roll = None, parent=None):
        super().__init__(parent)
        self.roll = roll
        self.init_ui()

    def init_ui(self):
        """初始化UI"""
        self.setWindowTitle("编辑胶卷" if self.roll else "新建胶卷")
        self.setMinimumWidth(450)

        layout = QVBoxLayout(self)
        layout.setSpacing(12)

        # 胶卷编号
        roll_num_layout = QHBoxLayout()
        roll_num_layout.addWidget(QLabel("胶卷编号:"))
        self.roll_number_edit = QLineEdit()
        roll_num_layout.addWidget(self.roll_number_edit)
        layout.addLayout(roll_num_layout)

        # 胶卷类型
        film_type_layout = QHBoxLayout()
        film_type_layout.addWidget(QLabel("胶卷类型:"))
        self.film_type_combo = QComboBox()
        self.film_type_combo.setEditable(True)
        self.film_type_combo.addItems([
            "柯达金200 (Kodak Gold 200)",
            "柯达全能400 (Kodak Ultramax 400)",
            "富士C200 (Fujifilm C200)",
            "富士Superia 400",
            "富士Pro 400H",
            "伊尔福Delta 400",
            "伊尔福FP4 Plus 125",
            "伊尔福HP5 Plus 400",
            "其他"
        ])
        film_type_layout.addWidget(self.film_type_combo)
        layout.addLayout(film_type_layout)

        # 相机和镜头
        camera_layout = QHBoxLayout()
        camera_layout.addWidget(QLabel("相机:"))
        self.camera_edit = QLineEdit()
        camera_layout.addWidget(self.camera_edit)

        camera_layout.addWidget(QLabel("镜头:"))
        self.lens_edit = QLineEdit()
        camera_layout.addWidget(self.lens_edit)
        layout.addLayout(camera_layout)

        # 日期
        date_layout = QHBoxLayout()
        date_layout.addWidget(QLabel("拍摄日期:"))
        self.shoot_date_edit = QDateEdit()
        self.shoot_date_edit.setCalendarPopup(True)
        date_layout.addWidget(self.shoot_date_edit)

        date_layout.addWidget(QLabel("冲洗日期:"))
        self.develop_date_edit = QDateEdit()
        self.develop_date_edit.setCalendarPopup(True)
        date_layout.addWidget(self.develop_date_edit)
        layout.addLayout(date_layout)

        # 扫描日期和冲洗店
        lab_layout = QHBoxLayout()
        lab_layout.addWidget(QLabel("扫描日期:"))
        self.scan_date_edit = QDateEdit()
        self.scan_date_edit.setCalendarPopup(True)
        lab_layout.addWidget(self.scan_date_edit)

        lab_layout.addWidget(QLabel("冲洗店:"))
        self.lab_edit = QLineEdit()
        lab_layout.addWidget(self.lab_edit)
        layout.addLayout(lab_layout)

        # 备注
        layout.addWidget(QLabel("备注:"))
        self.notes_edit = QTextEdit()
        self.notes_edit.setMaximumHeight(80)
        layout.addWidget(self.notes_edit)

        # 按钮
        btn_layout = QHBoxLayout()
        btn_layout.addStretch()

        cancel_btn = QPushButton("取消")
        cancel_btn.clicked.connect(self.reject)
        btn_layout.addWidget(cancel_btn)

        save_btn = QPushButton("保存")
        save_btn.clicked.connect(self._on_save)
        btn_layout.addWidget(save_btn)

        layout.addLayout(btn_layout)

        # 如果是编辑模式，填充数据
        if self.roll:
            self._load_roll_data()

    def _load_roll_data(self):
        """加载胶卷数据"""
        self.roll_number_edit.setText(self.roll.roll_number)
        self.film_type_combo.setCurrentText(self.roll.film_type)
        self.camera_edit.setText(self.roll.camera or "")
        self.lens_edit.setText(self.roll.lens or "")
        self.lab_edit.setText(self.lab or "")

        if self.roll.shoot_date:
            self.shoot_date_edit.setDate(QDate.fromString(self.roll.shoot_date, "yyyy-MM-dd"))
        if self.roll.develop_date:
            self.develop_date_edit.setDate(QDate.fromString(self.roll.develop_date, "yyyy-MM-dd"))
        if self.roll.scan_date:
            self.scan_date_edit.setDate(QDate.fromString(self.roll.scan_date, "yyyy-MM-dd"))

        self.notes_edit.setPlainText(self.roll.notes or "")

    def _on_save(self):
        """保存"""
        if not self.roll_number_edit.text().strip():
            QMessageBox.warning(self, "错误", "胶卷编号不能为空！")
            return

        self.accept()

    def get_roll_data(self) -> dict:
        """获取胶卷数据"""
        return {
            'roll_number': self.roll_number_edit.text().strip(),
            'film_type': self.film_type_combo.currentText(),
            'camera': self.camera_edit.text().strip() or None,
            'lens': self.lens_edit.text().strip() or None,
            'shoot_date': self.shoot_date_edit.date().toString("yyyy-MM-dd"),
            'develop_date': self.develop_date_edit.date().toString("yyyy-MM-dd"),
            'scan_date': self.scan_date_edit.date().toString("yyyy-MM-dd"),
            'lab': self.lab_edit.text().strip() or None,
            'notes': self.notes_edit.toPlainText().strip() or None,
        }


class TagManagerDialog(QDialog):
    """标签管理对话框"""

    def __init__(self, tag_manager: TagManager, parent=None):
        super().__init__(parent)
        self.tag_manager = tag_manager
        self.init_ui()
        self.load_tags()

    def init_ui(self):
        """初始化UI"""
        self.setWindowTitle("标签管理")
        self.setMinimumWidth(400)
        self.setMinimumHeight(300)

        layout = QVBoxLayout(self)

        # 标签列表
        self.tag_list = QListWidget()
        layout.addWidget(self.tag_list)

        # 添加/编辑标签
        btn_layout = QHBoxLayout()

        self.new_tag_edit = QLineEdit()
        self.new_tag_edit.setPlaceholderText("新标签名称...")
        btn_layout.addWidget(self.new_tag_edit)

        add_btn = QPushButton("添加")
        add_btn.clicked.connect(self._add_tag)
        btn_layout.addWidget(add_btn)

        layout.addLayout(btn_layout)

        # 标签列表操作
        list_btn_layout = QHBoxLayout()

        edit_btn = QPushButton("编辑")
        edit_btn.clicked.connect(self._edit_tag)
        list_btn_layout.addWidget(edit_btn)

        delete_btn = QPushButton("删除")
        delete_btn.clicked.connect(self._delete_tag)
        list_btn_layout.addWidget(delete_btn)

        list_btn_layout.addStretch()

        close_btn = QPushButton("关闭")
        close_btn.clicked.connect(self.close)
        list_btn_layout.addWidget(close_btn)

        layout.addLayout(list_btn_layout)

    def load_tags(self):
        """加载标签列表"""
        self.tag_list.clear()
        tags = self.tag_manager.get_all_tags()
        for tag in tags:
            item = QListWidgetItem(tag.name)
            item.setData(Qt.ItemDataRole.UserRole, tag)
            self.tag_list.addItem(item)

    def _add_tag(self):
        """添加标签"""
        name = self.new_tag_edit.text().strip()
        if not name:
            return

        tag = self.tag_manager.create_tag(name)
        if tag:
            self.load_tags()
            self.new_tag_edit.clear()
        else:
            QMessageBox.warning(self, "错误", "标签名称已存在！")

    def _edit_tag(self):
        """编辑标签"""
        item = self.tag_list.currentItem()
        if not item:
            return

        tag = item.data(Qt.ItemDataRole.UserRole)
        if not tag:
            return

        new_name, ok = QInputDialog.getText(self, "编辑标签", "标签名称:", QLineEdit.EchoMode.Normal, tag.name)
        if ok and new_name.strip():
            tag.name = new_name.strip()
            self.tag_manager.update_tag(tag)
            self.load_tags()

    def _delete_tag(self):
        """删除标签"""
        item = self.tag_list.currentItem()
        if not item:
            return

        tag = item.data(Qt.ItemDataRole.UserRole)
        if not tag:
            return

        reply = QMessageBox.question(self, "确认", f"确定要删除标签 '{tag.name}' 吗？")
        if reply == QMessageBox.StandardButton.Yes:
            self.tag_manager.delete_tag(tag.id)
            self.load_tags()


class MainWindow(QMainWindow):
    """主窗口"""

    def __init__(self):
        super().__init__()
        self.db = DBManager()
        self.roll_manager = RollManager()
        self.tag_manager = TagManager()
        self.photo_processor = PhotoProcessor()

        self.current_roll = None
        self.current_photo = None
        self.current_viewer = None

        self.init_ui()
        self._update_statistics()

        # 延迟加载数据
        QTimer.singleShot(100, self._load_initial_data)

    def init_ui(self):
        """初始化UI"""
        self.setWindowTitle(f"{APP_NAME} v{APP_VERSION}")
        self.setMinimumSize(1200, 800)

        # 创建菜单栏
        self._create_menu_bar()

        # 创建工具栏
        self._create_tool_bar()

        # 创建主界面
        self._create_main_ui()

        # 创建状态栏
        self._create_status_bar()

        # 创建右侧属性面板
        self._create_property_panel()

    def _create_menu_bar(self):
        """创建菜单栏"""
        menubar = self.menuBar()

        # 文件菜单
        file_menu = menubar.addMenu("文件")

        import_action = QAction("导入胶卷...", self)
        import_action.setShortcut(QKeySequence.StandardKey.Open)
        import_action.triggered.connect(self._on_import)
        file_menu.addAction(import_action)

        file_menu.addSeparator()

        export_action = QAction("导出当前胶卷...", self)
        export_action.triggered.connect(self._on_export_roll)
        file_menu.addAction(export_action)

        file_menu.addSeparator()

        backup_action = QAction("备份数据...", self)
        backup_action.triggered.connect(self._on_backup)
        file_menu.addAction(backup_action)

        restore_action = QAction("恢复数据...", self)
        restore_action.triggered.connect(self._on_restore)
        file_menu.addAction(restore_action)

        file_menu.addSeparator()

        exit_action = QAction("退出", self)
        exit_action.setShortcut(QKeySequence.StandardKey.Quit)
        exit_action.triggered.connect(self.close)
        file_menu.addAction(exit_action)

        # 编辑菜单
        edit_menu = menubar.addMenu("编辑")

        edit_roll_action = QAction("编辑胶卷信息", self)
        edit_roll_action.triggered.connect(self._on_edit_current_roll)
        edit_menu.addAction(edit_roll_action)

        manage_tags_action = QAction("管理标签...", self)
        manage_tags_action.triggered.connect(self._on_manage_tags)
        edit_menu.addAction(manage_tags_action)

        # 视图菜单
        view_menu = menubar.addMenu("视图")

        refresh_action = QAction("刷新", self)
        refresh_action.setShortcut(QKeySequence.StandardKey.Refresh)
        refresh_action.triggered.connect(self._refresh)
        view_menu.addAction(refresh_action)

        # 帮助菜单
        help_menu = menubar.addMenu("帮助")

        about_action = QAction("关于...", self)
        about_action.triggered.connect(self._on_about)
        help_menu.addAction(about_action)

    def _create_tool_bar(self):
        """创建工具栏"""
        toolbar = QToolBar()
        toolbar.setMovable(False)
        self.addToolBar(toolbar)

        # 导入按钮
        import_btn = QPushButton("导入胶卷")
        import_btn.clicked.connect(self._on_import)
        toolbar.addWidget(import_btn)

        toolbar.addSeparator()

        # 搜索框
        toolbar.addWidget(QLabel("搜索:"))
        self.search_edit = QLineEdit()
        self.search_edit.setPlaceholderText("搜索胶卷...")
        self.search_edit.setFixedWidth(200)
        self.search_edit.returnPressed.connect(self._on_search)
        toolbar.addWidget(self.search_edit)

        search_btn = QPushButton("搜索")
        search_btn.clicked.connect(self._on_search)
        toolbar.addWidget(search_btn)

    def _create_main_ui(self):
        """创建主界面"""
        central_widget = QWidget()
        self.setCentralWidget(central_widget)

        # 使用分割器创建三栏布局
        main_layout = QHBoxLayout(central_widget)
        main_layout.setContentsMargins(4, 4, 4, 4)
        main_layout.setSpacing(4)

        splitter = QSplitter(Qt.Orientation.Horizontal)

        # 左侧胶卷列表
        self.roll_list_widget = RollListWidget()
        self.roll_list_widget.roll_selected.connect(self._on_roll_selected)
        self.roll_list_widget.roll_deleted.connect(self._on_roll_deleted)
        self.roll_list_widget.edit_roll_requested.connect(self._on_edit_roll)
        splitter.addWidget(self.roll_list_widget)

        # 中间照片网格
        self.photo_grid_widget = PhotoGridWidget()
        self.photo_grid_widget.photo_selected.connect(self._on_photo_selected)
        self.photo_grid_widget.photo_opened.connect(self._on_photo_double_clicked)
        self.photo_grid_widget.photos_changed.connect(self._on_photos_changed)
        splitter.addWidget(self.photo_grid_widget)

        splitter.setStretchFactor(0, 1)
        splitter.setStretchFactor(1, 3)

        main_layout.addWidget(splitter)

    def _create_status_bar(self):
        """创建状态栏"""
        self.status_bar = QStatusBar()
        self.setStatusBar(self.status_bar)

        self.stats_label = QLabel("就绪")
        self.status_bar.addWidget(self.stats_label, 1)

    def _create_property_panel(self):
        """创建右侧属性面板"""
        self.property_dock = QDockWidget("属性", self)
        self.property_dock.setAllowedAreas(Qt.DockWidgetArea.RightDockWidgetArea)
        self.property_dock.setMinimumWidth(250)

        self.property_widget = QWidget()
        property_layout = QVBoxLayout(self.property_widget)

        # 照片属性区域
        self.photo_property_area = QScrollArea()
        self.photo_property_area.setWidgetResizable(True)
        self.photo_property_widget = QWidget()
        self.photo_property_layout = QVBoxLayout(self.photo_property_widget)

        # 照片信息
        self.photo_info_group = QGroupBox("照片信息")
        photo_info_layout = QVBoxLayout()

        self.photo_title_edit = QLineEdit()
        self.photo_title_edit.setPlaceholderText("标题")
        self.photo_title_edit.textChanged.connect(self._on_photo_property_changed)
        photo_info_layout.addWidget(self.photo_title_edit)

        self.photo_desc_edit = QTextEdit()
        self.photo_desc_edit.setPlaceholderText("描述...")
        self.photo_desc_edit.setMaximumHeight(80)
        self.photo_desc_edit.textChanged.connect(self._on_photo_property_changed)
        photo_info_layout.addWidget(self.photo_desc_edit)

        # 评分
        rating_layout = QHBoxLayout()
        rating_layout.addWidget(QLabel("评分:"))
        self.rating_combo = QComboBox()
        self.rating_combo.addItems(["0星", "1星", "2星", "3星", "4星", "5星"])
        self.rating_combo.currentIndexChanged.connect(self._on_photo_property_changed)
        rating_layout.addWidget(self.rating_combo)
        rating_layout.addStretch()
        photo_info_layout.addLayout(rating_layout)

        # 收藏
        self.favorite_check = QPushButton("♥ 收藏")
        self.favorite_check.setCheckable(True)
        self.favorite_check.clicked.connect(self._on_photo_property_changed)
        photo_info_layout.addWidget(self.favorite_check)

        # 帧号
        self.frame_label = QLabel("帧号: -")
        photo_info_layout.addWidget(self.frame_label)

        # 文件信息
        self.file_label = QLabel("文件: -")
        self.file_label.setWordWrap(True)
        photo_info_layout.addWidget(self.file_label)

        self.photo_info_group.setLayout(photo_info_layout)
        self.photo_property_layout.addWidget(self.photo_info_group)

        # 标签
        self.tags_group = QGroupBox("标签")
        tags_layout = QVBoxLayout()

        self.tags_label = QLabel("无标签")
        tags_layout.addWidget(self.tags_label)

        add_tag_btn = QPushButton("添加标签")
        add_tag_btn.clicked.connect(self._on_add_tag_to_photo)
        tags_layout.addWidget(add_tag_btn)

        self.tags_group.setLayout(tags_layout)
        self.photo_property_layout.addWidget(self.tags_group)

        # EXIF信息
        self.exif_group = QGroupBox("EXIF信息")
        exif_layout = QVBoxLayout()

        self.exif_label = QLabel("无EXIF信息")
        self.exif_label.setWordWrap(True)
        exif_layout.addWidget(self.exif_label)

        self.exif_group.setLayout(exif_layout)
        self.photo_property_layout.addWidget(self.exif_group)

        self.photo_property_layout.addStretch()

        self.photo_property_area.setWidget(self.photo_property_widget)
        property_layout.addWidget(self.photo_property_area)

        self.property_dock.setWidget(self.property_dock)
        self.addDockWidget(Qt.DockWidgetArea.RightDockWidgetArea, self.property_dock)
        self.property_dock.hide()

    def _load_initial_data(self):
        """加载初始数据"""
        rolls = self.roll_manager.get_all_rolls()
        self.roll_list_widget.load_rolls(rolls)
        self._update_statistics()

    def _update_statistics(self):
        """更新统计信息"""
        stats = self.db.get_statistics()
        self.stats_label.setText(
            f"总胶卷数: {stats['total_rolls']} | "
            f"总照片数: {stats['total_photos']} | "
            f"收藏照片: {stats['favorite_photos']}"
        )

    # ==================== 事件处理 ====================

    def _on_roll_selected(self, roll_id: int):
        """胶卷选中"""
        self.current_roll = self.roll_manager.get_roll(roll_id)
        self.current_photo = None

        if self.current_roll:
            self.photo_grid_widget.load_photos(roll_id)
            self.status_bar.showMessage(f"已选择胶卷: {self.current_roll.roll_number}")

    def _on_roll_deleted(self, roll_id: int):
        """胶卷删除"""
        reply = QMessageBox.question(self, "确认删除", "确定要删除这个胶卷吗？",
                                    QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        if reply == QMessageBox.StandardButton.Yes:
            if self.roll_manager.delete_roll(roll_id, delete_files=False):
                self.current_roll = None
                self.photo_grid_widget.clear()
                self._load_initial_data()
                self.property_dock.hide()
                QMessageBox.information(self, "完成", "胶卷已删除")

    def _on_edit_roll(self, roll_id: int):
        """编辑胶卷"""
        roll = self.roll_manager.get_roll(roll_id)
        if roll:
            self._on_edit_roll_with_roll(roll)

    def _on_edit_roll_with_roll(self, roll: Roll):
        """编辑胶卷（使用提供的roll对象）"""
        dialog = RollEditDialog(roll, self)
        if dialog.exec() == QDialog.DialogCode.Accepted:
            roll_data = dialog.get_roll_data()
            roll.roll_number = roll_data['roll_number']
            roll.film_type = roll_data['film_type']
            roll.camera = roll_data['camera']
            roll.lens = roll_data['lens']
            roll.shoot_date = roll_data['shoot_date']
            roll.develop_date = roll_data['develop_date']
            roll.scan_date = roll_data['scan_date']
            roll.lab = roll_data['lab']
            roll.notes = roll_data['notes']

            if self.roll_manager.update_roll(roll):
                self._load_initial_data()
                if self.current_roll and self.current_roll.id == roll.id:
                    self.current_roll = roll

    def _on_edit_current_roll(self):
        """编辑当前胶卷"""
        if self.current_roll:
            self._on_edit_roll_with_roll(self.current_roll)

    def _on_photo_selected(self, photo_id: int):
        """照片选中"""
        self.current_photo = self.db.get_photo(photo_id)
        self._update_property_panel()

    def _on_photo_double_clicked(self, photo_id: int):
        """照片双击打开"""
        photo = self.db.get_photo(photo_id)
        if photo:
            viewer = PhotoViewer(photo, self)
            viewer.show()

    def _on_photo_property_changed(self):
        """照片属性改变"""
        if not self.current_photo:
            return

        self.current_photo.title = self.photo_title_edit.text()
        self.current_photo.description = self.photo_desc_edit.toPlainText()
        self.current_photo.rating = self.rating_combo.currentIndex()
        self.current_photo.is_favorite = self.favorite_check.isChecked()

        self.db.update_photo(self.current_photo)
        self.photo_grid_widget.load_photos(self.current_roll.id)

    def _update_property_panel(self):
        """更新属性面板"""
        if not self.current_photo:
            self.property_dock.hide()
            return

        self.property_dock.show()

        self.photo_title_edit.setText(self.current_photo.title or "")
        self.photo_desc_edit.setPlainText(self.current_photo.description or "")
        self.rating_combo.setCurrentIndex(self.current_photo.rating)
        self.favorite_check.setChecked(self.current_photo.is_favorite)

        self.frame_label.setText(f"帧号: {self.current_photo.frame_number or '?'}")
        self.file_label.setText(f"文件: {self.current_photo.file_name}")

        # 更新标签
        tags = self.tag_manager.get_photo_tags(self.current_photo.id)
        if tags:
            self.tags_label.setText(", ".join([t.name for t in tags]))
        else:
            self.tags_label.setText("无标签")

        # 更新EXIF
        exif_display = PhotoProcessor.get_display_exif(self.current_photo.exif_data)
        if exif_display:
            exif_text = "\n".join([f"{k}: {v}" for k, v in exif_display.items()])
            self.exif_label.setText(exif_text)
        else:
            self.exif_label.setText("无EXIF信息")

    def _on_add_tag_to_photo(self):
        """给照片添加标签"""
        if not self.current_photo:
            return

        tags = self.tag_manager.get_all_tags()
        if not tags:
            QMessageBox.information(self, "提示", "暂无标签，请先创建标签！")
            return

        tag_names = [t.name for t in tags]
        selected, ok = QInputDialog.getItem(self, "添加标签", "选择标签:", tag_names, editable=False)
        if ok and selected:
            tag = next((t for t in tags if t.name == selected), None)
            if tag:
                self.tag_manager.add_tag_to_photo(self.current_photo.id, tag.id)
                self._update_property_panel()

    def _on_photos_changed(self):
        """照片列表变化"""
        if self.current_roll:
            self._load_initial_data()

    def _on_import(self):
        """导入胶卷"""
        dialog = ImportDialog(DEFAULT_IMPORT_DIR, self)
        dialog.import_finished.connect(self._on_import_finished)
        dialog.exec()

    def _on_import_finished(self, rolls: list):
        """导入完成"""
        self._load_initial_data()
        if rolls:
            # 自动选中新导入的第一卷
            self._on_roll_selected(rolls[0].id)

    def _on_export_roll(self):
        """导出胶卷"""
        if not self.current_roll:
            QMessageBox.information(self, "提示", "请先选择一个胶卷！")
            return

        file_path, _ = QFileDialog.getSaveFileName(
            self, "导出胶卷",
            f"{self.current_roll.roll_number}.zip",
            "ZIP压缩包 (*.zip)"
        )

        if file_path:
            if self.roll_manager.export_roll_to_zip(self.current_roll.id, file_path):
                QMessageBox.information(self, "完成", f"胶卷已导出到:\n{file_path}")
            else:
                QMessageBox.warning(self, "错误", "导出失败！")

    def _on_backup(self):
        """备份数据"""
        file_path, _ = QFileDialog.getSaveFileName(
            self, "备份数据",
            f"film_backup_{QDate.currentDate().toString('yyyyMMdd')}.zip",
            "ZIP压缩包 (*.zip)"
        )

        if file_path:
            import zipfile
            from ..config import DATA_DIR, THUMBNAILS_DIR

            try:
                with zipfile.ZipFile(file_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                    # 备份数据库
                    from ..config import DB_PATH
                    if __import__('os').path.exists(DB_PATH):
                        zipf.write(DB_PATH, "film_manager.db")

                    # 备份缩略图
                    if THUMBNAILS_DIR.exists():
                        for thumb in THUMBNAILS_DIR.rglob("*"):
                            if thumb.is_file():
                                arcname = f"thumbnails/{thumb.name}"
                                zipf.write(thumb, arcname)

                QMessageBox.information(self, "完成", f"数据已备份到:\n{file_path}")
            except Exception as e:
                QMessageBox.warning(self, "错误", f"备份失败:\n{e}")

    def _on_restore(self):
        """恢复数据"""
        reply = QMessageBox.question(self, "确认", "恢复数据将覆盖当前数据，确定继续？")
        if reply != QMessageBox.StandardButton.Yes:
            return

        file_path, _ = QFileDialog.getOpenFileName(
            self, "选择备份文件",
            "",
            "ZIP压缩包 (*.zip)"
        )

        if file_path:
            import zipfile
            from ..config import DATA_DIR

            try:
                with zipfile.ZipFile(file_path, 'r') as zipf:
                    zipf.extractall(DATA_DIR)

                QMessageBox.information(self, "完成", "数据已恢复！请重启程序。")
                self._load_initial_data()
            except Exception as e:
                QMessageBox.warning(self, "错误", f"恢复失败:\n{e}")

    def _on_manage_tags(self):
        """管理标签"""
        dialog = TagManagerDialog(self.tag_manager, self)
        dialog.exec()

    def _on_about(self):
        """关于"""
        QMessageBox.about(self, "关于",
                        f"<h3>{APP_NAME}</h3>"
                        f"<p>版本: {APP_VERSION}</p>"
                        f"<p>专为胶片摄影师设计的个人胶片照片管理软件</p>")

    def _on_search(self):
        """搜索"""
        keyword = self.search_edit.text().strip()
        if keyword:
            rolls = self.roll_manager.search_rolls(keyword)
            self.roll_list_widget.load_rolls(rolls)
        else:
            self._load_initial_data()

    def _refresh(self):
        """刷新"""
        self._load_initial_data()
        if self.current_roll:
            self.photo_grid_widget.load_photos(self.current_roll.id)

    def dragEnterEvent(self, event):
        """拖拽进入"""
        if event.mimeData().hasUrls():
            event.acceptProposedAction()

    def dropEvent(self, event):
        """拖拽放下"""
        urls = event.mimeData().urls()
        if urls:
            path = urls[0].toLocalFile()
            if path:
                dialog = ImportDialog(path, self)
                dialog.import_finished.connect(self._on_import_finished)
                dialog.exec()