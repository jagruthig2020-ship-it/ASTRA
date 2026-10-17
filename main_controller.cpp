#include <Arduino.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include "config.h"
#include "transport.h"

OneWire oneWire(Pins::PROBE);
DallasTemperature probe(&oneWire);
Transport transport("main");
unsigned long heartbeatAt=0, conversionAt=0, reportAt=0, debounceAt=0;
uint32_t heartbeatCount=0, commandAck=0, sequence=0;
bool heartbeatLevel=false, probeReady=false, thermalTrip=false;
bool conversionPending=false, injectedFreeze=false, injectedThermal=false;
bool firstValidTemperature=true;
bool buttonRaw=HIGH, buttonStable=HIGH;
float temperature=NAN;
String bootId;

void setup() {
  Serial.begin(115200);
  pinMode(Pins::HEARTBEAT_OUT,OUTPUT); digitalWrite(Pins::HEARTBEAT_OUT,LOW);
  pinMode(Pins::FAULT_BUTTON,INPUT_PULLUP);
  probe.begin(); probe.setResolution(10); probe.setWaitForConversion(false);
  probe.requestTemperatures(); conversionAt=millis(); conversionPending=true;
  bootId=String(esp_random(),HEX); transport.begin();
  Serial.println("ASTRA main ready. Button on GPIO25 injects a latched heartbeat fault.");
}

void loop() {
  unsigned long now=millis();
  bool reading=digitalRead(Pins::FAULT_BUTTON);
  if(reading!=buttonRaw) { buttonRaw=reading; debounceAt=now; }
  if(now-debounceAt>=35 && buttonStable!=buttonRaw) {
    buttonStable=buttonRaw;
    if(buttonStable==LOW) injectedFreeze=true;
  }
  Command command;
  while(transport.receive(command)) {
    if(strcmp(command.action,"freeze")==0) injectedFreeze=true;
    if(strcmp(command.action,"test_thermal")==0) injectedThermal=true;
    commandAck=command.id;
  }
  if(conversionPending && now-conversionAt>=250) {
    float value=probe.getTempCByIndex(0);
    probeReady=isfinite(value) && value!=DEVICE_DISCONNECTED_C && value>=-55 && value<=125;
    temperature=probeReady ? value : NAN;
    if(probeReady && firstValidTemperature) {
      // A reset must not bypass the 40 C thermal release condition.
      thermalTrip=value>Limits::TEMP_CLEAR_C; firstValidTemperature=false;
    }
    if(probeReady && value>=Limits::TEMP_TRIP_C) thermalTrip=true;
    if(probeReady && value<=Limits::TEMP_CLEAR_C) thermalTrip=false;
    conversionPending=false;
  }
  if(!conversionPending && now-conversionAt>=1000) {
    probe.requestTemperatures(); conversionAt=now; conversionPending=true;
  }
  const char* fault=injectedFreeze ? "injected_freeze" : injectedThermal ? "injected_thermal" :
      thermalTrip ? "overtemperature" : (!probeReady && now>Limits::BOOT_GRACE_MS) ? "probe_missing" : "none";
  bool healthy=strcmp(fault,"none")==0 && probeReady;
  bool starting=!probeReady && now<=Limits::BOOT_GRACE_MS && strcmp(fault,"none")==0;
  if(healthy && now-heartbeatAt>=Limits::HEARTBEAT_HALF_PERIOD_MS) {
    heartbeatAt=now; heartbeatLevel=!heartbeatLevel;
    digitalWrite(Pins::HEARTBEAT_OUT,heartbeatLevel); heartbeatCount++;
  } else if(!healthy) { heartbeatLevel=false; digitalWrite(Pins::HEARTBEAT_OUT,LOW); }
  if(now-reportAt>=500) {
    reportAt=now;
    DynamicJsonDocument doc(768);
    doc["boot_id"]=bootId; doc["seq"]=++sequence; doc["uptime_ms"]=now;
    doc["command_ack"]=commandAck; doc["heartbeat_count"]=heartbeatCount;
    doc["status"]=healthy ? "healthy" : starting ? "starting" : "fault"; doc["fault"]=fault;
    doc["probe_ok"]=probeReady;
    if(probeReady) doc["temperature_c"]=temperature; else doc["temperature_c"]=nullptr;
    transport.publish(doc);
    serializeJson(doc,Serial); Serial.println();
  }
  delay(2);
}
