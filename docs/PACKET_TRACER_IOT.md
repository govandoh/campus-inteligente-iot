# Packet Tracer e IoT — qué se puede, qué no, y cómo lo resolvemos

## El bloqueo

Packet Tracer es un simulador **cerrado**: sus routers, switches y PCs virtuales no existen en la red real. Un ESP32 físico no puede asociarse al AP simulado, y PRTG/Zabbix/Mosquitto reales no pueden hacer SNMP ni MQTT contra un equipo de PT. Eso no cambia.

Lo que **sí** existe (Packet Tracer 7.2 en adelante) es una salida controlada: los scripts de los dispositivos programables (SBC‑PT / MCU‑PT) pueden hacer **peticiones HTTP reales** a la PC anfitriona con la clase `RealHTTPClient`, si se habilita *External Network Access from Device Scripts* en las preferencias. Con eso construimos un puente de datos de PT hacia la plataforma real.

## Estrategia en tres capas

| Capa | Dónde | Qué demuestra | Pruebas del enunciado |
|---|---|---|---|
| **1. Red simulada** | Packet Tracer | Un SBC‑PT (representa al ESP32) conectado por Wi‑Fi a `CAMPUS-IOT`, recibe IP por DHCP en `10.10.3.0/25`; la ACL `IOT-IN` permite solo TCP 1883 hacia el servidor MQTT (10.10.5.70) y bloquea el resto | 1, 3, 5 (dentro de PT) |
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
| 3 · VLAN no autorizadas bloqueadas | Capa 1 (ACL `IOT-IN`, ping del SBC hacia la VLAN 10 falla) |
| 5 · ESP32 con conectividad en VLAN 60 | Capa 1 (SBC con 10.10.3.x en PT) **y** capa 3 (ESP32 real con 10.10.3.x en el router `CAMPUS-IOT`) |
| 6 · ESP32 → servidor, datos recibidos | Capa 3 (Mosquitto recibe la telemetría) |
| 7 · Dashboard con datos visibles | Capa 3 (y capa 2 como extra) |

## Capa 1 — Montaje en Packet Tracer

1. En el Edificio C (Laboratorios), junto a `AP-C1` (SSID `CAMPUS-IOT`, WPA2‑PSK, VLAN 60), agregue un **SBC‑PT** (`End Devices → Home/IoT → SBC Board`). Nómbrelo `ESP32-LAB-C1`.
2. SBC → *Config → Interface → Wireless0*: SSID `CAMPUS-IOT`, WPA2‑PSK con la misma clave del AP, IP **DHCP**. Verifique que recibe `10.10.3.x /25` (evidencia de la prueba 5 dentro de PT).
3. Conecte con cable **IoT Custom Cable** tres sensores al SBC:
   - `Temperature Sensor` → **A0**
   - `Humidity Sensor` → **A1** (si su versión no lo tiene, use un segundo *Temperature Sensor* o un *Potentiometer* y documente la sustitución)
   - `Motion Detector` → **D0**
4. En el servidor de la VLAN 50 (`10.10.5.70`, "Mosquitto") habilite el servicio **IoT** si quiere además el registro interno de PT (opcional).
5. Aplique la ACL en el SW‑CORE (también disponible con botón *Copiar* en la pestaña **Evidencias** del dashboard):

```
ip access-list extended IOT-IN
 remark IoT -> broker MQTT (Mosquitto 10.10.5.70)
 permit tcp 10.10.3.0 0.0.0.127 host 10.10.5.70 eq 1883
 permit udp any any eq bootps
 permit udp 10.10.3.0 0.0.0.127 host 10.10.5.66 eq domain
 permit udp 10.10.3.0 0.0.0.127 host 10.10.5.67 eq ntp
 deny   ip any any log
!
interface Vlan60
 ip access-group IOT-IN in
```

Prueba de la ACL en PT: desde el SBC, `ping 10.10.4.2` (ADMIN) **falla**; desde un PC de la VLAN 10 hacia el SW‑CORE por SSH **funciona**. Capture ambas.

> Nota: en Packet Tracer el SBC no tiene cliente MQTT real; la regla `eq 1883` se evidencia con `show access-lists` (contadores) y la conexión MQTT real se evidencia en la capa 3.

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
