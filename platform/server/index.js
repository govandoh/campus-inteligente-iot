// Plataforma IoT — Campus Universitario Inteligente (UMG)
//
//   ESP32 / Wokwi / simulador ──MQTT──▶ Mosquitto ──▶ [esta plataforma] ──SSE──▶ dashboard web
//   Packet Tracer (SBC con RealHTTPClient) ──HTTP /api/ingest──▶ [esta plataforma] ──MQTT──▶ Mosquitto
//
// Responsabilidades: suscribirse a campus/iot/#, validar y guardar lecturas (SQLite), detectar
// nodos caídos, evaluar umbrales/alertas, enviar comandos a los ESP32 y servir el dashboard.
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import mqtt from 'mqtt';
import { config, BUILDINGS, buildingFromSlug } from './config.js';
import { openDb } from './db.js';
import { heatIndex, dewPoint, inSubnet, round1 } from './metrics.js';
import { startSimulator } from './simulator.js';

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const db = openDb(config.dbPath);
const thresholds = { ...config.thresholds };

// ───────────────────────────── Estado en memoria ─────────────────────────────
/** @type {Map<string, any>} */
const nodes = new Map();
const broker = { connected: false, url: config.mqttUrl, embedded: config.embeddedBroker, since: null, messages: 0 };
const alertState = new Map(); // `${node}:${metric}` → true mientras la alerta esté activa

function getNode(id, buildingId) {
  let n = nodes.get(id);
  if (!n) {
    const b = BUILDINGS[buildingId] ?? buildingFromSlug(buildingId ?? '');
    n = {
      id, building: b.id, buildingName: b.name, state: 'unknown', source: null, ip: null, mac: null,
      fw: null, rssi: null, interval: 5, lastSeen: null, firstSeen: Date.now(), msgCount: 0,
      last: null, lastMotionAt: null, motion: 0, inVlan60: false,
    };
    nodes.set(id, n);
  }
  return n;
}

// ───────────────────────────── Server-Sent Events ─────────────────────────────
const clients = new Set();
function broadcast(event, data) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(frame);
}

function emitEvent(e) {
  const ev = { ts: Date.now(), ...e };
  ev.id = db.addEvent(ev);
  broadcast('event', ev);
  return ev;
}

const publicNode = (n) => ({ ...n });

// ───────────────────────────── Procesamiento ─────────────────────────────
function num(v) {
  if (v === undefined || v === null || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function handleTelemetry(nodeId, buildingSlug, p, transport = 'mqtt') {
  const b = buildingFromSlug(p.building ?? buildingSlug);
  const n = getNode(nodeId, b.id);
  const now = Date.now();

  let temp = num(p.temp ?? p.temperatura ?? p.t);
  let hum = num(p.hum ?? p.humedad ?? p.h);
  // Validación física del DHT22 (-40..80 °C, 0..100 %). Lecturas fuera de rango = error de sensor.
  if (temp !== null && (temp < -40 || temp > 80)) temp = null;
  if (hum !== null && (hum < 0 || hum > 100)) hum = null;
  const motion = num(p.motion ?? p.movimiento) ? 1 : 0;

  const wasDown = n.state !== 'online';
  Object.assign(n, {
    state: 'online',
    source: p.src ?? n.source ?? (transport === 'http' ? 'packet-tracer' : 'esp32'),
    ip: p.ip ?? n.ip,
    rssi: num(p.rssi) ?? n.rssi,
    fw: p.fw ?? n.fw,
    lastSeen: now,
    uptime: num(p.uptime),
    seq: num(p.seq),
    msgCount: n.msgCount + 1,
    motion,
  });
  n.inVlan60 = inSubnet(n.ip, config.iotSubnet);
  if (motion) n.lastMotionAt = now;

  const reading = {
    ts: now, node: n.id, building: n.building, temp: round1(temp), hum: round1(hum), motion,
    motionCount: num(p.motionCount) ?? 0, rssi: n.rssi, source: n.source,
    heatIndex: heatIndex(temp, hum), dewPoint: dewPoint(temp, hum),
    deviceTs: num(p.ts), sensorError: temp === null || hum === null,
  };
  n.last = reading;
  db.addReading(reading);
  broadcast('reading', reading);
  broadcast('node', publicNode(n));

  if (wasDown) emitEvent({ node: n.id, kind: 'status', level: 'ok', msg: `${n.id} en línea (${n.source}, ${n.ip ?? 'sin IP'})` });
  if (reading.sensorError) emitEvent({ node: n.id, kind: 'alert', level: 'warn', msg: `${n.id}: lectura inválida del DHT22 (revise cableado/pull-up)` });
  evaluateAlerts(n, reading);
}

function evaluateAlerts(n, r) {
  const rules = [
    ['tempHigh', r.temp, (v) => v >= thresholds.tempHigh, (v) => v < thresholds.tempHigh - 0.5, 'crit',
      (v) => `Temperatura alta en ${n.buildingName}: ${v} °C (umbral ${thresholds.tempHigh} °C)`],
    ['tempLow', r.temp, (v) => v <= thresholds.tempLow, (v) => v > thresholds.tempLow + 0.5, 'warn',
      (v) => `Temperatura baja en ${n.buildingName}: ${v} °C (umbral ${thresholds.tempLow} °C)`],
    ['humHigh', r.hum, (v) => v >= thresholds.humHigh, (v) => v < thresholds.humHigh - 1, 'warn',
      (v) => `Humedad alta en ${n.buildingName}: ${v} % (umbral ${thresholds.humHigh} %)`],
    ['humLow', r.hum, (v) => v <= thresholds.humLow, (v) => v > thresholds.humLow + 1, 'warn',
      (v) => `Humedad baja en ${n.buildingName}: ${v} % (umbral ${thresholds.humLow} %)`],
  ];
  for (const [key, value, trigger, clear, level, msg] of rules) {
    if (value === null || value === undefined) continue;
    const k = `${n.id}:${key}`;
    if (!alertState.get(k) && trigger(value)) {
      alertState.set(k, true);
      emitEvent({ node: n.id, kind: 'alert', level, msg: msg(value) });
    } else if (alertState.get(k) && clear(value)) {
      alertState.delete(k);
      emitEvent({ node: n.id, kind: 'alert', level: 'ok', msg: `${n.id}: ${key.startsWith('temp') ? 'temperatura' : 'humedad'} normalizada (${value})` });
    }
  }
}

function handleStatus(nodeId, buildingSlug, p) {
  const n = getNode(nodeId, buildingFromSlug(buildingSlug).id);
  const prev = n.state;
  if (p.state === 'offline') {
    n.state = 'offline';
    // Solo es alarma si el nodo estaba vivo; un "offline" retenido al arrancar la plataforma no lo es.
    if (prev === 'online' || prev === 'stale') emitEvent({ node: n.id, kind: 'status', level: 'crit', msg: `${n.id} desconectado (Last Will MQTT)` });
  } else {
    Object.assign(n, {
      state: 'online', ip: p.ip ?? n.ip, mac: p.mac ?? n.mac, fw: p.fw ?? n.fw, rssi: num(p.rssi) ?? n.rssi,
      interval: num(p.interval) ?? n.interval, sensor: p.sensor ?? n.sensor, source: p.src ?? n.source ?? 'esp32',
      lastSeen: Date.now(),
    });
    n.inVlan60 = inSubnet(n.ip, config.iotSubnet);
    if (prev !== 'online') emitEvent({ node: n.id, kind: 'status', level: 'ok', msg: `${n.id} conectado al broker · IP ${n.ip ?? '?'}${n.inVlan60 ? ' (VLAN 60 ✓)' : ''}` });
  }
  broadcast('node', publicNode(n));
}

function handleMotion(nodeId, buildingSlug, p) {
  const n = getNode(nodeId, buildingFromSlug(buildingSlug).id);
  n.motion = num(p.motion) ? 1 : 0;
  n.lastSeen = Date.now();
  if (n.motion) {
    n.lastMotionAt = Date.now();
    emitEvent({ node: n.id, kind: 'motion', level: 'info', msg: `Movimiento detectado en ${n.buildingName} (${n.id})` });
  }
  broadcast('motion', { node: n.id, motion: n.motion, ts: Date.now() });
  broadcast('node', publicNode(n));
}

// Detección de nodos "silenciosos": si no llega nada en 3 intervalos, se marca como sin datos.
setInterval(() => {
  const now = Date.now();
  for (const n of nodes.values()) {
    if (n.state === 'online' && n.lastSeen && now - n.lastSeen > Math.max(15000, n.interval * 3000)) {
      n.state = 'stale';
      emitEvent({ node: n.id, kind: 'status', level: 'warn', msg: `${n.id} sin datos desde hace ${Math.round((now - n.lastSeen) / 1000)} s` });
      broadcast('node', publicNode(n));
    }
  }
}, 2000);
setInterval(() => db.prune(config.retentionDays), 3600_000);

// ───────────────────────────── MQTT ─────────────────────────────
async function startEmbeddedBroker() {
  const { Aedes } = await import('aedes');
  const aedes = await Aedes.createBroker();
  await new Promise((resolve, reject) => {
    const srv = net.createServer(aedes.handle);
    srv.once('error', reject);
    srv.listen(config.embeddedBrokerPort, '0.0.0.0', resolve);
  });
  log(`[broker] MQTT embebido (Aedes) escuchando en :${config.embeddedBrokerPort} — solo para demo sin Mosquitto`);
}

let mq;
function connectMqtt() {
  const root = config.topicRoot;
  mq = mqtt.connect(config.mqttUrl, {
    clientId: `plataforma-${Math.random().toString(16).slice(2, 8)}`,
    username: config.mqttUser,
    password: config.mqttPass,
    reconnectPeriod: 3000,
  });
  mq.on('connect', () => {
    broker.connected = true;
    broker.since = Date.now();
    log(`[mqtt] conectado a ${config.mqttUrl}`);
    mq.subscribe(`${root}/#`, { qos: 1 });
    broadcast('broker', broker);
    emitEvent({ kind: 'info', level: 'ok', msg: `Plataforma suscrita a ${root}/# en ${config.mqttUrl}` });
  });
  mq.on('close', () => {
    if (broker.connected) {
      broker.connected = false;
      log('[mqtt] conexión perdida, reintentando…');
      broadcast('broker', broker);
      emitEvent({ kind: 'info', level: 'crit', msg: 'Conexión con el broker MQTT perdida' });
    }
  });
  mq.on('error', (e) => log('[mqtt] error:', e.message));
  mq.on('message', (topic, buf) => {
    if (buf.length === 0) return; // borrado de un mensaje retenido
    broker.messages++;
    // campus/iot/<edificio>/<nodo>/<tipo>
    const parts = topic.slice(root.length + 1).split('/');
    if (parts.length !== 3) return;
    const [building, nodeId, kind] = parts;
    let payload;
    const text = buf.toString();
    try { payload = JSON.parse(text); } catch { payload = { value: text }; }
    if (typeof payload !== 'object' || payload === null) payload = { value: payload };
    try {
      if (kind === 'telemetry') handleTelemetry(nodeId, building, payload);
      else if (kind === 'status') handleStatus(nodeId, building, payload);
      else if (kind === 'motion') handleMotion(nodeId, building, payload);
      else if (kind === 'ack') emitEvent({ node: nodeId, kind: 'info', level: 'info', msg: `${nodeId} confirmó comando: ${text}` });
      // Compatibilidad con el ejemplo del análisis inicial: campus/iot/edificioA/temperatura → "24.5"
      else if (kind === 'temperatura' || kind === 'humedad') handleTelemetry(nodeId, building, { [kind]: payload.value ?? payload });
    } catch (e) {
      log('[mqtt] mensaje inválido en', topic, e.message);
    }
  });
}

function publishCmd(nodeId, cmd) {
  const n = nodes.get(nodeId);
  if (!n || !mq?.connected) return false;
  const slug = BUILDINGS[n.building]?.slug ?? n.building;
  mq.publish(`${config.topicRoot}/${slug}/${n.id}/cmd`, JSON.stringify(cmd), { qos: 1 });
  emitEvent({ node: n.id, kind: 'info', level: 'info', msg: `Comando enviado a ${n.id}: ${JSON.stringify(cmd)}` });
  return true;
}

// ───────────────────────────── HTTP ─────────────────────────────
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return Object.fromEntries(new URLSearchParams(raw)); }
}

let sim = null;

function snapshot() {
  return {
    nodes: [...nodes.values()].map(publicNode),
    events: db.recentEvents(80),
    broker,
    thresholds,
    simulator: { available: !!sim, running: sim?.running ?? false },
    iotSubnet: `${config.iotSubnet.network}/${config.iotSubnet.prefix}`,
    buildings: BUILDINGS,
    serverTime: Date.now(),
  };
}

const routes = {
  'GET /api/state': (_req, res) => send(res, 200, snapshot()),

  'GET /api/stream': (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*' });
    res.write(`retry: 2000\nevent: hello\ndata: ${JSON.stringify(snapshot())}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
  },

  'GET /api/history': (_req, res, url) => {
    const node = url.searchParams.get('node');
    const minutes = Math.min(7 * 1440, Number(url.searchParams.get('minutes') ?? 30));
    const since = Date.now() - minutes * 60000;
    send(res, 200, {
      node, minutes,
      points: db.history(node, since),
      stats: db.stats(node, since),
      motionMinutes: db.motionMinutes(node, Date.now() - 60 * 60000),
    });
  },

  'GET /api/export.csv': (_req, res, url) => {
    const node = url.searchParams.get('node');
    const hours = Number(url.searchParams.get('hours') ?? 24);
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="lecturas-${node ?? 'todos'}-${new Date().toISOString().slice(0, 10)}.csv"` });
    res.end(db.exportCsv(node, Date.now() - hours * 3600000));
  },

  // Puente para Packet Tracer (y cualquier cliente HTTP): acepta GET con query o POST JSON/form.
  // Ej: /api/ingest?node=pt-sbc-lab&building=C&temp=24.5&hum=51&motion=0
  'GET /api/ingest': (req, res, url) => ingest(res, Object.fromEntries(url.searchParams)),
  'POST /api/ingest': async (req, res, url) => ingest(res, { ...Object.fromEntries(url.searchParams), ...(await readBody(req)) }),

  'PUT /api/thresholds': async (req, res) => {
    const body = await readBody(req);
    for (const k of Object.keys(thresholds)) if (num(body[k]) !== null) thresholds[k] = num(body[k]);
    alertState.clear();
    broadcast('thresholds', thresholds);
    emitEvent({ kind: 'info', level: 'info', msg: `Umbrales actualizados: T ${thresholds.tempLow}–${thresholds.tempHigh} °C, HR ${thresholds.humLow}–${thresholds.humHigh} %` });
    send(res, 200, thresholds);
  },

  'POST /api/cmd': async (req, res) => {
    const { node, ...cmd } = await readBody(req);
    send(res, publishCmd(node, cmd) ? 200 : 409, { ok: true });
  },

  'POST /api/sim': async (req, res) => {
    if (!sim) return send(res, 409, { error: 'El simulador no está habilitado (inicie con --simulate o SIMULATE=1)' });
    const { action, node } = await readBody(req);
    let result = null;
    if (action === 'start') { sim.start(); emitEvent({ kind: 'info', level: 'info', msg: 'Simulador de nodos iniciado' }); }
    if (action === 'stop') { sim.stop(); emitEvent({ kind: 'info', level: 'info', msg: 'Simulador de nodos detenido' }); }
    if (action === 'heat') {
      result = sim.heatSpike(node);
      if (result) emitEvent({ node: result, kind: 'info', level: 'info', msg: `Simulación: golpe de calor inyectado en ${result}` });
    }
    if (action === 'motion') result = sim.triggerMotion(node);
    broadcast('simulator', { available: true, running: sim.running });
    send(res, 200, { running: sim.running, result });
  },
};

function ingest(res, p) {
  const node = String(p.node ?? p.id ?? 'pt-sbc-01').replace(/[^\w.-]/g, '').slice(0, 40);
  const b = BUILDINGS[String(p.building ?? 'C').toUpperCase()] ?? buildingFromSlug(p.building ?? 'C');
  const payload = { ...p, node, building: b.id, src: p.src ?? 'packet-tracer', ts: Math.round(Date.now() / 1000) };
  // Se re-publica al broker para que el dato siga el mismo camino (y lo vean Grafana/Telegraf).
  if (mq?.connected) {
    mq.publish(`${config.topicRoot}/${b.slug}/${node}/telemetry`, JSON.stringify(payload), { qos: 1 });
  } else {
    handleTelemetry(node, b.slug, payload, 'http');
  }
  send(res, 200, { ok: true, node, via: mq?.connected ? 'mqtt' : 'directo' });
}

function serveStatic(req, res, url) {
  const safe = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  let file = path.join(config.webDist, safe);
  if (!file.startsWith(config.webDist)) return send(res, 403, 'forbidden', 'text/plain');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(config.webDist, 'index.html');
  if (!fs.existsSync(file)) {
    return send(res, 200, '<h1>Dashboard sin compilar</h1><p>Ejecute <code>npm run build</code> en /platform, o use <code>npm run dev</code> (puerto 5180).</p>', 'text/html; charset=utf-8');
  }
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }
  const handler = routes[`${req.method} ${url.pathname}`];
  try {
    if (handler) return await handler(req, res, url);
    if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'ruta no encontrada' });
    serveStatic(req, res, url);
  } catch (e) {
    log('[http] error', e);
    send(res, 500, { error: e.message });
  }
});

// ───────────────────────────── Arranque ─────────────────────────────
if (config.embeddedBroker) await startEmbeddedBroker();
connectMqtt();
if (config.simulate) {
  sim = startSimulator({
    url: config.embeddedBroker ? `mqtt://127.0.0.1:${config.embeddedBrokerPort}` : config.mqttUrl,
    user: process.env.SIM_MQTT_USER ?? 'esp32',
    pass: process.env.SIM_MQTT_PASS ?? 'esp32-umg-2026',
    topicRoot: config.topicRoot,
  });
  sim.start();
  log(`[sim] ${sim.nodeIds.length} nodos ESP32 simulados activos`);
}
server.listen(config.port, config.host, () => {
  log(`[http] dashboard en http://localhost:${config.port}  ·  API en /api/state  ·  puente PT en /api/ingest`);
});

const shutdown = () => { sim?.stop(); mq?.end(); setTimeout(() => process.exit(0), 400); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
