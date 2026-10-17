#include <Arduino.h>
#include <Wire.h>
#include "ina226_sensor.h"
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "config.h"
#include "transport.h"
#include "supervisor_logic.h"

INA226Sensor ina(INA226_ADDRESS, INA226_SHUNT_OHMS);
Adafruit_SSD1306 oled(128,OLED_HEIGHT,&Wire,-1);
Transport transport("supervisor");
SupervisorLogic control;
portMUX_TYPE hbMux=portMUX_INITIALIZER_UNLOCKED;
volatile uint32_t edgeCount=0, edgeAt=0;
uint32_t sampleAt=0, displayAt=0, reportAt=0;
uint32_t sequence=0, commandAck=0;
unsigned badCurrent=0, badVoltage=0;
bool inaOk=false, oledOk=false, payload=false, hbOk=false;
float voltage=NAN, current=NAN;
String bootId;


void IRAM_ATTR heartbeatISR() {
  portENTER_CRITICAL_ISR(&hbMux); edgeCount++; edgeAt=millis(); portEXIT_CRITICAL_ISR(&hbMux);
}
void setPayload(bool on) { payload=on; digitalWrite(Pins::PAYLOAD_GATE,on?HIGH:LOW); }
void setup() {
  Serial.begin(115200);
  pinMode(Pins::MAIN_RESET,OUTPUT); digitalWrite(Pins::MAIN_RESET,LOW);
  pinMode(Pins::PAYLOAD_GATE,OUTPUT); setPayload(false);
  pinMode(Pins::GREEN_LED,OUTPUT); pinMode(Pins::RED_LED,OUTPUT);
  if(ENABLE_BUZZER) { pinMode(Pins::BUZZER,OUTPUT); digitalWrite(Pins::BUZZER,LOW); }
  pinMode(Pins::HEARTBEAT_IN,INPUT_PULLDOWN);
  attachInterrupt(digitalPinToInterrupt(Pins::HEARTBEAT_IN),heartbeatISR,CHANGE);
  Wire.begin(Pins::SDA,Pins::SCL); Wire.setTimeOut(20);
  inaOk=ina.begin(&Wire);

  // Probe address first: Adafruit begin() alone doesn't establish an OLED is present.
  Wire.beginTransmission(OLED_ADDRESS);
  if(Wire.endTransmission()==0) oledOk=oled.begin(SSD1306_SWITCHCAPVCC,OLED_ADDRESS);
  if(oledOk) { oled.clearDisplay(); oled.setTextSize(1); oled.setTextColor(SSD1306_WHITE); }
  control.begin(millis()); bootId=String(esp_random(),HEX); transport.begin();
  if(!inaOk) control.trip("current_sensor_missing");
}
void loop() {
  uint32_t now=millis(), edges, lastEdge;
  portENTER_CRITICAL(&hbMux); edges=edgeCount; lastEdge=edgeAt; portEXIT_CRITICAL(&hbMux);
  hbOk=edges>=3 && now-lastEdge<Limits::HEARTBEAT_TIMEOUT_MS;
  Command cmd;
  while(transport.receive(cmd)) {
    if(strcmp(cmd.action,"payload_off")==0) { control.manualOff=true; setPayload(false); }
    else if(strcmp(cmd.action,"payload_on")==0 && control.state==SupervisorLogic::RUNNING) control.manualOff=false;
    else if(strcmp(cmd.action,"reset_main")==0) control.resetMain(now,edges);
    else if(strcmp(cmd.action,"rearm")==0) {
      if(!inaOk) { inaOk=ina.begin(&Wire); }
      if(inaOk) inaOk=ina.read(voltage,current);
      control.rearm(now,edges,inaOk,isfinite(voltage) && voltage>=Limits::VOLTAGE_MIN_V);
    }
    else if(strcmp(cmd.action,"test_current")==0) control.trip("injected_overcurrent");
    else if(strcmp(cmd.action,"test_voltage")==0) control.trip("injected_undervoltage");
    commandAck=cmd.id;
  }
  if(now-sampleAt>=200) {
    sampleAt=now;
    if(inaOk) {
      Wire.beginTransmission(INA226_ADDRESS);
      inaOk=Wire.endTransmission()==0;
      if(inaOk) inaOk=ina.read(voltage,current);
    }
    if(!inaOk) { voltage=current=NAN; control.trip("current_sensor_missing"); }
    if(inaOk) {
      badCurrent=payload && fabs(current)>Limits::CURRENT_MAX_MA ? badCurrent+1:0;
      badVoltage=voltage<Limits::VOLTAGE_MIN_V ? badVoltage+1:0;
      if(badCurrent>=5) control.trip("overcurrent");
      else if(badVoltage>=5) control.trip("undervoltage");
    }
  }
  control.tick(now,edges,hbOk,inaOk,isfinite(voltage) && voltage>=Limits::VOLTAGE_MIN_V);
  digitalWrite(Pins::MAIN_RESET,control.resetAsserted()?HIGH:LOW);
  setPayload(control.payloadEnabled(inaOk,hbOk));
  digitalWrite(Pins::GREEN_LED,control.state==SupervisorLogic::RUNNING?HIGH:LOW);
  digitalWrite(Pins::RED_LED,control.state==SupervisorLogic::RUNNING?LOW:HIGH);
  if(ENABLE_BUZZER) digitalWrite(Pins::BUZZER,control.state!=SupervisorLogic::RUNNING && (now/250)%2 ? HIGH:LOW);
  if(oledOk && now-displayAt>=500) {
    displayAt=now; oled.clearDisplay(); oled.setCursor(0,0);
    oled.println("ASTRA SUPERVISOR"); oled.println(control.name());
    oled.print("HB "); oled.print(hbOk?"OK":"LOST"); oled.print(" R:"); oled.println(control.resets);
    if(inaOk) { oled.print(voltage,2); oled.print(" V  "); oled.print(current,1); oled.println(" mA"); }
    else oled.println("INA226 MISSING");
    if(OLED_HEIGHT>=64) { oled.print("Payload "); oled.println(payload?"ON":"OFF"); oled.println(control.fault); }
    oled.display();
  }
  if(now-reportAt>=500) {
    reportAt=now; DynamicJsonDocument doc(1024);
    doc["boot_id"]=bootId; doc["seq"]=++sequence; doc["uptime_ms"]=now;
    doc["command_ack"]=commandAck; doc["status"]=control.name(); doc["fault"]=control.fault;
    doc["heartbeat_ok"]=hbOk; doc["heartbeat_count"]=edges;
    doc["payload_enabled"]=payload; doc["reset_count"]=control.resets;
    doc["reset_attempts"]=control.retries; doc["ina226_ok"]=inaOk; doc["oled_ok"]=oledOk;
    doc["manual_off"]=control.manualOff;
    if(inaOk) { doc["voltage_v"]=voltage; doc["current_ma"]=current; }
    else { doc["voltage_v"]=nullptr; doc["current_ma"]=nullptr; }
    transport.publish(doc); serializeJson(doc,Serial); Serial.println();
  }
  delay(2);
}
