import { toast } from 'sonner';
import { useStore } from '../store';
import { Alert, Check, Copy } from '../icons';
import { SOURCE_LABEL, ago, useNow } from '../util';

const ACL = `! SW-CORE (L3) — la VLAN 60 solo habla con SRV-SERVICIOS (DHCP, DNS, NTP, MQTT)
ip access-list extended ACL-IOT
 permit udp any any eq bootps
 permit udp any any eq bootpc
 permit udp any host 10.10.4.2 eq domain
 permit udp any host 10.10.4.2 eq 123
 permit tcp any host 10.10.4.2 eq 1883
 permit tcp any host 10.10.4.2 eq www
 permit icmp any host 10.10.4.2
 deny   ip any 10.10.0.0 0.0.255.255
 permit ip any any
!
interface Vlan60
 ip access-group ACL-IOT in`;

const TOPICS = [
  ['campus/iot/<edificio>/<nodo>/telemetry', 'ESP32 → broker', 'JSON cada N s: temp, hum, motion, rssi, ip…'],
  ['campus/iot/<edificio>/<nodo>/status', 'ESP32 → broker (retenido)', 'online con IP/MAC; offline por Last Will'],
  ['campus/iot/<edificio>/<nodo>/motion', 'ESP32 → broker', 'Evento inmediato del PIR (flanco)'],
  ['campus/iot/<edificio>/<nodo>/cmd', 'plataforma → ESP32', '{"interval":10} · {"identify":true}'],
];

export function EvidenceView() {
  const nodes = Object.values(useStore((s) => s.nodes));
  const broker = useStore((s) => s.broker);
  const connected = useStore((s) => s.connected);
  const iotSubnet = useStore((s) => s.iotSubnet);
  const selected = useStore((s) => s.selected);
  const payload = useStore((s) => (s.selected ? s.lastPayload[s.selected] : undefined));
  const now = useNow();

  const inVlan = nodes.filter((n) => n.inVlan60);
  const receiving = nodes.filter((n) => n.state === 'online' && n.msgCount > 0);
  const real = nodes.filter((n) => n.source && n.source !== 'simulador');

  const checks = [
    {
      n: 5, title: 'ESP32 con conectividad en VLAN 60',
      pass: inVlan.length > 0,
      detail: inVlan.length
        ? `${inVlan.length} nodo(s) con IP en ${iotSubnet}: ${inVlan.map((n) => `${n.id} (${n.ip})`).join(', ')}`
        : `Ningún nodo reporta IP dentro de ${iotSubnet}.`,
    },
    {
      n: 6, title: 'ESP32 → servidor: datos recibidos',
      pass: receiving.length > 0 && !!broker?.connected,
      detail: `${broker?.messages ?? 0} mensajes MQTT procesados · ${receiving.length} nodo(s) publicando · broker ${broker?.connected ? 'conectado' : 'desconectado'} (${broker?.url ?? '—'})`,
    },
    {
      n: 7, title: 'Dashboard: datos visibles',
      pass: connected && receiving.length > 0,
      detail: connected ? 'Flujo Server-Sent Events activo; las lecturas se actualizan en vivo.' : 'El navegador no está conectado al flujo en vivo.',
    },
    {
      n: 0, title: 'Origen de los datos',
      pass: real.length > 0,
      detail: real.length
        ? `Dispositivo(s) no simulado(s): ${real.map((n) => `${n.id} [${SOURCE_LABEL[n.source ?? ''] ?? n.source}]`).join(', ')}`
        : 'Solo hay nodos simulados. Conecte el ESP32 físico o Wokwi para la evidencia final.',
    },
  ];

  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast.success('Copiado al portapapeles'));

  return (
    <section className="evidence">
      <div className="card">
        <div className="card-head"><span className="card-title">Pruebas obligatorias (IoT) — estado en vivo</span></div>
        {checks.map((c) => (
          <div className="check" key={c.title}>
            <span className={`check-icon ${c.pass ? 'pass' : 'fail'}`}>{c.pass ? <Check size={16} /> : <Alert size={15} />}</span>
            <div>
              <h4>{c.n ? `Prueba ${c.n} · ` : ''}{c.title}</h4>
              <p>{c.detail}</p>
            </div>
          </div>
        ))}

        <div className="card-head" style={{ marginTop: 18 }}><span className="card-title">Inventario IoT</span></div>
        <table className="tbl">
          <thead><tr><th>Nodo</th><th>IP</th><th>MAC</th><th>Origen</th><th>Visto</th></tr></thead>
          <tbody>
            {nodes.map((n) => (
              <tr key={n.id}>
                <td>{n.id}</td><td style={{ color: n.inVlan60 ? 'var(--ok)' : 'var(--warn)' }}>{n.ip ?? '—'}</td>
                <td>{n.mac ?? '—'}</td><td>{SOURCE_LABEL[n.source ?? ''] ?? n.source}</td><td>{ago(n.lastSeen, now)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <div className="card">
          <div className="card-head"><span className="card-title">Tópicos MQTT</span></div>
          <table className="tbl">
            <thead><tr><th>Tópico</th><th>Sentido</th></tr></thead>
            <tbody>
              {TOPICS.map(([t, dir, desc]) => (
                <tr key={t} title={desc}><td style={{ overflowWrap: 'anywhere' }}>{t}</td><td style={{ fontFamily: 'var(--font)' }}>{dir}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-head">
            <span className="card-title">Payload en crudo · {selected ?? '—'}</span>
            {payload && <button className="btn ghost" onClick={() => copy(JSON.stringify(payload, null, 2))}><Copy size={14} /> Copiar</button>}
          </div>
          <pre className="code">{payload ? JSON.stringify(payload, null, 2) : 'Seleccione un nodo en Monitoreo.'}</pre>
        </div>

        <div className="card">
          <div className="card-head">
            <span className="card-title">ACL de la VLAN 60 (Cisco IOS)</span>
            <button className="btn ghost" onClick={() => copy(ACL)}><Copy size={14} /> Copiar</button>
          </div>
          <pre className="code">{ACL}</pre>
        </div>
      </div>
    </section>
  );
}
