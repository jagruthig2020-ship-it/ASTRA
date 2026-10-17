#pragma once
#include <stdint.h>
// These GPIOs MUST match your actual wiring; numbers refer to GPIO labels.
namespace Pins {
constexpr int PROBE=4, FAULT_BUTTON=25, HEARTBEAT_OUT=18;
constexpr int HEARTBEAT_IN=27, MAIN_RESET=32, PAYLOAD_GATE=26;
constexpr int GREEN_LED=19, RED_LED=23, BUZZER=33;
constexpr int SDA=21, SCL=22;
}
namespace Limits {
constexpr float TEMP_TRIP_C=45.0f;
constexpr float TEMP_CLEAR_C=40.0f;
// Values below are for the 3.3 V LED demonstration branch, NOT a 5 V load.
constexpr float VOLTAGE_MIN_V=2.70f;
constexpr float CURRENT_MAX_MA=30.0f;
constexpr unsigned long HEARTBEAT_HALF_PERIOD_MS=250;
constexpr unsigned long HEARTBEAT_TIMEOUT_MS=2000;
constexpr unsigned long BOOT_GRACE_MS=5000;
constexpr unsigned long RESET_PULSE_MS=300;
constexpr unsigned long RECOVERY_GRACE_MS=6000;
constexpr unsigned MAX_RESET_ATTEMPTS=3;
constexpr unsigned long RETRY_BUDGET_CLEAR_MS=60000;
}
constexpr bool ENABLE_BUZZER=false; // true ONLY with the separate transistor driver installed
constexpr uint8_t INA226_ADDRESS=0x40, OLED_ADDRESS=0x3C;
constexpr uint8_t OLED_HEIGHT=64; // change to 32 for a 128x32 SSD1306

// MUST match the resistor marking: R100=0.1 ohm, R010=0.01 ohm.
constexpr float INA226_SHUNT_OHMS=0.1f;
