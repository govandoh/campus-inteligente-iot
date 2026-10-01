import { motion } from 'motion/react';
import { useStore, type IoTNode } from '../store';
import { tempColor } from '../util';

// Posiciones del mapa y datos de fibra tomados del análisis inicial (sección 4.3).
const LAYOUT = [
  { id: 'A', name: 'Administración', x: 150, y: 105, fiber: 120, margin: 3.44, loss: 1.06 },
  { id: 'B', name: 'Aulas', x: 750, y: 105, fiber: 190, margin: 3.23, loss: 1.27 },
  { id: 'C', name: 'Laboratorios', x: 750, y: 415, fiber: 260, margin: 3.02, loss: 1.48 },
  { id: 'D', name: 'Biblioteca', x: 150, y: 415, fiber: 330, margin: 2.81, loss: 1.69 },
];
const DC = { x: 450, y: 260 };
const W = 190, H = 96;

function avg(nums: (number | null | undefined)[]) {
  const v = nums.filter((n): n is number => n != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function CampusView() {
  const nodes = useStore((s) => s.nodes);
  const pulse = useStore((s) => s.pulse);
  const select = useStore((s) => s.select);
  const setTab = useStore((s) => s.setTab);
  const byBuilding = (id: string) => Object.values(nodes).filter((n) => n.building === id);

  const open = (list: IoTNode[]) => {
    if (!list.length) return;
    select((list.find((n) => n.source !== 'simulador') ?? list[0]).id);
    setTab('monitor');
  };

  return (
    <section className="campus">
      <div className="card">
        <div className="card-head">
          <span className="card-title">Mapa del campus · backbone 1000BASE-SX / OM4</span>
          <span className="chart-val">clic en un edificio para ver sus sensores</span>
        </div>
        <svg className="campus-map" viewBox="0 0 900 520" role="img" aria-label="Mapa del campus con temperatura por edificio">
          <defs>
            <radialGradient id="dcGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#4cc3ff" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#4cc3ff" stopOpacity="0" />
            </radialGradient>
          </defs>

          {LAYOUT.map((b) => {
            const list = byBuilding(b.id);
            const p = list.reduce((a, n) => a + (pulse[n.id] ?? 0), 0);
            const mx = (b.x + DC.x) / 2, my = (b.y + DC.y) / 2;
            return (
              <g key={`f-${b.id}`}>
                <line x1={b.x} y1={b.y} x2={DC.x} y2={DC.y} stroke="#4cc3ff" strokeOpacity="0.28" strokeWidth="3" />
                {p > 0 && (
                  <motion.line
                    key={p}
                    x1={b.x} y1={b.y} x2={DC.x} y2={DC.y}
                    stroke={tempColor(avg(list.map((n) => n.last?.temp)))} strokeWidth="3.5" strokeLinecap="round"
                    className="fiber-pulse"
                    initial={{ strokeDashoffset: 10, opacity: 1 }}
                    animate={{ strokeDashoffset: -Math.hypot(DC.x - b.x, DC.y - b.y), opacity: [1, 1, 0] }}
                    transition={{ duration: 1.1, ease: [0.77, 0, 0.175, 1] }}
                  />
                )}
                <g transform={`translate(${mx}, ${my})`}>
                  <rect x="-58" y="-12" width="116" height="24" rx="12" fill="#0b0c0e" stroke="rgba(255,255,255,.08)" />
                  <text textAnchor="middle" y="4" fontSize="11" fill="#a3a9b3" fontFamily="var(--mono)">{b.fiber} m · {b.margin} dB</text>
                </g>
              </g>
            );
          })}

          <circle cx={DC.x} cy={DC.y} r="90" fill="url(#dcGlow)" />
          <g transform={`translate(${DC.x - 80}, ${DC.y - 44})`}>
            <rect width="160" height="88" rx="16" fill="#15171b" stroke="rgba(76,195,255,.45)" />
            <text x="80" y="30" textAnchor="middle" fontSize="14" fontWeight="600" fill="#eceef1">Data Center</text>
            <text x="80" y="50" textAnchor="middle" fontSize="11" fill="#a3a9b3" fontFamily="var(--mono)">SW-CORE-1/2 · OSPF</text>
            <text x="80" y="68" textAnchor="middle" fontSize="11" fill="#a3a9b3" fontFamily="var(--mono)">Mosquitto · VLAN 50</text>
          </g>

          {LAYOUT.map((b) => {
            const list = byBuilding(b.id);
            const t = avg(list.map((n) => n.last?.temp));
            const h = avg(list.map((n) => n.last?.hum));
            const moving = list.some((n) => n.motion);
            const color = tempColor(t);
            return (
              <g key={b.id} className="bld" transform={`translate(${b.x - W / 2}, ${b.y - H / 2})`} onClick={() => open(list)}
                role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && open(list)} aria-label={`Edificio ${b.id} ${b.name}`}>
                <rect className="body" width={W} height={H} rx="16" fill="#111316" stroke="rgba(255,255,255,.1)" />
                <rect x="0" y="0" width="5" height={H} rx="2.5" fill={color} opacity={t == null ? 0.25 : 0.9} />
                <text x="18" y="26" fontSize="12" fill="#6b717b">Edificio {b.id}</text>
                <text x="18" y="45" fontSize="14" fontWeight="600" fill="#eceef1">{b.name}</text>
                <text x="18" y="78" fontSize="26" fontWeight="500" fill={color} fontFamily="var(--mono)">{t == null ? '—' : `${t.toFixed(1)}°`}</text>
                <text x={W - 16} y="78" textAnchor="end" fontSize="12" fill="#4cc3ff" fontFamily="var(--mono)">{h == null ? '' : `${h.toFixed(0)}% HR`}</text>
                <text x={W - 16} y="26" textAnchor="end" fontSize="11" fill="#6b717b" fontFamily="var(--mono)">{list.length} nodo{list.length === 1 ? '' : 's'}</text>
                {moving && (
                  <g transform={`translate(${W - 22}, 44)`}>
                    <circle r="5" fill="#b18cff" />
                    <circle r="5" fill="none" stroke="#b18cff" strokeWidth="2">
                      <animate attributeName="r" from="5" to="14" dur="1.4s" repeatCount="indefinite" />
                      <animate attributeName="opacity" from="0.8" to="0" dur="1.4s" repeatCount="indefinite" />
                    </circle>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="card">
        <div className="card-head"><span className="card-title">Resumen por edificio</span></div>
        <table className="tbl">
          <thead><tr><th>Edificio</th><th>Nodos</th><th>Temp.</th><th>HR</th><th>Mov.</th></tr></thead>
          <tbody>
            {LAYOUT.map((b) => {
              const list = byBuilding(b.id);
              const t = avg(list.map((n) => n.last?.temp)), h = avg(list.map((n) => n.last?.hum));
              return (
                <tr key={b.id}>
                  <td style={{ fontFamily: 'var(--font)' }}>{b.id} · {b.name}</td>
                  <td>{list.filter((n) => n.state === 'online').length}/{list.length}</td>
                  <td style={{ color: tempColor(t) }}>{t == null ? '—' : `${t.toFixed(1)}°`}</td>
                  <td>{h == null ? '—' : `${h.toFixed(0)}%`}</td>
                  <td style={{ color: list.some((n) => n.motion) ? 'var(--motion)' : 'var(--text-3)' }}>{list.some((n) => n.motion) ? 'sí' : 'no'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="card-head" style={{ marginTop: 22 }}><span className="card-title">Presupuesto óptico (850 nm, OM4)</span></div>
        <table className="tbl">
          <thead><tr><th>Enlace</th><th>Dist.</th><th>Pérdida</th><th>Margen</th></tr></thead>
          <tbody>
            {LAYOUT.map((b) => (
              <tr key={b.id}>
                <td style={{ fontFamily: 'var(--font)' }}>DC – {b.id}</td>
                <td>{b.fiber} m</td>
                <td>{b.loss.toFixed(2)} dB</td>
                <td style={{ color: 'var(--ok)' }}>{b.margin.toFixed(2)} dB</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="faint" style={{ fontSize: 12, marginTop: 10 }}>
          Presupuesto disponible 7.5 dB (TX −9.5 dBm, RX −17 dBm) con margen de seguridad de 3 dB ya descontado.
        </p>
      </div>
    </section>
  );
}
