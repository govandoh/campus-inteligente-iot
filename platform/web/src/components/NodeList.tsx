import { motion } from 'motion/react';
import { useStore } from '../store';
import { SOURCE_LABEL, stateDot, tempColor } from '../util';

const ORDER = ['A', 'B', 'C', 'D', 'DC'];

export function NodeList() {
  const nodes = useStore((s) => s.nodes);
  const selected = useStore((s) => s.selected);
  const select = useStore((s) => s.select);

  // Dispositivos reales primero, luego por edificio.
  const list = Object.values(nodes).sort((a, b) => {
    const ra = a.source === 'simulador' ? 1 : 0, rb = b.source === 'simulador' ? 1 : 0;
    return ra - rb || ORDER.indexOf(a.building) - ORDER.indexOf(b.building) || a.id.localeCompare(b.id);
  });

  return (
    <aside className="sidebar">
      <div className="sidebar-label">
        <span>Nodos IoT</span>
        <span className="mono">{list.length}</span>
      </div>
      <div className="node-list" role="listbox" aria-label="Nodos IoT">
        {list.length === 0 && <div className="faint" style={{ padding: 12, fontSize: 13 }}>Esperando el primer mensaje MQTT…</div>}
        {list.map((n) => (
          <button key={n.id} role="option" aria-selected={selected === n.id} className="node-item" onClick={() => select(n.id)}>
            {selected === n.id && <motion.span layoutId="node-sel" className="sel" transition={{ type: 'spring', duration: 0.3, bounce: 0.1 }} />}
            <span className="node-name">
              <span className={`dot ${stateDot(n)}`} />
              <span>{n.id}</span>
            </span>
            <span className="node-temp" style={{ color: tempColor(n.last?.temp) }}>
              {n.last?.temp != null ? `${n.last.temp.toFixed(1)}°` : '—'}
            </span>
            <span className="node-meta">
              <span>Edif. {n.building}</span>
              <span className={`badge ${n.source ?? ''}`}>{SOURCE_LABEL[n.source ?? ''] ?? n.source ?? '—'}</span>
              {n.motion ? <span className="badge" style={{ color: 'var(--motion)' }}>mov.</span> : null}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
