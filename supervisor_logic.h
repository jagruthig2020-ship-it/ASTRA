#pragma once
#include <stdint.h>
#include "config.h"

// Pure control policy: shared by the real ESP32 and native C++ recovery tests.
class SupervisorLogic {
public:
  enum State { BOOT, RUNNING, RESETTING, VERIFYING, LOCKED };
  State state=BOOT;
  const char* fault="none";
  uint32_t retries=0, resets=0;
  bool manualOff=false;
private:
  uint32_t phaseAt=0, phaseEdges=0, healthyAt=0;
  void startReset(uint32_t now,uint32_t edges) {
    if(retries>=Limits::MAX_RESET_ATTEMPTS) { trip("recovery_failed"); return; }
    retries++; resets++; state=RESETTING; phaseAt=now; phaseEdges=edges;
    fault="heartbeat_timeout";
  }
public:
  void begin(uint32_t now,uint32_t edges=0) { phaseAt=now; phaseEdges=edges; }
  void trip(const char* cause) {
    // Keep the original latched cause until re-arm; later faults must not hide it.
    if(state!=LOCKED) fault=cause;
    state=LOCKED;
  }
  bool resetMain(uint32_t now,uint32_t edges) {
    if(state==LOCKED || state==RESETTING)return false;
    startReset(now,edges);return state==RESETTING;
  }
  bool rearm(uint32_t now,uint32_t edges,bool sensorOk,bool voltageOk) {
    if(!sensorOk || !voltageOk)return false;
    retries=0;fault="none";manualOff=false;state=BOOT;
    phaseAt=now;phaseEdges=edges;return true;
  }
  void tick(uint32_t now,uint32_t edges,bool heartbeatOk,bool sensorOk,bool voltageOk) {
    if(!sensorOk) {trip("current_sensor_missing");return;}
    switch(state) {
      case BOOT:
        if(heartbeatOk && edges-phaseEdges>=3 && voltageOk) {
          state=RUNNING;healthyAt=now;fault="none";
        } else if(now-phaseAt>Limits::BOOT_GRACE_MS) startReset(now,edges);
        break;
      case RUNNING:
        if(!heartbeatOk)startReset(now,edges);
        else if(now-healthyAt>Limits::RETRY_BUDGET_CLEAR_MS)retries=0;
        break;
      case RESETTING:
        if(now-phaseAt>=Limits::RESET_PULSE_MS) {
          state=VERIFYING;phaseAt=now;phaseEdges=edges;
        }
        break;
      case VERIFYING:
        if(heartbeatOk && edges-phaseEdges>=3 && voltageOk) {
          state=RUNNING;healthyAt=now;fault="none";
        } else if(now-phaseAt>Limits::RECOVERY_GRACE_MS)startReset(now,edges);
        break;
      case LOCKED:break;
    }
  }
  bool payloadEnabled(bool sensorOk,bool heartbeatOk)const {
    return state==RUNNING && !manualOff && sensorOk && heartbeatOk;
  }
  bool resetAsserted()const {return state==RESETTING;}
  const char* name()const {
    switch(state) {
      case BOOT:return "starting";case RUNNING:return "healthy";
      case RESETTING:case VERIFYING:return "recovering";default:return "locked_out";
    }
  }
};
