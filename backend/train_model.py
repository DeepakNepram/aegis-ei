"""
Aegis.ei — ML training utilities

Enhanced vs. AgentOps reference:
  • Uses risk_score as a feature (if present)
  • Computes override rate by category and by risk level
  • Returns actionable policy recommendations
"""

from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd
from joblib import dump
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

from .config import MODELS_DIR
from .models import fetch_decisions_for_enterprise


# ── Helpers ──────────────────────────────────────────────────────────────

def _build_dataframe(rows: List[Dict[str, Any]]) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    for col in ["amount", "risk_level", "risk_score", "vip_flag",
                 "new_supplier_flag", "category", "override_flag"]:
        if col not in df.columns:
            df[col] = None

    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)
    df["risk_score"] = pd.to_numeric(df["risk_score"], errors="coerce").fillna(0.0)
    df["vip_flag"] = df["vip_flag"].fillna(0).astype(int)
    df["new_supplier_flag"] = df["new_supplier_flag"].fillna(0).astype(int)
    df["risk_level"] = df["risk_level"].fillna("unknown")
    df["category"] = df["category"].fillna("unknown")
    df["override_flag"] = df["override_flag"].fillna(0).astype(int)
    return df


def _build_features_and_target(df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.Series]:
    base = df[["amount", "risk_score", "vip_flag", "new_supplier_flag"]].copy()
    categorical = pd.get_dummies(
        df[["risk_level", "category"]],
        prefix=["risk", "cat"],
        drop_first=True,
    )
    X = pd.concat([base, categorical], axis=1)
    y = df["override_flag"]
    return X, y


def _compute_insights(df: pd.DataFrame, current_threshold: float) -> Dict[str, Any]:
    total = len(df)
    overrides = int(df["override_flag"].sum())
    overall_rate = (overrides / total) if total > 0 else 0.0

    # Override rate above threshold
    above = df[df["amount"] > current_threshold]
    above_total = len(above)
    above_overrides = int(above["override_flag"].sum()) if above_total > 0 else 0
    above_rate = (above_overrides / above_total) if above_total > 0 else 0.0

    # Override rate by category
    cat_rates = {}
    for cat, grp in df.groupby("category"):
        if len(grp) >= 2:
            cat_rates[cat] = {
                "total": len(grp),
                "overrides": int(grp["override_flag"].sum()),
                "rate": float(grp["override_flag"].mean()),
            }

    # Override rate by risk level
    risk_rates = {}
    for rl, grp in df.groupby("risk_level"):
        if len(grp) >= 2:
            risk_rates[rl] = {
                "total": len(grp),
                "overrides": int(grp["override_flag"].sum()),
                "rate": float(grp["override_flag"].mean()),
            }

    # Suggested threshold via sliding window
    suggested_threshold = float(current_threshold)
    if total >= 10:
        sorted_df = df.sort_values("amount")
        amounts = sorted_df["amount"].values
        flags = sorted_df["override_flag"].values
        window = max(5, int(len(sorted_df) * 0.1))
        best_jump = 0.0
        for i in range(len(sorted_df) - window):
            low_w = flags[: i + window]
            high_w = flags[i + 1: i + 1 + window]
            if len(low_w) == 0 or len(high_w) == 0:
                continue
            jump = high_w.mean() - low_w.mean()
            if jump > best_jump and amounts[i] >= current_threshold * 0.5:
                best_jump = float(jump)
                suggested_threshold = float(amounts[i])

    # Readable bullets
    bullets: List[str] = []
    bullets.append(
        f"Overall, managers override {overall_rate * 100:.1f}% of AI recommendations "
        f"({overrides} out of {total} decisions)."
    )
    if above_total > 0:
        bullets.append(
            f"For POs above ₹{current_threshold:,.0f}, managers override "
            f"{above_rate * 100:.1f}% of cases ({above_overrides}/{above_total})."
        )

    # New supplier insight
    new_sup = df[df["new_supplier_flag"] == 1]
    if len(new_sup) >= 3:
        ns_rate = new_sup["override_flag"].mean()
        bullets.append(
            f"New suppliers are overridden {ns_rate * 100:.1f}% of the time "
            f"({int(new_sup['override_flag'].sum())}/{len(new_sup)})."
        )

    # Highest-override category
    if cat_rates:
        worst_cat = max(cat_rates, key=lambda c: cat_rates[c]["rate"])
        wr = cat_rates[worst_cat]
        if wr["rate"] > overall_rate and wr["total"] >= 3:
            bullets.append(
                f"Category '{worst_cat}' has {wr['rate'] * 100:.0f}% override rate — "
                f"{wr['rate'] / max(overall_rate, 0.01):.1f}x higher than average."
            )

    # Policy recommendations
    recommendations: List[str] = []
    if suggested_threshold < current_threshold * 0.9:
        recommendations.append(
            f"💡 Recommend reducing auto-approval threshold from "
            f"₹{current_threshold:,.0f} to ₹{suggested_threshold:,.0f} for current market conditions."
        )
    if cat_rates:
        worst_cat = max(cat_rates, key=lambda c: cat_rates[c]["rate"])
        wr = cat_rates[worst_cat]
        if wr["rate"] > 0.5 and wr["total"] >= 3:
            recommendations.append(
                f"💡 Consider adding '{worst_cat}' category to mandatory T1 review."
            )
    if above_rate > 0.7 and above_total >= 3:
        recommendations.append(
            "💡 High override rate on above-threshold POs suggests threshold may be too permissive."
        )
    if overall_rate < 0.15 and total >= 10:
        recommendations.append(
            "💡 Very low override rate — consider periodic human spot-checks to avoid automation complacency."
        )

    return {
        "overall_override_rate": overall_rate,
        "above_threshold_override_rate": above_rate,
        "suggested_threshold": suggested_threshold,
        "insights": bullets,
        "recommendations": recommendations,
        "category_rates": cat_rates,
        "risk_level_rates": risk_rates,
    }


# ── Main training entry point ────────────────────────────────────────────

def train_override_model(
    enterprise_id: str,
    current_threshold: float,
) -> Dict[str, Any]:
    rows = fetch_decisions_for_enterprise(enterprise_id)
    result: Dict[str, Any] = {
        "success": False,
        "enterprise_id": enterprise_id,
        "samples_used": len(rows),
        "model_accuracy": None,
        "current_threshold": float(current_threshold),
        "suggested_threshold": float(current_threshold),
        "insights": [],
        "recommendations": [],
    }

    if len(rows) < 6:
        result["message"] = (
            "Not enough decision history to train a useful model "
            "(need at least 6 rows)."
        )
        return result

    df = _build_dataframe(rows)
    X, y = _build_features_and_target(df)

    # Need at least two classes
    if y.nunique() < 2:
        insight_data = _compute_insights(df, current_threshold)
        result["success"] = True
        result["model_accuracy"] = None
        result["message"] = "All decisions have the same override status — model skipped, insights computed."
        result.update({k: v for k, v in insight_data.items()})
        return result

    test_size = min(0.25, max(2, int(len(df) * 0.25)) / len(df))
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=42, stratify=y,
    )

    model = LogisticRegression(max_iter=1000)
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    acc = float(accuracy_score(y_test, y_pred))

    model_path = f"{MODELS_DIR}/{enterprise_id}_override_model.pkl"
    dump({"model": model, "feature_columns": list(X.columns)}, model_path)

    insight_data = _compute_insights(df, current_threshold)

    result["success"] = True
    result["model_accuracy"] = acc
    result.update({k: v for k, v in insight_data.items()})
    return result
