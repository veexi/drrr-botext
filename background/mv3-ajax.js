// Small callback-compatible replacement for the jQuery AJAX calls used by
// background logic. Extension service workers do not have a DOM or jQuery.
function encodeAjaxData(data) {
  if (data instanceof URLSearchParams) return data.toString();
  if (typeof data === 'string') return data;
  if (!data || typeof data !== 'object') return '';

  const pairs = [];
  const append = (value, key) => {
    if (value == null) value = '';
    if (Array.isArray(value)) {
      value.forEach((item, index) => append(item, `${key}[${index}]`));
    } else if (typeof value === 'object') {
      Object.keys(value).forEach(name => append(value[name], `${key}[${name}]`));
    } else {
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  };

  Object.keys(data).forEach(key => append(data[key], key));
  return pairs.join('&');
}

function workerAjax(options = {}) {
  const method = String(options.type || options.method || 'GET').toUpperCase();
  let url = options.url;
  let body;
  const headers = new Headers(options.headers || {});
  const encoded = encodeAjaxData(options.data);
  const requestHost = new URL(url, globalThis.location.href).hostname;

  if (method === 'GET' || method === 'HEAD') {
    if (encoded) url += `${String(url).includes('?') ? '&' : '?'}${encoded}`;
  } else if (options.data instanceof FormData || options.data instanceof Blob) {
    body = options.data;
  } else if (options.data != null) {
    body = encoded;
    if (options.contentType !== false && !headers.has('content-type')) {
      headers.set('content-type', options.contentType || 'application/x-www-form-urlencoded; charset=UTF-8');
    }
  }

  const request = {
    method,
    headers,
    body,
    credentials: options.xhrFields && options.xhrFields.withCredentials
      || requestHost === 'drrr.com' || requestHost.endsWith('.drrr.com')
      ? 'include' : 'same-origin',
  };
  let timeoutId;
  if (options.timeout) {
    const controller = new AbortController();
    request.signal = controller.signal;
    timeoutId = setTimeout(() => controller.abort(), options.timeout);
  }

  return fetch(url, request).then(async response => {
    const xhr = {
      status: response.status,
      statusText: response.statusText,
      responseURL: response.url,
    };
    const text = await response.text();
    xhr.responseText = text;

    if (!response.ok) {
      const error = Object.assign(new Error(response.statusText || `HTTP ${response.status}`), xhr);
      if (options.error) options.error(error, 'error', error.statusText);
      return undefined;
    }

    let data = text;
    if (options.dataType === 'json') data = text ? JSON.parse(text) : null;
    if (options.success) options.success(data, 'success', xhr);
    return data;
  }).catch(error => {
    if (options.error) {
      const xhr = { status: error.status || 0, statusText: error.message || 'network error' };
      options.error(xhr, error.name === 'AbortError' ? 'timeout' : 'error', xhr.statusText);
    } else {
      console.error('Background request failed:', error);
    }
    return undefined;
  }).finally(() => {
    if(timeoutId) clearTimeout(timeoutId);
  });
}

globalThis.$ = {
  ajax: workerAjax,
  notify(message, type) {
    console[type === 'error' ? 'error' : 'log'](message);
  },
};
