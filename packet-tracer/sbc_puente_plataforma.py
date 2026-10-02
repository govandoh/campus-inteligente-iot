# ─────────────────────────────────────────────────────────────────────────────
# Puente Packet Tracer → Plataforma IoT real (RealHTTPClient)
#
# Dónde va: en un SBC-PT (Single Board Computer) de la topología, conectado por
# Wi-Fi al SSID CAMPUS-IOT (VLAN 60). Pestaña "Programming" → New → Python →
# pegue este archivo en main.py → Run.
#
# Requisito: en Packet Tracer active
#   Options → Preferences → Miscellaneous → "Enable External Network Access from Device Scripts"
#   (el nombre exacto puede variar levemente según la versión 8.x/9.x)
#
# IMPORTANTE para la defensa: RealHTTPClient sale por la tarjeta de red de la PC
# anfitriona, NO por la red simulada. Es un puente de datos, no prueba de conectividad.
# La conectividad VLAN 60 / ACL se demuestra dentro de PT (DHCP, ping, ACL);
# este script solo lleva las lecturas de los sensores de PT al dashboard real.
#
# Conexiones en PT (cable IoT desde el sensor al SBC):
#   Temperature Sensor → A0      Humidity Sensor → A1      Motion Detector → D0
# ─────────────────────────────────────────────────────────────────────────────
from gpio import *
from time import *
from realhttp import *

SERVER = "http://127.0.0.1:3100/api/ingest"   # plataforma corriendo en la misma PC
NODE = "pt-sbc-lab-c1"
BUILDING = "C"
SIM_IP = "10.10.2.30"     # IP que el SBC obtuvo por DHCP DENTRO de la simulación (informativa)
PERIOD_S = 5

try:
    T_SLOT = A0
    H_SLOT = A1
except:
    T_SLOT = 0
    H_SLOT = 1
PIR_SLOT = 0

http = RealHTTPClient()


def on_done(status, data):
    print("[http] " + str(status) + " " + str(data))


http.onDone(on_done)


def to_temp(raw):
    # Sensor de temperatura de PT: 0..1023  →  -100..100 °C
    return round(raw * 200.0 / 1023.0 - 100.0, 1)


def to_hum(raw):
    # Sensor de humedad de PT: 0..1023  →  0..100 %
    return round(raw * 100.0 / 1023.0, 1)


def main():
    pinMode(PIR_SLOT, IN)
    print("Puente PT -> " + SERVER + " cada " + str(PERIOD_S) + " s")
    while True:
        raw_t = analogRead(T_SLOT)
        raw_h = analogRead(H_SLOT)
        motion = 1 if digitalRead(PIR_SLOT) > 0 else 0
        t = to_temp(raw_t)
        h = to_hum(raw_h)
        print("T=" + str(t) + " C (raw " + str(raw_t) + ")  HR=" + str(h) + " % (raw " + str(raw_h) + ")  mov=" + str(motion))

        url = (SERVER + "?node=" + NODE + "&building=" + BUILDING +
               "&temp=" + str(t) + "&hum=" + str(h) + "&motion=" + str(motion) +
               "&ip=" + SIM_IP + "&src=packet-tracer")
        http.get(url)
        sleep(PERIOD_S)


if __name__ == "__main__":
    main()
