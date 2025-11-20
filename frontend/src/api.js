import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export const contentApi = {
    list: () => api.get('/content'),
    create: (data) => api.post('/content/create', data),
    get: (id) => api.get(`/content/${id}`),
    runFocusGroup: (id, data) => api.post(`/content/${id}/run-focus-group`, data),
    runEditor: (id, data) => api.post(`/content/${id}/run-editor`, data),
    userReview: (id, data) => api.post(`/content/${id}/user-review`, data),
    runOrchestrator: (data) => api.post('/orchestrate/run', data),
};

export const personaApi = {
    list: () => api.get('/personas'),
    create: (data) => api.post('/personas', data),
    update: (id, data) => api.put(`/personas/${id}`, data),
    delete: (id) => api.delete(`/personas/${id}`),
};

export default api;
