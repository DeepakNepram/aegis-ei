"""
Aegis.ei — Flask backend

Endpoints:
  GET  /api/health              → { status: "ok" }
  POST /api/log_decision        → store one decision row
  GET  /api/decisions?limit=N   → fetch recent decisions
  POST /api/train_model         → train ML model, return insights
  GET  /api/enterprise_insights → return latest saved insights

Run from the aegis-ei/ root:
    python -m backend.server
"""

import os
from typing import Any, Dict

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

from .config import BASE_DIR, DEFAULT_ENTERPRISE_ID
from .models import (
    fetch_decisions_for_enterprise,
    fetch_recent_decisions,
    init_db,
    insert_decision,
    load_insights,
    save_insights,
)
from .train_model import train_override_model


def create_app() -> Flask:
    app = Flask(__name__, static_folder=None)
    CORS(app)
    init_db()

    # ── Serve frontend static files ──────────────────────────────────
    @app.route("/")
    def serve_index() -> Any:
        return send_from_directory(BASE_DIR, "index.html")

    @app.route("/<path:filename>")
    def serve_static(filename: str) -> Any:
        if filename.startswith("api/"):
            return jsonify({"error": "not found"}), 404
        filepath = os.path.join(BASE_DIR, filename)
        if os.path.isfile(filepath):
            return send_from_directory(BASE_DIR, filename)
        return jsonify({"error": "not found"}), 404

    # ── Health ───────────────────────────────────────────────────────
    @app.route("/api/health", methods=["GET"])
    def health() -> Any:
        return jsonify({"status": "ok"})

    # ── Log decision ─────────────────────────────────────────────────
    @app.route("/api/log_decision", methods=["POST"])
    def log_decision() -> Any:
        data: Dict[str, Any] = request.get_json(force=True) or {}
        required = ["enterprise_id", "case_id", "timestamp", "amount"]
        missing = [f for f in required if f not in data]
        if missing:
            return jsonify({"success": False, "error": f"Missing: {', '.join(missing)}"}), 400
        try:
            insert_decision(data)
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)}), 500
        return jsonify({"success": True})

    # ── List decisions ───────────────────────────────────────────────
    @app.route("/api/decisions", methods=["GET"])
    def list_decisions() -> Any:
        try:
            limit = int(request.args.get("limit", "50"))
        except ValueError:
            limit = 50
        rows = fetch_recent_decisions(limit=limit)
        return jsonify({"success": True, "items": rows})

    # ── Train model ──────────────────────────────────────────────────
    @app.route("/api/train_model", methods=["POST"])
    def api_train_model() -> Any:
        data: Dict[str, Any] = request.get_json(force=True) or {}
        enterprise_id = data.get("enterprise_id") or DEFAULT_ENTERPRISE_ID
        current_threshold = float(data.get("current_threshold") or 50000)

        raw_rows = fetch_decisions_for_enterprise(enterprise_id)
        if len(raw_rows) == 0:
            return jsonify({
                "success": False,
                "enterprise_id": enterprise_id,
                "message": "No decisions logged yet. Make some decisions in the UI first.",
            })

        result = train_override_model(
            enterprise_id=enterprise_id,
            current_threshold=current_threshold,
        )
        save_insights(enterprise_id, result)
        return jsonify(result)

    # ── Enterprise insights ──────────────────────────────────────────
    @app.route("/api/enterprise_insights", methods=["GET"])
    def api_enterprise_insights() -> Any:
        enterprise_id = request.args.get("enterprise_id") or DEFAULT_ENTERPRISE_ID
        payload = load_insights(enterprise_id)
        if not payload:
            return jsonify({
                "success": False,
                "enterprise_id": enterprise_id,
                "message": "No insights generated yet. Run learning first.",
            })
        payload["success"] = True
        payload["enterprise_id"] = enterprise_id
        return jsonify(payload)

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(host="127.0.0.1", port=5000, debug=True)
