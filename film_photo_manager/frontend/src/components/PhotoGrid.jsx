import React, { useState } from 'react'
import { photosAPI } from '../services/api'
import './PhotoGrid.css'

function PhotoGrid({ photos, selectedPhoto, onSelectPhoto, onPhotoDoubleClick, onPhotoUpdate }) {
  const [gridSize, setGridSize] = useState(6)

  if (!photos || photos.length === 0) {
    return (
      <div className="empty-state">
        <h3>暂无照片</h3>
        <p>选择左侧胶卷查看照片</p>
      </div>
    )
  }

  return (
    <div className="photo-grid-container">
      <div className="photo-grid-toolbar">
        <span>共 {photos.length} 张照片</span>
        <div className="grid-size-control">
          <span>网格大小:</span>
          <input
            type="range"
            min="3"
            max="10"
            value={gridSize}
            onChange={(e) => setGridSize(parseInt(e.target.value))}
          />
          <span>{gridSize}</span>
        </div>
      </div>
      <div
        className="photo-grid"
        style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}
      >
        {photos.map(photo => (
          <div
            key={photo.id}
            className={`photo-item ${selectedPhoto?.id === photo.id ? 'selected' : ''}`}
            onClick={() => onSelectPhoto(photo)}
            onDoubleClick={() => onPhotoDoubleClick(photo)}
          >
            <img
              src={photo.thumbnail_path ? `/api/photos/${photo.id}/thumbnail` : '/placeholder.png'}
              alt={photo.file_name}
              loading="lazy"
            />
            <div className="photo-item-info">
              <span>#{photo.frame_number || '?'}</span>
              {photo.rating > 0 && (
                <span className="photo-item-rating">
                  {'★'.repeat(photo.rating)}
                </span>
              )}
              {photo.is_favorite && <span className="photo-item-fav">♥</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default PhotoGrid