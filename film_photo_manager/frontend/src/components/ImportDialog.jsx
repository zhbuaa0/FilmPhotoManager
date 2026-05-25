import React, { useState, useRef } from 'react'
import { rollsAPI, photosAPI } from '../services/api'
import './ImportDialog.css'

function ImportDialog({ onClose, onComplete }) {
  const [rollData, setRollData] = useState({
    roll_number: '',
    film_type: '',
    camera: '',
    lens: '',
    shoot_date: '',
    develop_date: '',
    lab: '',
    notes: ''
  })
  const [photos, setPhotos] = useState([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const fileInputRef = useRef()

  const handleDrop = (e) => {
    e.preventDefault()
    e.currentTarget.classList.remove('dragover')
    const files = Array.from(e.dataTransfer.files)
    handleFiles(files)
  }

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files)
    handleFiles(files)
  }

  const handleFiles = (files) => {
    const imageFiles = files.filter(f =>
      f.name.match(/\.(bmp|tif|tiff|jpg|jpeg)$/i)
    )
    setPhotos(imageFiles)

    // Auto-generate roll number
    if (!rollData.roll_number) {
      const now = new Date()
      const dateStr = now.toISOString().slice(0,10).replace(/-/g,'')
      setRollData(d => ({ ...d, roll_number: `${dateStr}-01` }))
    }
  }

  const handleSubmit = async () => {
    if (photos.length === 0) {
      alert('请先选择照片')
      return
    }

    if (!rollData.roll_number || !rollData.film_type) {
      alert('胶卷编号和类型不能为空')
      return
    }

    setUploading(true)
    setProgress(0)

    try {
      // 创建胶卷
      const roll = await rollsAPI.create(rollData)

      // 上传照片
      for (let i = 0; i < photos.length; i++) {
        const file = photos[i]
        const formData = new FormData()
        formData.append('file', file)
        formData.append('roll_id', roll.id)
        formData.append('frame_number', i + 1)

        await photosAPI.create(formData)
        setProgress(Math.round(((i + 1) / photos.length) * 100))
      }

      alert('导入成功！')
      onComplete()
    } catch (error) {
      console.error('Import failed:', error)
      alert('导入失败: ' + error.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal import-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>导入胶卷</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div
            className="import-dropzone"
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('dragover') }}
            onDragLeave={(e) => e.currentTarget.classList.remove('dragover')}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <p>将照片文件拖拽到此处</p>
            <p>或点击选择文件</p>
            <p className="hint">支持 BMP, TIF, JPG 格式</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".bmp,.tif,.tiff,.jpg,.jpeg"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />

          {photos.length > 0 && (
            <div className="selected-files">
              <p>已选择 {photos.length} 张照片</p>
            </div>
          )}

          <div className="import-form">
            <div className="form-group">
              <label>胶卷编号 *</label>
              <input
                type="text"
                value={rollData.roll_number}
                onChange={(e) => setRollData({ ...rollData, roll_number: e.target.value })}
                placeholder="如 20260525-01"
              />
            </div>

            <div className="form-group">
              <label>胶卷类型 *</label>
              <select
                value={rollData.film_type}
                onChange={(e) => setRollData({ ...rollData, film_type: e.target.value })}
              >
                <option value="">选择类型...</option>
                <option value="柯达金200">柯达金200</option>
                <option value="柯达全能400">柯达全能400</option>
                <option value="富士C200">富士C200</option>
                <option value="富士Pro 400H">富士Pro 400H</option>
                <option value="伊尔福Delta 400">伊尔福Delta 400</option>
                <option value="伊尔福HP5 Plus">伊尔福HP5 Plus</option>
                <option value="其他">其他</option>
              </select>
            </div>

            <div className="form-group">
              <label>相机</label>
              <input
                type="text"
                value={rollData.camera}
                onChange={(e) => setRollData({ ...rollData, camera: e.target.value })}
                placeholder="如 Canon AE-1"
              />
            </div>

            <div className="form-group">
              <label>镜头</label>
              <input
                type="text"
                value={rollData.lens}
                onChange={(e) => setRollData({ ...rollData, lens: e.target.value })}
                placeholder="如 50mm f/1.8"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>拍摄日期</label>
                <input
                  type="date"
                  value={rollData.shoot_date}
                  onChange={(e) => setRollData({ ...rollData, shoot_date: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>冲洗日期</label>
                <input
                  type="date"
                  value={rollData.develop_date}
                  onChange={(e) => setRollData({ ...rollData, develop_date: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label>冲洗店</label>
              <input
                type="text"
                value={rollData.lab}
                onChange={(e) => setRollData({ ...rollData, lab: e.target.value })}
                placeholder="如 富士专业冲洗"
              />
            </div>

            <div className="form-group">
              <label>备注</label>
              <textarea
                value={rollData.notes}
                onChange={(e) => setRollData({ ...rollData, notes: e.target.value })}
                placeholder="备注信息..."
              />
            </div>
          </div>

          {uploading && (
            <div className="upload-progress">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }}></div>
              </div>
              <p>正在导入... {progress}%</p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>取消</button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={uploading || photos.length === 0}
          >
            {uploading ? '导入中...' : '开始导入'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ImportDialog