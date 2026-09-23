const drrrPluginMatches = {
  room: ['https://drrr.com/room/*'],
  lounge: ['https://drrr.com/lounge/*'],
  login: ['https://drrr.com/'],
};

let drrrPluginSyncQueue = Promise.resolve();

function queueDrrrPluginSync(){
  drrrPluginSyncQueue = drrrPluginSyncQueue
    .catch(() => {})
    .then(syncDrrrUserPlugins);
  return drrrPluginSyncQueue;
}

async function setDrrrPluginStatus(status){
  await chrome.storage.local.set({ drrrMv3PluginStatus: status });
}

async function syncDrrrUserPlugins(){
  let userScripts;
  try {
    userScripts = chrome.userScripts;
    if(!userScripts || typeof userScripts.getScripts !== 'function')
      throw new Error('User Scripts API is unavailable');
    await userScripts.getScripts();
  } catch(error) {
    await setDrrrPluginStatus({
      available: false,
      reason: 'user_scripts_disabled',
      detail: error.message,
      issues: [],
      updatedAt: Date.now(),
    });
    return;
  }

  const { plugins = {} } = await chrome.storage.local.get('plugins');
  const names = Object.keys(plugins).filter(name => name !== 'chatroom_hooks');
  if(plugins.chatroom_hooks) names.unshift('chatroom_hooks');

  const scripts = [];
  const issues = [];
  for(const name of names){
    const [mode, location, enabled, source] = plugins[name] || [];
    if(!enabled) continue;

    const matches = drrrPluginMatches[location];
    if(!matches){
      issues.push({ name, reason: 'invalid_location' });
      continue;
    }

    let code = String(source || '');
    if(mode === 'url'){
      let url;
      try {
        url = new URL(code, 'https://drrr.com/');
      } catch(error) {
        issues.push({ name, reason: 'invalid_url' });
        continue;
      }
      if(!['http:', 'https:'].includes(url.protocol)){
        issues.push({ name, reason: 'invalid_url' });
        continue;
      }

      const originPattern = `${url.protocol}//${url.hostname}/*`;
      const allowed = await chrome.permissions.contains({ origins: [originPattern] });
      if(!allowed){
        issues.push({ name, reason: 'host_permission_required', origin: originPattern });
        continue;
      }

      try {
        const response = await fetch(url.href, {
          cache: 'no-store',
          credentials: url.hostname === 'drrr.com' ? 'include' : 'omit',
          signal: AbortSignal.timeout(15000),
        });
        if(!response.ok) throw new Error(`HTTP ${response.status}`);
        code = await response.text();
      } catch(error) {
        issues.push({ name, reason: 'download_failed', detail: error.message });
        continue;
      }
    }
    else if(mode !== 'code'){
      issues.push({ name, reason: 'invalid_mode' });
      continue;
    }

    scripts.push({
      name,
      script: {
        id: `drrr-plugin-${location}-${scripts.length}`,
        matches,
        js: [{ code }],
        runAt: 'document_idle',
        world: 'MAIN',
      },
    });
  }

  try {
    await userScripts.unregister();
    for(const { name, script } of scripts){
      try {
        await userScripts.register([script]);
      } catch(error) {
        issues.push({ name, reason: 'registration_failed', detail: error.message });
      }
    }
    await setDrrrPluginStatus({
      available: true,
      reason: '',
      issues,
      updatedAt: Date.now(),
    });
  } catch(error) {
    await setDrrrPluginStatus({
      available: false,
      reason: 'registration_failed',
      detail: error.message,
      issues,
      updatedAt: Date.now(),
    });
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if(areaName === 'local'
    && (changes.plugins || changes.drrrPluginRefreshAt))
    queueDrrrPluginSync();
});

chrome.runtime.onInstalled.addListener(details => {
  if(details.reason === 'install' || details.reason === 'update')
    queueDrrrPluginSync();
});

chrome.runtime.onStartup.addListener(queueDrrrPluginSync);
