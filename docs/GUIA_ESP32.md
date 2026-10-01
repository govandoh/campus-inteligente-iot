# Guía paso a paso — ESP32 + DHT22 + PIR hacia la plataforma IoT

Objetivo (requerimiento IoT del enunciado): **un ESP32 con sensor, conectado por Wi‑Fi a la VLAN 60, obtiene IP por DHCP y transmite sus lecturas por MQTT a un servidor que las muestra en un dashboard.** Esta guía cubre las pruebas obligatorias 5, 6 y 7.

```
ESP32 (DHT22 + PIR) ──Wi‑Fi CAMPUS‑IOT──▶ AP ──▶ VLAN 60 (10.10.3.0/25) ──▶ Mosquitto :1883 ──▶ Plataforma ──▶ Dashboard
```

---

## 0. Materiales

| Componente | Notas |
|---|---|
| ESP32 DevKit V1 (30 pines) | Cualquier ESP32 "WROOM" sirve. Solo trabaja en **2.4 GHz**. |
| DHT22 (AM2302) | Si es **módulo** (3 pines, placa azul/negra) ya trae resistencia pull‑up. Si es el sensor **suelto** (4 pines) necesita una resistencia de **10 kΩ** entre DATA y VCC. |
| PIR HC‑SR501 | Sensor de movimiento (extra). Se alimenta a 5 V, su salida es de 3.3 V (segura para el ESP32). |
| Protoboard + 7 cables jumper macho‑hembra | |
| Cable USB **de datos** | Muchos cables de carga no transmiten datos: si la PC no detecta la placa, cambie el cable primero. |
| (Opcional) Router Wi‑Fi o celular como hotspot | Para crear la red `CAMPUS-IOT` el día de la defensa. |

---

## 1. Conexiones (cableado)

Con el ESP32 **desconectado del USB**:

| Sensor | Pin del sensor | Pin del ESP32 DevKit V1 | Color sugerido |
|---|---|---|---|
| DHT22 | VCC / `+` | **3V3** | rojo |
| DHT22 | DATA / `out` | **D4** (GPIO4) | verde |
| DHT22 | GND / `-` | **GND** | negro |
| DHT22 suelto (4 pines) | resistencia 10 kΩ entre DATA y VCC | — | — |
| PIR HC‑SR501 | VCC | **VIN** (5 V del USB) | rojo |
| PIR HC‑SR501 | OUT | **D27** (GPIO27) | naranja |
| PIR HC‑SR501 | GND | **GND** | negro |

```
                ┌──────────────────────┐
     DHT22 VCC ─┤3V3              VIN ├─ PIR VCC
     DHT22 GND ─┤GND              GND ├─ PIR GND
               ─┤D15              D13 ├─
               ─┤D2 (LED)         D12 ├─
    DHT22 DATA ─┤D4               D14 ├─
               ─┤...              D27 ├─ PIR OUT
                └────────[USB]────────┘
```

Ajuste del PIR (los dos potenciómetros naranjas): **Tiempo** al mínimo (≈3 s, girando a la izquierda) y **Sensibilidad** a la mitad. Jumper en **H** (disparo repetible). Al energizarlo, el PIR necesita **30–60 s** de calentamiento; en ese tiempo puede dar falsos positivos.

---

## 2. Preparar Arduino IDE (una sola vez)

1. Instale **Arduino IDE 2.x**: <https://www.arduino.cc/en/software>.
2. `Archivo → Preferencias → URLs adicionales de gestor de placas`, pegue:
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
3. `Herramientas → Placa → Gestor de placas` → busque **esp32** → instale **"esp32 by Espressif Systems"** (el firmware se compiló y verificó con la versión 3.3.x).
4. `Herramientas → Gestionar bibliotecas` e instale:
   - **PubSubClient** (Nick O'Leary)
   - **DHT sensor library** (Adafruit) — acepte instalar también **Adafruit Unified Sensor**
5. Driver USB: conecte el ESP32. Si en `Herramientas → Puerto` no aparece un `COMx`, instale el driver del chip USB de su placa:
   - **CP2102/CP210x** (Silicon Labs) o **CH340** (WCH). El chip viene impreso junto al conector USB.

---

## 3. Configurar el firmware

1. Abra `firmware/esp32_campus_iot/esp32_campus_iot.ino` en Arduino IDE.
2. En la misma carpeta, **copie `config.example.h` como `config.h`** (este archivo tiene las claves y no se sube al repositorio).
3. Edite `config.h`:

```cpp
#define NODE_ID        "esp32-lab-c1"     // nombre único del nodo
#define BUILDING_SLUG  "edificioC"        // el ESP32 está en Laboratorios (topología, sección 5.1)
#define WIFI_SSID      "CAMPUS-IOT"
#define WIFI_PASS      "su-clave-wifi"
#define MQTT_HOST      "10.10.3.10"        // IP de la laptop que corre el broker (paso 5)
#define MQTT_USER      "esp32"
#define MQTT_PASS      "esp32-umg-2026"    // debe coincidir con MQTT_ESP32_PASS de stack/.env
```

---

## 4. Grabar (flashear) el ESP32

1. `Herramientas → Placa → esp32 → **DOIT ESP32 DEVKIT V1**`.
2. `Herramientas → Puerto → COMx` (el que aparece al conectar la placa).
3. Botón **Subir** (flecha →).
4. Si aparece `Connecting........_____` y luego *"Failed to connect… Timed out waiting for packet header"*: **mantenga presionado el botón BOOT** de la placa mientras dice `Connecting…` y suéltelo cuando empiece a escribir (`Writing at 0x…`).
5. Abra `Herramientas → Monitor serie` a **115200 baudios** y presione **EN/RST**. Debe ver:

```
=== Campus IoT · ESP32 1.0.0 · esp32-lab-c1 ===
[wifi] Conectando a CAMPUS-IOT....
[wifi] OK  IP=10.10.3.25  GW=10.10.3.1  MASK=255.255.255.128  RSSI=-58 dBm
[mqtt] Conectando a 10.10.3.10:1883 como esp32-lab-c1… OK
[pub] OK  {"node":"esp32-lab-c1","building":"C","temp":24.6,"hum":55.2,"motion":0,...}
[pir] MOVIMIENTO
```

La línea `MASK=255.255.255.128` con IP `10.10.3.x` es la **evidencia de que el ESP32 está en la VLAN 60** (prueba 5). El LED azul queda **encendido fijo** cuando está conectado al broker.

---

## 5. Red Wi‑Fi `CAMPUS-IOT` para la demo

Packet Tracer no puede dar Wi‑Fi a un dispositivo real, así que el día de la defensa la VLAN 60 se reproduce con un router o un hotspot.

**Opción A (recomendada) — Router Wi‑Fi dedicado que imita la VLAN 60:**

| Parámetro del router | Valor |
|---|---|
| SSID | `CAMPUS-IOT` (banda **2.4 GHz**) |
| Seguridad | WPA2‑Personal (AES) |
| IP LAN del router (gateway) | `10.10.3.1` |
| Máscara | `255.255.255.128` (/25) |
| Rango DHCP | `10.10.3.2` – `10.10.3.126` |
| Reserva DHCP para la laptop | `10.10.3.10` (la IP del broker que usa el análisis inicial, sección 7.5) |

Así el ESP32 obtiene **exactamente** una IP del plan VLSM de la VLAN 60. En el diseño final el broker vive en la VLAN 50 (`10.10.5.70`) y el SW‑CORE enruta VLAN 60 → 50 con la ACL `IOT-IN`; en la maqueta se simplifica poniendo la laptop‑servidor en el mismo segmento. Explíquelo así en la defensa.

**Opción B — Hotspot del celular llamado `CAMPUS-IOT`:** funciona igual, pero la IP no será `10.10.3.x` (el dashboard marcará "fuera de 10.10.3.0/25"). En iPhone active *"Maximizar compatibilidad"* para forzar 2.4 GHz.

En ambos casos, la laptop se conecta a la **misma** red y su IP (ver con `ipconfig`) es la que va en `MQTT_HOST`.

---

## 6. Levantar el broker y la plataforma en la laptop

Requisitos: Docker Desktop encendido.

```powershell
cd D:\TELECO-PROYECTO\stack
copy .env.example .env         # (ya existe; cambie las contraseñas si quiere)
docker compose up -d --build   # Mosquitto :1883 + Plataforma :3100
```

- Dashboard: <http://localhost:3100>
- Con `SIMULATE=1` en `.env` también aparecen 4 nodos simulados (uno por edificio). Para la demo con el ESP32 real puede dejarlos (muestran el campus completo) o poner `SIMULATE=0` y ejecutar `docker compose up -d`.

**Firewall de Windows** — permita que el ESP32 llegue al puerto 1883 (PowerShell como administrador):

```powershell
New-NetFirewallRule -DisplayName "MQTT Mosquitto 1883" -Direction Inbound -Protocol TCP -LocalPort 1883 -Action Allow
```

Y marque la red Wi‑Fi como **Privada** (Configuración → Red → Propiedades).

---

## 7. Verificar (pruebas 5, 6 y 7)

1. **Prueba 5 — ESP32 en VLAN 60:** Monitor serie muestra `IP=10.10.3.x MASK=255.255.255.128`. En el dashboard, tarjeta *Dispositivo* → `VLAN 60 ✓ 10.10.3.0/25`.
2. **Prueba 6 — ESP32 → servidor:** vea los mensajes llegar al broker:
   ```powershell
   docker exec -it campus-mosquitto mosquitto_sub -u platform -P platform-umg-2026 -t "campus/iot/#" -v
   ```
3. **Prueba 7 — Dashboard:** en <http://localhost:3100> aparece `esp32-lab-c1` con la etiqueta **ESP32 físico**; al soplar/calentar el DHT22 sube la temperatura en vivo; al pasar la mano frente al PIR se enciende el radar de movimiento.
4. Pestaña **Evidencias**: las pruebas 5, 6 y 7 aparecen en verde con los datos reales → **capture pantalla** para el documento.
5. Pruebe el control remoto: `Controles → Identificar (LED)` hace parpadear el LED del ESP32 (comando MQTT de bajada) y `Intervalo 2 s` cambia la frecuencia de publicación.
6. Desconecte el USB del ESP32: en ~15–20 s el broker publica el *Last Will* y el dashboard lo marca **Desconectado** (evidencia de "¿cómo detectarían una falla?").

---

## 8. Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| No aparece puerto COM | Cable solo de carga o falta driver | Otro cable; driver CP210x/CH340 |
| `Failed to connect ... packet header` | La placa no entra en modo descarga | Mantener **BOOT** durante `Connecting…` |
| `[wifi]` se queda en puntos | Red de 5 GHz, clave errónea, SSID con otro nombre | Usar 2.4 GHz; revisar mayúsculas en `WIFI_SSID` |
| `[mqtt] falló (rc=-2)` | No llega a la IP del broker | IP de laptop correcta en `MQTT_HOST`; regla de firewall 1883; misma red |
| `[mqtt] falló (rc=4)` o `rc=5` | Usuario/clave MQTT incorrectos o ACL | `MQTT_USER=esp32` y la clave de `stack/.env` |
| `[dht] Lectura inválida` | Cableado DATA/VCC, falta pull‑up | Revisar D4, 3V3, GND; resistencia 10 kΩ si es sensor suelto |
| PIR siempre en 1 | Calentamiento o sensibilidad alta | Esperar 60 s; bajar sensibilidad; alejar de fuentes de calor |
| El ESP32 se reinicia al conectar Wi‑Fi (*brownout*) | Puerto USB débil | Otro puerto/cable, hub con alimentación |

Códigos `rc` de PubSubClient: `-4` timeout · `-2` conexión fallida · `2` client id rechazado · `4` credenciales · `5` no autorizado.

---

## 9. Plan B sin hardware: Wokwi (simulador en el navegador)

El mismo firmware corre en <https://wokwi.com> (ESP32 + DHT22 + PIR virtuales). Wokwi sale a Internet por la red `Wokwi-GUEST` y **no ve la laptop**, así que publica en un broker público y el Mosquitto local lo trae con un *bridge*.

1. En wokwi.com → **New Project → ESP32**.
2. Reemplace el contenido de `sketch.ino` y `diagram.json` con los de la carpeta [`wokwi/`](../wokwi).
3. Agregue un archivo nuevo `config.h` (flecha ▾ junto a las pestañas → *New file*) con el contenido de `wokwi/config.h`.
4. Pestaña *Library Manager* → agregue **PubSubClient**, **DHT sensor library** y **Adafruit Unified Sensor**.
5. En la laptop active el bridge y reinicie Mosquitto:
   ```powershell
   cd D:\TELECO-PROYECTO\stack
   copy mosquitto\config\bridge-wokwi.conf.disabled mosquitto\config\conf.d\bridge-wokwi.conf
   docker compose restart mosquitto
   ```
6. ▶ en Wokwi. En el dashboard aparece `wokwi-lab-c1` con la etiqueta **Wokwi**. Haga clic sobre el DHT22 simulado para mover la temperatura/humedad con los deslizadores y sobre el PIR para simular movimiento.

Nota: en Wokwi la IP será de la red virtual de Wokwi (no `10.10.3.x`); para la prueba 5 use el ESP32 físico o el SBC de Packet Tracer.

---

## 10. Seguridad del ESP32 (pregunta de defensa)

1. **Segmentación:** vive en la VLAN 60; la ACL `IOT-IN` del SW‑CORE solo le permite DHCP, DNS, NTP y **TCP 1883 hacia el broker**; todo lo demás se deniega y se registra (`log`).
2. **Wi‑Fi:** SSID `CAMPUS-IOT` con WPA2/WPA3; en producción, reserva DHCP/MAC por dispositivo.
3. **MQTT autenticado:** sin acceso anónimo; usuario `esp32` con ACL de mínimo privilegio (solo escribe sus tópicos y solo lee `…/cmd`). Probado: un cliente anónimo recibe *"not authorised"*.
4. **Credenciales fuera del código:** `config.h` está en `.gitignore`.
5. **Siguiente paso (si hay tiempo):** MQTT sobre TLS (puerto 8883, `WiFiClientSecure` + certificado de la CA), *Secure Boot* y *Flash Encryption* del ESP32, y actualizaciones OTA firmadas.
6. **Detección:** *Last Will* + detección de nodo silencioso en la plataforma → alerta inmediata.
