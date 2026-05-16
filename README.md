# ⬡ Aegis.ei — Governance Infrastructure for AI-Driven Supply Chains

> **Hackathon Prototype** | SAP Hackfest 2026

A governance and control layer that sits *between* AI agents (like SAP Joule) and enterprise ERP/supply-chain systems — ensuring every AI-driven purchase order is risk-scored, tiered, auditable, and overridable by humans.

---

## 🔍 The Problem

AI agents are increasingly making autonomous procurement decisions — generating purchase orders, selecting vendors, and approving spend. But **who governs the AI?**

Without a governance layer, enterprises face:
- 💸 Unapproved high-value purchases slipping through
- 🚫 Blocked vendors getting re-engaged by AI
- 📋 No audit trail for AI-made decisions
- 🎛️ No kill switch when things go wrong

**Aegis.ei solves this** by introducing a tiered autonomy model with full human-in-the-loop controls.

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| **Tiered Autonomy (T0–T3)** | From fully manual (T0) to auto-execute (T3), dynamically assigned per PO based on risk |
| **🔴 Kill Switch** | Instantly pause all AI autonomy — every PO drops to T1 (human-only) |
| **📊 Risk Scoring Engine** | Multi-factor composite risk score (0–100) based on amount, vendor trust, category, season |
| **⏱ Auto-Approve with Override** | T3 POs auto-approve on a countdown — humans can intervene anytime |
| **📋 Audit Ledger** | Every decision (AI or human) is logged with actor, justification, and timestamp |
| **🧠 Enterprise Intelligence Loop** | ML model learns from decisions to recommend threshold & policy adjustments |
| **⚙️ Enterprise Configuration** | Customizable thresholds, preferred/blocked vendors, risk appetite, currency |

---

## 🏗️ Architecture

```
Frontend (Browser)          Backend (Flask)
┌──────────────────┐       ┌──────────────────┐
│  index.html      │       │  server.py       │
│  styles.css      │◄─────►│  models.py       │
│  app.js          │ REST  │  train_model.py  │
│                  │ API   │  init_db.py      │
│  PO Generator    │       │  config.py       │
│  Risk Engine     │       │                  │
│  Tier Assignment │       │  SQLite DB       │
│  UI Rendering    │       │  ML (sklearn)    │
└──────────────────┘       └──────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- Python 3.9+
- A modern web browser (Chrome recommended)

### 1. Clone and set up

```bash
git clone https://github.com/DeepakNepram/aegis-ei.git
cd aegis-ei

# Create virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux

# Install dependencies
pip install -r requirements.txt
```

### 2. Initialize database and start server

```bash
# Seed the database with sample data
python -m backend.init_db

# Start the Flask server
python -m backend.server
```

The app runs at **http://127.0.0.1:5000**

### 3. First run

1. Fill in the **Enterprise Configuration** screen (name, thresholds, vendors, etc.)
2. Click **"Start Using Aegis.ei"**
3. Navigate the 5 tabs to explore all features

---

## 🎯 3 Things to Click During a Demo

1. **🔴 Kill Switch** — Pause the AI agent. Watch all PO tiers drop to T1, a red banner appears. Resume to restore normal governance.
2. **⏱ T3 Auto-Approve** — Let a T3 PO auto-approve via countdown timer, then click "Override & Review" on the next one to demonstrate human-in-the-loop.
3. **🧠 Enterprise Intelligence Cycle** (Tab 5) — Run ML training and see real insights generated from your decisions.

---

## 📡 API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/log_decision` | Store a decision record |
| `GET` | `/api/decisions?limit=N` | Fetch recent decisions |
| `POST` | `/api/train_model` | Train ML model, return insights |
| `GET` | `/api/enterprise_insights` | Get latest saved insights |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript |
| **Backend** | Python 3, Flask, Flask-CORS |
| **Database** | SQLite3 |
| **ML** | scikit-learn (Logistic Regression), pandas |
| **Font** | Inter (Google Fonts) |

---

## 📂 Project Structure

```
aegis-ei/
├── index.html                   # Frontend entry point
├── styles.css                   # All CSS styles
├── app.js                       # Core application logic (762 lines)
├── backend/
│   ├── __init__.py              # Package marker
│   ├── config.py                # Centralised configuration
│   ├── models.py                # SQLite helpers
│   ├── server.py                # Flask API server
│   ├── train_model.py           # ML training utilities
│   └── init_db.py               # Database seeder (15+ sample rows)
├── docs/
│   └── slides.html              # Project presentation (HTML slide deck)
│   └── Aegis-ei_Prototype.pptx  # Prototype Interface presentation
├── requirements.txt             # Python dependencies
├── LICENSE                      # MIT License
└── README.md                    # This file
```

> **Note:** The `data/` (SQLite DB) and `models/` (trained `.pkl` files) folders are auto-generated at runtime and excluded from version control via `.gitignore`.

---

## 🤖 Built with AI — Transparency Disclosure

**This project was built with the assistance of AI coding tools**, and I believe in full transparency about that process. Using AI tools for development is a legitimate and increasingly important skill in modern software engineering.

### AI Tools Used

- **Google Antigravity (Gemini-powered AI coding assistant)** — Used throughout the development process for code generation, debugging, and iterating on features.

### What AI Helped With

- ✅ Scaffolding the frontend HTML structure and CSS styling
- ✅ Writing the Flask backend routes and SQLite database layer
- ✅ Implementing the risk scoring algorithm logic
- ✅ Building the ML training pipeline with scikit-learn
- ✅ Debugging issues (e.g., T3 auto-approve PO generation, audit logging)
- ✅ Writing this README and project documentation

### What I (the Human) Did

- 🧠 **Conceived the core idea** — governance middleware for AI-driven supply chains
- 🏗️ **Designed the architecture** — tiered autonomy model (T0–T3), kill switch concept, risk scoring factors
- 🎯 **Defined requirements** — what features to build, how they should behave, edge cases to handle
- 🐛 **Directed debugging** — identified bugs, described expected behavior, validated fixes
- 🔄 **Iterated on UX** — reviewed outputs, requested changes, refined the user experience
- 📋 **Domain expertise** — supply chain procurement knowledge, SAP ecosystem context

### Why Disclose This?

AI-assisted coding is a **skill, not a shortcut**. It requires:
- Clear problem articulation — the AI needs well-defined prompts
- Architectural thinking — knowing *what* to build before asking AI *how*
- Quality judgment — reviewing, testing, and iterating on AI outputs
- Debugging ability — when AI code doesn't work, you need to diagnose why

I view AI tools the same way I view IDEs, Stack Overflow, or documentation — **powerful tools that amplify human capability** when used thoughtfully.

---

## 📊 Presentation

A self-contained HTML slide deck is available at [`docs/slides.html`](docs/slides.html). Open it in any browser — no additional software needed. It can also be printed/exported to PDF.

---

## ⚠️ Project Status

This is a **hackathon prototype** built for the SAP Hackfest 2026. It demonstrates the concept of AI governance in supply chains but is not production-ready.

**Future roadmap ideas:**
- SAP BTP integration with real Joule/AI agent APIs
- Role-based access control (RBAC) for multi-user enterprises
- Real ERP connectors (SAP S/4HANA, Ariba)
- PostgreSQL for production-grade persistence
- Containerised deployment (Docker)

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

**Built with ❤️ and 🤖 by Deepak Nepram**
