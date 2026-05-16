"""
Aegis.ei — Database initialisation and seed data

Usage:
    python -m backend.init_db

Creates the SQLite database and seeds 15+ diverse sample rows so ML
training produces meaningful results on first demo run.
"""

from datetime import datetime, timedelta

from .config import DEFAULT_ENTERPRISE_ID
from .models import init_db, insert_decision


def seed_sample_data() -> None:
    """Insert diverse sample decisions spanning all risk levels and categories."""
    now = datetime.utcnow()
    base = now - timedelta(days=7)

    samples = [
        # ── Low-risk, auto-approved ──────────────────────────────────────
        {
            "case_id": "PO-2026-101", "amount": 12000,
            "supplier": "Delta Office Solutions", "category": "Office Supplies",
            "risk_level": "low", "risk_score": 12,
            "vip_flag": 0, "new_supplier_flag": 0,
            "ai_autonomy_tier": "T3", "ai_initial_recommendation": "APPROVE",
            "final_decision": "APPROVE", "decision_actor": "AI_AGENT",
            "override_flag": 0, "override_justification": None,
            "notes": "Routine stationery order auto-approved.",
        },
        {
            "case_id": "PO-2026-102", "amount": 8500,
            "supplier": "Sunrise Packaging", "category": "Packaging",
            "risk_level": "low", "risk_score": 8,
            "vip_flag": 0, "new_supplier_flag": 0,
            "ai_autonomy_tier": "T3", "ai_initial_recommendation": "APPROVE",
            "final_decision": "APPROVE", "decision_actor": "AI_AGENT",
            "override_flag": 0, "override_justification": None,
            "notes": "Standard packaging reorder.",
        },
        {
            "case_id": "PO-2026-103", "amount": 22000,
            "supplier": "TechParts India Pvt Ltd", "category": "Electronics",
            "risk_level": "low", "risk_score": 18,
            "vip_flag": 1, "new_supplier_flag": 0,
            "ai_autonomy_tier": "T3", "ai_initial_recommendation": "APPROVE",
            "final_decision": "APPROVE", "decision_actor": "AI_AGENT",
            "override_flag": 0, "override_justification": None,
            "notes": "Preferred vendor, within threshold.",
        },
        # ── Medium-risk, human approved ──────────────────────────────────
        {
            "case_id": "PO-2026-104", "amount": 65000,
            "supplier": "NovaTech Components", "category": "Electronics",
            "risk_level": "medium", "risk_score": 38,
            "vip_flag": 0, "new_supplier_flag": 1,
            "ai_autonomy_tier": "T2", "ai_initial_recommendation": "REVIEW",
            "final_decision": "APPROVE", "decision_actor": "MANAGER",
            "override_flag": 0, "override_justification": None,
            "notes": "New supplier approved after verification.",
        },
        {
            "case_id": "PO-2026-105", "amount": 48000,
            "supplier": "Metro FMCG Distributors", "category": "FMCG Consumables",
            "risk_level": "medium", "risk_score": 34,
            "vip_flag": 0, "new_supplier_flag": 0,
            "ai_autonomy_tier": "T2", "ai_initial_recommendation": "REVIEW",
            "final_decision": "APPROVE", "decision_actor": "MANAGER",
            "override_flag": 0, "override_justification": None,
            "notes": "Seasonal demand spike considered.",
        },
        {
            "case_id": "PO-2026-106", "amount": 55000,
            "supplier": "Heritage Textiles", "category": "Textiles",
            "risk_level": "medium", "risk_score": 42,
            "vip_flag": 0, "new_supplier_flag": 0,
            "ai_autonomy_tier": "T2", "ai_initial_recommendation": "REVIEW",
            "final_decision": "REJECT", "decision_actor": "MANAGER",
            "override_flag": 1, "override_justification": '["Confirmed with inventory team — stock critically low"]',
            "notes": "Budget constraints.",
        },
        # ── High-risk, overrides ─────────────────────────────────────────
        {
            "case_id": "PO-2026-107", "amount": 180000,
            "supplier": "Global Steel Corp", "category": "Raw Materials",
            "risk_level": "high", "risk_score": 62,
            "vip_flag": 1, "new_supplier_flag": 0,
            "ai_autonomy_tier": "T1", "ai_initial_recommendation": "ESCALATE",
            "final_decision": "APPROVE", "decision_actor": "MANAGER",
            "override_flag": 1,
            "override_justification": '["Price is significantly better than market rate","Approved by senior management verbally"]',
            "notes": "VIP vendor, price advantage.",
        },
        {
            "case_id": "PO-2026-108", "amount": 95000,
            "supplier": "Apex Chemicals", "category": "Chemicals",
            "risk_level": "high", "risk_score": 58,
            "vip_flag": 0, "new_supplier_flag": 0,
            "ai_autonomy_tier": "T1", "ai_initial_recommendation": "ESCALATE",
            "final_decision": "REJECT", "decision_actor": "MANAGER",
            "override_flag": 1, "override_justification": '["Emergency procurement — no alternatives available"]',
            "notes": "Vendor financial stability flagged Watch.",
        },
        {
            "case_id": "PO-2026-109", "amount": 130000,
            "supplier": "Falcon Raw Materials", "category": "Raw Materials",
            "risk_level": "high", "risk_score": 67,
            "vip_flag": 0, "new_supplier_flag": 1,
            "ai_autonomy_tier": "T1", "ai_initial_recommendation": "ESCALATE",
            "final_decision": "APPROVE", "decision_actor": "MANAGER",
            "override_flag": 1,
            "override_justification": '["Conducted independent supplier verification","Received written assurance from supplier"]',
            "notes": "New supplier, large amount.",
        },
        # ── Critical-risk ────────────────────────────────────────────────
        {
            "case_id": "PO-2026-110", "amount": 275000,
            "supplier": "Summit Engineering", "category": "Equipment",
            "risk_level": "critical", "risk_score": 82,
            "vip_flag": 0, "new_supplier_flag": 1,
            "ai_autonomy_tier": "T1", "ai_initial_recommendation": "ESCALATE",
            "final_decision": "REJECT", "decision_actor": "MANAGER",
            "override_flag": 1, "override_justification": '["Emergency procurement — no alternatives available"]',
            "notes": "New supplier, critical risk, rejected.",
        },
        # ── More low-risk to balance the dataset ─────────────────────────
        {
            "case_id": "PO-2026-111", "amount": 15000,
            "supplier": "Sunrise Packaging", "category": "Packaging",
            "risk_level": "low", "risk_score": 10,
            "vip_flag": 0, "new_supplier_flag": 0,
            "ai_autonomy_tier": "T3", "ai_initial_recommendation": "APPROVE",
            "final_decision": "APPROVE", "decision_actor": "AI_AGENT",
            "override_flag": 0, "override_justification": None,
            "notes": "Repeat packaging order.",
        },
        {
            "case_id": "PO-2026-112", "amount": 9000,
            "supplier": "Delta Office Solutions", "category": "Office Supplies",
            "risk_level": "low", "risk_score": 5,
            "vip_flag": 0, "new_supplier_flag": 0,
            "ai_autonomy_tier": "T3", "ai_initial_recommendation": "APPROVE",
            "final_decision": "APPROVE", "decision_actor": "AI_AGENT",
            "override_flag": 0, "override_justification": None,
            "notes": "Office supplies reorder.",
        },
        {
            "case_id": "PO-2026-113", "amount": 30000,
            "supplier": "TechParts India Pvt Ltd", "category": "Electronics",
            "risk_level": "low", "risk_score": 14,
            "vip_flag": 1, "new_supplier_flag": 0,
            "ai_autonomy_tier": "T3", "ai_initial_recommendation": "APPROVE",
            "final_decision": "APPROVE", "decision_actor": "AI_AGENT",
            "override_flag": 0, "override_justification": None,
            "notes": "Preferred vendor routine.",
        },
        {
            "case_id": "PO-2026-114", "amount": 72000,
            "supplier": "Bharat Agro Suppliers", "category": "Agro Commodities",
            "risk_level": "medium", "risk_score": 40,
            "vip_flag": 0, "new_supplier_flag": 0,
            "ai_autonomy_tier": "T2", "ai_initial_recommendation": "REVIEW",
            "final_decision": "APPROVE", "decision_actor": "MANAGER",
            "override_flag": 0, "override_justification": None,
            "notes": "Seasonal agro purchase.",
        },
        {
            "case_id": "PO-2026-115", "amount": 110000,
            "supplier": "Apex Chemicals", "category": "Chemicals",
            "risk_level": "high", "risk_score": 60,
            "vip_flag": 0, "new_supplier_flag": 0,
            "ai_autonomy_tier": "T1", "ai_initial_recommendation": "ESCALATE",
            "final_decision": "APPROVE", "decision_actor": "MANAGER",
            "override_flag": 1,
            "override_justification": '["Supplier has mitigating history not reflected in system"]',
            "notes": "Override — chemicals reorder.",
        },
        {
            "case_id": "PO-2026-116", "amount": 42000,
            "supplier": "Pioneer Logistics", "category": "Logistics Services",
            "risk_level": "medium", "risk_score": 30,
            "vip_flag": 0, "new_supplier_flag": 0,
            "ai_autonomy_tier": "T2", "ai_initial_recommendation": "REVIEW",
            "final_decision": "APPROVE", "decision_actor": "MANAGER",
            "override_flag": 0, "override_justification": None,
            "notes": "Logistics contract renewal.",
        },
    ]

    for i, row in enumerate(samples):
        row["enterprise_id"] = DEFAULT_ENTERPRISE_ID
        row["timestamp"] = (base + timedelta(hours=i * 4)).isoformat() + "Z"
        insert_decision(row)


def main() -> None:
    init_db()
    seed_sample_data()
    print(f"Database initialised at data/aegis.db with {16} sample decision_log rows.")


if __name__ == "__main__":
    main()
