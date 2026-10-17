from anomaly import BaselineAnomalyDetector, MIN_BASELINE_SAMPLES


def test_detector_waits_for_real_baseline_then_flags_outlier():
    detector = BaselineAnomalyDetector()
    for i in range(MIN_BASELINE_SAMPLES - 1):
        detector.observe_healthy({
            "temperature_c": 27.9 + (i % 5) * 0.05,
            "voltage_v": 3.29 + (i % 3) * 0.005,
            "current_ma": 5.0 + (i % 4) * 0.04,
        })
    assert not detector.status({"temperature_c": 28, "voltage_v": 3.3, "current_ma": 5})["ready"]
    detector.observe_healthy({"temperature_c": 28.1, "voltage_v": 3.305, "current_ma": 5.12})
    result = detector.status({"temperature_c": 70, "voltage_v": 1.2, "current_ma": 500})
    assert result["ready"] and result["anomaly"]
    assert result["advisory_only"] and result["score"] > 0
    assert "not a probability" in result["score_meaning"]


def test_bad_or_missing_sensor_values_are_not_used():
    detector = BaselineAnomalyDetector()
    detector.observe_healthy({"temperature_c": float("nan"), "voltage_v": 3.3, "current_ma": 5})
    detector.observe_healthy({"temperature_c": 28, "voltage_v": None, "current_ma": 5})
    assert detector.status()["baseline_samples"] == 0
