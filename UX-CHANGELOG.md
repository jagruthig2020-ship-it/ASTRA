# ASTRA current code + ATMOS cinematic UX

Base: ASTRA-ATMOS-REDESIGN.zip (existing backend, ML and firmware retained).
Frontend: static/ directory replaced with the cinematic UI from ASTRA-complete-3.zip, including scene.js and bundled Three.js assets.

No firmware pins, backend routes, or ML algorithms were changed.

Start: `bash start.command` (after setup if needed). Stop the previous port 8000 server first. Hard refresh the browser.

This is a frontend transplant; hardware functions still depend on correct wiring, firmware and live telemetry.
