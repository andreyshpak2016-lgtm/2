'use strict';

// Voxel Frontier — клиент кооператива.
// Работает поверх WebSocket и не мешает одиночной игре: если сервера нет,
// страница просто остаётся в офлайн-режиме.

(function () {
  const bridge = window.VFNetBridge;
  if (!bridge) return;

  const params = new URLSearchParams(location.search);
  const statusEl = document.getElementById('netStatus');
  const statEl = document.getElementById('netStat');
  const autoConnect = params.has('coop') || location.port === '8138';

  let name = (params.get('name') || '').trim();
  try {
    if (!name) name = (localStorage.getItem('vf-name') || '').trim();
  } catch (err) { /* хранилище недоступно */ }
  if (!name) name = 'Пилот-' + Math.floor(100 + Math.random() * 900);
  try { localStorage.setItem('vf-name', name); } catch (err) { /* ignore */ }

  let ws = null;
  let selfId = null;
  let reconnectAttempt = 0;
  let reconnectTimer = null;
  let stateTimer = null;
  let status = 'off';
  let lastStatusText = '';

  function wsURL() {
    const explicit = params.get('ws');
    if (explicit) return explicit;
    const secure = location.protocol === 'https:';
    const proto = secure ? 'wss:' : 'ws:';
    const host = location.hostname || 'localhost';
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      if (location.port === '8138') return proto + '//' + location.host + '/ws';
    }
    return proto + '//' + host + ':8138/ws';
  }

  function setStatus(text, kind) {
    status = kind || 'off';
    if (statEl) {
      statEl.classList.toggle('online', status === 'on');
      statEl.classList.toggle('connecting', status === 'connecting');
    }
    if (statusEl && text !== lastStatusText) {
      statusEl.textContent = text;
      lastStatusText = text;
    }
  }

  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }

  function startStateLoop() {
    stopStateLoop();
    stateTimer = setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const s = bridge.localState();
      if (!s || !s.playing) return;
      send({
        t: 'state',
        x: s.x, y: s.y, z: s.z,
        yaw: s.yaw, pitch: s.pitch,
        mode: s.mode,
        ship: s.ship,
      });
    }, 100);
  }

  function stopStateLoop() {
    if (stateTimer) {
      clearInterval(stateTimer);
      stateTimer = null;
    }
  }

  function handle(msg) {
    if (!msg || typeof msg.t !== 'string') return;
    if (msg.t === 'welcome') {
      selfId = msg.id;
      bridge.applyEdits(Array.isArray(msg.edits) ? msg.edits : []);
      bridge.applyShip(msg.ship);
      bridge.updatePlayers(Array.isArray(msg.players) ? msg.players : [], selfId);
      const n = Array.isArray(msg.players) ? msg.players.length : 1;
      setStatus('Онлайн · ' + n + ' игр.', 'on');
      return;
    }
    if (msg.t === 'states') {
      bridge.updatePlayers(Array.isArray(msg.players) ? msg.players : [], selfId);
      bridge.applyShip(msg.ship);
      const n = Array.isArray(msg.players) ? msg.players.length : 0;
      setStatus('Онлайн · ' + n + ' игр.', 'on');
      return;
    }
    if (msg.t === 'edit') {
      bridge.applyEdit(msg.k, msg.type);
    }
  }

  function scheduleReconnect() {
    if (!autoConnect || reconnectTimer) return;
    const delay = Math.min(5000, 500 * Math.pow(2, reconnectAttempt++));
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function connect() {
    if (!autoConnect) return;
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;

    setStatus('Подключение…', 'connecting');
    let socket;
    try {
      socket = new WebSocket(wsURL());
    } catch (err) {
      setStatus('Оффлайн', 'off');
      scheduleReconnect();
      return;
    }
    ws = socket;

    socket.onopen = () => {
      reconnectAttempt = 0;
      setStatus('Онлайн', 'on');
      send({ t: 'hello', name });
      startStateLoop();
    };

    socket.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch (err) { return; }
      handle(msg);
    };

    socket.onclose = () => {
      if (ws === socket) ws = null;
      stopStateLoop();
      selfId = null;
      bridge.updatePlayers([], null);
      setStatus('Оффлайн', 'off');
      scheduleReconnect();
    };

    socket.onerror = () => {
      try { socket.close(); } catch (err) { /* ignore */ }
    };
  }

  function disconnect() {
    autoConnect = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      try { ws.close(); } catch (err) { /* ignore */ }
      ws = null;
    }
    stopStateLoop();
    selfId = null;
    bridge.updatePlayers([], null);
    setStatus('Оффлайн', 'off');
  }

  bridge.setHooks({
    onEdit(key, type) {
      send({ t: 'edit', k: key, type });
    },
  });

  window.VFNet = {
    connect,
    disconnect,
    get status() { return status; },
    get selfId() { return selfId; },
    get url() { return wsURL(); },
    snapshot() {
      return {
        status,
        selfId,
        url: wsURL(),
        players: bridge.remoteSnapshot(),
      };
    },
  };

  if (autoConnect) connect();
  else setStatus('Оффлайн', 'off');

  window.addEventListener('beforeunload', () => {
    if (ws) {
      try { ws.close(); } catch (err) { /* ignore */ }
    }
  });
})();
