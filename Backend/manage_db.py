#!/usr/bin/env python3
"""
CLI Tool to inspect, seed, and manage the SQLite EcoSort database.
Usage:
    python manage_db.py init
    python manage_db.py list [--limit 20]
    python manage_db.py stats
    python manage_db.py seed
    python manage_db.py export [--output data.csv]
"""

import os
import sys
import csv
import json
import argparse
from pathlib import Path

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

import database as db


def cmd_init(args):
    path = db.init_db()
    print(f"✅ Database initialized successfully at:\n   {path}")


def cmd_list(args):
    records = db.get_predictions(limit=args.limit, category=args.category)
    if not records:
        print("No predictions found in database.")
        return

    print(f"\n📋 Recent Predictions (Showing {len(records)}):")
    header = f"{'ID':<5} | {'Date/Time':<20} | {'Waste Category':<18} | {'Conf %':<8} | {'Recommended Bin':<28} | {'Feedback':<10}"
    print("-" * len(header))
    print(header)
    print("-" * len(header))

    for r in records:
        icon = r.get('icon') or ''
        category = f"{icon} {r['prediction']}"
        conf = f"{r['confidence_pct']:.1f}%"
        dt = str(r['created_at'])[:19]
        bin_name = r['recommended_bin'][:26]
        feedback = r.get('feedback_status') or 'unreviewed'
        print(f"{r['id']:<5} | {dt:<20} | {category:<18} | {conf:<8} | {bin_name:<28} | {feedback:<10}")
    print("-" * len(header))


def cmd_stats(args):
    stats = db.get_stats()
    print("\n📊 EcoSort AI Waste Classification Analytics")
    print("=" * 50)
    print(f"Total Predictions:    {stats['total_predictions']}")
    print(f"Average Confidence:   {stats['average_confidence']}%")
    print("\nBreakdown by Waste Category:")
    for item in stats["category_distribution"]:
        print(f"  • {item['category']:<16} : {item['count']:>4} items (avg conf: {item['avg_confidence']}%)")

    if stats.get("feedback_summary"):
        print("\nFeedback Summary:")
        for status, count in stats["feedback_summary"].items():
            print(f"  • {status:<12} : {count}")
    print("=" * 50)


def cmd_seed(args):
    """Seeds sample prediction records into SQLite."""
    sample_records = [
        {"prediction": "Plastic", "raw_class": "plastic", "confidence": 0.964, "confidence_percentage": 96.4, "recommended_bin": "Plastic Waste Bin", "recommendation": "Clean and rinse plastic bottles or packaging.", "icon": "🥤"},
        {"prediction": "Paper", "raw_class": "paper", "confidence": 0.921, "confidence_percentage": 92.1, "recommended_bin": "Paper Waste Bin", "recommendation": "Keep paper clean and dry.", "icon": "📄"},
        {"prediction": "Food Organics", "raw_class": "Food Organics", "confidence": 0.955, "confidence_percentage": 95.5, "recommended_bin": "Organic / Wet Waste Bin", "recommendation": "Place food scraps in the wet compost bin.", "icon": "🍎"},
        {"prediction": "Metal", "raw_class": "metal", "confidence": 0.948, "confidence_percentage": 94.8, "recommended_bin": "Metal Recycling Bin", "recommendation": "Rinse metal cans and foil.", "icon": "🥫"},
        {"prediction": "Glass", "raw_class": "glass", "confidence": 0.916, "confidence_percentage": 91.6, "recommended_bin": "Glass Waste Bin", "recommendation": "Handle glass jars and bottles carefully.", "icon": "🍾"},
        {"prediction": "Vegetation", "raw_class": "Vegetation", "confidence": 0.892, "confidence_percentage": 89.2, "recommended_bin": "Yard / Organic Waste Bin", "recommendation": "Place garden clippings in yard waste bin.", "icon": "🌿"},
        {"prediction": "Cardboard", "raw_class": "cardboard", "confidence": 0.937, "confidence_percentage": 93.7, "recommended_bin": "Paper / Cardboard Recycling Bin", "recommendation": "Flatten boxes to save space.", "icon": "📦"},
        {"prediction": "Textile Trash", "raw_class": "Textile Trash", "confidence": 0.884, "confidence_percentage": 88.4, "recommended_bin": "Textile / Donation Bin", "recommendation": "Donate usable textiles or place in fabric bins.", "icon": "👕"},
    ]

    count = 0
    for rec in sample_records:
        db.insert_prediction(rec, image_meta="seed_sample.jpg")
        count += 1

    print(f"✅ Successfully seeded {count} sample waste prediction records into SQLite!")


def cmd_export(args):
    records = db.get_predictions(limit=1000)
    if not records:
        print("No records to export.")
        return

    out_path = args.output or ("predictions_export.csv" if args.format == "csv" else "predictions_export.json")
    out_file = Path(out_path).resolve()

    if args.format == "csv":
        fieldnames = ["id", "created_at", "prediction", "raw_class", "confidence_pct", "recommended_bin", "feedback_status"]
        with open(out_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(records)
    else:
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(records, f, indent=2, default=str)

    print(f"✅ Exported {len(records)} records to {out_file}")


def main():
    parser = argparse.ArgumentParser(description="SQLite Database CLI for EcoSort Waste Platform")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # init
    p_init = subparsers.add_parser("init", help="Initialize the SQLite database schema")

    # list
    p_list = subparsers.add_parser("list", help="List recent predictions")
    p_list.add_argument("--limit", type=int, default=20, help="Number of records to show")
    p_list.add_argument("--category", type=str, default=None, help="Filter by waste category")

    # stats
    p_stats = subparsers.add_parser("stats", help="Show aggregate prediction analytics")

    # seed
    p_seed = subparsers.add_parser("seed", help="Seed sample test predictions")

    # export
    p_export = subparsers.add_parser("export", help="Export predictions to file")
    p_export.add_argument("--format", choices=["csv", "json"], default="csv", help="Export file format")
    p_export.add_argument("--output", type=str, help="Destination file path")

    args = parser.parse_args()

    if args.command == "init":
        cmd_init(args)
    elif args.command == "list":
        cmd_list(args)
    elif args.command == "stats":
        cmd_stats(args)
    elif args.command == "seed":
        cmd_seed(args)
    elif args.command == "export":
        cmd_export(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
