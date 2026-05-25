import React, { useState } from 'react'
import { tagsAPI } from '../services/api'
import './TagManager.css'

function TagManager({ tags, onClose, onUpdate }) {
  const [newTagName, setNewTagName] = useState('')

  const handleAddTag = async () => {
    if (!newTagName.trim()) return
    try {
      await tagsAPI.create({ name: newTagName.trim() })
      setNewTagName('')
      onUpdate()
    } catch (error) {
      console.error('Failed to add tag:', error)
    }
  }

  const handleDeleteTag = async (tagId) => {
    if (!window.confirm('确定要删除这个标签吗？')) return
    try {
      await tagsAPI.delete(tagId)
      onUpdate()
    } catch (error) {
      console.error('Failed to delete tag:', error)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal tag-manager" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>标签管理</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="tag-list">
            {tags.length === 0 ? (
              <p className="no-tags">暂无标签</p>
            ) : (
              tags.map(tag => (
                <div key={tag.id} className="tag-item">
                  <span
                    className="tag-color"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="tag-name">{tag.name}</span>
                  <button
                    className="tag-delete"
                    onClick={() => handleDeleteTag(tag.id)}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="add-tag-form">
            <input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="新标签名称..."
              onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
            />
            <button className="btn btn-primary" onClick={handleAddTag}>
              添加
            </button>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}

export default TagManager