"""Advisory anomaly detection trained from ASTRA's live healthy telemetry."""
from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
from math import isfinite

import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler


FEATURES = ("temperature_c", "voltage_v", "current_ma")
MIN_BASELINE_SAMPLES = 60


class BaselineAnomalyDetector:
    """A small, online-refitted Isolation Forest. Output is advisory, never a trip."""

    def __init__(self, max_samples: int = 3600):
        self.samples: deque[list[float]] = deque(maxlen=max_samples)
        self.scaler: StandardScaler | None = None
        self.model: IsolationForest | None = None
        self.last_fit_count = 0
        self.trained_at: str | None = None

    @staticmethod
    def vector(values: dict) -> list[float] | None:
        try:
            vector = [float(values[name]) for name in FEATURES]
        except (KeyError, TypeError, ValueError):
            return None
        return vector if all(isfinite(value) for value in vector) else None

    def observe_healthy(self, values: dict) -> None:
        vector = self.vector(values)
        if vector is None:
            return
        self.samples.append(vector)
        count = len(self.samples)
        if count >= MIN_BASELINE_SAMPLES and (self.model is None or count - self.last_fit_count >= 30):
            matrix = np.asarray(self.samples, dtype=float)
            self.scaler = StandardScaler().fit(matrix)
            scaled = self.scaler.transform(matrix)
            self.model = IsolationForest(
                n_estimators=120, contamination=0.03, random_state=42, n_jobs=1
            ).fit(scaled)
            self.last_fit_count = count
            self.trained_at = datetime.now(timezone.utc).isoformat()

    def inspect(self, values: dict) -> dict:
        vector = self.vector(values)
        if self.model is None or self.scaler is None or vector is None:
            return {"ready": False, "anomaly": False, "score": None}
        row = self.scaler.transform([vector])
        # decision_function is signed distance from the learned decision boundary;
        # lower values indicate more unusual readings. It is not a probability.
        decision = float(self.model.decision_function(row)[0])
        largest_deviation = float(np.max(np.abs(row[0])))
        score = max(-decision, largest_deviation / 4.0)
        return {
            "ready": True,
            # Isolation Forest catches unusual combinations within the learned
            # ranges; the four-sigma guard catches values beyond all training
            # split bounds, a known blind spot for tree isolation methods.
            "anomaly": int(self.model.predict(row)[0]) == -1 or largest_deviation > 4.0,
            "score": round(score, 5),
        }

    def status(self, values: dict | None = None) -> dict:
        result = self.inspect(values or {})
        return {
            **result,
            "method": "Isolation Forest",
            "baseline_samples": len(self.samples),
            "required_samples": MIN_BASELINE_SAMPLES,
            "trained_at": self.trained_at,
            "advisory_only": True,
            "score_meaning": "Higher values indicate more unusual readings; includes a four-standard-deviation guard; not a probability.",
        }
