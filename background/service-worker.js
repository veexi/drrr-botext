// Load the legacy background runtime in the service worker's shared global
// scope. The source files are kept separate so the MV2 branch's dependency
// order remains easy to follow; the module-only features are compiled by the
// local build script into a classic-script registry.
globalThis.window = globalThis;
globalThis.alert = (...args) => console.warn('[extension alert]', ...args);

importScripts(
  '/background/mv3-ajax.js',
  '/background/worker-lambda.js',
  '/lib/globals.js',
  '/lib/api.js',
  '/lib/format.js',
  '/module/index.js',
  '/background/utility.js',
  '/background/music.js',
  '/setting/script/drrr.js',
  '/background/action.js',
  '/background/popup.js',
  '/setting/plugin/function.js',
  '/background/worker-modules.js',
  '/background/user-plugins.js',
  '/background/index.js'
);

// Lambda timer/later callbacks still live in the worker's memory. Keep the
// worker active only while those callbacks exist and a Drrr room page is open.
globalThis.__drrrActiveLambdaTimerOwners = new Set();
globalThis.__drrrLambdaTimerActivityChanged = (ownerId, active) => {
  const owners = globalThis.__drrrActiveLambdaTimerOwners;
  const hadTasks = owners.size > 0;
  if(active) owners.add(ownerId);
  else owners.delete(ownerId);
  const hasTasks = owners.size > 0;
  if(hadTasks === hasTasks) return;

  chrome.tabs.query({ url: 'https://drrr.com/room/*' }, tabs => {
    tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, {
      __drrrLambdaTimerHeartbeat: hasTasks
    }, () => void chrome.runtime.lastError));
  });
};
