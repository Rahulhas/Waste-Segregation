import os
import sys
import json
import base64
import time
import subprocess
import urllib.request
import urllib.error
from pathlib import Path

# Ensure UTF-8 output
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_DIR = Path(__file__).resolve().parent
TEST_IMG = BASE_DIR.parent / "Frontend" / "client" / "public" / "backgrounds" / "green-leaves.jpg"

print("=" * 60)
print("🧪 RUNNING COMPREHENSIVE ECOSORT AI + SQLITE INTEGRATION TESTS")
print("=" * 60)

# Check test image
assert TEST_IMG.is_file(), f"Test image not found at {TEST_IMG}"
with open(TEST_IMG, "rb") as f:
    b64_data = "data:image/jpeg;base64," + base64.b64encode(f.read()).decode()

# -------------------------------------------------------------
# Test 1: Direct Python Module Inference & SQLite DB
# -------------------------------------------------------------
print("\n[Test 1/5] Direct PyTorch Inference (sample.py) & SQLite Logging...")
sys.path.insert(0, str(BASE_DIR))
from sample import predict_waste
import database as db

# Initialize SQLite database
db_path = db.init_db()
assert Path(db_path).is_file(), f"SQLite database not created at {db_path}"
print(f"  ✓ SQLite database initialized at: {db_path}")

result_direct = predict_waste(str(TEST_IMG))
assert result_direct is not None, "Direct prediction returned None"
assert "prediction" in result_direct, "Missing 'prediction' field"
assert "confidence" in result_direct, "Missing 'confidence' field"

# Test direct SQLite insertion
pred_id = db.insert_prediction(result_direct, image_meta="test_direct_leaves.jpg")
assert pred_id is not None and pred_id > 0, "Failed to insert prediction into SQLite"
fetched = db.get_prediction_by_id(pred_id)
assert fetched is not None and fetched["prediction"] == result_direct["prediction"]

print(f"  ✓ Direct PyTorch inference & SQLite log succeeded!")
print(f"    • Prediction: {result_direct['prediction']} ({result_direct['icon']})")
print(f"    • Confidence: {result_direct['confidence_percentage']}%")
print(f"    • SQLite Record ID: #{pred_id}")

# -------------------------------------------------------------
# Test 2: Flask AI Microservice with SQLite Endpoints
# -------------------------------------------------------------
print("\n[Test 2/5] Testing Flask AI Microservice with SQLite (port 5001)...")
flask_proc = subprocess.Popen(
    [sys.executable, str(BASE_DIR / "app.py")],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    cwd=str(BASE_DIR),
    env={**os.environ, "PORT": "5001", "PYTHONIOENCODING": "utf-8"}
)

time.sleep(3) # Wait for server and model to warm up

try:
    # Health check
    req = urllib.request.Request("http://127.0.0.1:5001/health")
    with urllib.request.urlopen(req, timeout=5) as resp:
        health_data = json.loads(resp.read().decode())
        assert health_data.get("status") == "ok"
        assert health_data.get("database") == "sqlite"
        print(f"  ✓ Flask health check passed: {health_data}")

    # Predict endpoint (automatically logs to SQLite)
    predict_req = urllib.request.Request(
        "http://127.0.0.1:5001/predict",
        data=json.dumps({"image": b64_data}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(predict_req, timeout=10) as resp:
        res = json.loads(resp.read().decode())
        assert res.get("success") is True
        assert res["result"]["prediction"] == result_direct["prediction"]
        assert "id" in res["result"], "Missing SQLite 'id' in prediction response"
        print(f"  ✓ Flask POST /predict succeeded (Logged as SQLite ID #{res['result']['id']})")

    # History endpoint
    with urllib.request.urlopen("http://127.0.0.1:5001/api/history?limit=5", timeout=5) as resp:
        hist_data = json.loads(resp.read().decode())
        assert hist_data.get("success") is True
        assert len(hist_data["predictions"]) > 0
        print(f"  ✓ Flask GET /api/history retrieved {len(hist_data['predictions'])} records from SQLite")

    # Stats endpoint
    with urllib.request.urlopen("http://127.0.0.1:5001/api/stats", timeout=5) as resp:
        stats_data = json.loads(resp.read().decode())
        assert stats_data.get("success") is True
        assert stats_data["stats"]["total_predictions"] > 0
        print(f"  ✓ Flask GET /api/stats: Total={stats_data['stats']['total_predictions']}, AvgConf={stats_data['stats']['average_confidence']}%")

finally:
    # -------------------------------------------------------------
    # Test 3: Express Backend Route WITH Flask Service Running
    # -------------------------------------------------------------
    print("\n[Test 3/5] Testing Express API Route (/api/waste/analyze) with microservice...")
    server_dir = BASE_DIR.parent / "Frontend" / "server"
    express_proc = subprocess.Popen(
        ["node", "src/index.js"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=str(server_dir),
        env={**os.environ, "PORT": "5000", "AI_SERVICE_URL": "http://127.0.0.1:5001"}
    )
    time.sleep(2)

    try:
        # Express health
        with urllib.request.urlopen("http://localhost:5000/api/health", timeout=5) as resp:
            print("  ✓ Express server online")

        # Express waste analyze (fast path via Flask + SQLite)
        t0 = time.time()
        analyze_req = urllib.request.Request(
            "http://localhost:5000/api/waste/analyze",
            data=json.dumps({"image": b64_data}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(analyze_req, timeout=10) as resp:
            express_res = json.loads(resp.read().decode())
            assert express_res.get("success") is True
            elapsed = time.time() - t0
            print(f"  ✓ Express primary path succeeded in {elapsed:.2f}s!")
            print(f"    • Category: {express_res['result']['prediction']}")
            print(f"    • Bin:      {express_res['result']['recommended_bin']}")

        # Express waste history from SQLite
        with urllib.request.urlopen("http://localhost:5000/api/waste/history", timeout=5) as resp:
            exp_hist = json.loads(resp.read().decode())
            assert exp_hist.get("success") is True
            assert len(exp_hist.get("predictions", [])) > 0
            print(f"  ✓ Express GET /api/waste/history returned {len(exp_hist['predictions'])} SQLite predictions")

    finally:
        # Now kill Flask process so we can test CLI fallback
        flask_proc.terminate()
        flask_proc.kill()
        time.sleep(1)

    # -------------------------------------------------------------
    # Test 4: Express Backend Route CLI Fallback (Flask offline)
    # -------------------------------------------------------------
    print("\n[Test 4/5] Testing Express CLI Fallback (Flask offline)...")
    try:
        t0 = time.time()
        analyze_req2 = urllib.request.Request(
            "http://localhost:5000/api/waste/analyze",
            data=json.dumps({"image": b64_data}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(analyze_req2, timeout=15) as resp:
            fallback_res = json.loads(resp.read().decode())
            assert fallback_res.get("success") is True
            elapsed = time.time() - t0
            print(f"  ✓ Express CLI fallback succeeded in {elapsed:.2f}s!")
            print(f"    • Category: {fallback_res['result']['prediction']}")
            print(f"    • Bin:      {fallback_res['result']['recommended_bin']}")
    finally:
        express_proc.terminate()
        express_proc.kill()

# -------------------------------------------------------------
# Test 5: CLI Database Tool (manage_db.py)
# -------------------------------------------------------------
print("\n[Test 5/5] Testing manage_db.py CLI tool...")
cli_res = subprocess.run(
    [sys.executable, str(BASE_DIR / "manage_db.py"), "stats"],
    capture_output=True,
    text=True,
    cwd=str(BASE_DIR),
    env={**os.environ, "PYTHONIOENCODING": "utf-8"}
)
assert cli_res.returncode == 0, f"manage_db.py failed: {cli_res.stderr}"
assert "Total Predictions:" in cli_res.stdout
print("  ✓ manage_db.py stats executed successfully!")

print("\n" + "=" * 60)
print("🎉 ALL 5 INTEGRATION & SQLITE TESTS PASSED!")
print("=" * 60)
