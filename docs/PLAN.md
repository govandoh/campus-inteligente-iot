# Plan — Vía V3 (IoT y servicios): ESP32, MQTT y dashboard

Estado al 30 de septiembre de 2026 · Defensa: **sábado 3 de octubre de 2026**.

## 1. Qué se entrega

| Entregable del enunciado | Dónde está | Estado |
|---|---|---|
| Código ESP32 (.ino) | `firmware/esp32_campus_iot/` | Listo; compila para ESP32 DevKit V1 (core 3.3.x) |
| Broker MQTT (Mosquitto) con autenticación y ACL | `stack/` (Docker) | Listo y probado |
| Servidor + dashboard en tiempo real | `platform/` | Listo y probado |
| Dashboard "clásico" Grafana (opcional) | `stack/` perfil `grafana` | Configurado |
| Integración con Packet Tracer | `packet-tracer/` + `docs/PACKET_TRACER_IOT.md` | Listo (depende de la versión de PT) |
| Simulación sin hardware | Wokwi (`wokwi/`) y simulador integrado | Listo |
| Evidencias de pruebas 5, 6, 7 | Pestaña **Evidencias** del dashboard + capturas | Pendiente: capturar con el ESP32 real |

## 2. Arquitectura

```
                        ┌──────────── Data Center · VLAN 50 (10.10.4.0/27) ────────────┐
ESP32 + DHT22 + PIR     │                                                              │
 (VLAN 60, 10.10.2.x) ──┼─ MQTT :1883 ─▶ Mosquitto ──▶ Plataforma (Node.js) ──SSE──▶ Navegador
Wokwi ─▶ broker público ┼─ bridge ─────▶    │           · SQLite (historial)          (dashboard)
Packet Tracer (SBC) ────┼─ HTTP /api/ingest ─────────▶  · alertas / umbrales
Simulador (4 nodos) ────┼─ MQTT ───────▶    │           · comandos → …/cmd
                        │                   └─▶ Telegraf ─▶ InfluxDB ─▶ Grafana (opcional)
                        └──────────────────────────────────────────────────────────────┘
```

**Decisiones y por qué:**

- **MQTT + Mosquitto** (lo recomienda el enunciado): publicar/suscribir, liviano para el ESP32, *Last Will* para detectar caídas y *retained* para el estado del dispositivo.
- **Plataforma propia en Node.js** en lugar de Node‑RED: hace lo mismo (suscribirse, guardar, alertar) pero además sirve el dashboard, recibe el puente de Packet Tracer y envía comandos al ESP32. Grafana queda como evidencia adicional.
- **Server‑Sent Events**: el servidor empuja cada lectura al navegador al instante, sin recargar.
- **SQLite** integrado en Node 24: historial sin instalar otra base de datos.
- **Docker Compose**: todo el stack se levanta con un comando, igual en cualquier laptop del equipo.

**Direccionamiento real del `.pkt` (fuente de verdad):** VLAN 60 IoT = `10.10.2.0/25` (gateway 10.10.2.1). VLAN 50 Servidores = `10.10.4.0/27`.

| Servicio | IP |
|---|---|
| Gateway VLAN 50 | 10.10.4.1 |
| **SRV-SERVICIOS**: DNS, NTP, Syslog y **broker MQTT** | **10.10.4.2** |
| SRV-WEB | 10.10.4.3 |
| DHCP (todas las VLAN) | SW-CORE (pools locales) |

**Aviso de consistencia:** el `.pkt` usa el VLSM **sin** el 10 % de crecimiento (por ejemplo, ESTUDIANTES /24 e IoT 10.10.2.0/25). La tabla VLSM v5 del análisis inicial (con crecimiento) **no** coincide con el `.pkt`. Se decidió mantener el `.pkt` y alinear el documento técnico y la hoja VLSM a él. Responsable: Sergio.

**Tópicos MQTT:** `campus/iot/<edificio>/<nodo>/{telemetry|status|motion|cmd|ack}`
Ejemplo: `campus/iot/edificioC/esp32-lab-c1/telemetry` → `{"temp":24.6,"hum":55.2,"motion":0,"rssi":-61,"ip":"10.10.3.25",…}`

## 3. Packet Tracer (el bloqueo)

PT no deja entrar ni salir tráfico real de su topología. Solución en tres capas **que se suman, no se reemplazan** (detalle en [PACKET_TRACER_IOT.md](PACKET_TRACER_IOT.md)):

1. **Dentro de PT (obligatoria)**: SBC‑PT en `CAMPUS-IOT` con IP DHCP de la VLAN 60 + ACL `ACL-IOT` → pruebas de conectividad y bloqueo.
2. **Puente PT → plataforma (extra)** con `RealHTTPClient` → los sensores de PT aparecen en el dashboard real.
3. **ESP32 físico (obligatoria; Wokwi si falla el hardware)** → flujo MQTT real, evidencia principal de las pruebas 6 y 7.

Mínimo para cumplir: capas 1 + 3. Si el puente (capa 2) no funciona en la versión de PT del equipo, no se pierde ninguna prueba.

## 4. Cronograma hasta la defensa

| Día | Tareas | Resultado |
|---|---|---|
| **Mié 30 sep** (hoy) | Stack, plataforma, firmware, Wokwi, guía y script de PT | ✔ Hecho |
| **Jue 1 oct** | Reunión presencial con dos equipos en paralelo — ver [PLAN_REUNION_1OCT.md](PLAN_REUNION_1OCT.md) | ESP32 real en el dashboard; capas 1 y 2 en el `.pkt`; capturas en `evidencias/` |
| **Vie 2 oct** | Redactar la sección "ESP32, IoT y MQTT" del documento técnico con capturas. Ensayar dos veces la demo de 3 minutos (§5). Probar el plan B sin Internet (`npm run demo`) | Documento y demo ensayados |
| **Sáb 3 oct** | Llegar con el stack levantado 30 min antes; verificar Wi‑Fi y firewall | Defensa |

Responsable principal: **Jonathan** (IoT y documentación). Apoyo: **Diego** (monitoreo) para las capturas de Grafana, **Mario** para la ACL de la VLAN 60 en PT.

## 5. Guion de la demo (3 minutos)

1. **Arquitectura (30 s)** — Pestaña *Monitoreo* → tarjeta *Recorrido del dato*: ESP32 → AP‑IOT `CAMPUS-IOT` → SW‑E4 VLAN 60 → SW‑CORE (ACL-IOT, solo 1883) → broker 10.10.4.2 (VLAN 50) → plataforma. El punto naranja recorre la ruta con cada mensaje.
2. **Datos en vivo (45 s)** — Tomar el DHT22 con los dedos: la temperatura sube en tiempo real. Pasar la mano frente al PIR: el radar se activa y queda en el registro.
3. **Alertas (30 s)** — *Controles → Umbrales*: bajar la temperatura máxima por debajo del valor actual → toast rojo y evento en el registro. Restaurar.
4. **Control remoto (20 s)** — *Identificar (LED)*: el LED del ESP32 parpadea (comando MQTT de bajada).
5. **Falla simulada (30 s)** — Desconectar el USB: en ~20 s el *Last Will* marca el nodo **Desconectado**. Reconectar: vuelve solo.
6. **Evidencias (15 s)** — Pestaña *Evidencias*: pruebas 5, 6, 7 en verde, inventario IoT y ACL.

## 6. Respuestas de defensa (IoT)

**¿Cómo protegerían el ESP32?** VLAN 60 aislada + ACL que solo permite DHCP, DNS, NTP y TCP 1883 al broker; WPA2 en `CAMPUS-IOT`; MQTT sin anónimos, con usuario y ACL por tópico (el ESP32 no puede leer datos de otros nodos: probado); credenciales fuera del repositorio; *Last Will* para detectar desconexiones. Mejora: TLS en 8883, Secure Boot / Flash Encryption y OTA firmado.

**¿Cómo escalaría a 500 dispositivos IoT?**
1. *Direccionamiento:* la VLAN 60 es /25 (126 hosts). Para 500 + 10 % = 550 se necesita **/22** (1022 hosts); con el plan actual se asignaría un bloque libre, p. ej. `10.10.8.0/22`, o varias VLAN IoT por edificio (una /24 cada una) para reducir el dominio de broadcast.
2. *Wi‑Fi:* más AP con el SSID `CAMPUS-IOT`, canales 1/6/11, límite de clientes por AP; controlador WLC.
3. *Broker:* 500 nodos × 1 mensaje / 5 s = 100 mensajes/s, muy por debajo de la capacidad de Mosquitto. Para alta disponibilidad: clúster (EMQX/HiveMQ) o dos brokers en *bridge*.
4. *Seguridad:* un usuario/certificado por dispositivo y ACL por patrón (`pattern write campus/iot/+/%u/telemetry`, ya documentado en `stack/mosquitto/config/acl`).
5. *Datos:* InfluxDB con retención y *downsampling*; la plataforma ya agrupa por tópico `edificio/nodo`.

**¿Cómo detectarían una falla?** *Last Will* del broker (desconexión abrupta), detección de nodo silencioso (sin datos en 3 intervalos), validación de lecturas del sensor (NaN o fuera de rango) y umbrales con histéresis; todo sale como alerta en el dashboard y queda en el registro de eventos.

## 7. Riesgos y plan B

| Riesgo | Plan B |
|---|---|
| El ESP32 o el sensor no llegan / se dañan | Wokwi con el mismo firmware (GUIA §9) o `SIMULATE=1` |
| No hay Internet en el salón | Todo el stack corre local; `npm run demo` ni siquiera necesita Docker (broker embebido) |
| El ESP32 no llega a la laptop | Revisar firewall 1883 y la IP en `MQTT_HOST`; usar hotspot del celular |
| Docker no arranca | `cd platform && npm run demo` (broker Aedes + simulador + dashboard en :3100) |
| El puente de PT no funciona en esa versión | Mostrar capas 1 y 3; explicar la limitación |
