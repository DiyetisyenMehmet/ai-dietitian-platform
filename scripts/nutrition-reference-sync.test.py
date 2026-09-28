#!/usr/bin/env python3
import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).with_name("nutrition-reference-sync.py")
spec = importlib.util.spec_from_file_location("nutrition_reference_sync", SCRIPT)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

headers = [
    "Food name",
    "Calcium (mg/100 g)",
    "Vitamin D (µg/100 g)",
    "Folate (µg/100 g)",
    "Iron (mg/100 g)",
]
columns = module.micronutrient_columns(headers)
assert columns["calcium"] == 1
assert columns["vitaminD"] == 2
assert columns["folate"] == 3
assert columns["iron"] == 4
assert columns["magnesium"] is None

assert module.header_unit("Vitamin D (µg/100 g)") == "ug"
assert module.header_unit("Calcium (mg/100 g)") == "mg"
assert module.convert_unit(0.12, "g", "mg") == 120
assert module.convert_unit(0.005, "mg", "ug") == 5
assert module.convert_unit(None, "mg", "mg") is None
assert module.parse_number("trace") is None
assert module.parse_number("") is None

print("nutrition reference micronutrient mapping: PASS")
