# -*- coding: utf-8 -*-
"""
导入胶卷对话框
支持拖拽导入和手动选择
"""

from PyQt6.QtWidgets import (QDialog, QVBoxLayout, QHBoxLayout, QLabel,
                             QPushButton, QLineEdit, QTextEdit, QComboBox,
                             QDateEdit, QGroupBox, QProgressBar, QCheckBox,
                             QFileDialog, QMessageBox, QWidget)
from PyQt6.QtCore import Qt, QThread, pyqtSignal, QTimer, QDate
from PyQt6.QtGui import QDragEnterEvent, QDropEvent

from ..database.models import Roll
from ..core.roll_manager import RollManager


class ImportThread(QThread):
    """导入线程"""
    progress = pyqtSignal(int, int, str)  # 当前, 总数, 状态
    finished = pyqtSignal(list)  # 导入的胶卷列表
    error = pyqtSignal(str)  # 错误信息
    cancelled = pyqtSignal()

    def __init__(self, roll_manager: RollManager, directory: str, roll_data: dict):
        super().__init__()
        self.roll_manager = roll_manager
        self.directory = directory
        self.roll_data = roll_data
        self._cancelled = False

    def run(self):
        try:
            rolls = self.roll_manager.import_photos_from_directory(
                self.directory,
                self.roll_data,
                progress_callback=lambda curr, total, status: self.progress.emit(curr, total, status),
                cancel_event=lambda: self._cancelled
            )

            if self._cancelled:
                self.cancelled.emit()
            else:
                self.finished.emit(rolls)

        except Exception as e:
            self.error.emit(str(e))

    def cancel(self):
        self._cancelled = True


class ImportDialog(QDialog):
    """导入胶卷对话框"""

    import_finished = pyqtSignal(list)  # 导入完成的胶卷列表

    def __init__(self, default_directory: str = "", parent=None):
        super().__init__(parent)
        self.default_directory = default_directory
        self.import_thread = None
        self.roll_manager = RollManager()
        self.init_ui()

    def init_ui(self):
        """初始化UI"""
        self.setWindowTitle("导入胶卷")
        self.setMinimumWidth(600)
        self.setMinimumHeight(500)

        layout = QVBoxLayout(self)
        layout.setSpacing(16)

        # 拖拽区域
        self.drop_area = QLabel("将照片文件夹拖拽到此处\n或点击选择文件夹")
        self.drop_area.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.drop_area.setStyleSheet("""
            QLabel {
                border: 2px dashed #aaa;
                border-radius: 8px;
                padding: 40px;
                background-color: #fafafa;
                color: #666;
                font-size: 14px;
            }
            QLabel:hover {
                border-color: #1976d2;
                background-color: #e3f2fd;
            }
        """)
        self.drop_area.setAcceptDrops(True)
        self.drop_area.mousePressEvent = lambda e: self._select_directory()
        layout.addWidget(self.drop_area)

        # 目录路径显示
        self.path_layout = QHBoxLayout()
        self.path_label = QLabel("未选择目录")
        self.path_label.setStyleSheet("color: #666;")
        self.path_layout.addWidget(self.path_label)
        self.path_layout.addStretch()

        select_btn = QPushButton("选择...")
        select_btn.clicked.connect(self._select_directory)
        self.path_layout.addWidget(select_btn)
        layout.addLayout(self.path_layout)

        # 胶卷信息
        info_group = QGroupBox("胶卷信息")
        info_layout = QVBoxLayout()

        # 胶卷编号
        roll_num_layout = QHBoxLayout()
        roll_num_layout.addWidget(QLabel("胶卷编号:"))
        self.roll_number_edit = QLineEdit()
        self.roll_number_edit.setPlaceholderText("自动生成（如 20260525-01）")
        roll_num_layout.addWidget(self.roll_number_edit)
        info_layout.addLayout(roll_num_layout)

        # 胶卷类型
        film_type_layout = QHBoxLayout()
        film_type_layout.addWidget(QLabel("胶卷类型:"))
        self.film_type_combo = QComboBox()
        self.film_type_combo.setEditable(True)
        self.film_type_combo.addItems([
            "柯达金200 (Kodak Gold 200)",
            "柯达全能400 (Kodak Ultramax 400)",
            "柯达彩色负片400",
            "富士C200 (Fujifilm C200)",
            "富士Superia 400",
            "富士Pro 400H",
            "伊尔福Delta 400",
            "伊尔福FP4 Plus 125",
            "伊尔福HP5 Plus 400",
            "柯达克罗姆Kodachrome",
            "其他"
        ])
        film_type_layout.addWidget(self.film_type_combo)
        info_layout.addLayout(film_type_layout)

        # 相机和镜头
        camera_layout = QHBoxLayout()
        camera_layout.addWidget(QLabel("相机:"))
        self.camera_edit = QLineEdit()
        self.camera_edit.setPlaceholderText("如 Canon AE-1")
        camera_layout.addWidget(self.camera_edit)

        camera_layout.addWidget(QLabel("镜头:"))
        self.lens_edit = QLineEdit()
        self.lens_edit.setPlaceholderText("如 50mm f/1.8")
        camera_layout.addWidget(self.lens_edit)
        info_layout.addLayout(camera_layout)

        # 拍摄日期和冲洗日期
        date_layout = QHBoxLayout()
        date_layout.addWidget(QLabel("拍摄日期:"))
        self.shoot_date_edit = QDateEdit()
        self.shoot_date_edit.setCalendarPopup(True)
        self.shoot_date_edit.setDate(QDate.currentDate())
        date_layout.addWidget(self.shoot_date_edit)

        date_layout.addWidget(QLabel("冲洗日期:"))
        self.develop_date_edit = QDateEdit()
        self.develop_date_edit.setCalendarPopup(True)
        self.develop_date_edit.setDate(QDate.currentDate())
        date_layout.addWidget(self.develop_date_edit)
        info_layout.addLayout(date_layout)

        # 冲洗店
        lab_layout = QHBoxLayout()
        lab_layout.addWidget(QLabel("冲洗店:"))
        self.lab_edit = QLineEdit()
        self.lab_edit.setPlaceholderText("如 富士专业冲洗")
        lab_layout.addWidget(self.lab_edit)
        lab_layout.addStretch()
        info_layout.addLayout(lab_layout)

        # 备注
        info_layout.addWidget(QLabel("备注:"))
        self.notes_edit = QTextEdit()
        self.notes_edit.setMaximumHeight(80)
        info_layout.addWidget(self.notes_edit)

        info_group.setLayout(info_layout)
        layout.addWidget(info_group)

        # 进度条
        self.progress_bar = QProgressBar()
        self.progress_bar.hide()
        layout.addWidget(self.progress_bar)

        self.status_label = QLabel("")
        self.status_label.setStyleSheet("color: #666;")
        layout.addWidget(self.status_label)

        # 按钮
        btn_layout = QHBoxLayout()
        btn_layout.addStretch()

        self.cancel_btn = QPushButton("取消")
        self.cancel_btn.clicked.connect(self._on_cancel)
        btn_layout.addWidget(self.cancel_btn)

        self.import_btn = QPushButton("开始导入")
        self.import_btn.setEnabled(False)
        self.import_btn.clicked.connect(self._on_import)
        btn_layout.addWidget(self.import_btn)

        layout.addLayout(btn_layout)

        # 设置拖拽
        self.setAcceptDrops(True)

    def dragEnterEvent(self, event: QDragEnterEvent):
        """拖拽进入"""
        if event.mimeData().hasUrls():
            event.acceptProposedAction()
            self.drop_area.setStyleSheet("""
                QLabel {
                    border: 2px solid #1976d2;
                    border-radius: 8px;
                    padding: 40px;
                    background-color: #e3f2fd;
                    color: #1976d2;
                    font-size: 14px;
                }
            """)

    def dragLeaveEvent(self, event):
        """拖拽离开"""
        self._reset_drop_area_style()

    def dropEvent(self, event: QDropEvent):
        """拖拽放下"""
        self._reset_drop_area_style()

        urls = event.mimeData().urls()
        if urls:
            path = urls[0].toLocalFile()
            if path:
                self._set_directory(path)

    def _reset_drop_area_style(self):
        """重置拖拽区域样式"""
        self.drop_area.setStyleSheet("""
            QLabel {
                border: 2px dashed #aaa;
                border-radius: 8px;
                padding: 40px;
                background-color: #fafafa;
                color: #666;
                font-size: 14px;
            }
            QLabel:hover {
                border-color: #1976d2;
                background-color: #e3f2fd;
            }
        """)

    def _select_directory(self):
        """选择目录"""
        directory = QFileDialog.getExistingDirectory(
            self, "选择照片目录", self.default_directory
        )
        if directory:
            self._set_directory(directory)

    def _set_directory(self, directory: str):
        """设置目录"""
        self.directory = directory
        self.path_label.setText(directory)
        self.path_label.setToolTip(directory)
        self.import_btn.setEnabled(True)

        # 自动生成胶卷编号
        if not self.roll_number_edit.text():
            next_num = self.roll_manager.get_next_roll_number()
            self.roll_number_edit.setText(next_num)

    def _on_cancel(self):
        """取消导入"""
        if self.import_thread and self.import_thread.isRunning():
            self.import_thread.cancel()
        else:
            self.reject()

    def _on_import(self):
        """开始导入"""
        if not hasattr(self, 'directory'):
            QMessageBox.warning(self, "错误", "请先选择照片目录！")
            return

        # 获取胶卷信息
        roll_data = {
            'roll_number': self.roll_number_edit.text(),
            'film_type': self.film_type_combo.currentText(),
            'camera': self.camera_edit.text() or None,
            'lens': self.lens_edit.text() or None,
            'shoot_date': self.shoot_date_edit.date().toString("yyyy-MM-dd"),
            'develop_date': self.develop_date_edit.date().toString("yyyy-MM-dd"),
            'lab': self.lab_edit.text() or None,
            'notes': self.notes_edit.toPlainText() or None,
        }

        # 显示进度
        self.progress_bar.show()
        self.progress_bar.setValue(0)
        self.status_label.setText("正在扫描和导入照片...")
        self.import_btn.setEnabled(False)
        self.cancel_btn.setText("取消导入")

        # 启动导入线程
        self.import_thread = ImportThread(self.roll_manager, self.directory, roll_data)
        self.import_thread.progress.connect(self._on_import_progress)
        self.import_thread.finished.connect(self._on_import_finished)
        self.import_thread.error.connect(self._on_import_error)
        self.import_thread.cancelled.connect(self._on_import_cancelled)
        self.import_thread.start()

    def _on_import_progress(self, current: int, total: int, status: str):
        """导入进度更新"""
        if total > 0:
            self.progress_bar.setValue(int(current * 100 / total))
        self.status_label.setText(status)

    def _on_import_finished(self, rolls: list):
        """导入完成"""
        self.progress_bar.setValue(100)
        self.status_label.setText(f"导入完成！共导入 {len(rolls)} 卷胶卷")

        QMessageBox.information(self, "导入完成", f"成功导入 {len(rolls)} 卷胶卷！")

        self.import_finished.emit(rolls)
        self.accept()

    def _on_import_error(self, error: str):
        """导入错误"""
        self.progress_bar.hide()
        self.status_label.setText("")
        self.import_btn.setEnabled(True)
        self.cancel_btn.setText("取消")

        QMessageBox.critical(self, "导入错误", f"导入过程中发生错误:\n{error}")

    def _on_import_cancelled(self):
        """导入取消"""
        self.progress_bar.hide()
        self.status_label.setText("导入已取消")
        self.import_btn.setEnabled(True)
        self.cancel_btn.setText("取消")
        self.accept()

    def get_roll_data(self) -> dict:
        """获取胶卷信息"""
        return {
            'roll_number': self.roll_number_edit.text(),
            'film_type': self.film_type_combo.currentText(),
            'camera': self.camera_edit.text() or None,
            'lens': self.lens_edit.text() or None,
            'shoot_date': self.shoot_date_edit.date().toString("yyyy-MM-dd"),
            'develop_date': self.develop_date_edit.date().toString("yyyy-MM-dd"),
            'lab': self.lab_edit.text() or None,
            'notes': self.notes_edit.toPlainText() or None,
        }