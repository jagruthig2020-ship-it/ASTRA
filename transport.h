#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/task.h>
#if __has_include("secrets.h")
#include "secrets.h"
#else
#define ASTRA_WIFI_SSID ""
#define ASTRA_WIFI_PASSWORD ""
#define ASTRA_SERVER_URL "http://192.168.1.100:8000"
#define ASTRA_API_KEY ""
#endif

struct Command { uint32_t id; char action[32]; };
struct TelemetryPacket { char json[1024]; };
// All network work lives on core 0. Control loops never wait for HTTP or Wi-Fi.
class Transport {
  QueueHandle_t telemetryQueue=nullptr, commandQueue=nullptr;
  const char* device;
  String serialLine;
  uint32_t lastSerialId=0;
  static void run(void* arg) { static_cast<Transport*>(arg)->worker(); }
  void worker() {
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.begin(ASTRA_WIFI_SSID, ASTRA_WIFI_PASSWORD);
    unsigned long retryAt=millis();
    uint32_t lastDelivered=0;
    for (;;) {
      if(WiFi.status()!=WL_CONNECTED) {
        if(millis()-retryAt>10000) { WiFi.reconnect(); retryAt=millis(); }
      } else {
        TelemetryPacket packet;
        if(xQueuePeek(telemetryQueue,&packet,0)==pdTRUE) {
          WiFiClient client;
          HTTPClient http;
          http.setConnectTimeout(700); http.setTimeout(700);
          String url=String(ASTRA_SERVER_URL)+"/api/devices/"+device+"/telemetry";
          if(http.begin(client,url)) {
            http.addHeader("Content-Type","application/json");
            http.addHeader("X-ASTRA-Key",ASTRA_API_KEY);
            int code=http.POST(reinterpret_cast<uint8_t*>(packet.json),strlen(packet.json));
            if(code==200) {
              DynamicJsonDocument response(768);
              if(!deserializeJson(response,http.getString())) {
                JsonObject obj=response["command"];
                uint32_t id=obj["id"] | 0;
                if(id && id!=lastDelivered) {
                  Command cmd{}; cmd.id=id;
                  strlcpy(cmd.action,obj["action"] | "",sizeof(cmd.action));
                  if(xQueueSend(commandQueue,&cmd,0)==pdTRUE) lastDelivered=id;
                }
              }
            }
            http.end();
          }
        }
      }
      vTaskDelay(pdMS_TO_TICKS(1000));
    }
  }
public:
  explicit Transport(const char* role):device(role){}
  void begin() {
    telemetryQueue=xQueueCreate(1,sizeof(TelemetryPacket));
    commandQueue=xQueueCreate(4,sizeof(Command));
    if(!telemetryQueue || !commandQueue) { Serial.println("Transport allocation failed; local control continues."); return; }
    if(strlen(ASTRA_WIFI_SSID)) {
      if(xTaskCreatePinnedToCore(run,"astra-net",8192,this,1,nullptr,0)!=pdPASS)
        Serial.println("Network task failed; local control continues.");
    } else Serial.println("Wi-Fi not configured. Local autonomous operation is available.");
  }
  void publish(JsonDocument& doc) {
    if(!telemetryQueue)return;
    TelemetryPacket p{}; serializeJson(doc,p.json,sizeof(p.json));
    xQueueOverwrite(telemetryQueue,&p);
  }
  bool receive(Command& cmd) {
    // Newline-delimited command envelopes from the local USB bridge.
    while(Serial.available()) {
      char c=Serial.read();
      if(c=='\n') {
        StaticJsonDocument<192> d;
        bool valid=!deserializeJson(d,serialLine); serialLine="";
        uint32_t id=d["id"] | 0;
        const char* action=d["action"] | "";
        if(valid && id && id!=lastSerialId && strlen(action)<sizeof(cmd.action)) {
          cmd.id=id; strlcpy(cmd.action,action,sizeof(cmd.action)); lastSerialId=id; return true;
        }
      } else if(c!='\r') {
        serialLine+=c;
        if(serialLine.length()>191) serialLine="";
      }
    }
    return commandQueue && xQueueReceive(commandQueue,&cmd,0)==pdTRUE;
  }
};
