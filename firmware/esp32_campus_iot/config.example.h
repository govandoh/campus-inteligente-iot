// ─────────────────────────────────────────────────────────────────────────────
// Copie este archivo como "config.h" y complete sus valores.
// config.h NO se sube al repositorio (.gitignore) para no exponer credenciales.
// ─────────────────────────────────────────────────────────────────────────────
#pragma once

// Identidad del nodo
#define NODE_ID        "esp32-lab-c1"      // único por dispositivo
#define BUILDING_SLUG  "edificioC"         // edificioA | edificioB | edificioC | edificioD
#define BUILDING_ID    "C"
#define DATA_SOURCE    "esp32"             // "esp32" (físico) o "wokwi" (simulado)

// Wi-Fi — SSID de la red IoT (VLAN 60)
#define WIFI_SSID      "CAMPUS-IOT"
#define WIFI_PASS      "cambie-esta-clave"

// Broker MQTT (Mosquitto). En el diseño: 10.10.5.70 (VLAN 50, Data Center).
// En la demo: la IP de la laptop que corre Docker (ver docs/GUIA_ESP32.md, paso 6).
#define MQTT_HOST      "192.168.1.100"
#define MQTT_PORT      1883
#define MQTT_USER      "esp32"
#define MQTT_PASS      "esp32-umg-2026"
#define TOPIC_ROOT     "campus/iot"        // Wokwi + broker público: "umg-teleco-g5/campus/iot"

// Servidor NTP (en el diseño, el servidor NTP del Data Center: 10.10.5.67)
#define NTP_SERVER     "pool.ntp.org"
#define TZ_OFFSET_SEC  (-6 * 3600)         // Guatemala, UTC-6

// Hardware
#define DHT_PIN        4                   // DATA del DHT22
#define PIR_PIN        27                  // OUT del HC-SR501
#define LED_PIN        2                   // LED azul integrado del DevKit V1
#define PUBLISH_EVERY_S 5                  // intervalo por defecto (el dashboard lo puede cambiar)
