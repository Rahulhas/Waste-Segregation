const API_URL = import.meta.env.VITE_API_URL || '/api';

export function getToken() {
  return localStorage.getItem('token');
}

export function setToken(token) {
  if (token) {
    localStorage.setItem('token', token);
  } else {
    localStorage.removeItem('token');
  }
}

export function getStoredUser() {
  const raw = localStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}

export function setStoredUser(user) {
  if (user) {
    localStorage.setItem('user', JSON.stringify(user));
  } else {
    localStorage.removeItem('user');
  }
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const isPublicAuth =
    path.startsWith('/auth/login') ||
    path.startsWith('/auth/register') ||
    path.startsWith('/auth/forgot-password') ||
    path.startsWith('/auth/reset-password');

  if (token && !isPublicAuth) {
    headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });
  } catch (err) {
    // If the relative /api call failed (e.g. Vite dev proxy hiccup or network error),
    // attempt a direct connection to the backend server on port 5000
    if (!options._retried) {
      const fallbackBase = typeof window !== 'undefined'
        ? `${window.location.protocol}//${window.location.hostname}:5000/api`
        : 'http://127.0.0.1:5000/api';

      try {
        res = await fetch(`${fallbackBase}${path}`, {
          ...options,
          _retried: true,
          headers,
        });
      } catch (directErr) {
        // Also try 127.0.0.1 if hostname wasn't 127.0.0.1
        try {
          res = await fetch(`http://127.0.0.1:5000/api${path}`, {
            ...options,
            _retried: true,
            headers,
          });
        } catch {
          throw new Error('Unable to connect to backend server. Please ensure the server is running on port 5000.');
        }
      }
    } else {
      throw new Error('Unable to connect to backend server. Please ensure the server is running on port 5000.');
    }
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

export const api = {
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  register: (payload) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),

  forgotPassword: (email) =>
    request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),

  resetPassword: (token, password) =>
    request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),

  me: () => request('/auth/me'),

  auditLogs: () => request('/auth/audit-logs'),

  submitCitizenRequest: (payload) =>
    request('/citizen-requests', { method: 'POST', body: JSON.stringify(payload) }),

  trackCitizenRequest: (ticketId) => request(`/citizen-requests/track/${ticketId}`),

  getCitizenComplaints: (params = '') => request(`/citizen-requests/public${params ? `?${params}` : ''}`),

  citizenRequests: (params = '') => request(`/citizen-requests${params ? `?${params}` : ''}`),

  updateCitizenRequestStatus: (ticketId, payload) =>
    request(`/citizen-requests/${ticketId}/status`, { method: 'PATCH', body: JSON.stringify(payload) }),

  analyzeWaste: async (imageInput) => {
    let base64Image = imageInput;
    if (imageInput instanceof Blob || imageInput instanceof File) {
      base64Image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(imageInput);
      });
    }
    const response = await request('/waste/analyze', {
      method: 'POST',
      body: JSON.stringify({ image: base64Image }),
    });
    return response.result;
  },

  getWasteHistory: (params = '') => request(`/waste/history${params ? `?${params}` : ''}`),

  getWasteStats: () => request('/waste/stats'),

  // Zones & Bins
  getZones: () => request('/zones'),
  getZone: (id) => request(`/zones/${id}`),
  getZoneBins: (id) => request(`/zones/${id}/bins`),
  updateBin: (zoneId, binId, payload) =>
    request(`/zones/${zoneId}/bins/${binId}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  // Admin User Management
  getAdminUsers: (params = '') => request(`/auth/admin/users${params ? `?${params}` : ''}`),
  createAdminUser: (payload) =>
    request('/auth/admin/create-user', { method: 'POST', body: JSON.stringify(payload) }),
  updateAdminUser: (id, payload) =>
    request(`/auth/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteAdminUser: (id) =>
    request(`/auth/admin/users/${id}`, { method: 'DELETE' }),

  // Complaint Workflow & Drivers
  getDriversByZone: (zoneId = '') =>
    request(`/citizen-requests/drivers-by-zone${zoneId ? `?zoneId=${zoneId}` : ''}`),
  assignDriver: (ticketId, driverId) =>
    request(`/citizen-requests/${ticketId}/assign`, { method: 'PATCH', body: JSON.stringify({ driverId }) }),
  uploadPickupProof: (ticketId, driverProofPhotoUrl) =>
    request(`/citizen-requests/${ticketId}/pickup-proof`, { method: 'PATCH', body: JSON.stringify({ driverProofPhotoUrl }) }),
  verifyCleanup: (ticketId) =>
    request(`/citizen-requests/${ticketId}/verify-cleanup`, { method: 'PATCH' }),

  // Comments
  getTicketComments: (ticketId) => request(`/citizen-requests/${ticketId}/comments`),
  addTicketComment: (ticketId, content) =>
    request(`/citizen-requests/${ticketId}/comments`, { method: 'POST', body: JSON.stringify({ content }) }),
};


