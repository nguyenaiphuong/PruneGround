"""Lossless panel extraction from the supplied qualitative figure; no retouching.

Run from any directory: python3 scripts/extract-qualitative.py [--check]
Requires Pillow. Crop coordinates are in source-image pixels, right/bottom exclusive.
"""
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/images/qualitative.png"
OUT = ROOT / "assets/images/qualitative"
ROWS = {"chair": (0, 480), "desk": (520, 1070), "cabinet": (1120, 1595)}
COLUMNS = {"full": (420, 980), "pruned": (1020, 1460),
           "prediction": (2070, 2540), "ground-truth": (2570, 3126)}
CHECK = "--check" in sys.argv

with Image.open(SOURCE) as source:
    assert source.size == (3126, 1798), "Unexpected source figure dimensions"
    manifest = {"source": "../qualitative.png", "source_sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                "operation": "Lossless rectangular crops only; original pixels, geometry and box colors unchanged.", "panels": {}}
    if not CHECK:
        OUT.mkdir(parents=True, exist_ok=True)
    for case, (top, bottom) in ROWS.items():
        for stage, (left, right) in COLUMNS.items():
            name = f"{case}-{stage}.png"
            box = (left, top, right, bottom)
            panel = source.crop(box)
            if CHECK:
                with Image.open(OUT / name) as saved:
                    assert saved.size == panel.size and saved.mode == panel.mode
                    assert saved.tobytes() == panel.tobytes(), name
            else:
                panel.save(OUT / name, optimize=True)
            manifest["panels"][name] = {"crop_xyxy": list(box), "width": panel.width, "height": panel.height,
                                       "sha256": hashlib.sha256((OUT / name).read_bytes()).hexdigest()}
    if CHECK:
        assert json.loads((OUT / "manifest.json").read_text()) == manifest
    else:
        (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"{'Verified' if CHECK else 'Extracted'} 12 original figure panels.")
