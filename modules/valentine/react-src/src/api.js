// Thin wrapper matching the old vanilla module's `_api` helper: prefer
// Shell.api (adds Authorization: Bearer <token>, handles 401 centrally),
// fall back to a raw fetch with the token from Shell/localStorage otherwise.
export async function api(method, path, body) {
  const opts = { method };
  if (body) opts.body = JSON.stringify(body);
  if (window.Shell && window.Shell.api) {
    return await window.Shell.api(path, opts);
  }
  try {
    const headers = { 'Content-Type': 'application/json' };
    const tok = (window.Shell && window.Shell.token) || localStorage.getItem('ho_token');
    if (tok) headers['Authorization'] = 'Bearer ' + tok;
    const r = await fetch(path, { method, headers, body: opts.body });
    return await r.json();
  } catch (e) {
    return null;
  }
}

export const getContacts = () => api('GET', '/api/msg/contacts');
export const getStickers = () => api('GET', '/api/valentine/stickers');
export const getReceived = () => api('GET', '/api/valentine/received');
export const getProfile = () => api('GET', '/api/profile');
export const sendValentine = (to, pages) => api('POST', '/api/valentine/send', { to, pages });
export const markRead = (id) => api('POST', '/api/valentine/read', { id });
export const deleteValentine = (id) => api('DELETE', '/api/valentine/' + id);
