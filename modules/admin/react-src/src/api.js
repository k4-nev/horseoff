const api = (url, opts) => window.Shell.api(url, opts);

export const getAllModules = () => api('/api/modules/all');
export const getUsers = () => api('/api/users');
export const createUser = (body) => api('/api/users', { method: 'POST', body: JSON.stringify(body) });
export const updateUser = (id, body) => api('/api/users/' + id, { method: 'PUT', body: JSON.stringify(body) });
export const deleteUser = (id) => api('/api/users/' + id, { method: 'DELETE' });
export const getDefaultModules = () => api('/api/settings/default-modules');
export const setDefaultModules = (modules) => api('/api/settings/default-modules', { method: 'POST', body: JSON.stringify({ modules }) });
