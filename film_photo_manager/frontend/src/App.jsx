import React, { useState, useEffect } from 'react'
import { rollsAPI, tagsAPI, photosAPI } from './services/api'
import RollList from './components/RollList'
import PhotoGrid from './components/PhotoGrid'
import PhotoViewer from './components/PhotoViewer'
import ImportDialog from './components/ImportDialog'
import TagManager from './components/TagManager'
import './App.css'

function App() {
  const [rolls, setRolls] = useState([])
  const [tags, setTags] = useState([])
  const [selectedRoll, setSelectedRoll] = useState(null)
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [photos, setPhotos] = useState([])
  const [stats, setStats] = useState({})
  const [showImport, setShowImport] = useState(false)
  const [showTagManager, setShowTagManager] = useState(false)
  const [viewerPhoto, setViewerPhoto] = useState(null)
  const [searchKeyword, setSearchKeyword] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [rollsData, tagsData, statsData] = await Promise.all([
        rollsAPI.getAll(),
        tagsAPI.getAll(),
        rollsAPI.getStats()
      ])
      setRolls(rollsData)
      setTags(tagsData)
      setStats(statsData)
    } catch (error) {
      console.error('Failed to load data:', error)
    }
  }

  const handleSelectRoll = async (roll) => {
    setSelectedRoll(roll)
    setSelectedPhoto(null)
    try {
      const photosData = await rollsAPI.getPhotos(roll.id)
      setPhotos(photosData)
    } catch (error) {
      console.error('Failed to load photos:', error)
      setPhotos([])
    }
  }

  const handleSelectPhoto = (photo) => {
    setSelectedPhoto(photo)
  }

  const handleDeleteRoll = async (rollId) => {
    if (!window.confirm('确定要删除这个胶卷吗？')) return
    try {
      await rollsAPI.delete(rollId)
      loadData()
      if (selectedRoll?.id === rollId) {
        setSelectedRoll(null)
        setPhotos([])
      }
    } catch (error) {
      console.error('Failed to delete roll:', error)
    }
  }

  const handleImportComplete = () => {
    setShowImport(false)
    loadData()
  }

  const handlePhotoUpdate = async (photoId, updates) => {
    try {
      await photosAPI.update(photoId, updates)
      // Refresh photos
      if (selectedRoll) {
        const photosData = await rollsAPI.getPhotos(selectedRoll.id)
        setPhotos(photosData)
      }
      // Refresh selected photo
      if (selectedPhoto?.id === photoId) {
        const updatedPhoto = await photosAPI.get(photoId)
        setSelectedPhoto(updatedPhoto)
      }
    } catch (error) {
      console.error('Failed to update photo:', error)
    }
  }

  const handleSearch = async () => {
    if (!searchKeyword.trim()) {
      loadData()
      return
    }
    try {
      const results = await rollsAPI.search(searchKeyword)
      setRolls(results)
    } catch (error) {
      console.error('Search failed:', error)
    }
  }

  return (
    <div className="app">
      {/* 顶部工具栏 */}
      <header className="toolbar">
        <h1 className="app-title">胶片照片管理器</h1>
        <div className="toolbar-actions">
          <button className="btn btn-primary" onClick={() => setShowImport(true)}>
            导入胶卷
          </button>
          <button className="btn" onClick={() => setShowTagManager(true)}>
            标签管理
          </button>
          <div className="search-box">
            <input
              type="text"
              placeholder="搜索胶卷..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button onClick={handleSearch}>搜索</button>
          </div>
        </div>
      </header>

      {/* 主内容区 - 三栏布局 */}
      <main className="main-content">
        {/* 左侧胶卷列表 */}
        <aside className="sidebar">
          <RollList
            rolls={rolls}
            selectedRoll={selectedRoll}
            onSelectRoll={handleSelectRoll}
            onDeleteRoll={handleDeleteRoll}
          />
        </aside>

        {/* 中间照片网格 */}
        <section className="content">
          <PhotoGrid
            photos={photos}
            selectedPhoto={selectedPhoto}
            onSelectPhoto={handleSelectPhoto}
            onPhotoDoubleClick={setViewerPhoto}
            onPhotoUpdate={handlePhotoUpdate}
          />
        </section>

        {/* 右侧属性面板 */}
        <aside className="property-panel">
          {selectedPhoto ? (
            <div className="photo-properties">
              <h3>照片属性</h3>
              <div className="property-group">
                <label>标题</label>
                <input
                  type="text"
                  value={selectedPhoto.title || ''}
                  onChange={(e) => handlePhotoUpdate(selectedPhoto.id, { title: e.target.value })}
                />
              </div>
              <div className="property-group">
                <label>描述</label>
                <textarea
                  value={selectedPhoto.description || ''}
                  onChange={(e) => handlePhotoUpdate(selectedPhoto.id, { description: e.target.value })}
                />
              </div>
              <div className="property-group">
                <label>评分</label>
                <select
                  value={selectedPhoto.rating || 0}
                  onChange={(e) => handlePhotoUpdate(selectedPhoto.id, { rating: parseInt(e.target.value) })}
                >
                  <option value={0}>0星</option>
                  <option value={1}>1星</option>
                  <option value={2}>2星</option>
                  <option value={3}>3星</option>
                  <option value={4}>4星</option>
                  <option value={5}>5星</option>
                </select>
              </div>
              <div className="property-group">
                <label>
                  <input
                    type="checkbox"
                    checked={selectedPhoto.is_favorite || false}
                    onChange={(e) => handlePhotoUpdate(selectedPhoto.id, { is_favorite: e.target.checked })}
                  />
                  收藏
                </label>
              </div>
              <div className="property-info">
                <p><strong>帧号:</strong> {selectedPhoto.frame_number || '-'}</p>
                <p><strong>文件名:</strong> {selectedPhoto.file_name}</p>
                <p><strong>格式:</strong> {selectedPhoto.file_format}</p>
              </div>
            </div>
          ) : (
            <div className="no-selection">
              <p>选择一张照片查看属性</p>
            </div>
          )}
        </aside>
      </main>

      {/* 状态栏 */}
      <footer className="statusbar">
        <span>总胶卷数: {stats.total_rolls || 0}</span>
        <span>总照片数: {stats.total_photos || 0}</span>
        <span>收藏照片: {stats.favorite_photos || 0}</span>
      </footer>

      {/* 对话框 */}
      {showImport && (
        <ImportDialog
          onClose={() => setShowImport(false)}
          onComplete={handleImportComplete}
        />
      )}

      {showTagManager && (
        <TagManager
          tags={tags}
          onClose={() => setShowTagManager(false)}
          onUpdate={loadData}
        />
      )}

      {viewerPhoto && (
        <PhotoViewer
          photo={viewerPhoto}
          onClose={() => setViewerPhoto(null)}
        />
      )}
    </div>
  )
}

export default App