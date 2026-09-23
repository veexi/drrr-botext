
/* require global.js utility.js */

new Handler("music", [],
  {
    sync: {
      [event_musicend]: { /* handle config[MUSIC_MODE] be undefined slightly */
        precond: (config, uis) =>
          config[MUSIC_MODE] !== SINGLE_MODE
          && !empty_list(config, PLAYLIST),
        onevent: (req, config, uis, sender) => {
          function wake_check(){
            sendTab({
              fn: is_playing,
            }, undefined, ([active, after]) => {
              if(!active){
                if(after === undefined || after > getDelay(config) - 5)
                  play_next(config)
                else sendTab({
                  fn: set_timeout,
                  args: {
                    event: event_timeout,
                    duration: (getDelay(config) - after + 5) * 1000
                  }
                });
              }
            });
          }
          console.log("wait for delay", getDelay(config), 's');
          wake_check();
        }
      },
      [event_timeout]: {
        precond: (config, uis) =>
          config[MUSIC_MODE] !== SINGLE_MODE
          && !empty_list(config, PLAYLIST),
        onevent: (req, config, uis, sender) => {
          function wake_check(){
            sendTab({
              fn: is_playing,
            }, undefined, ([active, after]) => {
              if(!active){
                if(after === undefined || after > getDelay(config) - 5)
                  play_next(config)
                else sendTab({
                  fn: set_timeout,
                  args: {
                    event: event_timeout,
                    duration: (getDelay(config) - after + 5) * 1000
                  }
                });
              }
            });
          }
          console.log("re-wait for delay", getDelay(config), 's');
          wake_check();
        }
      }
    }
  }
);

function generate_notification(req){
  const note = req.notification;
  var func = () => {
    const notificationId = note.url || note.sel || undefined;
    const create = () => chrome.notifications.create(notificationId, {
        type: "basic",
        iconUrl: '/icon.png',
        title: note.title,
        message: note.msg
      });
    if(notificationId && (note.url || note.sel)){
      rememberNotificationAction(notificationId, {
            url: note.url || '',
            sel: note.sel || '',
            exit: Boolean(note.exit),
      }, create);
    } else create();
  };

  if(note.clear){
    chrome.notifications.getAll((notes)=>{
      for(n in notes)
        if(n.match(new RegExp(note.pattern)))
          chrome.notifications.clear(n);
      func();
    })
  }
  else func();
}

function notificationActionKey(notificationId){
  return `drrr-notification-action:${notificationId}`;
}

// Extension service worker events must be registered synchronously when the
// worker starts. The action itself is persisted so clicks still work after an
// idle shutdown/restart.
chrome.notifications.onClicked.addListener((notificationId) => {
  const key = notificationActionKey(notificationId);
  chrome.storage.local.get(key, (stored) => {
    const action = stored[key];
    if(action){
      chrome.storage.local.remove(key);
      if(action.url){
        if(action.exit){
          sendTab({ fn: leave_room, args: {jump: action.url} });
        }
        else if(action.url.includes('drrr_webpage')){
          chrome.tabs.create({
            active: false,
            pinned: false,
            url: 'https://drrr.com/'
          });
        }
        else chrome.tabs.update({url: action.url});

        chrome.notifications.getAll((notes)=>{
          for(const id in notes)
            if(id.startsWith('https://drrr.com/room/?id='))
              chrome.notifications.clear(id);
        });
      }
      else if(action.sel){
        sendTab({ fn: scroll_to, args: {sel: action.sel}}, undefined, undefined, undefined, 'https://drrr.com/lounge/*');
      }
      chrome.notifications.clear(notificationId);
      return;
    }

    if(notificationId.startsWith('URL')){
      chrome.tabs.create({url: notificationId.substring(3)});
      chrome.notifications.clear(notificationId);
    }
    else if(notificationId.startsWith('chrome-extension://')){
      chrome.tabs.create({url: notificationId});
      chrome.notifications.clear(notificationId);
    }
  });
});

chrome.notifications.onClosed.addListener((notificationId) => {
  chrome.storage.local.remove(notificationActionKey(notificationId));
});

var error403 = 0;
chrome.runtime.onMessage.addListener((req, sender, callback) => {

  if(req && req.__drrrLambdaHeartbeat){
    callback && callback();
    return;
  }

  if(req && req.closeTab){
    chrome.tabs.remove(sender.tab.id, function() { });
  }
  else if(req && req.uninstallSelf){
    chrome.management.uninstallSelf().then(
          null, (error) => console.log(`Canceled: ${error}`));
  }

  if(isLockedUser){ return callback && callback(); }

  if(req && req.jumpto){
    if(sender.tab && sender.tab.id)
      chrome.tabs.update(sender.tab.id, { url: req.jumpto });
    else chrome.tabs.update({ url: req.jumpto });
  }
  else if(req && req.clearNotes){
    chrome.notifications.getAll((notes)=>{
      for(n in notes)
        if(n.match(new RegExp(req.pattern)))
          chrome.notifications.clear(n);
    })
  }
  else if(req && req.newTab){
    chrome.tabs.create({
      url: req.newTab
    });
  }
  else if(req && req.saveCookie){
    chrome.cookies.getAll({
      url : 'https://drrr.com'
    }, function(cookies){
      cookies = cookies.filter(c => c.name === "drrr-session-1")
      chrome.storage.sync.set({
        'profile': req.profile,
        'cookie':cookies
      }, ()=> callback && callback());
    });
    return true; // keep the response channel open for the storage callback
  }
  else if(req && req.setCookies){
    setCookies(req.cookies, callback);
    return true; // keep the response channel open for the cookie callbacks
  }
  else if(req && req.notification){
    generate_notification(req);
  }
  else if(sender.url.match(new RegExp('https://drrr.com/room/.*'))){
    if(req && req.info) drrr.setInfo(req.info);

    if(req.start){
      drrr.getProfile();
      drrr.getLoc();
      drrr.getLounge();
      if(globalThis.__drrrActiveLambdaTimerOwners
        && globalThis.__drrrActiveLambdaTimerOwners.size
        && sender.tab){
        chrome.tabs.sendMessage(sender.tab.id, {
          __drrrLambdaTimerHeartbeat: true
        }, () => void chrome.runtime.lastError);
      }
      callback && callback();
      return;
    }

    let get = drrr.profile ? f => f() : drrr.getProfile;

    get(()=>{

      // for some switch in sync storage
      chrome.storage.sync.get((sconfig) => {
        var reg_funcs = reg_table.sync[req.type] || [];
        for(let handle of reg_funcs){
          handle(req, sconfig, sender, sconfig)
        }

        // for some switch in local storage
        chrome.storage.local.get((lconfig) => {
          var reg_funcs = reg_table.local[req.type] || [];
          for(let handle of reg_funcs){
            handle(req, lconfig, sender, sconfig)
          }

          if(lconfig['select_module']){
            const filename = module_mapping[lconfig['select_module']];
            const module = filename && globalThis.__drrrModules[`module/${filename}`];
            module && module.event_action &&
              module.event_action(req, lconfig, sender, event_action);
          }
          Object.keys(local_functions).forEach((x)=>{
            if(lconfig['switch_' + x]){
              const module = globalThis.__drrrModules[`setting/plugin/${local_functions[x].module_file}`];
              module && module.event_action &&
                module.event_action(req, lconfig, sender, event_action);
            }
          });
        });
      });
    })
  }
  else if(sender.url.match(new RegExp('https://drrr.com/lounge'))){
    if(req && req.start){
      drrr.getLoc();
      drrr.getLounge();
    }
    drrr.getProfile(profile => {
      if(!profile) return;
      req.type = event_lounge;
      req.host = false;
      req.user = profile.name;
      req.trip = profile.tripcode;
      req.text = '';
      req.url = '';
      chrome.storage.sync.get((sconfig) => {
        var reg_funcs = reg_table.sync[req.type] || [];
        for(handle of reg_funcs)
          handle(req, sconfig, sender, sconfig)

        chrome.storage.local.get((lconfig) => {
          var reg_funcs = reg_table.local[req.type] || [];
          for(handle of reg_funcs)
            handle(req, lconfig, sender, sconfig)
        });
      });
    })
  }
  else if(sender.url.match(new RegExp('https://chat.openai.com/chat'))){
    sendTabMessage(req.text);
  }

  if(callback){
    //alert(JSON.stringify(req));
    //console.log(JSON.stringify(req))
    callback();
  }
})

// Check whether new version is installed
chrome.runtime.onInstalled.addListener(function(details){
  if(details.reason == "install"){
    //if(confirm("Do you want to have some default settings? (要加入預設設定嗎？)"))
    // think twice
    if(0) chrome.storage.sync.set({
      "EventAction-setting": [
        [ "msg", "", "^/play\\s+(\\D|\\d\\S)", "plym", [ "$args" ] ],
        [ "msg", "", "^/gif", "umsg", [ "$giphy($1)", "$1" ]]]
    });
  }
  else if(details.reason == "update"){
    var thisVersion = chrome.runtime.getManifest().version;
    console.log("Updated from " + details.previousVersion + " to " + thisVersion + "!");
  }
});
