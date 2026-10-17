# Pin map used by this software

Compare this table with the actual circuit before flashing. GPIO numbers refer to printed GPIO/D labels, not the physical pin number along the board edge. Breadboard rail sections can be split: test continuity across the section you use.

## Board roles and power

- **A = main controller**, **B = supervisor**.
- Power each board through its own USB connector. Their **GNDs share a common rail**.
- Keep **A 3V3 and B 3V3 separate**. A powers its probe; B powers its INA226, OLED and LED branch.
- Any GND pin on the same ESP32 is electrically the same ground. A normal five-hole breadboard group can also distribute GND if you deliberately connect it to common GND.

## Main A

| Component terminal | Connection |
|---|---|
| Heartbeat output A GPIO18 | B GPIO27 |
| Pushbutton contact 1 | A GPIO25 |
| Pushbutton opposite switched contact | Common GND |
| Probe DATA, usually yellow | A GPIO4 |
| Probe VDD, usually red | A 3V3 |
| Probe GND, usually black | Common GND |
| 4.7 kΩ probe pull-up | Between probe DATA / GPIO4 node and A 3V3 |

Probe wire colours vary by vendor: verify the actual DS18B20 probe's pinout. The pull-up is a branch from DATA to 3V3; it is not inserted in series with DATA. A 220 Ω resistor does not substitute for the 4.7 kΩ pull-up. Use soldered/insulated header leads or a screw-terminal adapter for bare probe wires.

For a four-leg tactile pushbutton, two pins are normally permanently connected as a pair and the other two form the second pair. Use a meter or the part drawing to select contacts that are **open when released** and **connected when pressed**. The firmware enables the internal pull-up, so an external button pull-up is unnecessary.

## Supervisor B peripherals

| Component terminal | Connection |
|---|---|
| INA226 VCC | B 3V3 |
| INA226 GND | Common GND |
| INA226 SDA | B GPIO21 |
| INA226 SCL | B GPIO22 |
| INA226 VBUS input (verify breakout label) | Monitored 3V3 supply; separate from chip VCC |
| INA226 VIN+ | B 3V3 |
| INA226 VIN− | 220 Ω LED resistor → payload LED anode |
| INA226 A0/A1, if present | Leave default address straps unchanged, 0x40 |
| OLED VCC | B 3V3 (for the compatible 3.3 V I2C module) |
| OLED GND | Common GND |
| OLED SDA | B GPIO21 |
| OLED SCL | B GPIO22 |
| Green status LED anode | B GPIO19 through its own 220 Ω resistor |
| Green status LED cathode | Common GND |
| Red status LED anode | B GPIO23 through its own 220 Ω resistor |
| Red status LED cathode | Common GND |

INA226 and OLED **share SDA and SCL** on the same supervisor bus. The default OLED configuration is SSD1306 128×64, address 0x3C. A different display controller such as SH1106 requires a different driver; changing the address alone is insufficient. The INA226 measures the small LED payload branch, not the whole ESP32's USB current. VBUS must be connected upstream of the switched load so the voltage reading remains near 3.3 V while the MOSFET turns the load off.

## Payload LED and IRLZ44N MOSFET

For the **IRLZ44N** in your photo, text face toward you and leads downward: **left = Gate, middle = Drain, right = Source**. The metal tab is also Drain.

| Terminal | Connection |
|---|---|
| Gate | B GPIO26 through 220 Ω |
| Gate pull-down | 10 kΩ from Gate to common GND |
| Drain | Payload LED cathode (short leg / flat-edge side) |
| Source | Common GND |
| Payload LED anode | 220 Ω resistor → INA226 VIN− |

The GPIO26 gate resistor and the LED's 220 Ω resistor are **two different resistors**. GPIO26 controls the MOSFET gate; the payload LED has no direct GPIO supply connection. These limits and current thresholds are for a small demonstration LED only.

## Reset transistor BC547B

Confirm the exact package pinout. For the usual BC547 TO-92 package, flat face toward you and legs down: **Collector, Base, Emitter** from left to right.

| Terminal | Connection |
|---|---|
| Collector | A EN |
| Base | B GPIO32 through **1 kΩ** |
| Base pull-down | **10 kΩ** from Base to common GND |
| Emitter | Common GND |

**The base does not connect directly to GND.** It connects to GND through the 10 kΩ pull-down. The emitter connects directly. B GPIO32 HIGH turns the NPN on and pulls A EN LOW for 300 ms. Do not connect B GPIO32 directly to A EN in addition to the transistor.

## Optional active buzzer

The core project works with no buzzer. `ENABLE_BUZZER` defaults to `false`.

For a small two-wire active buzzer, use a **second** BC547 driver: B GPIO33 → 1 kΩ → Base; 10 kΩ Base → GND; Emitter → GND; Collector → buzzer negative; buzzer positive → the supply specified for that buzzer. Grounds must be common. Verify its rated current fits the transistor and available supply. A magnetic buzzer may require a flyback diode according to its datasheet. Do not drive an unidentified buzzer directly from a GPIO or assume it is rated for 3.3 V.

Only enable the buzzer setting after that driver is installed. The reset transistor remains dedicated to A EN.

## No additional data wire required

A GPIO18 → B GPIO27 carries heartbeat. Each controller independently reports its readings over Wi-Fi to the Mac. A-to-B UART wiring is not used by this build. The OLED shows B's heartbeat, current, voltage and recovery state; the web dashboard also shows A's temperature.
