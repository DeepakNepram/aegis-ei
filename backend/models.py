"""
Aegis.ei — SQLite helpers

Extended schema compared to AgentOps reference:
  • risk_score REAL  — composite 0–100 risk score
  • override_justification TEXT  — JSON array of justification reasons
"""

import json
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional

from .config import DB_PATH


def get_connection() -> sqlite3.Connection:
    """Return a new SQLite connection with dict-like row access."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create required tables if they do not already exist."""
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS decision_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            enterprise_id TEXT NOT NULL,
            case_id TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            amount REAL NOT NULL,
            supplier TEXT,
            category TEXT,
            risk_level TEXT,
            risk_score REAL DEFAULT 0,
            vip_flag INTEGER DEFAULT 0,
            new_supplier_flag INTEGER DEFAULT 0,
            ai_autonomy_tier TEXT,
            ai_initial_recommendation TEXT,
            final_decision TEXT,
            decision_actor TEXT,
            override_flag INTEGER DEFAULT 0,
            override_justification TEXT,
            notes TEXT
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS enterprise_insights (
            enterprise_id TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )

    conn.commit()
    conn.close()


def insert_decision(decision: Dict[str, Any]) -> None:
    """Insert a single decision_log row."""
    conn = get_connection()
    cur = conn.cursor()

    d = decision.copy()
    d.setdefault("notes", None)
    d.setdefault("override_justification", None)
    d.setdefault("risk_score", 0)

    cur.execute(
        """
        INSERT INTO decision_log (
            enterprise_id, case_id, timestamp, amount,
            supplier, category, risk_level, risk_score,
            vip_flag, new_supplier_flag,
            ai_autonomy_tier, ai_initial_recommendation,
            final_decision, decision_actor,
            override_flag, override_justification, notes
        ) VALUES (
            :enterprise_id, :case_id, :timestamp, :amount,
            :supplier, :category, :risk_level, :risk_score,
            :vip_flag, :new_supplier_flag,
            :ai_autonomy_tier, :ai_initial_recommendation,
            :final_decision, :decision_actor,
            :override_flag, :override_justification, :notes
        )
        """,
        d,
    )

    conn.commit()
    conn.close()


def fetch_recent_decisions(limit: int = 50) -> List[Dict[str, Any]]:
    """Return the most recent N decisions across all enterprises."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT * FROM decision_log
        ORDER BY datetime(timestamp) DESC, id DESC
        LIMIT ?
        """,
        (limit,),
    )
    rows = [dict(row) for row in cur.fetchall()]
    conn.close()
    return rows


def fetch_decisions_for_enterprise(enterprise_id: str) -> List[Dict[str, Any]]:
    """Return all decisions for a specific enterprise, oldest first."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT * FROM decision_log
        WHERE enterprise_id = ?
        ORDER BY datetime(timestamp) ASC, id ASC
        """,
        (enterprise_id,),
    )
    rows = [dict(row) for row in cur.fetchall()]
    conn.close()
    return rows


def save_insights(enterprise_id: str, payload: Dict[str, Any]) -> None:
    """Upsert latest insights for an enterprise as a JSON blob."""
    conn = get_connection()
    cur = conn.cursor()
    now = datetime.utcnow().isoformat() + "Z"
    payload_json = json.dumps(payload, ensure_ascii=False)

    cur.execute(
        """
        INSERT INTO enterprise_insights (enterprise_id, payload, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(enterprise_id) DO UPDATE SET
            payload = excluded.payload,
            updated_at = excluded.updated_at
        """,
        (enterprise_id, payload_json, now),
    )
    conn.commit()
    conn.close()


def load_insights(enterprise_id: str) -> Optional[Dict[str, Any]]:
    """Load latest insights for an enterprise, or None."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT payload, updated_at FROM enterprise_insights WHERE enterprise_id = ?",
        (enterprise_id,),
    )
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    payload = json.loads(row["payload"])
    payload["updated_at"] = row["updated_at"]
    return payload
