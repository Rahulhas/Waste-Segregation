import os
import sys
import json
import sqlite3
from pathlib import Path
from datetime import datetime

# Default database location: Backend/waste_predictions.db
BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DB_PATH = os.getenv("SQLITE_DB_PATH", str(BASE_DIR / "waste_predictions.db"))


def get_connection(db_path=None):
    """Establishes a connection to the SQLite database with dict row factory."""
    path = db_path or DEFAULT_DB_PATH
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(db_path=None):
    """Initializes SQLite schema and seeds standard categories."""
    path = db_path or DEFAULT_DB_PATH
    conn = get_connection(path)
    cursor = conn.cursor()

    # Table 1: Waste Categories Reference Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS waste_categories (
            category_name TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            recommended_bin TEXT NOT NULL,
            recommendation TEXT NOT NULL,
            icon TEXT NOT NULL,
            color TEXT NOT NULL
        )
    """)

    # Table 2: Waste Predictions Log
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS predictions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id TEXT,
            prediction TEXT NOT NULL,
            raw_class TEXT NOT NULL,
            confidence REAL NOT NULL,
            confidence_pct REAL NOT NULL,
            recommended_bin TEXT NOT NULL,
            recommendation TEXT,
            icon TEXT,
            image_meta TEXT,
            all_probabilities_json TEXT,
            feedback_status TEXT DEFAULT 'unreviewed',
            user_notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Indexes
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_predictions_created_at
        ON predictions(created_at DESC)
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_predictions_prediction
        ON predictions(prediction)
    """)

    # Seed reference categories if empty
    cursor.execute("SELECT COUNT(*) FROM waste_categories")
    if cursor.fetchone()[0] == 0:
        categories = [
            ("Food Organics", "Food Organics", "Organic / Wet Waste Bin", "Place food scraps, leftovers, and kitchen organic waste in the green wet waste or compost bin.", "🍎", "#16a34a"),
            ("Vegetation", "Vegetation", "Yard / Organic Waste Bin", "Place garden clippings, leaves, flowers, and plant waste in the compost or yard waste bin.", "🌿", "#15803d"),
            ("cardboard", "Cardboard", "Paper / Cardboard Recycling Bin", "Flatten cardboard boxes to save space, ensure they are dry, and place in the dry recyclables bin.", "📦", "#ca8a04"),
            ("paper", "Paper", "Paper Waste Bin", "Keep paper clean and dry. Place newspapers, office paper, and magazines in the blue paper recycling bin.", "📄", "#2563eb"),
            ("plastic", "Plastic", "Plastic Waste Bin", "Rinse out plastic containers, bottles, and packaging before placing in the plastic recycling bin.", "🥤", "#0284c7"),
            ("metal", "Metal", "Metal Recycling Bin", "Rinse metal cans and foil. Place clean metal items into the designated metal recycling bin.", "🥫", "#475569"),
            ("glass", "Glass", "Glass Waste Bin", "Handle glass jars and bottles carefully. Remove non-glass caps and place in the designated glass bin.", "🍾", "#0d9488"),
            ("Textile Trash", "Textile Trash", "Textile / Donation Bin", "Donate usable clothing and clean textiles to donation centers, or drop off at fabric recycling facilities.", "👕", "#7c3aed"),
        ]
        cursor.executemany("""
            INSERT INTO waste_categories (category_name, display_name, recommended_bin, recommendation, icon, color)
            VALUES (?, ?, ?, ?, ?, ?)
        """, categories)

    conn.commit()
    conn.close()
    return path


def insert_prediction(result, image_meta=None, ticket_id=None, db_path=None):
    """
    Logs an AI prediction result dictionary to SQLite.
    Returns the integer ID of the inserted record.
    """
    init_db(db_path)
    conn = get_connection(db_path)
    cursor = conn.cursor()

    prediction = result.get("prediction", "Unknown")
    raw_class = result.get("raw_class", prediction)
    confidence = float(result.get("confidence", 0.0))
    confidence_pct = float(result.get("confidence_percentage", confidence * 100))
    recommended_bin = result.get("recommended_bin", "General Waste Bin")
    recommendation = result.get("recommendation", "")
    icon = result.get("icon", "♻️")

    all_probs = result.get("all_probabilities", {})
    probs_json = json.dumps(all_probs) if all_probs else None

    cursor.execute("""
        INSERT INTO predictions (
            ticket_id, prediction, raw_class, confidence, confidence_pct,
            recommended_bin, recommendation, icon, image_meta,
            all_probabilities_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        ticket_id,
        prediction,
        raw_class,
        confidence,
        confidence_pct,
        recommended_bin,
        recommendation,
        icon,
        str(image_meta) if image_meta else None,
        probs_json,
    ))

    inserted_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return inserted_id


def get_predictions(limit=50, offset=0, category=None, db_path=None):
    """Fetches recent predictions with optional category filtering."""
    init_db(db_path)
    conn = get_connection(db_path)
    cursor = conn.cursor()

    if category:
        cursor.execute("""
            SELECT * FROM predictions
            WHERE prediction = ? OR raw_class = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        """, (category, category, limit, offset))
    else:
        cursor.execute("""
            SELECT * FROM predictions
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        """, (limit, offset))

    rows = cursor.fetchall()
    results = [dict(row) for row in rows]
    conn.close()
    return results


def get_prediction_by_id(prediction_id, db_path=None):
    """Fetches a single prediction by its primary key ID."""
    init_db(db_path)
    conn = get_connection(db_path)
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM predictions WHERE id = ?", (prediction_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def update_feedback(prediction_id, feedback_status, user_notes=None, db_path=None):
    """Updates the user feedback on an AI prediction ('correct', 'incorrect')."""
    init_db(db_path)
    conn = get_connection(db_path)
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE predictions
        SET feedback_status = ?, user_notes = COALESCE(?, user_notes)
        WHERE id = ?
    """, (feedback_status, user_notes, prediction_id))

    affected = cursor.rowcount
    conn.commit()
    conn.close()
    return affected > 0


def get_stats(db_path=None):
    """Computes overall aggregate metrics from the prediction history."""
    init_db(db_path)
    conn = get_connection(db_path)
    cursor = conn.cursor()

    # Total and average confidence
    cursor.execute("""
        SELECT COUNT(*) as total, AVG(confidence_pct) as avg_confidence
        FROM predictions
    """)
    overview = cursor.fetchone()
    total = overview["total"] or 0
    avg_conf = round(float(overview["avg_confidence"] or 0.0), 1)

    # Breakdown by category
    cursor.execute("""
        SELECT prediction, COUNT(*) as count, AVG(confidence_pct) as avg_conf
        FROM predictions
        GROUP BY prediction
        ORDER BY count DESC
    """)
    breakdown = [
        {
            "category": row["prediction"],
            "count": row["count"],
            "avg_confidence": round(float(row["avg_conf"]), 1),
        }
        for row in cursor.fetchall()
    ]

    # Latest record
    cursor.execute("SELECT * FROM predictions ORDER BY created_at DESC LIMIT 1")
    latest_row = cursor.fetchone()
    latest = dict(latest_row) if latest_row else None

    # Feedback breakdown
    cursor.execute("""
        SELECT feedback_status, COUNT(*) as count
        FROM predictions
        GROUP BY feedback_status
    """)
    feedback = {row["feedback_status"]: row["count"] for row in cursor.fetchall()}

    conn.close()
    return {
        "total_predictions": total,
        "average_confidence": avg_conf,
        "category_distribution": breakdown,
        "latest_prediction": latest,
        "feedback_summary": feedback,
    }


def clear_all(db_path=None):
    """Clears all logged predictions (preserves category references)."""
    init_db(db_path)
    conn = get_connection(db_path)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM predictions")
    conn.commit()
    conn.close()


if __name__ == "__main__":
    db = init_db()
    print(f"✅ SQLite Database initialized at: {db}")
    stats = get_stats()
    print(f"Total predictions logged: {stats['total_predictions']}")
