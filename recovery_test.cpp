#include <cassert>
#include <cstring>
#include <iostream>
#include "supervisor_logic.h"
using S=SupervisorLogic;
int main() {
  // Startup requires several real heartbeat edges and a healthy sensor/supply.
  S c;c.begin(0);c.tick(100,2,true,true,true);assert(c.state==S::BOOT);
  c.tick(750,3,true,true,true);assert(c.state==S::RUNNING);
  assert(c.payloadEnabled(true,true));
  // Heartbeat timeout isolates payload and starts exactly one finite EN pulse.
  c.tick(3000,3,false,true,true);assert(c.state==S::RESETTING);
  assert(c.resets==1 && c.retries==1 && c.resetAsserted());
  assert(!c.payloadEnabled(true,false));
  c.tick(3299,3,false,true,true);assert(c.resetAsserted());
  c.tick(3300,3,false,true,true);assert(!c.resetAsserted() && c.state==S::VERIFYING);
  // Old edges cannot pass verification. Three new edges restore the payload.
  c.tick(3400,3,true,true,true);assert(c.state==S::VERIFYING);
  c.tick(4100,6,true,true,true);assert(c.state==S::RUNNING);
  assert(c.payloadEnabled(true,true));
  // Transient recovery doesn't erase the retry budget; sustained health does.
  assert(c.retries==1);c.tick(64101,200,true,true,true);assert(c.retries==0);
  // Permanent missing heartbeat reaches lockout after three reset attempts.
  S p;p.begin(0);uint32_t now=5001;p.tick(now,0,false,true,true);
  for(int i=0;i<3;i++) {
    assert(p.state==S::RESETTING);
    now+=300;p.tick(now,0,false,true,true);assert(p.state==S::VERIFYING);
    now+=6001;p.tick(now,0,false,true,true);
  }
  assert(p.state==S::LOCKED && p.resets==3 && !p.resetAsserted());
  assert(!p.payloadEnabled(true,true));
  // Manual reset cannot bypass a latched current/supply fault.
  assert(!p.resetMain(now,100));
  assert(!p.rearm(now,100,false,true));assert(!p.rearm(now,100,true,false));
  assert(p.rearm(now,100,true,true));assert(p.state==S::BOOT && p.retries==0);
  p.tick(now+1,100,true,true,true);assert(p.state==S::BOOT);
  p.tick(now+750,103,true,true,true);assert(p.state==S::RUNNING);
  p.manualOff=true;assert(!p.payloadEnabled(true,true));
  p.manualOff=false;p.trip("overcurrent");p.trip("undervoltage");
  assert(std::strcmp(p.fault,"overcurrent")==0 && p.state==S::LOCKED);
  assert(!p.resetMain(now+800,104));assert(!p.resetAsserted());
  // Sensor disappearance releases EN even during a reset, and keeps load off.
  S missing;missing.begin(0);missing.resetMain(100,0);missing.tick(150,0,false,false,false);
  assert(missing.state==S::LOCKED && !missing.resetAsserted());
  // Millisecond arithmetic remains valid across ESP32 millis() rollover.
  S wrap;wrap.begin(UINT32_MAX-100);wrap.tick(5001,0,false,true,true);
  assert(wrap.state==S::RESETTING);wrap.tick(5301,0,false,true,true);
  assert(wrap.state==S::VERIFYING);
  std::cout<<"Recovery policy: startup, timeout, reset pulse, fresh-edge verification, retry budget, lockout, re-arm, sensor loss and millis rollover PASS\n";
}
