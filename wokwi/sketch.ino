/*
 * Campus Universitario Inteligente — Nodo IoT ESP32 (VLAN 60)
 * Universidad Mariano Gálvez · Telecomunicaciones · 2026
 *
 * Sensores:  DHT22 (temperatura + humedad) en GPIO4, PIR HC-SR501 (movimiento) en GPIO27
 * Red:       Wi-Fi SSID CAMPUS-IOT → IP por DHCP en 10.10.2.0/25 (VLAN 60)
 * Protocolo: MQTT hacia Mosquitto (VLAN 50), con usuario/contraseña y Last Will
 *
 * Tópicos (campus/iot/<edificio>/<nodo>/…):
 *   telemetry  → JSON cada N s   {"temp":24.6,"hum":55.2,"motion":0,"rssi":-61,"ip":"10.10.2.25",…}
 *   status     → retenido        {"state":"online",…}  /  {"state":"offline"} (Last Will)
 *   motion     → al instante     {"motion":1}  (flanco del PIR)
 *   cmd        ← comandos        {"interval":10} · {"identify":true} · {"reboot":true}
 *   ack        → confirmación de comandos
 *
 * Librerías (Arduino IDE → Gestor de librerías):
 *   - PubSubClient (Nick O'Leary)
 *   - DHT sensor library (Adafruit) + Adafruit Unified Sensor
 */
#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <time.h>
#include "config.h"

#define FW_VERSION "1.0.0"

#ifndef DHT_TYPE
#define DHT_TYPE DHT22   // DHT11 si el sensor es azul; se define en config.h
#endif
DHT dht(DHT_PIN, DHT_TYPE);
WiFiClient net;
PubSubClient mqtt(net);

String topicBase;                 // campus/iot/edificioC/esp32-lab-c1
uint32_t intervalMs = PUBLISH_EVERY_S * 1000UL;
uint32_t lastPublish = 0;
uint32_t lastMqttAttempt = 0;
uint32_t mqttBackoff = 1000;
uint32_t seq = 0;

volatile bool pirChanged = false;
bool motionState = false;
uint16_t motionCount = 0;         // activaciones del PIR desde la última telemetría
uint32_t identifyUntil = 0;

void IRAM_ATTR onPir() { pirChanged = true; }

String topic(const char* leaf) { return topicBase + "/" + leaf; }

// ───────────────────────────── Wi-Fi ─────────────────────────────
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.printf("[wifi] Conectando a %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.setHostname(NODE_ID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000) {
    digitalWrite(LED_PIN, !digitalRead(LED_PIN));   // parpadeo = buscando red
    delay(250);
    Serial.print('.');
  }
  digitalWrite(LED_PIN, LOW);
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[wifi] OK  IP=%s  GW=%s  MASK=%s  RSSI=%d dBm\n",
                  WiFi.localIP().toString().c_str(), WiFi.gatewayIP().toString().c_str(),
                  WiFi.subnetMask().toString().c_str(), WiFi.RSSI());
  } else {
    Serial.println("\n[wifi] Sin conexión; se reintentará.");
  }
}

// ───────────────────────────── MQTT ─────────────────────────────
void publishStatusOnline() {
  char buf[256];
  snprintf(buf, sizeof(buf),
           "{\"state\":\"online\",\"ip\":\"%s\",\"mac\":\"%s\",\"rssi\":%d,\"fw\":\"%s\",\"interval\":%lu,"
           "\"sensor\":\"DHT22+PIR\",\"src\":\"%s\"}",
           WiFi.localIP().toString().c_str(), WiFi.macAddress().c_str(), WiFi.RSSI(), FW_VERSION,
           (unsigned long)(intervalMs / 1000), DATA_SOURCE);
  mqtt.publish(topic("status").c_str(), buf, true);   // retenido
}

void onMessage(char* t, byte* payload, unsigned int len) {
  String msg;
  for (unsigned int i = 0; i < len; i++) msg += (char)payload[i];
  Serial.printf("[mqtt] comando recibido: %s\n", msg.c_str());

  // Parser mínimo (evita depender de ArduinoJson)
  int i = msg.indexOf("\"interval\"");
  if (i >= 0) {
    long s = msg.substring(msg.indexOf(':', i) + 1).toInt();
    if (s >= 2 && s <= 300) {
      intervalMs = s * 1000UL;
      publishStatusOnline();
    }
  }
  if (msg.indexOf("\"identify\"") >= 0) identifyUntil = millis() + 5000;
  mqtt.publish(topic("ack").c_str(), msg.c_str());
  if (msg.indexOf("\"reboot\"") >= 0) { delay(200); ESP.restart(); }
}

void connectMqtt() {
  if (mqtt.connected() || WiFi.status() != WL_CONNECTED) return;
  if (millis() - lastMqttAttempt < mqttBackoff) return;
  lastMqttAttempt = millis();

  Serial.printf("[mqtt] Conectando a %s:%d como %s… ", MQTT_HOST, MQTT_PORT, NODE_ID);
  // Last Will: si el ESP32 se desconecta sin avisar, el broker publica "offline" por él.
  // Con broker público (Wokwi) MQTT_USER va vacío y se conecta sin credenciales.
  const char* user = strlen(MQTT_USER) ? MQTT_USER : nullptr;
  const char* pass = strlen(MQTT_USER) ? MQTT_PASS : nullptr;
  bool ok = mqtt.connect(NODE_ID, user, pass,
                         topic("status").c_str(), 1, true, "{\"state\":\"offline\"}");
  if (ok) {
    Serial.println("OK");
    mqttBackoff = 1000;
    publishStatusOnline();
    mqtt.subscribe(topic("cmd").c_str(), 1);
  } else {
    Serial.printf("falló (rc=%d). Reintento en %lu ms\n", mqtt.state(), (unsigned long)mqttBackoff);
    mqttBackoff = min<uint32_t>(mqttBackoff * 2, 30000);   // backoff exponencial
  }
}

// ───────────────────────────── Sensores ─────────────────────────────
void publishTelemetry() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  bool valid = !(isnan(t) || isnan(h));
  if (!valid) Serial.println("[dht] Lectura inválida — revise VCC, GND, DATA y la resistencia pull-up de 10 kΩ");

  char temp[12], hum[12];
  if (valid) { dtostrf(t, 0, 1, temp); dtostrf(h, 0, 1, hum); }
  else { strcpy(temp, "null"); strcpy(hum, "null"); }

  char buf[384];
  snprintf(buf, sizeof(buf),
           "{\"node\":\"%s\",\"building\":\"%s\",\"temp\":%s,\"hum\":%s,\"motion\":%d,\"motionCount\":%u,"
           "\"rssi\":%d,\"ip\":\"%s\",\"uptime\":%lu,\"seq\":%lu,\"ts\":%ld,\"fw\":\"%s\",\"src\":\"%s\"}",
           NODE_ID, BUILDING_ID, temp, hum, motionState ? 1 : 0, motionCount, WiFi.RSSI(),
           WiFi.localIP().toString().c_str(), millis() / 1000UL, (unsigned long)++seq, (long)time(nullptr),
           FW_VERSION, DATA_SOURCE);
  motionCount = 0;

  bool sent = mqtt.publish(topic("telemetry").c_str(), buf);
  Serial.printf("[pub] %s %s\n", sent ? "OK " : "ERR", buf);
}

void handlePir() {
  if (!pirChanged) return;
  pirChanged = false;
  bool now = digitalRead(PIR_PIN) == HIGH;
  if (now == motionState) return;
  motionState = now;
  if (now) motionCount++;
  char buf[96];
  snprintf(buf, sizeof(buf), "{\"node\":\"%s\",\"motion\":%d,\"ts\":%ld}", NODE_ID, now ? 1 : 0, (long)time(nullptr));
  mqtt.publish(topic("motion").c_str(), buf);
  Serial.printf("[pir] %s\n", now ? "MOVIMIENTO" : "reposo");
}

// ───────────────────────────── Arduino ─────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n=== Campus IoT · ESP32 " FW_VERSION " · " NODE_ID " ===");

  pinMode(LED_PIN, OUTPUT);
  pinMode(PIR_PIN, INPUT);
  attachInterrupt(digitalPinToInterrupt(PIR_PIN), onPir, CHANGE);
  dht.begin();

  topicBase = String(TOPIC_ROOT) + "/" + BUILDING_SLUG + "/" + NODE_ID;

  connectWiFi();
  configTime(TZ_OFFSET_SEC, 0, NTP_SERVER);   // NTP: marca de tiempo en cada lectura

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMessage);
  mqtt.setBufferSize(512);
  mqtt.setKeepAlive(15);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  connectMqtt();
  mqtt.loop();
  handlePir();

  if (mqtt.connected() && millis() - lastPublish >= intervalMs) {
    lastPublish = millis();
    publishTelemetry();
  }

  // LED: fijo = conectado al broker; parpadeo rápido = comando "identify"
  if (millis() < identifyUntil) digitalWrite(LED_PIN, (millis() / 120) % 2);
  else digitalWrite(LED_PIN, mqtt.connected() ? HIGH : LOW);
}
