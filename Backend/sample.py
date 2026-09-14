import os
import sys
import io
import json
import base64
import argparse
from pathlib import Path
import torch
import torch.nn as nn
from PIL import Image
from torchvision import models, transforms

# -------------------------------------------------
# Configuration and Constants
# -------------------------------------------------
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

BASE_DIR = Path(__file__).resolve().parent

DEFAULT_CHECKPOINT = os.getenv(
    "MODEL_PATH",
    str(BASE_DIR / "best_waste_model.pth")
)

IMG_SIZE = 224

class_names = [
    "Food Organics",
    "Textile Trash",
    "Vegetation",
    "cardboard",
    "glass",
    "metal",
    "paper",
    "plastic",
]

CLASS_METADATA = {
    "Food Organics": {
        "category": "Food Organics",
        "display_name": "Food Organics",
        "recommended_bin": "Organic / Wet Waste Bin",
        "recommendation": "Place food scraps, leftovers, and kitchen organic waste in the green wet waste or compost bin.",
        "icon": "🍎",
        "color": "#16a34a",
    },
    "Vegetation": {
        "category": "Vegetation",
        "display_name": "Vegetation",
        "recommended_bin": "Yard / Organic Waste Bin",
        "recommendation": "Place garden clippings, leaves, flowers, and plant waste in the compost or yard waste bin.",
        "icon": "🌿",
        "color": "#15803d",
    },
    "cardboard": {
        "category": "cardboard",
        "display_name": "Cardboard",
        "recommended_bin": "Paper / Cardboard Recycling Bin",
        "recommendation": "Flatten cardboard boxes to save space, ensure they are dry, and place in the dry recyclables bin.",
        "icon": "📦",
        "color": "#ca8a04",
    },
    "paper": {
        "category": "paper",
        "display_name": "Paper",
        "recommended_bin": "Paper Waste Bin",
        "recommendation": "Keep paper clean and dry. Place newspapers, office paper, and magazines in the blue paper recycling bin.",
        "icon": "📄",
        "color": "#2563eb",
    },
    "plastic": {
        "category": "plastic",
        "display_name": "Plastic",
        "recommended_bin": "Plastic Waste Bin",
        "recommendation": "Rinse out plastic containers, bottles, and packaging before placing in the plastic recycling bin.",
        "icon": "🥤",
        "color": "#0284c7",
    },
    "metal": {
        "category": "metal",
        "display_name": "Metal",
        "recommended_bin": "Metal Recycling Bin",
        "recommendation": "Rinse metal cans and foil. Place clean metal items into the designated metal recycling bin.",
        "icon": "🥫",
        "color": "#475569",
    },
    "glass": {
        "category": "glass",
        "display_name": "Glass",
        "recommended_bin": "Glass Waste Bin",
        "recommendation": "Handle glass jars and bottles carefully. Remove non-glass caps and place in the designated glass bin.",
        "icon": "🍾",
        "color": "#0d9488",
    },
    "Textile Trash": {
        "category": "Textile Trash",
        "display_name": "Textile Trash",
        "recommended_bin": "Textile / Donation Bin",
        "recommendation": "Donate usable clothing and clean textiles to donation centers, or drop off at fabric recycling facilities.",
        "icon": "👕",
        "color": "#7c3aed",
    },
}

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

val_transform = transforms.Compose([
    transforms.Resize((IMG_SIZE, IMG_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225],
    ),
])

# Global cached model
_cached_model = None


def load_model(checkpoint_path=DEFAULT_CHECKPOINT):
    """Loads and caches the ResNet-18 waste classification model."""
    global _cached_model
    if _cached_model is not None:
        return _cached_model

    # Candidate paths to search
    candidate_paths = [
        checkpoint_path,
        str(BASE_DIR / "best_waste_model.pth"),
        r"D:\Hackathons\SIH KLE DATA\Backend\best_waste_model.pth",
    ]

    model_path = None
    for cp in candidate_paths:
        if cp and os.path.isfile(cp):
            model_path = cp
            break

    if not model_path:
        raise FileNotFoundError(
            f"Model weights file not found. Looked in: {candidate_paths}"
        )

    # Recreate exact ResNet-18 model architecture
    model = models.resnet18(weights=None)
    num_features = model.fc.in_features
    model.fc = nn.Sequential(
        nn.Linear(num_features, 256),
        nn.ReLU(inplace=True),
        nn.Dropout(0.4),
        nn.Linear(256, len(class_names)),
    )

    checkpoint = torch.load(
        model_path,
        map_location=device,
        weights_only=False,
    )

    if isinstance(checkpoint, nn.Module):
        model = checkpoint
    elif isinstance(checkpoint, dict):
        if "model_state_dict" in checkpoint:
            model.load_state_dict(checkpoint["model_state_dict"])
        elif "state_dict" in checkpoint:
            model.load_state_dict(checkpoint["state_dict"])
        else:
            model.load_state_dict(checkpoint)
    else:
        raise TypeError("Unsupported model-file format.")

    model = model.to(device)
    model.eval()

    _cached_model = model
    return _cached_model


def _parse_image_input(image_source):
    """Resolves an image source (path, PIL Image, bytes, base64) to a PIL Image."""
    if isinstance(image_source, Image.Image):
        return image_source.convert("RGB")

    if isinstance(image_source, (str, Path)):
        s = str(image_source).strip()
        # Check if it is a base64 data url or base64 string
        if s.startswith("data:image") or len(s) > 300:
            if "base64," in s:
                s = s.split("base64,")[1]
            try:
                img_bytes = base64.b64decode(s)
                return Image.open(io.BytesIO(img_bytes)).convert("RGB")
            except Exception:
                pass

        if os.path.isfile(s):
            return Image.open(s).convert("RGB")
        raise FileNotFoundError(f"Image path not found: {s}")

    if isinstance(image_source, (bytes, bytearray)):
        return Image.open(io.BytesIO(image_source)).convert("RGB")

    if hasattr(image_source, "read"):
        return Image.open(image_source).convert("RGB")

    raise ValueError(f"Unsupported image input type: {type(image_source)}")


def predict_waste(image_source, checkpoint_path=DEFAULT_CHECKPOINT):
    """
    Predicts the waste category for an input image.
    Accepts:
      - File path string
      - PIL.Image object
      - Raw image bytes
      - Base64 encoded string / data URL
    Returns:
      Dictionary containing prediction, confidence, recommended bin,
      recommendations, icon, and full probability breakdown.
    """
    model = load_model(checkpoint_path)
    image = _parse_image_input(image_source)
    image_tensor = val_transform(image).unsqueeze(0).to(device)

    with torch.no_grad():
        output = model(image_tensor)
        probabilities = torch.softmax(output, dim=1)[0].cpu().tolist()

    predicted_index = int(torch.tensor(probabilities).argmax().item())
    raw_class = class_names[predicted_index]
    confidence = float(probabilities[predicted_index])

    meta = CLASS_METADATA.get(raw_class, {
        "category": raw_class,
        "display_name": raw_class.capitalize(),
        "recommended_bin": "General Waste Bin",
        "recommendation": "Dispose of according to local waste segregation rules.",
        "icon": "♻️",
        "color": "#2d3748",
    })

    # Top predictions sorted by probability
    ranked = sorted(
        [
            {
                "class_name": class_names[i],
                "display_name": CLASS_METADATA.get(class_names[i], {}).get("display_name", class_names[i]),
                "confidence": round(float(prob), 4),
                "confidence_pct": round(float(prob) * 100, 1),
            }
            for i, prob in enumerate(probabilities)
        ],
        key=lambda x: x["confidence"],
        reverse=True,
    )

    return {
        "prediction": meta["display_name"],
        "raw_class": raw_class,
        "confidence": round(confidence, 4),
        "confidence_percentage": round(confidence * 100, 1),
        "recommended_bin": meta["recommended_bin"],
        "recommendation": meta["recommendation"],
        "icon": meta["icon"],
        "color": meta["color"],
        "top_predictions": ranked[:3],
        "all_probabilities": {
            class_names[i]: round(float(probabilities[i]), 4)
            for i in range(len(class_names))
        },
    }


# -------------------------------------------------
# CLI & Standalone execution
# -------------------------------------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Classify waste image with ResNet-18")
    parser.add_argument("--image", type=str, help="Path to image file")
    parser.add_argument("--base64", type=str, help="Base64 encoded image string")
    parser.add_argument("--stdin", action="store_true", help="Read image / base64 from stdin")
    parser.add_argument("--json", action="store_true", help="Output only JSON")
    args = parser.parse_args()

    target_input = None
    if args.stdin:
        target_input = sys.stdin.read().strip()
    elif args.base64:
        target_input = args.base64
    elif args.image:
        target_input = args.image
    else:
        # Fallback to test images in repo if available
        sample_candidates = [
            str(BASE_DIR.parent / "Frontend" / "client" / "public" / "backgrounds" / "green-leaves.jpg"),
            r"C:\Users\HP\Pictures\Screenshots\Screenshot 2026-09-10 165346.png",
        ]
        for candidate in sample_candidates:
            if os.path.isfile(candidate):
                target_input = candidate
                break

    if not target_input:
        print("Error: No test image found. Please pass --image <path>", file=sys.stderr)
        sys.exit(1)

    result = predict_waste(target_input)

    if args.json:
        print(json.dumps(result))
    else:
        print("\n🌿 EcoSort Waste Model Loaded Successfully")
        print(f"Using device: {device}")
        print("-" * 45)
        print(f"Prediction result: {result['prediction']} ({result['icon']})")
        print(f"Confidence:        {result['confidence_percentage']}%")
        print(f"Recommended Bin:   {result['recommended_bin']}")
        print(f"Action:            {result['recommendation']}")
        print("-" * 45)
        print("Top probabilities:")
        for top in result["top_predictions"]:
            print(f"  • {top['display_name']}: {top['confidence_pct']}%")