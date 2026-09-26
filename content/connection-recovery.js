(function () {
  "use strict";

  var installFlag = "__drrrBotextRoomRecoveryInstalled";
  if (window[installFlag]) return;
  window[installFlag] = true;

  // Give drrr's native Socket.IO reconnection a chance before reloading the room.
  var reconnectWait = 60 * 1000;
  var retryAfterReload = 5 * 1000;
  var maxRetries = 5;
  var retryCooldown = 60 * 1000;
  var bindStartedAt = Date.now();
  var roomKey = new URL(window.location.href).searchParams.get("id") || window.location.pathname;
  var stateKey = "__drrrBotextRoomRecovery:" + roomKey;
  var enabled = false;
  var socketObserved = false;
  var socketConnected = null;
  var eventsBound = false;
  var stopped = false;
  var recoveryTimer = null;
  var startupTimer = null;
  var pathCheckTimer = null;

  function isRoomPage() {
    return window.location.hostname === "drrr.com" &&
      (window.location.pathname === "/room" || window.location.pathname.indexOf("/room/") === 0);
  }

  function readState() {
    try {
      var state = JSON.parse(window.sessionStorage.getItem(stateKey) || "{}");
      return {
        attempts: Math.max(0, Number(state.attempts) || 0),
        inRecovery: Boolean(state.inRecovery),
        cooldownUntil: Math.max(0, Number(state.cooldownUntil) || 0)
      };
    } catch (error) {
      return { attempts: 0, inRecovery: false, cooldownUntil: 0 };
    }
  }

  function writeState(state) {
    try {
      window.sessionStorage.setItem(stateKey, JSON.stringify(state));
    } catch (error) {
      // Recovery still works for this page load if sessionStorage is unavailable.
    }
  }

  function clearState() {
    try {
      window.sessionStorage.removeItem(stateKey);
    } catch (error) {
      // Ignore storage errors; they must not interrupt the room page.
    }
  }

  function isSocketPayload(payload) {
    return Boolean(payload && typeof payload === "object" &&
      "io" in payload &&
      ("connected" in payload || "disconnected" in payload));
  }

  function clearRecoveryTimer() {
    if (recoveryTimer !== null) {
      window.clearTimeout(recoveryTimer);
      recoveryTimer = null;
    }
  }

  function markConnected() {
    socketObserved = true;
    socketConnected = true;
    clearRecoveryTimer();
    if (startupTimer !== null) {
      window.clearTimeout(startupTimer);
      startupTimer = null;
    }

    var state = readState();
    if (state.attempts || state.inRecovery || state.cooldownUntil) {
      clearState();
      console.info("[drrr-botext recovery] Room connection recovered.");
    }
  }

  function recover(reason) {
    if (!enabled || stopped || !isRoomPage()) return;

    var now = Date.now();
    var state = readState();
    if (state.cooldownUntil > now) {
      clearRecoveryTimer();
      recoveryTimer = window.setTimeout(function () {
        recoveryTimer = null;
        recover("recovery cooldown ended");
      }, state.cooldownUntil - now);
      return;
    }

    if (state.attempts >= maxRetries) {
      state.attempts = 0;
      state.inRecovery = true;
      state.cooldownUntil = now + retryCooldown;
      writeState(state);
      console.warn("[drrr-botext recovery] Reached the retry limit; waiting before trying again.");
      clearRecoveryTimer();
      recoveryTimer = window.setTimeout(function () {
        recoveryTimer = null;
        var nextState = readState();
        nextState.cooldownUntil = 0;
        writeState(nextState);
        recover("retry after cooldown");
      }, retryCooldown);
      return;
    }

    state.attempts += 1;
    state.inRecovery = true;
    state.cooldownUntil = 0;
    writeState(state);
    console.warn(
      "[drrr-botext recovery] Reloading the room to restore its connection (attempt " +
        state.attempts + "/" + maxRetries + "): " + reason
    );
    window.location.replace(window.location.href);
  }

  function scheduleRecovery(reason, delay) {
    if (!enabled || stopped || !isRoomPage() || recoveryTimer !== null) return;
    if (startupTimer !== null) {
      window.clearTimeout(startupTimer);
      startupTimer = null;
    }
    console.warn("[drrr-botext recovery] Connection lost; waiting before recovery: " + reason);
    recoveryTimer = window.setTimeout(function () {
      recoveryTimer = null;
      recover(reason);
    }, delay);
  }

  function onConnectionLost(event, source) {
    if (!isSocketPayload(source)) return;
    socketObserved = true;
    socketConnected = false;
    var state = readState();
    scheduleRecovery(
      "drrr reported a Socket.IO disconnect",
      state.inRecovery ? retryAfterReload : reconnectWait
    );
  }

  function onConnectionBump(event, source) {
    // drrr also uses this event for successful AJAX requests; only the socket
    // payload confirms the persistent room connection itself is back.
    if (!isSocketPayload(source)) return;
    socketObserved = true;
    socketConnected = source.connected === true;
    if (socketConnected) markConnected();
  }

  function startMonitoring() {
    if (!enabled || stopped || !isRoomPage() || !eventsBound) return;
    if (recoveryTimer !== null || startupTimer !== null) return;

    var state = readState();
    if (state.cooldownUntil > Date.now()) {
      recover("recovery cooldown");
      return;
    }
    if (socketConnected === true) {
      markConnected();
      return;
    }
    if (socketConnected === false) {
      scheduleRecovery(
        "drrr reported a Socket.IO disconnect",
        state.inRecovery ? retryAfterReload : reconnectWait
      );
      return;
    }

    if (state.inRecovery && !socketObserved) {
      startupTimer = window.setTimeout(function () {
        startupTimer = null;
        if (enabled && !socketObserved) {
          recover("no Socket.IO connection was established after recovery reload");
        }
      }, retryAfterReload);
    }
  }

  function setEnabled(value) {
    var nextEnabled = Boolean(value);
    if (!nextEnabled) {
      var wasEnabled = enabled;
      enabled = false;
      clearRecoveryTimer();
      if (startupTimer !== null) {
        window.clearTimeout(startupTimer);
        startupTimer = null;
      }
      clearState();
      if (wasEnabled) console.info("[drrr-botext recovery] Room recovery disabled.");
      return;
    }

    if (enabled) {
      if (eventsBound) startMonitoring();
      else bindPageEvents();
      return;
    }
    enabled = true;
    console.info("[drrr-botext recovery] Room recovery enabled.");
    if (eventsBound) startMonitoring();
    else bindPageEvents();
  }

  function onSettingMessage(event) {
    if (event.source !== window || event.origin !== window.location.origin) return;
    var data = event.data;
    if (!data || data.source !== "drrr-botext-extension" ||
        data.type !== "room-recovery-setting") return;
    setEnabled(data.enabled);
  }

  function stopIfRoomPageClosed() {
    if (isRoomPage()) return;
    stopped = true;
    clearRecoveryTimer();
    if (startupTimer !== null) window.clearTimeout(startupTimer);
    if (pathCheckTimer !== null) window.clearInterval(pathCheckTimer);
  }

  function bindPageEvents() {
    if (stopped || !isRoomPage() || eventsBound) return;

    var pageJQuery = window.jQuery;
    if (pageJQuery && pageJQuery.fn && typeof pageJQuery.fn.on === "function") {
      if (startupTimer !== null) {
        window.clearTimeout(startupTimer);
        startupTimer = null;
      }
      pageJQuery(document).on("drrr.connection.bump", onConnectionBump);
      pageJQuery(document).on("drrr.connection.lost", onConnectionLost);
      pageJQuery(document).on("drrr.connection.recovered", markConnected);
      pageJQuery(document).on("drrr.connection.version-update", function () {
        socketObserved = true;
        scheduleRecovery("drrr requested a client update", retryAfterReload);
      });
      eventsBound = true;
      if (enabled) startMonitoring();
      return;
    }

    // At document_start, drrr's jQuery may not have loaded yet.
    if (Date.now() - bindStartedAt < 30 * 1000) {
      window.setTimeout(bindPageEvents, 50);
      return;
    }

    if (enabled && readState().inRecovery) {
      startupTimer = window.setTimeout(function () {
        startupTimer = null;
        if (enabled && !socketObserved) {
          recover("drrr connection events were unavailable after recovery reload");
        }
      }, retryAfterReload);
    }
  }

  window.addEventListener("message", onSettingMessage);
  window.addEventListener("offline", function () {
    socketObserved = true;
    socketConnected = false;
    scheduleRecovery("the browser went offline", reconnectWait);
  });
  pathCheckTimer = window.setInterval(stopIfRoomPageClosed, 5000);
  bindPageEvents();
})();
