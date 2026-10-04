"""
Generate src/assets/hero-maps/depth.png from src/assets/hero.jpg with
Depth Anything V2, post-processed for the hero's parallax.

    python -m venv .depthenv
    .depthenv/Scripts/pip install torch --index-url https://download.pytorch.org/whl/cpu
    .depthenv/Scripts/pip install transformers pillow numpy scipy
    .depthenv/Scripts/python src/hero/tools/make-depth.py

Prints the figure's depth: put it in heroConfig.scene.personDepth.
"""
import sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from scipy import ndimage
from transformers import AutoImageProcessor, AutoModelForDepthEstimation

root = Path(__file__).resolve().parents[3]
src = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "src/assets/hero.jpg"
out = Path(sys.argv[2]) if len(sys.argv) > 2 else root / "src/assets/hero-maps/depth.png"
model_name = "depth-anything/Depth-Anything-V2-Base-hf"

proc = AutoImageProcessor.from_pretrained(model_name)
model = AutoModelForDepthEstimation.from_pretrained(model_name).eval()
img = Image.open(src).convert("RGB")
with torch.no_grad():
    pred = model(**proc(images=img, return_tensors="pt")).predicted_depth  # larger = nearer
    pred = torch.nn.functional.interpolate(pred.unsqueeze(1), size=(img.height, img.width), mode="bicubic", align_corners=False)[0, 0]
d = pred.numpy().astype(np.float32)
H, W = d.shape

lo, hi = np.percentile(d, 0.5), np.percentile(d, 99.5)
n = np.clip((d - lo) / (hi - lo), 0, 1)
region = lambda a, y0, y1, x0, x1: float(np.median(a[int(y0 * H):int(y1 * H), int(x0 * W):int(x1 * W)]))

# The island top lands on the parallax focus (0.5): the figure stays put, the
# sky and the foreground move in opposite directions. The far side gets a
# gentle curve so cloud towers separate from the sky behind them.
g = region(n, 0.42, 0.55, 0.35, 0.65)
m = np.where(n <= g, 0.5 * (n / g) ** 0.7, 0.5 + 0.5 * (n - g) / (1 - g))
# Grow near objects outward so silhouettes move rigidly and any stretch lands
# in soft cloud, then smooth so there are no hard steps to tear.
m = ndimage.grey_dilation(m, size=(9, 9))
m = ndimage.gaussian_filter(m, sigma=4 * W / 1672)

out.parent.mkdir(parents=True, exist_ok=True)
Image.fromarray(np.round(np.clip(m, 0, 1) * 255).astype(np.uint8), "L").save(out)
print(f"wrote {out}")
print(f"personDepth: {region(m, 0.375, 0.435, 0.478, 0.512):.2f}")
