// Configuración para el simulador Wokwi (https://wokwi.com)
// Wokwi da salida a Internet por la red "Wokwi-GUEST"; no puede ver su laptop directamente,
// por eso publica en un broker público y el Mosquitto local lo trae con un "bridge"
// (stack/mosquitto/config/bridge-wokwi.conf.disabled).
#pragma once

#define NODE_ID        "wokwi-lab-c1"
#define BUILDING_SLUG  "edificioC"
#define BUILDING_ID    "C"
#define DATA_SOURCE    "wokwi"

#define WIFI_SSID      "Wokwi-GUEST"
#define WIFI_PASS      ""

#define MQTT_HOST      "broker.hivemq.com"
#define MQTT_PORT      1883
#define MQTT_USER      ""                  // broker público: sin credenciales
#define MQTT_PASS      ""
// Prefijo único para no mezclarse con otros usuarios del broker público
#define TOPIC_ROOT     "umg-teleco-2026-g5/campus/iot"

#define NTP_SERVER     "pool.ntp.org"
#define TZ_OFFSET_SEC  (-6 * 3600)

#define DHT_PIN        4
#define PIR_PIN        27
#define LED_PIN        2
#define PUBLISH_EVERY_S 5
