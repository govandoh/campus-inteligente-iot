// Configuración de la plataforma. Todo se puede sobreescribir con variables de entorno
// (ver stack/.env.example) o con banderas de línea de comandos.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const env = process.env;

const bool = (v, fallback = false) =>
  v === undefined ? fallback : ['1', 'true', 'yes', 'si', 'sí'].includes(String(v).toLowerCase());

export const config = {
  port: Number(env.PORT ?? 3100),
  host: env.HOST ?? '0.0.0.0',

  // Broker MQTT (Mosquitto). En Docker el hostname es "mosquitto".
  mqttUrl: env.MQTT_URL ?? 'mqtt://localhost:1883',
  mqttUser: env.MQTT_USER ?? 'platform',
  mqttPass: env.MQTT_PASS ?? 'platform-umg-2026',

  // Raíz de tópicos. El ESP32 publica en campus/iot/<edificio>/<nodo>/<tipo>.
  topicRoot: env.TOPIC_ROOT ?? 'campus/iot',

  // Broker MQTT embebido (Aedes) para cuando no hay Docker/Mosquitto disponible.
  embeddedBroker: args.has('--embedded-broker') || bool(env.EMBEDDED_BROKER),
  embeddedBrokerPort: Number(env.EMBEDDED_BROKER_PORT ?? 1883),

  // Simulador de nodos ESP32 dentro del mismo proceso.
  simulate: args.has('--simulate') || bool(env.SIMULATE),

  dbPath: env.DB_PATH ?? path.join(here, '..', 'data', 'campus-iot.db'),
  webDist: env.WEB_DIST ?? path.join(here, '..', 'web', 'dist'),

  // Subred de la VLAN 60 (IoT) según el plan VLSM: 10.10.3.0/25.
  iotSubnet: { network: env.IOT_NETWORK ?? '10.10.3.0', prefix: Number(env.IOT_PREFIX ?? 25) },

  // Umbrales de alerta por defecto (se pueden cambiar desde el dashboard).
  thresholds: {
    tempHigh: Number(env.TEMP_HIGH ?? 30),
    tempLow: Number(env.TEMP_LOW ?? 16),
    humHigh: Number(env.HUM_HIGH ?? 75),
    humLow: Number(env.HUM_LOW ?? 25),
  },

  retentionDays: Number(env.RETENTION_DAYS ?? 14),
};

export const BUILDINGS = {
  A: { id: 'A', slug: 'edificioA', name: 'Administración' },
  B: { id: 'B', slug: 'edificioB', name: 'Aulas' },
  C: { id: 'C', slug: 'edificioC', name: 'Laboratorios' },
  D: { id: 'D', slug: 'edificioD', name: 'Biblioteca' },
  DC: { id: 'DC', slug: 'datacenter', name: 'Data Center' },
};

export function buildingFromSlug(slug = '') {
  const s = String(slug).toLowerCase();
  return (
    Object.values(BUILDINGS).find((b) => b.slug.toLowerCase() === s || b.id.toLowerCase() === s) ??
    { id: slug.toUpperCase(), slug, name: slug }
  );
}
