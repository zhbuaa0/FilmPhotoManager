import axios from 'axios'

const API_BASE = '/api'

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 胶卷 API
export const rollsAPI = {
  getAll: () => api.get('/rolls').then(res => res.data),
  get: (id) => api.get(`/rolls/${id}`).then(res => res.data),
  create: (data) => api.post('/rolls', data).then(res => res.data),
  update: (id, data) => api.put(`/rolls/${id}`, data).then(res => res.data),
  delete: (id) => api.delete(`/rolls/${id}`).then(res => res.data),
  getPhotos: (rollId) => api.get(`/rolls/${rollId}/photos`).then(res => res.data),
  search: (keyword) => api.get(`/rolls/search`, { params: { q: keyword } }).then(res => res.data),
  getStats: () => api.get('/rolls/stats').then(res => res.data)
}

// 照片 API
export const photosAPI = {
  create: (formData) => api.post('/photos', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(res => res.data),
  get: (id) => api.get(`/photos/${id}`).then(res => res.data),
  update: (id, data) => api.put(`/photos/${id}`, data).then(res => res.data),
  delete: (id) => api.delete(`/photos/${id}`).then(res => res.data),
  getImage: (id) => `${API_BASE}/photos/${id}/image`,
  getThumbnail: (id) => `${API_BASE}/photos/${id}/thumbnail`,
  batchUpdate: (photoIds, updates) => api.post('/photos/batch/update', { photo_ids: photoIds, updates }).then(res => res.data)
}

// 标签 API
export const tagsAPI = {
  getAll: () => api.get('/tags').then(res => res.data),
  create: (data) => api.post('/tags', data).then(res => res.data),
  update: (id, data) => api.put(`/tags/${id}`, data).then(res => res.data),
  delete: (id) => api.delete(`/tags/${id}`).then(res => res.data),
  getPhotos: (tagId) => api.get(`/tags/${tagId}/photos`).then(res => res.data),
  addToPhoto: (photoId, tagId) => api.post(`/tags/photos/${photoId}/tags`, { tag_id: tagId }).then(res => res.data),
  removeFromPhoto: (photoId, tagId) => api.delete(`/tags/photos/${photoId}/tags/${tagId}`).then(res => res.data),
  getPhotoTags: (photoId) => api.get(`/tags/photos/${photoId}/tags`).then(res => res.data)
}

export default api