// Thin fetch wrapper: JSON in/out, cookies for the session, readable errors.
export class ApiError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request(method, url, body) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) {
    opts.body = body;
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch {
    throw new ApiError(0, 'Network error — check your connection and try again.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`, data);
  return data;
}

export const api = {
  demoUsers: () => request('GET', '/api/auth/demo-users'),
  login: (email) => request('POST', '/api/auth/login', { email }),
  logout: () => request('POST', '/api/auth/logout'),
  me: () => request('GET', '/api/me'),
  users: () => request('GET', '/api/users'),
  listDocs: () => request('GET', '/api/documents'),
  createDoc: (title) => request('POST', '/api/documents', title ? { title } : {}),
  getDoc: (id) => request('GET', `/api/documents/${id}`),
  updateDoc: (id, patch) => request('PATCH', `/api/documents/${id}`, patch),
  deleteDoc: (id) => request('DELETE', `/api/documents/${id}`),
  importDoc: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request('POST', '/api/documents/import', fd);
  },
  share: (id, email, role) => request('PUT', `/api/documents/${id}/shares`, { email, role }),
  unshare: (id, userId) => request('DELETE', `/api/documents/${id}/shares/${userId}`),
};
