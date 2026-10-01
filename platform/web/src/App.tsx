import { useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Toaster, toast } from 'sonner';
import { connectStream, onCampusEvent, useStore } from './store';
import { NodeList } from './components/NodeList';
import { MonitorView } from './components/Monitor';
import { CampusView } from './components/Campus';
import { EvidenceView } from './components/Evidence';
import { ControlDrawer } from './components/ControlDrawer';
import { Sliders } from './icons';
import { clock, useNow } from './util';

const TABS = [
  { id: 'monitor', label: 'Monitoreo' },
  { id: 'campus', label: 'Campus' },
  { id: 'evidence', label: 'Evidencias' },
] as const;

export default function App() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const connected = useStore((s) => s.connected);
  const broker = useStore((s) => s.broker);
  const nodes = useStore((s) => s.nodes);
  const iotSubnet = useStore((s) => s.iotSubnet);
  const [drawer, setDrawer] = useState(false);
  const now = useNow();

  useEffect(() => connectStream(), []);

  // Las alertas y cambios de estado importantes se notifican como toast; el movimiento solo va al registro.
  useEffect(
    () =>
      onCampusEvent((e) => {
        if (e.kind === 'motion' || e.level === 'info') return;
        if (e.level === 'crit') toast.error(e.msg);
        else if (e.level === 'warn') toast.warning(e.msg);
        // "En línea" solo se anuncia para dispositivos reales, para no llenar de toasts al arrancar el simulador.
        else if (e.kind === 'alert' || (e.kind === 'status' && !e.node?.startsWith('sim-'))) toast.success(e.msg);
      }),
    []
  );

  const list = Object.values(nodes);
  const online = list.filter((n) => n.state === 'online').length;

  return (
    <MotionConfig reducedMotion="user">
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark">
              <svg width="18" height="18" viewBox="0 0 32 32" aria-hidden>
                <circle cx="16" cy="16" r="4" fill="var(--temp)" />
                <path d="M9 9a10 10 0 0 0 0 14M23 9a10 10 0 0 1 0 14" stroke="var(--temp)" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity=".7" />
              </svg>
            </div>
            <div>
              <h1>Campus Inteligente · IoT</h1>
              <p>UMG · VLAN 60 · {iotSubnet}</p>
            </div>
          </div>

          <nav className="tabs" role="tablist" aria-label="Vistas">
            {TABS.map((t) => (
              <button key={t.id} role="tab" className="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
                {tab === t.id && (
                  <motion.span layoutId="tab-indicator" className="tab-indicator" transition={{ type: 'spring', duration: 0.35, bounce: 0.12 }} />
                )}
                {t.label}
              </button>
            ))}
          </nav>

          <div className="spacer" />

          <div className="pills">
            <span className="pill" title={broker?.url}>
              <span className={`dot ${broker?.connected ? 'ok' : 'crit'}`} />
              {broker?.connected ? `Broker MQTT${broker.embedded ? ' (embebido)' : ''}` : 'Broker desconectado'}
            </span>
            <span className="pill">
              <span className={`dot ${connected ? 'ok live' : 'crit'}`} />
              {connected ? 'En vivo' : 'Reconectando…'}
            </span>
            <span className="pill mono">{online}/{list.length} nodos</span>
            <span className="pill mono">{clock(now)}</span>
          </div>

          <button className="btn" onClick={() => setDrawer(true)}>
            <Sliders size={16} /> Controles
          </button>
        </header>

        <main className={`main ${tab !== 'monitor' ? 'single' : ''}`}>
          {tab === 'monitor' && <NodeList />}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              className="content"
              initial={{ opacity: 0, transform: 'translateY(6px)' }}
              animate={{ opacity: 1, transform: 'translateY(0px)' }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            >
              {tab === 'monitor' && <MonitorView />}
              {tab === 'campus' && <CampusView />}
              {tab === 'evidence' && <EvidenceView />}
            </motion.div>
          </AnimatePresence>
        </main>

        <ControlDrawer open={drawer} onClose={() => setDrawer(false)} />
        <Toaster theme="dark" position="bottom-right" richColors closeButton visibleToasts={4} />
      </div>
    </MotionConfig>
  );
}
