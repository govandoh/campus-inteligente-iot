import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import NumberFlow from '@number-flow/react';
import { Liveline } from 'liveline';
import { api, useStore, type IoTNode, type Point } from '../store';
import { SOURCE_LABEL, STATE_LABEL, ago, clock, comfort, rssiBars, stateDot, tempColor, uptime, useNow } from '../util';
import { Chip, Monitor as MonitorIcon, Server, Shield, Switch, Wifi } from '../icons';

const WINDOWS = [
  { label: '1 min', secs: 60 },
  { label: '5 min', secs: 300 },
  { label: '15 min', secs: 900 },
  { label: '1 h', secs: 3600 },
];

const EMPTY: Point[] = [];

export function MonitorView() {
  const selected = useStore((s) => s.selected);
  const node = useStore((s) => (s.selected ? s.nodes[s.selected] : null));
  const loadHistory = useStore((s) => s.loadHistory);

  useEffect(() => {
    if (!selected) return;
    let cancel = false;
    api.history(selected, 60).then((h) => !cancel && loadHistory(selected, h.points));
    return () => { cancel = true; };
  }, [selected, loadHistory]);

  if (!node) {
    return (
      <div className="card empty">
        <h3>Esperando datos del ESP32</h3>
        <p>
          Encienda el ESP32 (o Wokwi) apuntando al broker, o inicie la demo con <code>npm run demo</code>.
          <br />Los nodos aparecen aquí apenas publican en <code>campus/iot/#</code>.
        </p>
      </div>
    );
  }

  return (
    <>
      <Headline node={node} />
      <section className="hero stagger" key={node.id}>
        <TemperatureCard node={node} />
        <HumidityCard node={node} />
        <MotionCard node={node} />
        <DeviceCard node={node} />
      </section>
      <section className="charts">
        <SeriesChart node={node} metric="temp" />
        <SeriesChart node={node} metric="hum" />
      </section>
      <section className="bottom">
        <Pipeline node={node} />
        <EventLog />
      </section>
    </>
  );
}

function Headline({ node }: { node: IoTNode }) {
  const now = useNow();
  return (
    <div className="headline">
      <div>
        <h2>{node.buildingName} <span className="faint" style={{ fontWeight: 400 }}>· {node.id}</span></h2>
        <div className="sub">
          <span className={`dot ${stateDot(node)}`} />
          <span>{STATE_LABEL[node.state]}</span>
          <span className="faint">·</span>
          <span className={`badge ${node.source ?? ''}`}>{SOURCE_LABEL[node.source ?? ''] ?? node.source}</span>
          <span className="faint">·</span>
          <span>Última lectura {ago(node.lastSeen, now)}</span>
        </div>
      </div>
    </div>
  );
}

function useSeries(id: string, k: 'temp' | 'hum' | 'motion') {
  return useStore((s) => s.series[id]?.[k] ?? EMPTY);
}

function stats(points: Point[], sinceSec: number) {
  const vals = points.filter((p) => p.time >= sinceSec).map((p) => p.value);
  if (!vals.length) return null;
  return { min: Math.min(...vals), max: Math.max(...vals), avg: vals.reduce((a, b) => a + b, 0) / vals.length };
}

function TemperatureCard({ node }: { node: IoTNode }) {
  const t = node.last?.temp ?? null;
  const th = useStore((s) => s.thresholds);
  const pts = useSeries(node.id, 'temp');
  const st = useMemo(() => stats(pts, Date.now() / 1000 - 3600), [pts]);
  // Tendencia: compara con la lectura de hace ~1 minuto
  const trend = useMemo(() => {
    if (pts.length < 2 || t == null) return 0;
    const target = pts[pts.length - 1].time - 60;
    const ref = [...pts].reverse().find((p) => p.time <= target) ?? pts[0];
    const d = t - ref.value;
    return Math.abs(d) < 0.15 ? 0 : d;
  }, [pts, t]);
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - 10) / 30) * 100))}%`;
  const c = comfort(t, node.last?.hum ?? null);
  const color = tempColor(t);

  return (
    <div className="card temp-card">
      <div className="glow" style={{ background: `radial-gradient(60% 50% at 50% 100%, color-mix(in srgb, ${color} 30%, transparent), transparent)` }} />
      <div className="card-head">
        <span className="card-title"><span className="swatch" style={{ background: 'var(--temp)' }} />Temperatura · DHT22</span>
        <span className="badge" style={{ color: `var(--${c.tone})` }}>{c.label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
        <div className="big temp-value" style={{ color }}>
          {t == null ? '—' : <NumberFlow value={t} locales="en-US" format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }} />}
          <span className="unit">°C</span>
        </div>
        <span className="mono" style={{ fontSize: 13, paddingBottom: 8, color: trend > 0 ? 'var(--temp)' : trend < 0 ? 'var(--hum)' : 'var(--text-3)' }}>
          {trend > 0 ? '▲' : trend < 0 ? '▼' : '■'} {trend === 0 ? 'estable' : `${trend > 0 ? '+' : ''}${trend.toFixed(1)}/min`}
        </span>
      </div>
      <div className="thermo" aria-hidden>
        <span className="mark" style={{ left: pos(th.tempLow) }} title={`Mín ${th.tempLow} °C`} />
        <span className="mark" style={{ left: pos(th.tempHigh) }} title={`Máx ${th.tempHigh} °C`} />
        {t != null && <span className="knob" style={{ left: pos(t) }} />}
      </div>
      <div className="thermo-scale"><span>10°</span><span>25°</span><span>40°</span></div>
      <div className="minmax">
        <div><span>Mín 1 h</span><span>{st ? st.min.toFixed(1) : '—'}°</span></div>
        <div><span>Prom.</span><span>{st ? st.avg.toFixed(1) : '—'}°</span></div>
        <div><span>Máx 1 h</span><span>{st ? st.max.toFixed(1) : '—'}°</span></div>
      </div>
      <div className="small-stats">
        <span>Sensación <b>{node.last?.heatIndex ?? '—'}°</b></span>
        <span>Umbral <b>{th.tempHigh}°</b></span>
      </div>
    </div>
  );
}

function HumidityCard({ node }: { node: IoTNode }) {
  const h = node.last?.hum ?? null;
  const th = useStore((s) => s.thresholds);
  const R = 64, C = 2 * Math.PI * R;
  const off = C * (1 - Math.min(100, Math.max(0, h ?? 0)) / 100);
  const out = h != null && (h >= th.humHigh || h <= th.humLow);
  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title"><span className="swatch" style={{ background: 'var(--hum)' }} />Humedad · DHT22</span>
        {out && <span className="badge" style={{ color: 'var(--warn)' }}>Fuera de rango</span>}
      </div>
      <div className="ring-wrap">
        <svg viewBox="0 0 150 150" width="150" height="150" aria-hidden>
          <circle cx="75" cy="75" r={R} stroke="var(--surface-2)" strokeWidth="10" fill="none" />
          <circle className="ring-fg" cx="75" cy="75" r={R} stroke={out ? 'var(--warn)' : 'var(--hum)'} strokeWidth="10" fill="none"
            strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} />
        </svg>
        <div className="ring-center">
          <div className="big">
            {h == null ? '—' : <NumberFlow value={h} locales="en-US" format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }} />}
            <span className="unit">%</span>
          </div>
          <div className="faint" style={{ fontSize: 12 }}>HR</div>
        </div>
      </div>
      <div className="small-stats">
        <span>Punto de rocío <b>{node.last?.dewPoint ?? '—'}°</b></span>
        <span>Rango <b>{th.humLow}–{th.humHigh}%</b></span>
      </div>
    </div>
  );
}

function MotionCard({ node }: { node: IoTNode }) {
  const now = useNow();
  const pts = useSeries(node.id, 'motion');
  // 60 barras = últimos 60 minutos; una barra "encendida" si hubo movimiento en ese minuto.
  const bars = useMemo(() => {
    const nowMin = Math.floor(Date.now() / 60000);
    const set = new Set(pts.filter((p) => p.value > 0).map((p) => Math.floor(p.time / 60)));
    if (node.lastMotionAt) set.add(Math.floor(node.lastMotionAt / 60000));
    return Array.from({ length: 60 }, (_, i) => set.has(nowMin - 59 + i));
  }, [pts, node.lastMotionAt]);
  const active = !!node.motion;
  const occ = bars.filter(Boolean).length;
  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title"><span className="swatch" style={{ background: 'var(--motion)' }} />Movimiento · PIR</span>
        <span className="badge mono">{occ}/60 min</span>
      </div>
      <div className={`radar ${active ? 'active' : ''}`} aria-hidden>
        <span className="ring" /><span className="ring" /><span className="ring" />
        <span className="wave" /><span className="wave" /><span className="wave" />
        <span className="core" style={{ position: 'relative' }} />
      </div>
      <div className={`motion-state ${active ? 'on' : ''}`} aria-live="polite">{active ? 'Presencia detectada' : 'Sin movimiento'}</div>
      <div className="faint" style={{ textAlign: 'center', fontSize: 12 }}>Último evento {ago(node.lastMotionAt, now)}</div>
      <div className="occupancy" aria-label={`Ocupación: ${occ} de los últimos 60 minutos con movimiento`}>
        {bars.map((on, i) => <i key={i} className={on ? 'on' : ''} />)}
      </div>
      <div className="occ-scale"><span>−60 min</span><span>ahora</span></div>
    </div>
  );
}

function DeviceCard({ node }: { node: IoTNode }) {
  const bars = rssiBars(node.rssi);
  const iotSubnet = useStore((s) => s.iotSubnet);
  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">Dispositivo</span>
        <span className={`badge ${node.source ?? ''}`}>{SOURCE_LABEL[node.source ?? ''] ?? node.source}</span>
      </div>
      <dl className="kv">
        <dt>Dirección IP</dt><dd>{node.ip ?? '—'}</dd>
        <dt>VLAN 60</dt>
        <dd>
          <span className="vlan-check" style={{ color: node.inVlan60 ? 'var(--ok)' : 'var(--warn)' }} title={`Subred IoT ${iotSubnet}`}>
            {node.inVlan60 ? '✓ ' : '✗ '}{iotSubnet}
          </span>
        </dd>
        <dt>Señal Wi-Fi</dt>
        <dd>
          <span className="rssi" aria-hidden>
            {[4, 7, 10, 12].map((h, i) => <i key={i} className={i < bars ? 'on' : ''} style={{ height: h }} />)}
          </span>
          {node.rssi != null ? `${node.rssi} dBm` : '—'}
        </dd>
        <dt>MAC</dt><dd>{node.mac ?? '—'}</dd>
        <dt>Firmware</dt><dd>{node.fw ?? '—'}</dd>
        <dt>Intervalo</dt><dd>{node.interval} s</dd>
        <dt>Uptime</dt><dd>{uptime(node.uptime)}</dd>
        <dt>Mensajes</dt><dd><NumberFlow value={node.msgCount} /></dd>
      </dl>
    </div>
  );
}

function SeriesChart({ node, metric }: { node: IoTNode; metric: 'temp' | 'hum' }) {
  const data = useSeries(node.id, metric);
  const th = useStore((s) => s.thresholds);
  const [win, setWin] = useState(300);
  const value = data.length ? data[data.length - 1].value : 0;
  const isTemp = metric === 'temp';
  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">
          <span className="swatch" style={{ background: isTemp ? 'var(--temp)' : 'var(--hum)' }} />
          {isTemp ? 'Temperatura en vivo' : 'Humedad en vivo'}
        </span>
        <span className="chart-val">{data.length} muestras</span>
      </div>
      <div className="chart-box">
        <Liveline
          data={data}
          value={value}
          theme="dark"
          color={isTemp ? '#ff8a4c' : '#4cc3ff'}
          window={win}
          windows={WINDOWS}
          onWindowChange={setWin}
          windowStyle="rounded"
          loading={data.length === 0}
          emptyText="Sin lecturas todavía"
          // La línea de umbral solo aparece cuando el valor se acerca, para no aplastar la escala del gráfico.
          referenceLine={isTemp
            ? (value >= th.tempHigh - 3 ? { value: th.tempHigh, label: `Umbral ${th.tempHigh}°` } : undefined)
            : (value >= th.humHigh - 8 ? { value: th.humHigh, label: `Umbral ${th.humHigh}%` } : undefined)}
          formatValue={(v) => (isTemp ? `${v.toFixed(1)}°C` : `${v.toFixed(1)}%`)}
          formatTime={(t) => clock(t * 1000).slice(0, 5)}
          exaggerate
          momentum
        />
      </div>
    </div>
  );
}

// ───────── Recorrido del dato por la red (explica la arquitectura en la defensa) ─────────
function hopsFor(node: IoTNode) {
  const b = node.building;
  if (node.source === 'wokwi')
    return [
      { icon: Chip, title: 'ESP32 (Wokwi)', sub: node.id },
      { icon: Wifi, title: 'Wokwi-GUEST', sub: 'Wi-Fi simulado' },
      { icon: Switch, title: 'Internet', sub: 'TCP 1883' },
      { icon: Server, title: 'Broker público', sub: 'broker.hivemq.com' },
      { icon: Shield, title: 'Bridge Mosquitto', sub: 'in: campus/iot/#' },
      { icon: MonitorIcon, title: 'Plataforma', sub: 'SSE → dashboard' },
    ];
  if (node.source === 'packet-tracer')
    return [
      { icon: Chip, title: 'SBC-PT', sub: `${node.ip ?? 'VLAN 60'}` },
      { icon: Wifi, title: 'RealHTTPClient', sub: 'script Python' },
      { icon: Switch, title: 'Host (PC)', sub: 'HTTP GET' },
      { icon: MonitorIcon, title: '/api/ingest', sub: 'plataforma :3100' },
      { icon: Server, title: 'Mosquitto', sub: 'republica MQTT' },
      { icon: Shield, title: 'Dashboard', sub: 'SSE en vivo' },
    ];
  return [
    { icon: Chip, title: 'ESP32', sub: node.ip ?? '—' },
    { icon: Wifi, title: `AP-${b}1`, sub: 'SSID CAMPUS-IOT' },
    { icon: Switch, title: `SW-${b}1`, sub: 'VLAN 60 · trunk' },
    { icon: Shield, title: 'SW-CORE (L3)', sub: 'ACL: solo TCP 1883' },
    { icon: Server, title: 'Mosquitto', sub: 'VLAN 50 · :1883' },
    { icon: MonitorIcon, title: 'Plataforma', sub: 'SSE → dashboard' },
  ];
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function Pipeline({ node }: { node: IoTNode }) {
  const pulse = useStore((s) => s.pulse[node.id] ?? 0);
  const payload = useStore((s) => s.lastPayload[node.id]);
  const hops = hopsFor(node);
  const [ref, width] = useWidth<HTMLDivElement>();
  const travel = width * 0.84;

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">Recorrido del dato</span>
        <span className="chart-val">campus/iot/…/{node.id}/telemetry</span>
      </div>
      <div className="pipeline" ref={ref}>
        <div className="track" />
        {pulse > 0 && (
          <motion.span
            key={pulse}
            className="packet"
            initial={{ transform: 'translateX(0px)', opacity: 0 }}
            animate={{ transform: `translateX(${travel}px)`, opacity: [0, 1, 1, 0] }}
            transition={{ duration: 0.9, ease: [0.77, 0, 0.175, 1], opacity: { duration: 0.9, times: [0, 0.1, 0.85, 1] } }}
          />
        )}
        {hops.map((h, i) => (
          <div key={`${pulse}-${i}`} className={`hop ${pulse ? 'flash' : ''}`} style={{ ['--i' as string]: i }}>
            <div className="hop-icon" style={{ animationDelay: `${i * 150}ms` }}><h.icon size={20} /></div>
            <b>{h.title}</b>
            <small>{h.sub}</small>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16 }}>
        <div className="faint" style={{ fontSize: 12, marginBottom: 6 }}>Último payload recibido</div>
        <pre className="code">{payload ? JSON.stringify({ temp: payload.temp, hum: payload.hum, motion: payload.motion, rssi: payload.rssi, src: payload.source }, null, 0) : '—'}</pre>
      </div>
    </div>
  );
}

const FILTERS = [
  { id: 'all', label: 'Todo' },
  { id: 'alert', label: 'Alertas' },
  { id: 'motion', label: 'Movimiento' },
  { id: 'status', label: 'Estado' },
] as const;

function EventLog() {
  const events = useStore((s) => s.events);
  const [f, setF] = useState<(typeof FILTERS)[number]['id']>('all');
  const list = events.filter((e) => f === 'all' || e.kind === f).slice(0, 40);
  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">Registro de eventos</span>
      </div>
      <div className="segmented" style={{ marginBottom: 8 }}>
        {FILTERS.map((x) => (
          <button key={x.id} aria-pressed={f === x.id} onClick={() => setF(x.id)}>{x.label}</button>
        ))}
      </div>
      <div className="events">
        <AnimatePresence initial={false}>
          {list.map((e) => (
            <motion.div
              key={e.id}
              className="event"
              initial={{ opacity: 0, transform: 'translateY(-4px)' }}
              animate={{ opacity: 1, transform: 'translateY(0px)' }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            >
              <span className={`dot ${e.kind === 'motion' ? 'motion' : e.level}`} />
              <span>{e.msg}</span>
              <time>{clock(e.ts)}</time>
            </motion.div>
          ))}
        </AnimatePresence>
        {list.length === 0 && <div className="faint" style={{ padding: 8, fontSize: 13 }}>Sin eventos.</div>}
      </div>
    </div>
  );
}
