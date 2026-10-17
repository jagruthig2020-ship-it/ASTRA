#pragma once
#include <Arduino.h>
#include <Wire.h>
// TI INA226 registers: bus LSB=1.25 mV; signed shunt LSB=2.5 uV.
// Current is computed directly from shunt voltage / actual shunt resistance.
class INA226Sensor {
  uint8_t address; float shunt; TwoWire* bus=nullptr;
  bool reg(uint8_t index,uint16_t& value) {
    bus->beginTransmission(address); bus->write(index);
    if(bus->endTransmission(false)!=0)return false;
    if(bus->requestFrom(address,(uint8_t)2)!=(uint8_t)2)return false;
    value=((uint16_t)bus->read()<<8)|bus->read(); return true;
  }
public:
  INA226Sensor(uint8_t a,float r):address(a),shunt(r){}
  bool begin(TwoWire* wire) {
    bus=wire; uint16_t manufacturer=0,die=0;
    if(shunt<=0 || !reg(0xFE,manufacturer) || !reg(0xFF,die))return false;
    if(manufacturer!=0x5449 || (die&0xFFF0)!=0x2260)return false;
    // Four-sample averaging, 1.1 ms conversions, continuous shunt + bus.
    bus->beginTransmission(address); bus->write(0x00); bus->write(0x43); bus->write(0x27);
    return bus->endTransmission()==0;
  }
  bool read(float& voltage,float& current) {
    uint16_t v=0,s=0;
    if(!reg(0x02,v)||!reg(0x01,s)) { voltage=current=NAN; return false; }
    voltage=v*0.00125f; current=(int16_t)s*0.0025f/shunt;
    return true;
  }
};
