"""
Traffic severity classification shared by every IntelliTraffic endpoint.

Thresholds are calibrated to the real LightGBM V2 output range observed
on the PeMS hourly dataset (0-993 veh/hr) and must be applied
consistently across the application:

    LOW       prediction < 200
    MODERATE  200 <= prediction < 400
    HIGH      400 <= prediction < 600
    SEVERE    prediction >= 600
"""

MODERATE_MIN = 200
HIGH_MIN = 400
SEVERE_MIN = 600

SEVERITY_LOW = "LOW"
SEVERITY_MODERATE = "MODERATE"
SEVERITY_HIGH = "HIGH"
SEVERITY_SEVERE = "SEVERE"


def classify_severity(prediction):
    """
    Classify a predicted traffic volume (veh/hr) into one of the four
    calibrated severity bands.
    """
    if prediction < MODERATE_MIN:
        return SEVERITY_LOW

    if prediction < HIGH_MIN:
        return SEVERITY_MODERATE

    if prediction < SEVERE_MIN:
        return SEVERITY_HIGH

    return SEVERITY_SEVERE
