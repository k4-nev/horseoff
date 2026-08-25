const api = (url, opts) => window.Shell.api(url, opts);

export const getStatus = () => api('/api/mod/servers/status');
export const getList = () => api('/api/mod/servers/list');
export const createServer = (body) => api('/api/mod/servers/create', { method: 'POST', body: JSON.stringify(body) });
export const addServer = (body) => api('/api/mod/servers/add', { method: 'POST', body: JSON.stringify(body) });
export const updateServer = (ip, body) => api('/api/mod/servers/update/' + ip, { method: 'PUT', body: JSON.stringify(body) });
export const deleteServer = (ip) => api('/api/mod/servers/delete/' + ip, { method: 'DELETE' });
export const getProvisionStatus = (ip) => api('/api/mod/servers/provision/' + ip);
export const getApiKeyStatus = () => api('/api/mod/servers/apikeys');
export const saveApiKey = (provider, key) => api('/api/mod/servers/apikeys', { method: 'POST', body: JSON.stringify({ provider, key }) });
export const saveSettings = (poll_interval) => api('/api/settings', { method: 'POST', body: JSON.stringify({ poll_interval }) });
