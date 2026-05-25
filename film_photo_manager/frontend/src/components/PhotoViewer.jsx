import React, { useState } from 'react'
import './PhotoViewer.css'

function PhotoViewer({ photo, onClose }) {
  const [scale, setScale] = useState(1)

  if (!photo) return null

  return (
    <div className="photo-viewer-overlay" onClick={onClose}>
      <div className="photo-viewer" onClick={(e) => e.stopPropagation()}>
        <img
          src={`/api/photos/${photo.id}/image`}
          alt={photo.file_name}
          style={{ transform: `scale(${scale})` }}
        />
      </div>

      <button className="photo-viewer-close" onClick={onClose}>×</button>

      <div className="photo-viewer-controls">
        <button onClick={() => setScale(s => Math.max(0.5, s - 0.2))}>-</button>
        <span>{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale(s => Math.min(3, s + 0.2))}>+</button>
        <button onClick={() => setScale(1)}>重置</button>
      </div>

      <div className="photo-viewer-info">
        <p>{photo.file_name}</p>
        {photo.title && <p><strong>{photo.title}</strong></p>}
        {photo.description && <p>{photo.description}</p>}
      </div>
    </div>
  )
}

export default PhotoViewer