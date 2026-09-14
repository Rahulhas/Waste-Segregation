import os
import sys
from pathlib import Path
from flask import Flask, request, jsonify
from flask_cors import CORS

# Add current directory to path
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from sample import predict_waste, load_model, device
import database as db

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

app = Flask(__name__)
CORS(app)

# Initialize SQLite database
try:
    db.init_db()
    print("💾 SQLite database connected and initialized")
except Exception as e:
    print(f"⚠️ Database initialization warning: {e}", file=sys.stderr)

# Preload model at server startup
try:
    load_model()
    print(f"🌿 ResNet-18 waste model preloaded on {device}")
except Exception as e:
    print(f"⚠️ Model preload warning: {e}", file=sys.stderr)


@app.route("/", methods=["GET"])
def index():
    host = request.host.split(":")[0]
    client_url = f"http://{host}:5173"
    
    if "text/html" in request.headers.get("Accept", ""):
        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EcoSort AI Microservice (Port 5001)</title>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f7f9f6;
      color: #1a1f1c;
      margin: 0;
      padding: 40px 20px;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 80vh;
    }}
    .card {{
      background: white;
      border: 1px solid #c5d6c0;
      border-radius: 16px;
      max-width: 580px;
      width: 100%;
      padding: 32px;
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.06);
    }}
    .badge {{
      background: #d8f3dc;
      color: #1b4332;
      font-size: 12px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 999px;
      display: inline-block;
      margin-bottom: 12px;
    }}
    h1 {{
      font-size: 22px;
      margin: 0 0 8px 0;
      color: #081c15;
    }}
    p {{
      font-size: 14px;
      color: #5c6b63;
      margin: 0 0 20px 0;
      line-height: 1.5;
    }}
    .btn {{
      display: inline-block;
      background: #1b4332;
      color: white;
      text-decoration: none;
      font-weight: 700;
      font-size: 14px;
      padding: 12px 20px;
      border-radius: 10px;
      margin-bottom: 24px;
      transition: background 0.2s;
    }}
    .btn:hover {{
      background: #081c15;
    }}
    .grid {{
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 16px;
      border-top: 1px solid #e2ebe0;
      padding-top: 16px;
    }}
    .item {{
      background: #f0f4f1;
      border-radius: 8px;
      padding: 10px 14px;
    }}
    .label {{
      font-size: 11px;
      font-weight: 700;
      color: #7da872;
      text-transform: uppercase;
    }}
    .value {{
      font-size: 13px;
      font-weight: 600;
      color: #081c15;
      margin-top: 2px;
    }}
    .endpoints {{
      margin-top: 20px;
      font-size: 12px;
      color: #5c6b63;
    }}
    .endpoints a {{
      color: #2d6a4f;
      text-decoration: underline;
      margin-right: 12px;
      font-weight: 600;
    }}
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">🌿 AI Microservice Active</span>
    <h1>EcoSort Waste Classification API</h1>
    <p>This port (<code>:5001</code>) powers the PyTorch ResNet-18 computer vision inference engine and SQLite database.</p>
    
    <a href="{client_url}" class="btn">🚀 Open EcoSort Web Application (:5173) ➔</a>

    <div class="grid">
      <div class="item">
        <div class="label">Device</div>
        <div class="value">{device}</div>
      </div>
      <div class="item">
        <div class="label">Model Architecture</div>
        <div class="value">PyTorch ResNet-18</div>
      </div>
      <div class="item">
        <div class="label">Trained Classes</div>
        <div class="value">8 Categories</div>
      </div>
      <div class="item">
        <div class="label">Persistence Engine</div>
        <div class="value">SQLite3 (waste_data.db)</div>
      </div>
    </div>

    <div class="endpoints">
      <strong>Active Endpoints:</strong><br>
      <a href="/health">GET /health</a>
      <a href="/api/stats">GET /api/stats</a>
      <a href="/api/history">GET /api/history</a>
    </div>
  </div>
</body>
</html>"""
        return html, 200, {"Content-Type": "text/html"}

    return jsonify({
        "service": "EcoSort Waste Classification API",
        "status": "online",
        "port": 5001,
        "device": str(device),
        "model": "ResNet-18 (8 classes)",
        "web_app_url": client_url,
        "endpoints": ["/health", "/predict", "/api/history", "/api/stats"],
    })


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "service": "EcoSort Waste Classification API",
        "device": str(device),
        "model_loaded": True,
        "database": "sqlite",
    })


@app.route("/predict", methods=["POST"])
def predict():
    try:
        image_input = None
        image_meta = "upload"

        # Check multipart upload
        if "file" in request.files:
            file = request.files["file"]
            if file.filename == "":
                return jsonify({"error": "No file selected"}), 400
            image_input = file.read()
            image_meta = file.filename

        elif "image" in request.files:
            file = request.files["image"]
            if file.filename == "":
                return jsonify({"error": "No file selected"}), 400
            image_input = file.read()
            image_meta = file.filename

        else:
            # Check JSON payload
            data = request.get_json(silent=True)
            if data and "image" in data:
                image_val = data["image"]
                if not image_val:
                    return jsonify({"error": "Empty image payload"}), 400
                image_input = image_val
                image_meta = data.get("filename", "base64_capture")

        if not image_input:
            return jsonify({"error": "Missing image in request. Send JSON with 'image' key or multipart form with 'file'."}), 400

        # Perform inference
        result = predict_waste(image_input)

        # Log prediction to SQLite
        pred_id = None
        try:
            pred_id = db.insert_prediction(result, image_meta=image_meta)
            result["id"] = pred_id
        except Exception as db_err:
            print(f"Database logging error: {db_err}", file=sys.stderr)

        return jsonify({"success": True, "result": result})

    except Exception as exc:
        print(f"Prediction error: {exc}", file=sys.stderr)
        return jsonify({"error": str(exc)}), 500


@app.route("/api/history", methods=["GET"])
def history():
    """Retrieve logged predictions from SQLite."""
    try:
        limit = int(request.args.get("limit", 50))
        offset = int(request.args.get("offset", 0))
        category = request.args.get("category", None)
        records = db.get_predictions(limit=limit, offset=offset, category=category)
        return jsonify({"success": True, "predictions": records})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/stats", methods=["GET"])
def stats():
    """Retrieve waste classification statistics from SQLite."""
    try:
        data = db.get_stats()
        return jsonify({"success": True, "stats": data})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/feedback", methods=["POST"])
def feedback():
    """Submit feedback for a prediction (correct / incorrect)."""
    try:
        data = request.get_json() or {}
        prediction_id = data.get("prediction_id")
        feedback_status = data.get("feedback_status") # 'correct', 'incorrect'
        notes = data.get("notes")

        if not prediction_id or not feedback_status:
            return jsonify({"error": "prediction_id and feedback_status are required"}), 400

        ok = db.update_feedback(prediction_id, feedback_status, notes)
        return jsonify({"success": ok})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    print(f"🚀 EcoSort AI Microservice starting on http://127.0.0.1:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
