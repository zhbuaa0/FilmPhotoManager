import React from 'react'
import './RollList.css'

function RollList({ rolls, selectedRoll, onSelectRoll, onDeleteRoll }) {
  if (!rolls || rolls.length === 0) {
    return (
      <div className="roll-list-empty">
        <p>暂无胶卷</p>
        <p className="hint">点击"导入胶卷"添加</p>
      </div>
    )
  }

  return (
    <div className="roll-list">
      <div className="roll-list-header">
        <h3>胶卷列表 ({rolls.length})</h3>
      </div>
      {rolls.map(roll => (
        <div
          key={roll.id}
          className={`roll-card ${selectedRoll?.id === roll.id ? 'selected' : ''}`}
          onClick={() => onSelectRoll(roll)}
        >
          <div className="roll-card-title">{roll.roll_number}</div>
          <div className="roll-card-info">
            <span>{roll.film_type || '未指定类型'}</span>
            {roll.shoot_date && <span> • {roll.shoot_date}</span>}
          </div>
          <div className="roll-card-info">
            <span>{roll.photo_count || 0} 张照片</span>
          </div>
          <button
            className="roll-delete-btn"
            onClick={(e) => {
              e.stopPropagation()
              onDeleteRoll(roll.id)
            }}
          >
            删除
          </button>
        </div>
      ))}
    </div>
  )
}

export default RollList