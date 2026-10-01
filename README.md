# Campus Universitario Inteligente — IoT (ESP32 · MQTT · Dashboard)

Proyecto final de Telecomunicaciones · Universidad Mariano Gálvez · defensa 3 de octubre de 2026.
Esta carpeta contiene la vía **V3 — IoT y servicios**: el ESP32 con sensor de temperatura/humedad (DHT22) y movimiento (PIR), el broker Mosquitto, la plataforma con dashboard en tiempo real y la integración con Packet Tracer.

```
ESP32 (DHT22 + PIR) ─Wi‑Fi CAMPUS‑IOT─▶ VLAN 60 ─MQTT─▶ Mosquitto ─▶ Plataforma ─▶ Dashboard
```

## Estructura

| Carpeta | Contenido |
|---|---|
| [`firmware/esp32_campus_iot/`](firmware/esp32_campus_iot) | Código `.ino` del ESP32 (entregable) + `config.example.h` |
| [`wokwi/`](wokwi) | El mismo firmware listo para el simulador Wokwi (plan B sin hardware) |
| [`platform/`](platform) | Plataforma: servidor Node.js (MQTT → SQLite → alertas → SSE) y dashboard web (React) |
| [`stack/`](stack) | Docker Compose: Mosquitto (usuarios + ACL), plataforma y, opcional, InfluxDB + Telegraf + Grafana |
| [`packet-tracer/`](packet-tracer) | Script Python del SBC‑PT que envía los sensores de Packet Tracer al dashboard real |
| [`docs/`](docs) | [Plan](docs/PLAN.md) · [Guía paso a paso del ESP32](docs/GUIA_ESP32.md) · [Packet Tracer e IoT](docs/PACKET_TRACER_IOT.md) |
| [`evidencias/`](evidencias) | Capturas de las 10 pruebas obligatorias (tabla de control) |

**Reunión del jueves 1 de octubre:** organización por equipos y tareas en [docs/PLAN_REUNION_1OCT.md](docs/PLAN_REUNION_1OCT.md).

## Arranque rápido

**Con Docker (recomendado):**

```powershell
cd stack
docker compose up -d --build          # Mosquitto :1883 + Plataforma :3100
# opcional: docker compose --profile grafana up -d   → Grafana en :3101 (admin / ver .env)
```

Abra <http://localhost:3100>. Con `SIMULATE=1` en `stack/.env` hay 4 ESP32 simulados además de los reales.

**Sin Docker (plan B, todo en un proceso):**

```powershell
cd platform
npm install
npm run build
npm run demo      # broker MQTT embebido + 4 nodos simulados + dashboard en :3100
```

**Desarrollo del dashboard:** `npm run dev` en `platform/` (Vite en :5180 con recarga en caliente, API en :3100).

## Dashboard

- **Monitoreo:** temperatura, humedad, sensación térmica, punto de rocío, movimiento (radar + ocupación de la última hora), datos del dispositivo (IP, verificación VLAN 60, RSSI, MAC, uptime), gráficas en vivo, recorrido del dato por la red y registro de eventos.
- **Campus:** mapa con los 4 edificios y el Data Center, temperatura por edificio, enlaces de fibra con su margen óptico.
- **Evidencias:** pruebas obligatorias 5, 6 y 7 evaluadas en vivo, inventario IoT, tópicos MQTT, payload en crudo y ACL de la VLAN 60.
- **Controles:** umbrales de alerta, comandos al ESP32 (intervalo, identificar por LED), simulador (golpe de calor, movimiento) y exportación CSV.

## Credenciales por defecto (cámbielas en `stack/.env`)

| Usuario MQTT | Uso | Permisos (ACL) |
|---|---|---|
| `esp32` | Dispositivos | Escribe `…/telemetry, status, motion, ack`; lee solo `…/cmd` |
| `platform` | Plataforma | Lee/escribe `campus/#` |
| `telegraf` | Grafana | Solo lectura |

Detener todo: `docker compose --profile grafana down` dentro de `stack/`.
