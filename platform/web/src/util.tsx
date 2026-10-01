import { useEffect, useState } from 'react';
import type { IoTNode } from './store';

export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function ago(ts: number | null | undefined, now = Date.now()) {
  if (!ts) return '—';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 5) return 'ahora';
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  return `hace ${Math.round(m / 60)} h`;
}

export const clock = (ts: number) =>
  new Date(ts).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

export function uptime(sec?: number | null) {
  if (sec == null) return '—';
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${m} min`;
  return `${m} min ${sec % 60} s`;
}

export const SOURCE_LABEL: Record<string, string> = {
  esp32: 'ESP32 físico',
  wokwi: 'Wokwi',
  simulador: 'Simulado',
  'packet-tracer': 'Packet Tracer',
};

export function stateDot(n?: IoTNode | null) {
  if (!n) return '';
  return n.state === 'online' ? 'ok' : n.state === 'stale' ? 'warn' : n.state === 'offline' ? 'crit' : '';
}

export const STATE_LABEL: Record<string, string> = { online: 'En línea', stale: 'Sin datos', offline: 'Desconectado', unknown: 'Desconocido' };

// Color de temperatura en la escala 10 °C (frío) → 40 °C (muy caliente)
export function tempColor(t: number | null | undefined) {
  if (t == null) return '#6b717b';
  const stops: [number, [number, number, number]][] = [
    [10, [76, 195, 255]], [20, [61, 220, 151]], [27, [255, 194, 76]], [33, [255, 90, 76]],
  ];
  if (t <= stops[0][0]) return `rgb(${stops[0][1].join(',')})`;
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
      const k = (t - t0) / (t1 - t0);
      return `rgb(${c0.map((c, j) => Math.round(c + (c1[j] - c) * k)).join(',')})`;
    }
  }
  return `rgb(${stops[stops.length - 1][1].join(',')})`;
}

export function rssiBars(rssi: number | null | undefined) {
  if (rssi == null) return 0;
  return rssi >= -55 ? 4 : rssi >= -65 ? 3 : rssi >= -75 ? 2 : rssi >= -85 ? 1 : 0;
}

export function comfort(temp: number | null, hum: number | null) {
  if (temp == null || hum == null) return { label: 'Sin lectura', tone: 'faint' };
  if (temp >= 30) return { label: 'Caluroso', tone: 'crit' };
  if (temp <= 17) return { label: 'Frío', tone: 'hum' };
  if (hum >= 70) return { label: 'Húmedo', tone: 'warn' };
  if (hum <= 30) return { label: 'Seco', tone: 'warn' };
  return { label: 'Confortable', tone: 'ok' };
}
