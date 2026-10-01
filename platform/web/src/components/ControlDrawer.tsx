import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { api, useStore } from '../store';
import { Bulb, Download, Flame, Person, Play, Stop, X } from '../icons';

const INTERVALS = [2, 5, 10, 30];

export function ControlDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="scrim"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.25 }}
          />
          <motion.aside
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Controles"
            initial={{ transform: 'translateX(calc(100% + 16px))' }}
            animate={{ transform: 'translateX(0%)' }}
            exit={{ transform: 'translateX(calc(100% + 16px))', transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] } }}
            transition={{ duration: 0.34, ease: [0.32, 0.72, 0, 1] }}
          >
            <header>
              <h3>Controles</h3>
              <button className="btn ghost" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
            </header>
            <div className="body">
              <NodeCommands />
              <ThresholdForm />
              <SimulatorPanel />
              <ExportPanel />
              <BridgeInfo />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function NodeCommands() {
  const node = useStore((s) => (s.selected ? s.nodes[s.selected] : null));
  if (!node) return null;
  const send = async (cmd: Record<string, unknown>, label: string) => {
    const r = await api.cmd(node.id, cmd);
    r.ok ? toast.success(`${label} → ${node.id}`) : toast.error('No se pudo enviar (¿broker desconectado?)');
  };
  return (
    <div className="section">
      <h4>Comandos al nodo · {node.id}</h4>
      <p className="help">Se publican en <span className="mono">…/{node.id}/cmd</span>; el ESP32 los recibe por MQTT.</p>
      <div className="field" style={{ marginBottom: 10 }}>
        <span>Intervalo de publicación</span>
        <div className="segmented">
          {INTERVALS.map((s) => (
            <button key={s} aria-pressed={node.interval === s} onClick={() => send({ interval: s }, `Intervalo ${s} s`)}>{s} s</button>
          ))}
        </div>
      </div>
      <button className="btn" onClick={() => send({ identify: true }, 'Identificar (parpadeo LED)')}>
        <Bulb size={16} /> Identificar (LED)
      </button>
    </div>
  );
}

function ThresholdForm() {
  const th = useStore((s) => s.thresholds);
  const [v, setV] = useState(th);
  useEffect(() => setV(th), [th]);
  const field = (k: keyof typeof th, label: string) => (
    <label className="field">
      <span>{label}</span>
      <input type="number" step="0.5" inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} />
    </label>
  );
  return (
    <form className="section" onSubmit={async (e) => { e.preventDefault(); await api.thresholds(v); toast.success('Umbrales guardados'); }}>
      <h4>Umbrales de alerta</h4>
      <div className="row" style={{ marginBottom: 8 }}>{field('tempLow', 'Temp. mínima °C')}{field('tempHigh', 'Temp. máxima °C')}</div>
      <div className="row" style={{ marginBottom: 12 }}>{field('humLow', 'HR mínima %')}{field('humHigh', 'HR máxima %')}</div>
      <button className="btn primary" type="submit">Guardar umbrales</button>
    </form>
  );
}

function SimulatorPanel() {
  const sim = useStore((s) => s.simulator);
  const selected = useStore((s) => s.selected);
  const target = selected?.startsWith('sim-') ? selected : undefined;
  const run = async (action: string, msg: string) => {
    const r = await api.sim(action, target);
    if (r.error) toast.error(r.error); else toast(msg + (r.result ? ` · ${r.result}` : ''));
  };
  return (
    <div className="section">
      <h4>Simulador de nodos</h4>
      {!sim.available ? (
        <p className="help">No disponible. Inicie la plataforma con <span className="mono">--simulate</span> (o <span className="mono">npm run demo</span>).</p>
      ) : (
        <>
          <p className="help">4 ESP32 virtuales (uno por edificio) publican por MQTT igual que el firmware real. {target ? `Acciones sobre ${target}.` : 'Seleccione un nodo "sim-…" para dirigir las acciones.'}</p>
          <div className="row">
            {sim.running
              ? <button className="btn" onClick={() => run('stop', 'Simulador detenido')}><Stop size={15} /> Detener</button>
              : <button className="btn" onClick={() => run('start', 'Simulador iniciado')}><Play size={15} /> Iniciar</button>}
            <button className="btn danger" disabled={!sim.running} onClick={() => run('heat', 'Golpe de calor inyectado')}><Flame size={15} /> Golpe de calor</button>
            <button className="btn" disabled={!sim.running} onClick={() => run('motion', 'Movimiento simulado')}><Person size={15} /> Movimiento</button>
          </div>
        </>
      )}
    </div>
  );
}

function ExportPanel() {
  const selected = useStore((s) => s.selected);
  return (
    <div className="section">
      <h4>Exportar lecturas (evidencia)</h4>
      <div className="row">
        {selected && <a className="btn" href={`/api/export.csv?node=${encodeURIComponent(selected)}&hours=24`}><Download size={15} /> CSV · {selected}</a>}
        <a className="btn" href="/api/export.csv?hours=24"><Download size={15} /> CSV · todos</a>
      </div>
    </div>
  );
}

function BridgeInfo() {
  const url = `${location.origin}/api/ingest?node=pt-sbc-lab&building=C&temp=24.5&hum=51&motion=0`;
  return (
    <div className="section">
      <h4>Puente Packet Tracer</h4>
      <p className="help">El SBC de Packet Tracer envía sus sensores con <span className="mono">RealHTTPClient</span> a:</p>
      <pre className="code" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{url}</pre>
    </div>
  );
}
