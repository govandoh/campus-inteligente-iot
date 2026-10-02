# Packet Tracer e IoT — qué se puede, qué no, y cómo lo resolvemos

## El bloqueo

Packet Tracer es un simulador **cerrado**: sus routers, switches y PCs virtuales no existen en la red real. Un ESP32 físico no puede asociarse al AP simulado, y PRTG/Zabbix/Mosquitto reales no pueden hacer SNMP ni MQTT contra un equipo de PT. Eso no cambia.

Lo que **sí** existe (Packet Tracer 7.2 en adelante) es una salida controlada: los scripts de los dispositivos programables (SBC‑PT / MCU‑PT) pueden hacer **peticiones HTTP reales** a la PC anfitriona con la clase `RealHTTPClient`, si se habilita *External Network Access from Device Scripts* en las preferencias. Con eso construimos un puente de datos de PT hacia la plataforma real.

## Estrategia en tres capas

| Capa | Dónde | Qué demuestra | Pruebas del enunciado |
|---|---|---|---|
| **1. Red simulada** | Packet Tracer | Un SBC‑PT (representa al ESP32) conectado por Wi‑Fi a `CAMPUS-IOT`, recibe IP por DHCP en `10.10.2.0/25`; la ACL `ACL-IOT` permite solo DHCP, DNS, NTP y TCP 1883 hacia SRV‑SERVICIOS (10.10.4.2) y bloquea el resto de la red interna | 1, 3, 5 (dentro de PT) |
| **2. Puente de datos** | PT → PC | El script `packet-tracer/sbc_puente_plataforma.py` lee los sensores de PT (temperatura, humedad, movimiento) y los envía a `http://127.0.0.1:3100/api/ingest`; la plataforma los **republica en MQTT** y aparecen en el dashboard con la etiqueta *Packet Tracer* | 6, 7 (con datos de PT) |
| **3. Dispositivo real** | Fuera de PT | ESP32 físico (o Wokwi) → MQTT → Mosquitto → dashboard | 5, 6, 7 (evidencia principal) |

### ¿Hay que hacer las tres, o son alternativas?

**Las capas no son alternativas entre sí: se suman.** Cada una cubre una parte distinta del enunciado.

| Capa | ¿Obligatoria? | Por qué | Si falla… |
|---|---|---|---|
| **1. PT** | **Sí** | Es parte del archivo `.pkt` que se entrega: VLAN 60, SSID `CAMPUS-IOT`, DHCP y la ACL que bloquea a IoT (pruebas 1, 3 y 5 dentro del simulador). Se hace aunque no existiera el ESP32. | No hay sustituto: es trabajo de Packet Tracer. |
| **3. ESP32** | **Sí** | El enunciado exige "al menos un ESP32" que envíe datos reales por MQTT (pruebas 6 y 7). Es la evidencia principal. | **Wokwi** con el mismo firmware (GUIA_ESP32 §9). |
| **2. Puente PT** | **No (es un extra)** | Muestra los sensores de PT en el mismo dashboard: une el simulador con la plataforma real. | No se pierde nada; se explica la limitación de PT. |

- **Mínimo para cumplir:** capa 1 + capa 3.
- **Ideal:** capa 1 + capa 2 + capa 3.
- **El simulador integrado** (`SIMULATE=1`, nodos `sim-…`) no es una capa: solo mantiene el dashboard con datos de los otros edificios durante la demo. No cuenta como evidencia del ESP32.

| Prueba del enunciado | Se demuestra con |
|---|---|
| 3 · VLAN no autorizadas bloqueadas | Capa 1 (ACL `ACL-IOT`, ping del SBC hacia la VLAN 10 falla) |
| 5 · ESP32 con conectividad en VLAN 60 | Capa 1 (SBC con 10.10.2.x en PT) **y** capa 3 (ESP32 real con 10.10.2.x en el router `CAMPUS-IOT`) |
| 6 · ESP32 → servidor, datos recibidos | Capa 3 (Mosquitto recibe la telemetría) |
| 7 · Dashboard con datos visibles | Capa 3 (y capa 2 como extra) |

## Capa 1 — Montaje en Packet Tracer (`packet-tracer/Campus-UMG-Final.pkt`)

**Lo que ya existía en el `.pkt`:** VLAN 60 en todos los switches, SVI `Vlan60` 10.10.2.1/25 y pool DHCP `VLAN60_IOT` en el SW‑CORE. También la PC `IOT-ESP32` cableada en SW‑E4 Fa0/2 (10.10.2.11) y la `ACL-IOT` escrita **pero sin aplicar**.

**Lo que se configuró con el MCP (ya guardado en el `.pkt`, 1 de octubre):**

- `AP-IOT` (AccessPoint‑PT) en **SW‑E4 Fa0/11** (access VLAN 60, portfast). En la vista física quedó en la oficina, no en el rack.
- `ESP32-SBC` (SBC‑PT). Se cambió su módulo inalámbrico a **PT‑IOT‑NM‑1W** (2.4 GHz, como un ESP32 real).
- `AP-E3`, movido de la VLAN 10 a la **VLAN 20** (SSID de personal según el diseño).
- **SSID con WPA2‑PSK (AES)** en los cinco AP:

  | AP | VLAN del puerto | SSID | Clave |
  |---|---|---|---|
  | AP-E1, AP-E2 | 30 | `CAMPUS-STUDENTS` | `Estudiantes-UMG-2026` |
  | AP-E3 | 20 | `CAMPUS-STAFF` | `Personal-UMG-2026` |
  | AP-E4 | 80 | `CAMPUS-GUEST` | `Invitados-UMG-2026` |
  | AP-IOT | 60 | `CAMPUS-IOT` | `IoT-Campus-2026` |

- **SW‑CORE:** `ACL-IOT` rehecha (se agregó NTP), `ACL-LABORATORIOS` y `ACL-VOZ` nuevas, y las seis ACL aplicadas `in` en sus SVI: Vlan20 `ACL-DOCENTES`, Vlan30 `ACL-ESTUDIANTES`, Vlan40 `ACL-LABORATORIOS`, Vlan60 `ACL-IOT`, Vlan70 `ACL-VOZ`, Vlan80 `ACL-INVITADOS`.
- **SSH solo desde ADMIN (10.10.3.0/25) y MGMT (10.10.4.32/27)**: ACL estándar `SSH-GESTION` como `access-class` en `vty 0 4` y `vty 5 15` de R‑BORDE, SW‑CORE y SW‑E1 a SW‑E4. Se cerraron las `vty 5 15` de los 2960, que tenían `login` sin clave.
- `write memory` en los seis equipos.

El detalle de los comandos está en [`packet-tracer/capa1_cli.txt`](../packet-tracer/capa1_cli.txt) (ya aplicado; queda como referencia para el documento).

**Pasos manuales que faltan en Packet Tracer (5 minutos):**

1. **ESP32-SBC** → *Config → Wireless3*: SSID `CAMPUS-IOT`, **WPA2‑PSK**, clave `IoT-Campus-2026`, cifrado AES, IP **DHCP**. Debe recibir `10.10.2.x /25` → **captura de la prueba 5 (PT)**.
   La API de scripts de PT no permite cambiar el perfil Wi‑Fi del cliente (devuelve `invalid vector subscript`), por eso este paso es manual. Si no asocia, acerque el SBC al AP‑IOT en la vista física y revise que el SSID y la clave estén escritos igual.
2. Agregue tres sensores (*End Devices → Home/IoT*) y conéctelos al SBC con **IoT Custom Cable**:
   - `Temperature Sensor` → **A0**
   - `Humidity Sensor` → **A1** (si su versión no lo tiene, use un segundo *Temperature Sensor* y documente la sustitución)
   - `Motion Detector` → **D0**

**Verificación (pruebas 3, 4 y 5) — resultados medidos en el `.pkt` el 1 de octubre:**

| Desde | Hacia | Esperado | Resultado |
|---|---|---|---|
| IOT-ESP32 (VLAN 60) | 10.10.4.2 (SRV‑SERVICIOS) | ✔ responde | ✔ 4/4 |
| IOT-ESP32 (VLAN 60) | 10.10.3.11 (PC‑ADM1) | ✘ bloqueado por `ACL-IOT` | ✔ 0/4 |
| PC-ADM1, PC-DOC1, PC-LAB1 | 10.10.4.2 | ✔ responde | ✔ 4/4 |
| PC-EST1 (VLAN 30) | 10.10.3.11 | ✘ bloqueado por `ACL-ESTUDIANTES` | ✔ 0/4 |
| PC-INV1 (VLAN 80) | 10.10.3.11 | ✘ bloqueado por `ACL-INVITADOS` | ✔ 0/4 |
| PC-ADM1 | `ssh -l adminredes 10.10.4.33` | ✔ pide contraseña | ✔ |
| PC-EST1 | `ssh -l adminredes 10.10.4.33` | ✘ sin respuesta | ✔ |
| ESP32-SBC | 10.10.4.2 y 10.10.3.11 | igual que IOT-ESP32 | pendiente del paso 1 |

Para la captura de la prueba 3, en el SW‑CORE ejecute `show access-lists ACL-IOT`: muestra los contadores de cada regla. Capture todo para `evidencias/`.

> Las ACL se aplican de entrada en la VLAN de origen, así que también cortan las respuestas: por ejemplo, un ping de ADMIN hacia un equipo IoT no regresa. Es lo esperado en este diseño, porque la VLAN 60 solo debe hablar con SRV‑SERVICIOS.

> Nota: en Packet Tracer el SBC no tiene cliente MQTT real. La regla `eq 1883` se evidencia con los contadores de `show access-lists`; la conexión MQTT real se evidencia en la capa 3.

## Capa 2 — Puente de datos PT → plataforma

1. Arranque la plataforma en la misma PC (`docker compose up -d` en `stack/`, o `npm run demo` en `platform/`).
2. En Packet Tracer: **Options → Preferences → Miscellaneous** → marque **"Enable External Network Access from Device Scripts"** (o equivalente en su versión). Reinicie PT si lo pide.
3. SBC → pestaña **Programming** → *New* → plantilla **Empty – Python** → pegue `packet-tracer/sbc_puente_plataforma.py` en `main.py` → **Run**.
4. La consola del SBC imprime `T=… HR=… mov=…` y `[http] 200 {"ok":true,…}`.
5. En el dashboard aparece `pt-sbc-lab-c1` con la etiqueta **Packet Tracer**. Cambie la temperatura del entorno de PT (*Environment → Temperature*) o use *Alt+clic* sobre el detector de movimiento: el dashboard lo refleja en ~5 s.

Si el SBC imprime errores de `RealHTTPClient` o valores extraños:

- Confirme la opción de acceso externo y que `http://127.0.0.1:3100/api/state` abre en el navegador de la PC.
- Los sensores de PT entregan 0–1023; el script convierte temperatura a −100…100 °C y humedad a 0–100 %. Si su versión escala distinto, ajuste `to_temp()`/`to_hum()` mirando el valor `raw` que se imprime.

Qué decir en la defensa: *"RealHTTPClient sale por la tarjeta de red de la PC, no por la topología simulada; por eso lo usamos como puente de datos y demostramos la conectividad de la VLAN 60 y la ACL dentro de Packet Tracer, y el flujo MQTT real con el ESP32 físico."*

## Capa 3 — Dispositivo real

Ver [GUIA_ESP32.md](GUIA_ESP32.md).
