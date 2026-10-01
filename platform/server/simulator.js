// Simulador de nodos ESP32 (DHT22 + PIR).
//
// Cada nodo simulado abre su PROPIA conexión MQTT con Last-Will, publica exactamente el mismo
// formato que el firmware real (firmware/esp32_campus_iot) y escucha su tópico de comandos.
// Así el dato recorre el mismo camino que el de un ESP32 físico: nodo → broker → plataforma.
//
// Uso independiente:  node server/simulator.js [--url mqtt://localhost:1883]
import mqtt from 'mqtt';
import { BUILDINGS } from './config.js';

const FW = '1.0.0-sim';

const DEFAULT_NODES = [
  { id: 'sim-admin-a1', building: 'A', ip: '10.10.3.21', base: 23.2, hum: 48, motionPerMin: 0.35 },
  { id: 'sim-aulas-b1', building: 'B', ip: '10.10.3.22', base: 25.4, hum: 58, motionPerMin: 1.2 },
  { id: 'sim-lab-c2', building: 'C', ip: '10.10.3.23', base: 25.6, hum: 46, motionPerMin: 0.7 },
  { id: 'sim-biblio-d1', building: 'D', ip: '10.10.3.24', base: 22.1, hum: 52, motionPerMin: 0.5 },
];

const rand = (a, b) => a + Math.random() * (b - a);
const gauss = () => {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const macFor = (i) => `24:0A:C4:3C:${(0x10 + i).toString(16).toUpperCase()}:${(0xa0 + i * 7).toString(16).toUpperCase()}`;

class SimNode {
  constructor(spec, index, opts) {
    Object.assign(this, spec);
    this.opts = opts;
    this.mac = macFor(index);
    this.slug = BUILDINGS[spec.building]?.slug ?? spec.building;
    this.topic = `${opts.topicRoot}/${this.slug}/${spec.id}`;
    this.interval = opts.interval ?? 5;
    this.seq = 0;
    this.started = Date.now();
    // Estado del proceso físico simulado
    this.drift = 0;          // Ornstein–Uhlenbeck sobre la temperatura
    this.humDrift = 0;
    this.rssi = Math.round(rand(-68, -52));
    this.motion = 0;
    this.motionUntil = 0;
    this.motionCount = 0;
    this.spike = null;       // { delta, t0, hold, decay }
  }

  connect() {
    const { url, user, pass } = this.opts;
    this.client = mqtt.connect(url, {
      clientId: this.id,
      username: user,
      password: pass,
      reconnectPeriod: 3000,
      will: { topic: `${this.topic}/status`, payload: JSON.stringify({ state: 'offline' }), qos: 1, retain: true },
    });
    this.client.on('connect', () => {
      this.client.publish(`${this.topic}/status`, JSON.stringify(this.statusPayload()), { qos: 1, retain: true });
      this.client.subscribe(`${this.topic}/cmd`);
    });
    this.client.on('message', (_t, buf) => this.onCommand(buf));
    this.client.on('error', () => {});
    this.schedule();
    this.motionTimer = setInterval(() => this.tickMotion(), 1000);
  }

  statusPayload() {
    return { state: 'online', ip: this.ip, mac: this.mac, rssi: this.rssi, fw: FW, interval: this.interval,
      sensor: 'DHT22+PIR', src: 'simulador' };
  }

  schedule() {
    clearInterval(this.timer);
    this.timer = setInterval(() => this.publishTelemetry(), this.interval * 1000);
  }

  onCommand(buf) {
    let cmd;
    try { cmd = JSON.parse(buf.toString()); } catch { return; }
    if (cmd.interval) {
      this.interval = Math.min(300, Math.max(2, Number(cmd.interval)));
      this.schedule();
      this.client.publish(`${this.topic}/status`, JSON.stringify(this.statusPayload()), { qos: 1, retain: true });
    }
    if (cmd.identify) {
      this.client.publish(`${this.topic}/ack`, JSON.stringify({ identify: true, ts: Date.now() }));
    }
  }

  // Temperatura = base del edificio + ciclo diario + deriva lenta + ruido del DHT22 (±0.5 °C) + pico inyectado
  readTemp(now) {
    const hour = new Date(now).getHours() + new Date(now).getMinutes() / 60;
    const daily = 1.8 * Math.sin(((hour - 9) / 24) * 2 * Math.PI);
    this.drift += -0.08 * this.drift + 0.12 * gauss();
    const occupancy = this.motion ? 0.25 : 0;
    return this.base_ + daily + this.drift + occupancy + this.spikeOffset(now) + 0.08 * gauss();
  }

  get base_() { return this.opts.baseOverride?.[this.id] ?? this.baseTempC; }

  spikeOffset(now) {
    if (!this.spike) return 0;
    const { delta, t0, rise, hold, decay } = this.spike;
    const t = (now - t0) / 1000;
    if (t < rise) return delta * (t / rise);
    if (t < rise + hold) return delta;
    const d = t - rise - hold;
    if (d > decay * 4) { this.spike = null; return 0; }
    return delta * Math.exp(-d / decay);
  }

  tickMotion() {
    const now = Date.now();
    const wasActive = this.motion;
    if (this.forcedMotionUntil && now < this.forcedMotionUntil) this.motion = 1;
    else if (now < this.motionUntil) this.motion = 1;
    else if (Math.random() < this.motionPerMin / 60) {
      this.motionUntil = now + rand(3000, 9000);
      this.motion = 1;
    } else this.motion = 0;

    if (this.motion !== wasActive) {
      if (this.motion) this.motionCount++;
      this.client?.publish(`${this.topic}/motion`, JSON.stringify({ node: this.id, motion: this.motion, ts: now }));
    }
  }

  publishTelemetry() {
    if (!this.client?.connected) return;
    const now = Date.now();
    const temp = this.readTemp(now);
    this.humDrift += -0.06 * this.humDrift + 0.35 * gauss();
    const hum = Math.min(99, Math.max(5, this.hum - (temp - this.base_) * 1.1 + this.humDrift));
    this.rssi = Math.round(Math.min(-40, Math.max(-85, this.rssi + gauss() * 1.2)));
    const payload = {
      node: this.id,
      building: this.building,
      temp: Math.round(temp * 10) / 10,
      hum: Math.round(hum * 10) / 10,
      motion: this.motion,
      motionCount: this.motionCount,
      rssi: this.rssi,
      ip: this.ip,
      uptime: Math.round((now - this.started) / 1000),
      seq: ++this.seq,
      ts: Math.round(now / 1000),
      fw: FW,
      src: 'simulador',
    };
    this.motionCount = 0;
    this.client.publish(`${this.topic}/telemetry`, JSON.stringify(payload), { qos: 0 });
  }

  stop() {
    clearInterval(this.timer);
    clearInterval(this.motionTimer);
    // Cierre "limpio": publicamos offline nosotros mismos (el LWT solo se dispara en caídas abruptas).
    if (this.client?.connected) {
      this.client.publish(`${this.topic}/status`, JSON.stringify({ state: 'offline' }), { qos: 1, retain: true },
        () => this.client.end());
    } else this.client?.end(true);
  }
}

export function startSimulator(opts) {
  const options = { topicRoot: 'campus/iot', interval: 5, ...opts };
  const nodes = new Map();
  let running = false;

  const api = {
    get running() { return running; },
    get nodeIds() { return [...nodes.keys()]; },
    start() {
      if (running) return;
      running = true;
      DEFAULT_NODES.forEach((spec, i) => {
        const n = new SimNode({ ...spec, baseTempC: spec.base }, i, options);
        n.connect();
        nodes.set(n.id, n);
      });
    },
    stop() {
      running = false;
      for (const n of nodes.values()) n.stop();
      nodes.clear();
    },
    // Inyecta un "golpe de calor" para demostrar las alertas en la defensa.
    heatSpike(id, delta = 8) {
      const n = nodes.get(id) ?? [...nodes.values()][0];
      if (!n) return false;
      n.spike = { delta, t0: Date.now(), rise: 12, hold: 25, decay: 20 };
      return n.id;
    },
    triggerMotion(id, seconds = 6) {
      const n = nodes.get(id) ?? [...nodes.values()][0];
      if (!n) return false;
      n.forcedMotionUntil = Date.now() + seconds * 1000;
      n.tickMotion();
      return n.id;
    },
  };
  return api;
}

// Ejecución independiente (fuera del servidor): node server/simulator.js
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('simulator.js')) {
  const i = process.argv.indexOf('--url');
  const sim = startSimulator({
    url: i > 0 ? process.argv[i + 1] : process.env.MQTT_URL ?? 'mqtt://localhost:1883',
    user: process.env.SIM_MQTT_USER ?? 'esp32',
    pass: process.env.SIM_MQTT_PASS ?? 'esp32-umg-2026',
  });
  sim.start();
  console.log(`[sim] ${sim.nodeIds.length} nodos ESP32 simulados publicando cada 5 s. Ctrl+C para detener.`);
  process.on('SIGINT', () => { sim.stop(); setTimeout(() => process.exit(0), 500); });
}
