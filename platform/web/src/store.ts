import { create } from 'zustand';

export type NodeState = 'online' | 'offline' | 'stale' | 'unknown';

export interface Reading {
  ts: number;
  node: string;
  building: string;
  temp: number | null;
  hum: number | null;
  motion: number;
  motionCount: number;
  rssi: number | null;
  source: string;
  heatIndex: number | null;
  dewPoint: number | null;
  deviceTs: number | null;
  sensorError: boolean;
}

export interface IoTNode {
  id: string;
  building: string;
  buildingName: string;
  state: NodeState;
  source: string | null;
  ip: string | null;
  mac: string | null;
  fw: string | null;
  rssi: number | null;
  interval: number;
  lastSeen: number | null;
  firstSeen: number;
  msgCount: number;
  last: Reading | null;
  lastMotionAt: number | null;
  motion: number;
  inVlan60: boolean;
  uptime?: number | null;
  sensor?: string;
}

export interface CampusEvent {
  id: number;
  ts: number;
  node: string | null;
  kind: 'alert' | 'motion' | 'status' | 'info';
  level: 'info' | 'ok' | 'warn' | 'crit';
  msg: string;
}

export interface Thresholds { tempHigh: number; tempLow: number; humHigh: number; humLow: number }
export interface Broker { connected: boolean; url: string; embedded: boolean; since: number | null; messages: number }
export interface Point { time: number; value: number }

interface Series { temp: Point[]; hum: Point[]; motion: Point[] }

const MAX_POINTS = 2400;

interface Store {
  connected: boolean;
  nodes: Record<string, IoTNode>;
  events: CampusEvent[];
  broker: Broker | null;
  thresholds: Thresholds;
  simulator: { available: boolean; running: boolean };
  iotSubnet: string;
  series: Record<string, Series>;
  lastPayload: Record<string, Reading>;
  pulse: Record<string, number>; // contador por nodo; cambia con cada mensaje recibido
  selected: string | null;
  tab: 'monitor' | 'campus' | 'evidence';
  select: (id: string) => void;
  setTab: (t: Store['tab']) => void;
  loadHistory: (id: string, points: { t: number; temp: number | null; hum: number | null; motion: number | null }[]) => void;
}

export const useStore = create<Store>((set, get) => ({
  connected: false,
  nodes: {},
  events: [],
  broker: null,
  thresholds: { tempHigh: 30, tempLow: 16, humHigh: 75, humLow: 25 },
  simulator: { available: false, running: false },
  iotSubnet: '10.10.2.0/25',
  series: {},
  lastPayload: {},
  pulse: {},
  selected: null,
  tab: 'monitor',
  select: (id) => set({ selected: id }),
  setTab: (tab) => set({ tab }),
  loadHistory: (id, points) => {
    const prev = get().series[id] ?? { temp: [], hum: [], motion: [] };
    const firstLive = prev.temp[0]?.time ?? Infinity;
    const older = points.filter((p) => p.t / 1000 < firstLive);
    const toPts = (k: 'temp' | 'hum' | 'motion') =>
      older.filter((p) => p[k] != null).map((p) => ({ time: p.t / 1000, value: Number(p[k]) }));
    set({
      series: {
        ...get().series,
        [id]: {
          temp: [...toPts('temp'), ...prev.temp].slice(-MAX_POINTS),
          hum: [...toPts('hum'), ...prev.hum].slice(-MAX_POINTS),
          motion: [...toPts('motion'), ...prev.motion].slice(-MAX_POINTS),
        },
      },
    });
  },
}));

// ───────────── Conexión en vivo (Server-Sent Events) ─────────────
type Listener = (e: CampusEvent) => void;
const eventListeners = new Set<Listener>();
export const onCampusEvent = (fn: Listener) => { eventListeners.add(fn); return () => { eventListeners.delete(fn); }; };

function appendReading(r: Reading) {
  const s = useStore.getState();
  const prev = s.series[r.node] ?? { temp: [], hum: [], motion: [] };
  const t = r.ts / 1000;
  const push = (arr: Point[], v: number | null) => (v == null ? arr : [...arr.slice(-(MAX_POINTS - 1)), { time: t, value: v }]);
  useStore.setState({
    series: { ...s.series, [r.node]: { temp: push(prev.temp, r.temp), hum: push(prev.hum, r.hum), motion: push(prev.motion, r.motion) } },
    lastPayload: { ...s.lastPayload, [r.node]: r },
    pulse: { ...s.pulse, [r.node]: (s.pulse[r.node] ?? 0) + 1 },
  });
}

export function connectStream() {
  const es = new EventSource('/api/stream');
  es.addEventListener('hello', (m) => {
    const snap = JSON.parse((m as MessageEvent).data);
    const nodes: Record<string, IoTNode> = {};
    for (const n of snap.nodes as IoTNode[]) nodes[n.id] = n;
    const s = useStore.getState();
    useStore.setState({
      connected: true, nodes, events: snap.events, broker: snap.broker, thresholds: snap.thresholds,
      simulator: snap.simulator, iotSubnet: snap.iotSubnet,
      selected: s.selected ?? pickDefault(nodes),
    });
  });
  es.addEventListener('reading', (m) => appendReading(JSON.parse((m as MessageEvent).data)));
  es.addEventListener('node', (m) => {
    const n: IoTNode = JSON.parse((m as MessageEvent).data);
    const s = useStore.getState();
    useStore.setState({ nodes: { ...s.nodes, [n.id]: n }, selected: s.selected ?? n.id });
  });
  es.addEventListener('event', (m) => {
    const e: CampusEvent = JSON.parse((m as MessageEvent).data);
    useStore.setState({ events: [e, ...useStore.getState().events].slice(0, 120) });
    eventListeners.forEach((fn) => fn(e));
  });
  es.addEventListener('broker', (m) => useStore.setState({ broker: JSON.parse((m as MessageEvent).data) }));
  es.addEventListener('thresholds', (m) => useStore.setState({ thresholds: JSON.parse((m as MessageEvent).data) }));
  es.addEventListener('simulator', (m) => useStore.setState({ simulator: JSON.parse((m as MessageEvent).data) }));
  es.onerror = () => useStore.setState({ connected: false });
  return () => es.close();
}

// Prioriza un ESP32 real (no simulado) para la vista principal.
function pickDefault(nodes: Record<string, IoTNode>) {
  const list = Object.values(nodes);
  return (list.find((n) => n.source !== 'simulador' && n.state === 'online') ?? list.find((n) => n.state === 'online') ?? list[0])?.id ?? null;
}

// ───────────── API ─────────────
export const api = {
  history: (node: string, minutes = 60) => fetch(`/api/history?node=${encodeURIComponent(node)}&minutes=${minutes}`).then((r) => r.json()),
  thresholds: (t: Partial<Thresholds>) =>
    fetch('/api/thresholds', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(t) }).then((r) => r.json()),
  cmd: (node: string, cmd: Record<string, unknown>) =>
    fetch('/api/cmd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ node, ...cmd }) }),
  sim: (action: string, node?: string) =>
    fetch('/api/sim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, node }) }).then((r) => r.json()),
};
