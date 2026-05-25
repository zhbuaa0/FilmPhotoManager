# 胶片照片管理器 Web 版

专为胶片摄影爱好者设计的个人胶片照片管理软件，按"卷"管理照片，而非单张管理。

## 功能特性

### 1. 导入功能（最重要，最常用）
- 支持拖拽上传照片文件
- 自动生成默认胶卷编号（如 20260525-01）
- 导入时可批量设置胶卷信息（类型、相机、冲洗店、日期）
- 自动生成缩略图（300x200，85%质量），缓存到 data/thumbnails 目录
- 自动提取 EXIF 信息并保存
- 显示导入进度条

### 2. 胶卷管理功能
- 左侧导航栏显示所有胶卷，按创建时间倒序排列
- 胶卷列表采用卡片式布局，显示封面、编号、类型、拍摄日期
- 点击胶卷卡片，中间显示该卷所有照片的网格视图
- 支持删除胶卷

### 3. 照片管理功能
- 网格视图浏览照片，可调整网格大小
- 双击照片打开大图查看器，支持缩放
- 支持给照片添加标题、描述、评分（1-5 星）、收藏
- 右侧属性面板实时编辑照片属性

### 4. 标签管理功能
- 支持创建、删除标签
- 支持给照片添加/移除标签

### 5. 搜索功能
- 按胶卷编号搜索
- 搜索结果实时显示

## 技术栈

### 前端
- React 18
- Vite（开发服务器）
- Axios（HTTP 客户端）
- 原生 CSS

### 后端
- Flask（Python Web 框架）
- Flask-CORS（跨域支持）

### 数据库
- SQLite3（单文件存储，无需额外服务）

### 图像处理
- Pillow（生成缩略图、格式支持）
- exifread（专门处理胶片扫描件的 EXIF 信息）

## 项目目录结构

```
film_photo_manager/
├── backend/                    # Flask 后端
│   ├── __init__.py
│   ├── app.py                  # Flask 应用入口
│   ├── config.py               # 配置文件
│   ├── database/               # 数据库模块
│   │   ├── __init__.py
│   │   ├── db_manager.py      # 数据库 CRUD 操作
│   │   └── models.py          # 数据模型
│   └── api/                   # REST API 路由
│       ├── __init__.py
│       ├── rolls.py            # 胶卷 API
│       ├── photos.py           # 照片 API
│       └── tags.py            # 标签 API
│
├── frontend/                   # React 前端
│   ├── src/
│   │   ├── components/        # React 组件
│   │   │   ├── RollList.jsx
│   │   │   ├── PhotoGrid.jsx
│   │   │   ├── PhotoViewer.jsx
│   │   │   ├── ImportDialog.jsx
│   │   │   └── TagManager.jsx
│   │   ├── services/          # API 调用
│   │   │   └── api.js
│   │   ├── App.jsx
│   │   ├── App.css
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── main.py                    # 启动脚本
├── config.py                  # 全局配置（保留）
└── data/                      # 运行时数据
    ├── film_manager.db        # 数据库文件
    ├── thumbnails/            # 缩略图缓存
    └── photos/                # 原始照片
```

## 快速开始

### 环境要求
- Python 3.8+
- Node.js 16+
- npm 或 yarn
- macOS / Windows / Linux

### 1. 创建 conda 环境（推荐）

```bash
# 创建环境
conda create -n film-manager python=3.11

# 激活环境
conda activate film-manager

# 安装 Python 依赖
pip install flask flask-cors pillow exifread
```

### 2. 安装前端依赖

```bash
cd film_photo_manager/frontend
npm install
```

### 3. 启动服务

**启动后端（终端 1）：**
```bash
cd film_photo_manager
python backend/app.py
```
后端地址：http://localhost:5001

**启动前端（终端 2）：**
```bash
cd film_photo_manager/frontend
npm run dev
```
前端地址：http://localhost:3000

### 4. 访问应用

在浏览器中打开 http://localhost:3000

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/health | 健康检查 |
| GET | /api/rolls | 获取所有胶卷 |
| POST | /api/rolls | 创建胶卷 |
| GET | /api/rolls/:id | 获取胶卷详情 |
| PUT | /api/rolls/:id | 更新胶卷 |
| DELETE | /api/rolls/:id | 删除胶卷 |
| GET | /api/rolls/:id/photos | 获取胶卷照片 |
| POST | /api/photos | 上传照片 |
| PUT | /api/photos/:id | 更新照片 |
| DELETE | /api/photos/:id | 删除照片 |
| GET | /api/photos/:id/image | 获取照片原图 |
| GET | /api/photos/:id/thumbnail | 获取缩略图 |
| GET | /api/tags | 获取所有标签 |
| POST | /api/tags | 创建标签 |
| DELETE | /api/tags/:id | 删除标签 |
| GET | /api/tags/photos/:id/tags | 获取照片标签 |
| POST | /api/tags/photos/:id/tags | 添加标签到照片 |

## 数据库表结构

### 胶卷表（核心）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| roll_number | TEXT | 胶卷编号：YYYYMMDD-序号 |
| film_type | TEXT | 胶卷类型（柯达金200、富士C200等） |
| camera | TEXT | 使用相机 |
| lens | TEXT | 使用镜头 |
| shoot_date | TEXT | 拍摄日期 |
| develop_date | TEXT | 冲洗日期 |
| scan_date | TEXT | 扫描日期 |
| lab | TEXT | 冲洗店 |
| notes | TEXT | 备注 |
| photo_count | INTEGER | 照片数量 |
| cover_photo_id | INTEGER | 封面照片ID |

### 照片表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| roll_id | INTEGER | 胶卷ID |
| file_path | TEXT | 原始文件绝对路径 |
| file_name | TEXT | 文件名 |
| file_size | INTEGER | 文件大小（字节） |
| file_format | TEXT | 格式：bmp/tif/jpg |
| frame_number | INTEGER | 帧号（1-36） |
| title | TEXT | 标题 |
| description | TEXT | 描述 |
| rating | INTEGER | 评分（0-5星） |
| is_favorite | BOOLEAN | 是否收藏 |
| exif_data | TEXT | EXIF信息（JSON字符串） |
| thumbnail_path | TEXT | 缩略图路径 |

### 标签表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| name | TEXT | 标签名称 |
| color | TEXT | 标签颜色 |

## 注意事项

1. 程序会自动创建 `data/` 目录存储数据库和缩略图
2. 支持的图片格式：BMP、TIF、JPG
3. 后端默认使用端口 5001（如果 5000 被占用）
4. 前端开发服务器默认使用端口 3000
5. 前端通过代理转发 API 请求到后端