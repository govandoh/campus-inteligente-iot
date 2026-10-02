# Reunión presencial — jueves 1 de octubre

**Meta del día:** al cerrar la noche quedan funcionando y con evidencia las tres capas de IoT, y todo está subido al repositorio. El viernes 2 queda solo para el documento y los ensayos.

> Recordatorio: las capas **se suman**. Mínimo para cumplir = capa 1 (Packet Tracer) + capa 3 (ESP32). La capa 2 (puente PT → dashboard) es un extra. Detalle en [PACKET_TRACER_IOT.md](PACKET_TRACER_IOT.md).

## Organización: 2 equipos + coordinación

Asignación según los roles del análisis inicial (sección 10). Se pueden intercambiar personas; lo importante es que cada bloque tenga dueño.

| Equipo | Integrantes | Responsable de | Necesita |
|---|---|---|---|
| **A — ESP32 físico (capa 3)** | **Jonathan** (IoT) + **Diego** (monitoreo) | Cablear, grabar y conectar el ESP32; stack Docker; dashboard y Grafana; prueba de falla | Laptop con Docker, el kit ESP32, router o celular para `CAMPUS-IOT` |
| **B — Packet Tracer IoT (capas 1 y 2)** | **Mario** (seguridad) + **Sergio** (VLAN/DHCP) | SSID en AP‑IOT, sensores del SBC, pegar `capa1_cli.txt` (ACL + SSH), script puente | Laptop con Packet Tracer y el `.pkt` actual del proyecto |
| **Coordinación** | **Gerardo** | Repositorio, integrar el `.pkt`, acta de las 10 pruebas, sección IoT del documento, desbloquear a los equipos | Laptop con Git |

**Regla del `.pkt`:** Packet Tracer guarda en binario y Git no puede combinar dos versiones. Solo **una persona a la vez** edita el `.pkt` principal (por defecto, el Equipo B durante la mañana/tarde). Quien termina sube, avisa por WhatsApp y entrega el turno.

## Bloque 0 — Arranque (30 min, todos juntos)

1. Cada uno clona el repositorio (ver [Instalaciones](#instalaciones-por-persona)).
2. Repaso de 5 minutos: arquitectura (PLAN §2) y las tres capas.
3. Estado del resto del proyecto en Packet Tracer (OSPF, VLAN, ACL generales, SSH): ¿qué falta? Si falta algo grande, la coordinación lo reparte después del Bloque 2.
4. Verificar el hardware: ESP32, DHT22, PIR, cables, cable USB **de datos**. Si falta algo, comprarlo ahora; mientras tanto el Equipo A avanza con Wokwi.

## Bloque 1 — Construcción en paralelo (2 a 2.5 h)

### Equipo A — ESP32 físico

| # | Tarea | Guía | Terminado cuando… |
|---|---|---|---|
| A1 | Levantar el stack: `cd stack` → `docker compose up -d --build` | README | <http://localhost:3100> muestra los nodos simulados |
| A2 | Instalar Arduino IDE, el core ESP32, las librerías y el driver USB | GUIA §2 | El IDE ve la placa en `COMx` |
| A3 | Cablear DHT22 (D4) y PIR (D27) | GUIA §1 | Conexiones revisadas por los dos |
| A4 | Configurar la red `CAMPUS-IOT` (router 10.10.2.1/25 o hotspot) y reservar `10.10.2.10` para la laptop | GUIA §5 | La laptop tiene IP `10.10.2.10` |
| A5 | Copiar `config.example.h` → `config.h`, completarlo y grabar el ESP32 | GUIA §3–4 | Monitor serie: `[wifi] OK IP=10.10.2.x`, `[mqtt] … OK`, `[pub] OK` |
| A6 | Abrir el firewall de Windows en el puerto 1883 | GUIA §6 | `esp32-lab-c1` aparece en el dashboard con etiqueta **ESP32 físico** |
| A7 | (Diego) Grafana: `docker compose --profile grafana up -d` | README | <http://localhost:3101> muestra el ESP32 |

**Si el hardware no llega o falla:** A5 se hace con Wokwi (GUIA §9). Al final del día, tomar la evidencia con Wokwi y dejar el físico para el viernes.

### Equipo B — Packet Tracer IoT

| # | Tarea | Guía | Terminado cuando… |
|---|---|---|---|
| B1 | AP‑IOT (ya agregado en SW‑E4 Fa0/11, VLAN 60): SSID `CAMPUS-IOT`, WPA2‑PSK | PACKET_TRACER_IOT §Capa 1 | El AP transmite el SSID |
| B2 | Pool DHCP de la VLAN 60 (gateway 10.10.2.1, /25) — ya existe en el `.pkt` | Plan VLSM | — |
| B3 | SBC‑PT `ESP32-SBC` (ya agregado) por Wi‑Fi `CAMPUS-IOT` con DHCP | Capa 1, pasos 1–2 | El SBC tiene `10.10.2.x /25` → **captura prueba 5 (PT)** |
| B4 | Sensores de temperatura, humedad y movimiento conectados al SBC (A0, A1, D0) | Capa 1, paso 3 | Los valores se ven en el SBC |
| B5 | (Mario) Pegar `packet-tracer/capa1_cli.txt` en SW‑CORE y en los switches (ACL por VLAN + SSH) | Capa 1, paso 5 | `ping` del SBC a la VLAN 10 **falla**; `show access-lists` muestra coincidencias → **captura prueba 3** |
| B6 | Activar *External Network Access from Device Scripts* y correr `sbc_puente_plataforma.py` | Capa 2 | `pt-sbc-lab-c1` aparece en el dashboard con etiqueta **Packet Tracer** |

**Si B6 no funciona en su versión de PT:** anotar la versión y el error, y continuar. Es un extra y no bloquea ninguna prueba.

### Coordinación (Gerardo)

- Crear el repositorio e invitar a los 4 (antes del Bloque 0).
- Subir el `.pkt` actual a `packet-tracer/` y llevar el control de turnos.
- Preparar la tabla de las 10 pruebas obligatorias en `evidencias/README.md` y llenarla conforme llegan las capturas.
- Empezar la sección "ESP32, IoT y MQTT" del documento técnico con PLAN §2 y §6.

## Bloque 2 — Integración (45 min, todos)

1. Los dos equipos en la **misma red**: la laptop del Equipo A es el servidor (`10.10.2.10`). La del Equipo B corre PT con el script apuntando a la plataforma. Si las dos máquinas son distintas, cambiar `SERVER` en el script por `http://10.10.2.10:3100/api/ingest` y abrir el puerto 3100 en el firewall de la laptop servidor (igual que el 1883, GUIA §6, con `-LocalPort 3100`).
2. En el dashboard deben verse a la vez el **ESP32 físico**, el nodo **Packet Tracer** y los simulados.
3. Ensayo corto de la demo (PLAN §5): calentar el DHT22, mover la mano frente al PIR, bajar el umbral, mandar *Identificar (LED)* y desconectar el USB (falla simulada).

## Bloque 3 — Evidencias y cierre (45 min)

Guardar las capturas en `evidencias/` con el nombre indicado en [evidencias/README.md](../evidencias/README.md):

- [ ] Prueba 3: ping bloqueado desde el SBC + `show access-lists` (Equipo B)
- [ ] Prueba 5: SBC con 10.10.2.x en PT (B) + monitor serie del ESP32 con `IP=10.10.2.x MASK=255.255.255.128` (A)
- [ ] Prueba 6: `mosquitto_sub` mostrando la telemetría del ESP32 (A)
- [ ] Prueba 7: dashboard con el ESP32 físico + pestaña Evidencias en verde (A)
- [ ] Prueba 9 (IoT): nodo "Desconectado" por Last Will tras quitar el USB (A)
- [ ] Grafana con datos del ESP32 (Diego)
- [ ] Puente PT: nodo Packet Tracer en el dashboard (B, si funcionó)
- [ ] Foto del montaje físico (protoboard)
- [ ] Exportar CSV de 24 h desde *Controles* (A)

**Por la noche:** cada equipo hace `git pull`, agrega sus capturas o su `.pkt` y hace `git push`. El coordinador verifica que todo esté arriba.

## Instalaciones por persona

| Software | Equipo A | Equipo B | Coordinación | Enlace |
|---|---|---|---|---|
| Git (o GitHub Desktop) | ✔ | ✔ | ✔ | <https://git-scm.com/download/win> |
| Docker Desktop | ✔ | — | opcional | <https://www.docker.com/products/docker-desktop/> |
| Node.js 22 o superior (solo para el plan B `npm run demo`) | ✔ | — | opcional | <https://nodejs.org/> |
| Arduino IDE 2 + core **esp32** 3.x + PubSubClient, DHT sensor library, Adafruit Unified Sensor | ✔ | — | — | GUIA §2 |
| Driver USB CP210x o CH340 (según la placa) | ✔ | — | — | GUIA §2 |
| Cisco Packet Tracer 8.2 o 9.x (con cuenta de NetAcad) | — | ✔ | ✔ | <https://www.netacad.com/> |
| MQTT Explorer (opcional, para ver los mensajes) | opcional | — | — | <https://mqtt-explorer.com/> |

Clonar el repositorio:

```powershell
git clone <URL-del-repositorio> campus-iot
cd campus-iot
```

## Material del kit (Equipo A)

ESP32 DevKit V1 · DHT22 (módulo de 3 pines, o sensor suelto + resistencia de 10 kΩ) · PIR HC‑SR501 · protoboard · 7 cables jumper macho‑hembra · cable USB de datos · router Wi‑Fi o celular con hotspot de 2.4 GHz.
