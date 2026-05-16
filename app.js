/* ═══════════════════════════════════════════════════════════════════════
   Aegis.ei — Core Application Logic
   ═══════════════════════════════════════════════════════════════════════ */
const API = "http://127.0.0.1:5000";
const SUPPLIERS = ["TechParts India Pvt Ltd", "Global Steel Corp", "Pioneer Logistics", "Apex Chemicals", "Sunrise Packaging", "NovaTech Components", "Bharat Agro Suppliers", "Delta Office Solutions", "Summit Engineering", "Falcon Raw Materials", "Heritage Textiles", "Metro FMCG Distributors"];
const CATEGORIES = ["Electronics", "Raw Materials", "Packaging", "Chemicals", "Office Supplies", "Equipment", "Logistics Services", "Agro Commodities", "Textiles", "FMCG Consumables"];
const SEASONS = ["Normal", "Festival Peak", "Quarter-End Rush", "Off-Season", "Supply Disruption Alert"];
const PAY_TERMS = [7, 15, 30, 45, 60, 90];
const JUSTIFY_OPTIONS = ["Conducted independent supplier verification", "Received written assurance from supplier", "Confirmed with inventory team — stock critically low", "Approved by senior management verbally", "Price is significantly better than market rate", "Supplier has mitigating history not reflected in system", "Emergency procurement — no alternatives available"];

let config = {};
let agentPaused = false;
let poQueue = [];
let decidedPOs = [];
let auditLog = [];
let metrics = { total: 0, autoApproved: 0, humanReview: 0, overrides: 0, criticalCaught: 0, totalRiskScore: 0 };
let autoTimers = {};
let recentSuppliers = [];
let currentModifyPoId = null;
let currentJustifyPoId = null;
let latestInsights = null;
let auditFilter = "all";
let poCounter = 200;

/* ── Currency helper ─────────────────────────────────────────────── */
function cs() { return config.currency === "USD" ? "$" : config.currency === "EUR" ? "€" : "₹"; }
function fmt(n) { return cs() + Number(n).toLocaleString("en-IN"); }

/* ═══════════════════════════════════════════════════════════════════════
   INIT & SETUP
   ═══════════════════════════════════════════════════════════════════════ */
window.addEventListener("DOMContentLoaded", () => {
    const saved = localStorage.getItem("aegis_config");
    if (saved) { config = JSON.parse(saved); showMainApp(); }
    else { document.getElementById("setupScreen").style.display = "flex"; }
    // justification "Other" toggle
    const oc = document.getElementById("justifyOtherCheck");
    if (oc) oc.addEventListener("change", () => { document.getElementById("justifyOtherText").style.display = oc.checked ? "block" : "none"; });
    // enable/disable justify confirm button
    document.querySelectorAll("#justifyModal .justify-checkboxes input[type=checkbox]").forEach(cb => {
        cb.addEventListener("change", updateJustifyBtn);
    });
});

function saveEnterpriseConfig() {
    const name = document.getElementById("cfgName").value.trim() || "Demo Enterprise";
    config = {
        name,
        industry: document.getElementById("cfgIndustry").value,
        currency: document.getElementById("cfgCurrency").value,
        threshold: Number(document.getElementById("cfgThreshold").value) || 50000,
        budget: Number(document.getElementById("cfgBudget").value) || 500000,
        maxPO: Number(document.getElementById("cfgMaxPO").value) || 200000,
        riskAppetite: (document.querySelector('input[name="cfgRiskAppetite"]:checked') || {}).value || "balanced",
        preferred: (document.getElementById("cfgPreferred").value || "").split(",").map(s => s.trim()).filter(Boolean),
        blocked: (document.getElementById("cfgBlocked").value || "").split(",").map(s => s.trim()).filter(Boolean),
        volatility: document.getElementById("cfgVolatility").checked
    };
    localStorage.setItem("aegis_config", JSON.stringify(config));
    showMainApp();
}

function openSettings() {
    document.getElementById("mainApp").classList.remove("visible");
    const s = document.getElementById("setupScreen"); s.style.display = "flex";
    document.getElementById("cfgName").value = config.name || "";
    document.getElementById("cfgIndustry").value = config.industry || "Manufacturing";
    document.getElementById("cfgCurrency").value = config.currency || "INR";
    document.getElementById("cfgThreshold").value = config.threshold || 50000;
    document.getElementById("cfgBudget").value = config.budget || 500000;
    document.getElementById("cfgMaxPO").value = config.maxPO || 200000;
    const ra = document.querySelector(`input[name="cfgRiskAppetite"][value="${config.riskAppetite || 'balanced'}"]`); if (ra) ra.checked = true;
    document.getElementById("cfgPreferred").value = (config.preferred || []).join(", ");
    document.getElementById("cfgBlocked").value = (config.blocked || []).join(", ");
    document.getElementById("cfgVolatility").checked = !!config.volatility;
}

function showMainApp() {
    document.getElementById("setupScreen").style.display = "none";
    const m = document.getElementById("mainApp"); m.classList.add("visible");
    document.getElementById("headerEntName").textContent = config.name;
    document.getElementById("mlSubtitle").textContent = `Aegis.ei learns from ${config.name}'s decisions to refine governance policies.`;
    renderDelegationPanel();
    initPOQueue();
    renderPOQueue();
    updateMetrics();
    renderAuditLog();
    renderPredictions();
    // check volatility
    if (config.volatility) {
        document.getElementById("volatilityAlert").innerHTML = '<div class="volatility-warning">⚠️ Volatility Mode Active — retraining cadence auto-set to Real-time. All thresholds tightened by 20%.</div>';
    } else { document.getElementById("volatilityAlert").innerHTML = ""; }
    // load existing insights
    fetch(`${API}/api/enterprise_insights`).then(r => r.json()).then(d => { if (d && d.success) { latestInsights = d; renderInsights(); } }).catch(() => { });
}

/* ── Tab switching ────────────────────────────────────────────────── */
function showTab(name) {
    document.querySelectorAll(".nav-tab").forEach(t => { t.classList.toggle("active", t.dataset.tab === name); });
    document.querySelectorAll(".tab-panel").forEach(p => { p.classList.toggle("active", p.id === "tab-" + name); });
    if (name === "metrics") updateMetrics();
    if (name === "decisions") {
        renderPOQueue();
        // Start T3 auto-approve timers now that the Decisions tab is visible
        poQueue.forEach(po => { if (po.tier === "T3" && !autoTimers[po.id] && !po.blocked) startAutoApprove(po.id); });
    }
    if (name === "audit") renderAuditLog();
}

/* ── Kill Switch ──────────────────────────────────────────────────── */
function toggleAgentPause() {
    agentPaused = !agentPaused;
    const btn = document.getElementById("killSwitch");
    const badge = document.getElementById("agentBadge");
    const banner = document.getElementById("pauseBanner");
    const wfBadge = document.getElementById("wfAgentBadge");
    if (agentPaused) {
        btn.textContent = "▶ Resume AI Agent"; btn.classList.add("resumed");
        badge.innerHTML = '<span class="dot"></span> AI Agent PAUSED'; badge.classList.add("paused");
        banner.classList.add("visible");
        if (wfBadge) { wfBadge.textContent = "T1 Suggest (PAUSED)"; wfBadge.className = "tier-badge tier-t1"; }
        addAuditEntry("SYSTEM", "AI Agent paused by operator. All autonomy set to T1.", "SYSTEM_EVENT", "⚙️ System");
    } else {
        btn.textContent = "⏸ Pause AI Agent"; btn.classList.remove("resumed");
        badge.innerHTML = '<span class="dot"></span> AI Agent Active'; badge.classList.remove("paused");
        banner.classList.remove("visible");
        if (wfBadge) { wfBadge.textContent = "T3 Auto-Execute"; wfBadge.className = "tier-badge tier-t3"; }
        addAuditEntry("SYSTEM", "AI Agent resumed. Normal governance rules restored.", "SYSTEM_EVENT", "⚙️ System");
    }
    // Clear auto-approve timers when pausing
    if (agentPaused) { Object.keys(autoTimers).forEach(id => cancelAutoApprove(id)); }
    renderPOQueue();
    renderDelegationPanel();
}

/* ═══════════════════════════════════════════════════════════════════════
   PO GENERATOR (Section 7)
   ═══════════════════════════════════════════════════════════════════════ */
function rand(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function randF(a, b, d) { return parseFloat((Math.random() * (b - a) + a).toFixed(d || 1)); }
function pick(arr) { return arr[rand(0, arr.length - 1)]; }

function generatePO(overrides) {
    poCounter++;
    const o = overrides || {};
    const supplier = o.supplier || pick(SUPPLIERS);
    const isPreferred = (config.preferred || []).some(v => supplier.toLowerCase().includes(v.toLowerCase()));
    const isBlocked = o.blocked !== undefined ? o.blocked : (config.blocked || []).some(v => v && supplier.toLowerCase().includes(v.toLowerCase()));
    const isNew = o.new_supplier !== undefined ? o.new_supplier : !recentSuppliers.includes(supplier);
    const amount = o.amount || rand(5000, 300000);
    const po = {
        id: `PO-2026-${String(poCounter).padStart(3, "0")}`,
        amount,
        supplier,
        category: o.category || pick(CATEGORIES),
        vendor_rating: o.vendor_rating || randF(1.0, 5.0, 1),
        on_time_delivery: o.on_time_delivery || rand(60, 99),
        financial_stability: o.financial_stability || pick(["Stable", "Stable", "Watch", "Critical"]),
        stock_level: o.stock_level || rand(10, 95),
        safety_stock: o.safety_stock || rand(15, 40),
        demand_volatility: o.demand_volatility !== undefined ? o.demand_volatility : rand(1, 10),
        seasonality: o.seasonality || pick(SEASONS),
        budget_remaining: o.budget_remaining || rand(20, 90),
        cash_flow_constraint: o.cash_flow_constraint !== undefined ? o.cash_flow_constraint : Math.random() > 0.6,
        payment_terms: o.payment_terms || pick(PAY_TERMS),
        new_supplier: isNew,
        vip: isPreferred,
        blocked: isBlocked,
        timestamp: new Date().toISOString()
    };
    // Calculate risk
    const rs = calculateRiskScore(po);
    po.risk_score = rs.total;
    po.risk_breakdown = rs.breakdown;
    po.risk_level = classifyRisk(rs.total);
    po.tier = assignTier(po);
    po.ai_reasoning = generateAIReasoning(po);
    return po;
}

/* Generate a guaranteed LOW-risk PO that qualifies for T3 auto-approve */
function generateT3PO() {
    const th = getEffectiveThreshold();
    // Pick a known supplier & add to recentSuppliers so it's not "new"
    const supplier = pick(SUPPLIERS.slice(0, 4));
    if (!recentSuppliers.includes(supplier)) recentSuppliers.push(supplier);
    return generatePO({
        supplier,
        amount: rand(5000, Math.floor(th * 0.7)),         // well under threshold
        vendor_rating: randF(4.5, 5.0, 1),                // excellent rating
        on_time_delivery: rand(92, 99),                    // very reliable
        financial_stability: "Stable",                     // no risk flag
        stock_level: rand(65, 95),                         // healthy stock
        demand_volatility: rand(1, 3),                     // low volatility
        cash_flow_constraint: false,                       // no constraint
        seasonality: "Normal",                             // no seasonal pressure
        new_supplier: false,                               // trusted vendor
        blocked: false
    });
}

/* Generate a guaranteed BLOCKED PO that triggers T0 auto-reject */
function generateT0PO() {
    // Use a hardcoded blocked vendor name (always on the blocked list)
    const BLOCKED_VENDOR = "Falcon Raw Materials";
    return generatePO({
        supplier: BLOCKED_VENDOR,
        blocked: true,
        amount: rand(30000, 150000),
        vendor_rating: randF(1.5, 2.5, 1),
        on_time_delivery: rand(60, 72),
        financial_stability: pick(["Watch", "Critical"]),
        demand_volatility: rand(5, 9),
        new_supplier: false
    });
}

function initPOQueue() {
    poQueue = [];
    // Guarantee at least 1 T3 and 1 T0 in every queue
    poQueue.push(generateT3PO());
    poQueue.push(generateT0PO());
    // Fill the rest randomly (3 more POs)
    for (let i = 0; i < 3; i++) poQueue.push(generatePO());
    // Shuffle so the guaranteed POs don't always appear first
    for (let i = poQueue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [poQueue[i], poQueue[j]] = [poQueue[j], poQueue[i]];
    }
}

function replacePO(poId) {
    const idx = poQueue.findIndex(p => p.id === poId);
    if (idx !== -1) poQueue.splice(idx, 1);
    // Occasionally generate T3 or T0 replacements so they keep appearing
    const roll = Math.random();
    if (roll < 0.35) poQueue.push(generateT3PO());
    else if (roll < 0.45) poQueue.push(generateT0PO());
    else poQueue.push(generatePO());
    renderPOQueue();
}

/* ═══════════════════════════════════════════════════════════════════════
   RISK SCORING ENGINE (Section 8)
   ═══════════════════════════════════════════════════════════════════════ */
function getEffectiveThreshold() {
    let t = config.threshold || 50000;
    if (config.volatility) t = Math.floor(t * 0.8);
    return t;
}

function calculateRiskScore(po) {
    const th = getEffectiveThreshold();
    const b = {};
    // Amount vs Threshold (20pts)
    const ratio = po.amount / th;
    b.amount = ratio > 2 ? 20 : ratio > 1 ? 15 : ratio > 0.75 ? 10 : 0;
    // Vendor Rating (15pts)
    b.vendor_rating = po.vendor_rating < 2.5 ? 15 : po.vendor_rating < 3.5 ? 10 : po.vendor_rating < 4.5 ? 5 : 0;
    // On-Time Delivery (15pts)
    b.on_time = po.on_time_delivery < 70 ? 15 : po.on_time_delivery < 80 ? 10 : po.on_time_delivery < 90 ? 5 : 0;
    // Financial Stability (15pts)
    b.financial = po.financial_stability === "Critical" ? 15 : po.financial_stability === "Watch" ? 8 : 0;
    // New Supplier (10pts)
    b.new_supplier = po.new_supplier ? 10 : 0;
    // Stock Level (10pts)
    b.stock = po.stock_level < 20 ? 10 : po.stock_level <= 60 ? 5 : 0;
    // Demand Volatility (10pts)
    b.volatility = po.demand_volatility >= 8 ? 10 : po.demand_volatility >= 5 ? 5 : 0;
    // Cash Flow (5pts)
    b.cash_flow = po.cash_flow_constraint ? 5 : 0;
    const total = Object.values(b).reduce((s, v) => s + v, 0);
    return { total, breakdown: b };
}

function classifyRisk(score) {
    if (score <= 25) return "low"; if (score <= 50) return "medium"; if (score <= 75) return "high"; return "critical";
}

function assignTier(po) {
    if (po.overridden) return "T1";
    if (agentPaused) return "T1";
    if (po.blocked) return "T0";
    const th = getEffectiveThreshold();
    if (po.risk_level === "critical") return "T1";
    if (po.risk_level === "high" && po.amount > th) return "T1";
    if (po.risk_level === "high") return "T2";
    if (po.amount > config.maxPO) return "T1";
    if (po.risk_level === "medium" && po.new_supplier) return "T2";
    if (po.risk_level === "medium") return "T2";
    if (po.risk_level === "low" && config.volatility) return "T2";
    if (po.risk_level === "low" && po.amount <= th && !po.new_supplier) return "T3";
    return "T2";
}

/* ═══════════════════════════════════════════════════════════════════════
   AI REASONING GENERATOR
   ═══════════════════════════════════════════════════════════════════════ */
function generateAIReasoning(po) {
    let r = `Vendor '${po.supplier}' `;
    if (po.financial_stability !== "Stable") r += `has financial stability flagged as '${po.financial_stability}' `;
    else r += `is financially stable `;
    r += `with ${po.on_time_delivery}% on-time delivery and a ${po.vendor_rating}/5.0 rating. `;
    if (po.demand_volatility >= 7) r += `Demand volatility is elevated at ${po.demand_volatility}/10. `;
    if (po.cash_flow_constraint) r += `Cash flow constraint is active. `;
    if (po.stock_level < 25) r += `Stock levels are critically low at ${po.stock_level}%. `;
    if (po.seasonality !== "Normal") r += `Seasonality signal: ${po.seasonality}. `;
    if (po.new_supplier) r += `This is a NEW supplier with no recent history. `;
    if (po.vip) r += `⭐ Preferred vendor per enterprise policy. `;
    r += `Amount ${fmt(po.amount)} against threshold ${fmt(getEffectiveThreshold())}. `;
    // Recommendation
    if (po.blocked) r += `Recommendation: AUTO-REJECT — vendor is on the blocked list.`;
    else if (po.tier === "T3") r += `Recommendation: AUTO-APPROVE — low risk, within guardrails.`;
    else if (po.tier === "T1") r += `Recommendation: ESCALATE to T1 — manager review required.`;
    else r += `Recommendation: CO-DECIDE (T2) — human confirmation needed.`;
    return r;
}

/* ═══════════════════════════════════════════════════════════════════════
   RENDER PO QUEUE (Section 9)
   ═══════════════════════════════════════════════════════════════════════ */
function renderPOQueue() {
    const c = document.getElementById("poContainer"); if (!c) return;
    // Re-evaluate tiers when state changes
    poQueue.forEach(po => { po.tier = assignTier(po); });
    // Alert banner
    const highCount = poQueue.filter(p => p.risk_level === "high" || p.risk_level === "critical").length;
    const ab = document.getElementById("riskAlertBanner");
    if (ab) {
        if (highCount > 0) ab.innerHTML = `<div class="risk-alert-banner"><span class="icon">⚠️</span>${highCount} high-risk purchase order(s) require your immediate review. AI agent cannot auto-execute these decisions.</div>`;
        else ab.innerHTML = "";
    }
    // Render cards
    c.innerHTML = poQueue.map(po => renderPOCard(po)).join("");
    // Start auto-approve timers for T3 only when the Decisions tab is visible
    const decisionsTabActive = document.getElementById("tab-decisions")?.classList.contains("active");
    if (decisionsTabActive) {
        poQueue.forEach(po => { if (po.tier === "T3" && !autoTimers[po.id] && !po.blocked) startAutoApprove(po.id); });
    }
}

function starRating(v) { const full = Math.floor(v); const half = v - full >= 0.5 ? 1 : 0; return "★".repeat(full) + (half ? "½" : "") + "☆".repeat(5 - full - half); }

function renderPOCard(po) {
    const rl = po.risk_level;
    const riskClass = `risk-${rl}`;
    const tierClass = `tier-${po.tier.toLowerCase()}`;
    const stabClass = po.financial_stability === "Stable" ? "stability-stable" : po.financial_stability === "Watch" ? "stability-watch" : "stability-critical";

    let html = `<div class="po-card" id="card-${po.id}">`;
    // Header
    html += `<div class="po-card-header">
    <span class="po-id">${po.id}</span>
    <span class="badge badge-category">${po.category}</span>
    <span class="badge ${riskClass}">${rl.toUpperCase()} RISK</span>
    <span class="tier-badge ${tierClass}">${po.tier}</span>
    ${po.vip ? '<span class="badge" style="background:rgba(245,158,11,.15);color:#fbbf24;border:1px solid rgba(245,158,11,.3)">⭐ VIP</span>' : ""}
    ${po.new_supplier ? '<span class="badge" style="background:rgba(139,92,246,.15);color:#a78bfa;border:1px solid rgba(139,92,246,.3)">🆕 New Supplier</span>' : ""}
    ${po.blocked ? '<span class="badge" style="background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.3)">🚫 BLOCKED</span>' : ""}
  </div>`;
    // Data context
    html += `<div class="data-context">
    <button class="data-context-toggle" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'grid':'none'">📊 Data Context (Simulated Integration) ▾</button>
    <div class="data-grid">
      <div class="data-source"><h5>📦 ERP System</h5>
        <div class="data-row"><span class="label">Amount</span><span class="value">${fmt(po.amount)}</span></div>
        <div class="data-row"><span class="label">Category</span><span class="value">${po.category}</span></div>
        <div class="data-row"><span class="label">Payment Terms</span><span class="value">${po.payment_terms} days</span></div>
        <div class="data-row"><span class="label">Budget Remaining</span><span class="value">${po.budget_remaining}%</span></div>
      </div>
      <div class="data-source"><h5>🏭 Vendor Database</h5>
        <div class="data-row"><span class="label">Supplier</span><span class="value">${po.supplier}</span></div>
        <div class="data-row"><span class="label">Rating</span><span class="value stars">${starRating(po.vendor_rating)} ${po.vendor_rating}</span></div>
        <div class="data-row"><span class="label">On-Time Delivery</span><span class="value">${po.on_time_delivery}%</span></div>
        <div class="data-row"><span class="label">Financial Stability</span><span class="value ${stabClass}">${po.financial_stability}</span></div>
      </div>
      <div class="data-source"><h5>📊 Inventory & Demand</h5>
        <div class="data-row"><span class="label">Stock Level</span><span class="value">${po.stock_level}%</span></div>
        <div class="data-row"><span class="label">Safety Stock</span><span class="value">${po.safety_stock}%</span></div>
        <div class="data-row"><span class="label">Demand Volatility</span><span class="value">${po.demand_volatility}/10</span></div>
        <div class="data-row"><span class="label">Seasonality</span><span class="value">${po.seasonality}</span></div>
      </div>
      <div class="data-source"><h5>💰 Finance</h5>
        <div class="data-row"><span class="label">Cash Flow Constraint</span><span class="value">${po.cash_flow_constraint ? "Yes ⚠️" : "No"}</span></div>
        <div class="data-row"><span class="label">Budget Remaining</span><span class="value">${po.budget_remaining}%</span></div>
      </div>
    </div>
  </div>`;
    // Risk score breakdown
    const bd = po.risk_breakdown;
    const barColor = rl === "low" ? "var(--success)" : rl === "medium" ? "var(--warning)" : rl === "high" ? "var(--danger)" : "var(--critical)";
    const maxPts = { amount: 20, vendor_rating: 15, on_time: 15, financial: 15, new_supplier: 10, stock: 10, volatility: 10, cash_flow: 5 };
    const labels = { amount: "PO Amount", vendor_rating: "Vendor Rating", on_time: "On-Time Delivery", financial: "Financial Stability", new_supplier: "New Supplier", stock: "Stock Level", volatility: "Demand Volatility", cash_flow: "Cash Flow" };
    html += `<div class="risk-score-section">
    <div class="risk-score-header"><span>Risk Score</span><span class="risk-score-value" style="color:${barColor}">${po.risk_score}/100</span></div>`;
    for (const [k, v] of Object.entries(bd)) {
        const pct = (v / maxPts[k]) * 100;
        html += `<div class="risk-bar-row"><span class="risk-bar-label">${labels[k]}</span><div class="risk-bar-track"><div class="risk-bar-fill" style="width:${pct}%;background:${barColor}"></div></div><span class="risk-bar-pts">${v}/${maxPts[k]}</span></div>`;
    }
    // Tier reason
    let reason = "";
    if (po.blocked) reason = "T0: Vendor is blocked";
    else if (po.overridden) reason = "T1: Manager overrode T3 auto-approve → manual review";
    else if (agentPaused) reason = "T1: AI Agent is paused — all decisions require human approval";
    else if (po.risk_level === "critical") reason = "T1: CRITICAL risk level";
    else if (po.risk_level === "high" && po.amount > getEffectiveThreshold()) reason = "T1: HIGH risk + above threshold";
    else if (po.amount > config.maxPO) reason = "T1: Exceeds Max Single PO Limit";
    else if (po.risk_level === "high") reason = "T2: HIGH risk, within threshold";
    else if (po.risk_level === "medium" && po.new_supplier) reason = "T2: MEDIUM risk + new supplier";
    else if (po.risk_level === "medium") reason = "T2: MEDIUM risk";
    else if (config.volatility && po.risk_level === "low") reason = "T2: LOW risk but Volatility Mode is ON";
    else if (po.tier === "T3") reason = "T3: LOW risk, within threshold, trusted vendor";
    else reason = `${po.tier}: Assigned by policy`;
    html += `<p class="risk-tier-reason">${reason}</p></div>`;
    // AI Recommendation
    html += `<div class="ai-recommendation"><h4>🤖 Joule Agent Analysis</h4><p class="reasoning">${po.ai_reasoning}</p></div>`;
    // T3 auto-approve notice
    if (po.tier === "T3" && !po.blocked) {
        html += `<div class="auto-approve-notice"><div><span class="text">✅ Auto-executing — no action required unless you override.</span><br><span class="countdown" id="countdown-${po.id}">Auto-approving in 15s…</span></div><button class="btn-override" onclick="cancelAutoApprove('${po.id}')">⛔ Override & Review</button></div>`;
    }
    // Blocked auto-reject
    if (po.blocked) {
        html += `<div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:var(--radius);padding:14px 18px;margin-bottom:16px;"><span style="color:#f87171;font-weight:600;">🚫 AUTO-REJECTED — Vendor is on blocked list.</span></div>`;
        // Auto-reject after render
        setTimeout(() => autoRejectBlocked(po.id), 1500);
    }
    // Action buttons (only for non-blocked)
    if (!po.blocked && po.tier !== "T3") {
        html += `<div class="po-actions">
      <button class="btn btn-approve" onclick="approvePO('${po.id}')">✅ Approve</button>
      <button class="btn btn-modify" onclick="modifyPO('${po.id}')">✏️ Modify Amount</button>
      <button class="btn btn-reject" onclick="rejectPO('${po.id}')">❌ Reject</button>
    </div>`;
    }
    html += `</div>`;
    return html;
}

/* ═══════════════════════════════════════════════════════════════════════
   AUTO-APPROVE & COUNTDOWN (T3)
   ═══════════════════════════════════════════════════════════════════════ */
function startAutoApprove(poId) {
    let secs = 15;
    autoTimers[poId] = setInterval(() => {
        secs--;
        const el = document.getElementById("countdown-" + poId);
        if (el) el.textContent = `Auto-approving in ${secs}s…`;
        if (secs <= 0) { clearInterval(autoTimers[poId]); delete autoTimers[poId]; executeAutoApprove(poId); }
    }, 1000);
}
function cancelAutoApprove(poId) {
    if (autoTimers[poId]) { clearInterval(autoTimers[poId]); delete autoTimers[poId]; }
    const po = poQueue.find(p => p.id === poId);
    if (po) { po.overridden = true; po.tier = "T1"; po.ai_reasoning += " [OVERRIDE: Manager cancelled auto-approve and requested manual review.]"; }
    addAuditEntry(poId, "Manager overrode T3 auto-approve → moved to T1 manual review", "MANAGER_DECISION", "👤 Manager", true);
    renderPOQueue();
}
function executeAutoApprove(poId) {
    const po = poQueue.find(p => p.id === poId); if (!po) return;
    metrics.total++; metrics.autoApproved++; metrics.totalRiskScore += po.risk_score;
    recentSuppliers.push(po.supplier); if (recentSuppliers.length > 5) recentSuppliers.shift();
    decidedPOs.push({ ...po, final_decision: "APPROVE", decision_actor: "AI_AGENT", override_flag: 0 });
    addAuditEntry(po.id, `AI Auto-Approved: ${po.supplier} — ${fmt(po.amount)} (${po.category}) | Risk: ${po.risk_score}/100`, "AI_ACTION", "🤖 Joule Agent");
    logDecision(po, "APPROVE", "AI_AGENT", 0);
    replacePO(poId); updateMetrics();
}
function autoRejectBlocked(poId) {
    const po = poQueue.find(p => p.id === poId); if (!po) return;
    metrics.total++; metrics.totalRiskScore += po.risk_score;
    decidedPOs.push({ ...po, final_decision: "REJECT", decision_actor: "SYSTEM", override_flag: 0 });
    addAuditEntry(po.id, `Auto-Rejected (BLOCKED vendor): ${po.supplier}`, "SYSTEM_EVENT", "⚙️ System");
    logDecision(po, "REJECT", "SYSTEM", 0);
    replacePO(poId); updateMetrics();
}

/* ═══════════════════════════════════════════════════════════════════════
   DECISION ACTIONS (Section 9)
   ═══════════════════════════════════════════════════════════════════════ */
function approvePO(poId) {
    const po = poQueue.find(p => p.id === poId); if (!po) return;
    if (po.risk_level === "high" || po.risk_level === "critical") { currentJustifyPoId = poId; showJustifyModal(po); return; }
    finalizeApprove(poId, null);
}
function finalizeApprove(poId, justification) {
    const po = poQueue.find(p => p.id === poId); if (!po) return;
    if (autoTimers[poId]) { clearInterval(autoTimers[poId]); delete autoTimers[poId]; }
    const isOverride = po.risk_level === "high" || po.risk_level === "critical";
    metrics.total++; metrics.humanReview++; metrics.totalRiskScore += po.risk_score;
    if (isOverride) { metrics.overrides++; if (po.risk_level === "critical") metrics.criticalCaught++; }
    recentSuppliers.push(po.supplier); if (recentSuppliers.length > 5) recentSuppliers.shift();
    decidedPOs.push({ ...po, final_decision: "APPROVE", decision_actor: "MANAGER", override_flag: isOverride ? 1 : 0, override_justification: justification });
    const justText = justification ? ` | Justification: ${justification.join("; ")}` : "";
    addAuditEntry(po.id, `Manager APPROVED: ${po.supplier} — ${fmt(po.amount)} | Risk: ${po.risk_score}/100${justText}`, "MANAGER_DECISION", "👤 Manager", isOverride);
    logDecision(po, "APPROVE", "MANAGER", isOverride ? 1 : 0, justification);
    replacePO(poId); updateMetrics();
}
function rejectPO(poId) {
    const po = poQueue.find(p => p.id === poId); if (!po) return;
    if (autoTimers[poId]) { clearInterval(autoTimers[poId]); delete autoTimers[poId]; }
    metrics.total++; metrics.humanReview++; metrics.overrides++; metrics.totalRiskScore += po.risk_score;
    recentSuppliers.push(po.supplier); if (recentSuppliers.length > 5) recentSuppliers.shift();
    decidedPOs.push({ ...po, final_decision: "REJECT", decision_actor: "MANAGER", override_flag: 1 });
    addAuditEntry(po.id, `Manager REJECTED: ${po.supplier} — ${fmt(po.amount)}`, "MANAGER_DECISION", "👤 Manager", true);
    logDecision(po, "REJECT", "MANAGER", 1);
    replacePO(poId); updateMetrics();
}

/* ── Modify modal ──────────────────────────────────────────────────── */
function modifyPO(poId) {
    const po = poQueue.find(p => p.id === poId); if (!po) return;
    currentModifyPoId = poId;
    document.getElementById("modModalPoId").textContent = po.id;
    document.getElementById("modModalCurrent").textContent = fmt(po.amount);
    document.getElementById("modModalNewAmt").value = po.amount;
    updateModifyPreview();
    document.getElementById("modifyModal").classList.add("visible");
}
function closeModifyModal() { document.getElementById("modifyModal").classList.remove("visible"); currentModifyPoId = null; }
function updateModifyPreview() {
    const v = Number(document.getElementById("modModalNewAmt").value);
    document.getElementById("modModalPreview").textContent = v > 0 ? fmt(v) : "—";
}
function confirmModifyAmount() {
    if (!currentModifyPoId) return closeModifyModal();
    const po = poQueue.find(p => p.id === currentModifyPoId); if (!po) return closeModifyModal();
    const val = Number(document.getElementById("modModalNewAmt").value);
    if (!val || val <= 0) return alert("Please enter a valid amount.");
    if (autoTimers[po.id]) { clearInterval(autoTimers[po.id]); delete autoTimers[po.id]; }
    const oldAmt = po.amount; po.amount = val;
    metrics.total++; metrics.humanReview++; metrics.overrides++; metrics.totalRiskScore += po.risk_score;
    recentSuppliers.push(po.supplier); if (recentSuppliers.length > 5) recentSuppliers.shift();
    decidedPOs.push({ ...po, final_decision: "MODIFY", decision_actor: "MANAGER", override_flag: 1 });
    addAuditEntry(po.id, `Manager MODIFIED amount from ${fmt(oldAmt)} → ${fmt(val)} and approved`, "MANAGER_DECISION", "👤 Manager", true);
    logDecision(po, "MODIFY", "MANAGER", 1);
    closeModifyModal(); replacePO(po.id); updateMetrics();
}

/* ── Justification modal ───────────────────────────────────────────── */
function showJustifyModal(po) {
    document.getElementById("justifyWarning").textContent = `PO ${po.id}: ${po.supplier} — ${fmt(po.amount)} | Risk: ${po.risk_score}/100 (${po.risk_level.toUpperCase()})`;
    document.querySelectorAll("#justifyModal .justify-checkboxes input[type=checkbox]").forEach(cb => { cb.checked = false; });
    document.getElementById("justifyOtherText").style.display = "none";
    document.getElementById("justifyOtherText").value = "";
    document.getElementById("btnConfirmJustify").disabled = true;
    document.getElementById("justifyModal").classList.add("visible");
}
function closeJustifyModal() { document.getElementById("justifyModal").classList.remove("visible"); currentJustifyPoId = null; }
function updateJustifyBtn() {
    const any = [...document.querySelectorAll("#justifyModal .justify-checkboxes input[type=checkbox]")].some(c => c.checked);
    document.getElementById("btnConfirmJustify").disabled = !any;
}
function confirmApproveWithJustification() {
    const reasons = [];
    document.querySelectorAll("#justifyModal .justify-checkboxes input[type=checkbox]:checked").forEach(cb => {
        if (cb.value === "Other") { const t = document.getElementById("justifyOtherText").value.trim(); reasons.push(t ? "Other: " + t : "Other"); }
        else reasons.push(cb.value);
    });
    if (reasons.length === 0) return;
    // IMPORTANT: save poId BEFORE closeJustifyModal (which sets currentJustifyPoId = null)
    const poId = currentJustifyPoId;
    closeJustifyModal();
    finalizeApprove(poId, reasons);
}

/* ═══════════════════════════════════════════════════════════════════════
   AUDIT LEDGER (Section 10)
   ═══════════════════════════════════════════════════════════════════════ */
function addAuditEntry(caseId, action, eventType, actor, isOverride = false, justification = null) {
    auditLog.unshift({ ts: new Date().toLocaleString("en-IN"), caseId, action, eventType, actor, override: isOverride, justification });
    renderAuditLog();
}
function filterAudit(f) {
    auditFilter = f;
    document.querySelectorAll(".audit-filter").forEach(b => b.classList.toggle("active", b.dataset.filter === f));
    renderAuditLog();
}
function renderAuditLog() {
    const c = document.getElementById("auditContainer"); if (!c) return;
    let items = auditLog;
    if (auditFilter === "ai") items = items.filter(e => e.eventType === "AI_ACTION");
    else if (auditFilter === "manager") items = items.filter(e => e.eventType === "MANAGER_DECISION");
    else if (auditFilter === "override") items = items.filter(e => e.override);
    else if (auditFilter === "system") items = items.filter(e => e.eventType === "SYSTEM_EVENT" || e.eventType === "CONFIG_CHANGE");
    if (items.length === 0) { c.innerHTML = '<div class="audit-empty">No audit entries match this filter.</div>'; return; }
    c.innerHTML = items.map(e => {
        const badgeClass = e.eventType === "AI_ACTION" ? "audit-badge-ai" : e.eventType === "MANAGER_DECISION" ? "audit-badge-manager" : e.eventType === "CONFIG_CHANGE" ? "audit-badge-config" : "audit-badge-system";
        return `<div class="audit-entry"><div class="audit-ts">⏱ ${e.ts}</div><div class="audit-desc"><strong>${e.caseId}:</strong> ${e.action}</div><div class="audit-meta"><span class="audit-badge ${badgeClass}">${e.eventType}</span><span class="audit-badge audit-badge-system">${e.actor}</span>${e.override ? '<span class="audit-badge audit-badge-override">⚠️ OVERRIDE</span>' : ""}</div>${e.justification ? `<div class="audit-justification">Justification: ${Array.isArray(e.justification) ? e.justification.join("; ") : e.justification}</div>` : ""}</div>`;
    }).join("");
}

/* ═══════════════════════════════════════════════════════════════════════
   METRICS & INTELLIGENCE (Section 11)
   ═══════════════════════════════════════════════════════════════════════ */
function updateMetrics() {
    const g = document.getElementById("kpiGrid"); if (!g) return;
    const or = metrics.total > 0 ? Math.round((metrics.overrides / metrics.total) * 100) : 0;
    const avgRisk = metrics.total > 0 ? Math.round(metrics.totalRiskScore / metrics.total) : 0;
    g.innerHTML = [
        { v: metrics.total, l: "Total POs Processed" }, { v: metrics.autoApproved, l: "AI Auto-Approved (T3)" },
        { v: metrics.humanReview, l: "Escalated to Human" }, { v: or + "%", l: "Override Rate" },
        { v: metrics.criticalCaught, l: "Critical POs Caught" }, { v: avgRisk, l: "Avg Risk Score" }
    ].map(k => `<div class="kpi-card"><div class="kpi-value">${k.v}</div><div class="kpi-label">${k.l}</div></div>`).join("");
    renderTeamingHealth(or);
    renderRiskDistChart();
    renderTierUsageChart();
    renderJustifyAnalysis();
}
function renderTeamingHealth(or) {
    const c = document.getElementById("teamingHealth"); if (!c) return;
    let icon, label, msg, color;
    if (or <= 20) { icon = "⚠️"; label = "Possible Over-Trust"; color = "var(--warning)"; msg = "Your team may be delegating too much to AI. Increase review frequency for medium-risk POs."; }
    else if (or <= 60) { icon = "✅"; label = "Balanced Teaming"; color = "var(--success)"; msg = "Healthy balance between AI automation and human oversight."; }
    else if (or <= 80) { icon = "⚠️"; label = "AI Under-Trust"; color = "var(--warning)"; msg = "High override rate suggests team lacks confidence in AI. Review model accuracy."; }
    else { icon = "🔴"; label = "Governance Crisis"; color = "var(--danger)"; msg = "AI governance has broken down. Consider pausing AI agent and running emergency retraining."; }
    c.innerHTML = `<div class="teaming-card"><div class="teaming-icon">${icon}</div><div class="teaming-label" style="color:${color}">${label}</div><div class="teaming-message">${msg} (Override rate: ${or}%)</div></div>`;
}
function renderRiskDistChart() {
    const c = document.getElementById("riskDistChart"); if (!c) return;
    const counts = { low: 0, medium: 0, high: 0, critical: 0 };
    decidedPOs.forEach(p => { if (counts[p.risk_level] !== undefined) counts[p.risk_level]++; });
    const max = Math.max(...Object.values(counts), 1);
    const colors = { low: "var(--success)", medium: "var(--warning)", high: "var(--danger)", critical: "var(--critical)" };
    c.innerHTML = `<div class="vbar-chart">${Object.entries(counts).map(([k, v]) => `<div class="vbar-col"><span class="vbar-count">${v}</span><div class="vbar-bar" style="height:${(v / max) * 100}%;background:${colors[k]}"></div><span class="vbar-label">${k.toUpperCase()}</span></div>`).join("")}</div>`;
}
function renderTierUsageChart() {
    const c = document.getElementById("tierUsageChart"); if (!c) return;
    const counts = { T0: 0, T1: 0, T2: 0, T3: 0 };
    decidedPOs.forEach(p => { if (counts[p.tier] !== undefined) counts[p.tier]++; });
    const max = Math.max(...Object.values(counts), 1);
    const colors = { T0: "#94a3b8", T1: "#60a5fa", T2: "#fbbf24", T3: "#4ade80" };
    c.innerHTML = `<div class="vbar-chart">${Object.entries(counts).map(([k, v]) => `<div class="vbar-col"><span class="vbar-count">${v}</span><div class="vbar-bar" style="height:${(v / max) * 100}%;background:${colors[k]}"></div><span class="vbar-label">${k}</span></div>`).join("")}</div>`;
}
function renderJustifyAnalysis() {
    const panel = document.getElementById("justifyAnalysis");
    const cont = document.getElementById("justifyTableContainer"); if (!panel || !cont) return;
    const freq = {};
    decidedPOs.filter(p => p.override_justification).forEach(p => {
        (Array.isArray(p.override_justification) ? p.override_justification : [p.override_justification]).forEach(r => { freq[r] = (freq[r] || 0) + 1; });
    });
    if (Object.keys(freq).length === 0) { panel.style.display = "none"; return; }
    panel.style.display = "block";
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    cont.innerHTML = `<table class="justify-table"><thead><tr><th>Justification Reason</th><th>Count</th></tr></thead><tbody>${sorted.map(([r, c]) => `<tr><td>${r}</td><td>${c}</td></tr>`).join("")}</tbody></table>`;
}

/* ═══════════════════════════════════════════════════════════════════════
   DELEGATION PANEL
   ═══════════════════════════════════════════════════════════════════════ */
function renderDelegationPanel() {
    const g = document.getElementById("delegationGrid"); if (!g) return;
    const th = getEffectiveThreshold();
    g.innerHTML = `
    <div class="deleg-item"><strong>Threshold:</strong> ${fmt(th)}${config.volatility ? " (tightened 20%)" : ""}</div>
    <div class="deleg-item"><strong>Max PO Limit:</strong> ${fmt(config.maxPO)}</div>
    <div class="deleg-item"><strong>Risk Appetite:</strong> ${(config.riskAppetite || "balanced").charAt(0).toUpperCase() + (config.riskAppetite || "balanced").slice(1)}</div>
    <div class="deleg-item"><strong>Volatility Mode:</strong> ${config.volatility ? "🔴 ON" : "⚪ OFF"}</div>
    <div class="deleg-item"><strong>Preferred Vendors:</strong> ${(config.preferred || []).length}</div>
    <div class="deleg-item"><strong>Blocked Vendors:</strong> ${(config.blocked || []).length}</div>
    <div class="deleg-item"><strong>AI Agent:</strong> ${agentPaused ? "⏸ PAUSED" : "▶ Active"}</div>
    <div class="deleg-item"><strong>Monthly Budget:</strong> ${fmt(config.budget)}</div>`;
}

/* ═══════════════════════════════════════════════════════════════════════
   ENTERPRISE INTELLIGENCE — ML LOOP (Section 12)
   ═══════════════════════════════════════════════════════════════════════ */
function setCadence(el) {
    document.querySelectorAll(".cadence-option").forEach(o => o.classList.remove("active"));
    el.classList.add("active");
    const val = el.querySelector("input").value;
    const labels = { realtime: "Real-time", weekly: "Weekly", monthly: "Monthly", trigger: "On Trigger (override > 60%)" };
    document.getElementById("cadenceLabel").textContent = "Current mode: " + labels[val];
}

function runLearning() {
    const btn = document.getElementById("btnLearn");
    const status = document.getElementById("learnStatus");
    btn.disabled = true;
    status.innerHTML = '<span class="spinner"></span> Aegis.ei is analyzing your decision history…';
    fetch(`${API}/api/train_model`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enterprise_id: "aegis_demo_1", current_threshold: getEffectiveThreshold() })
    }).then(r => r.json()).then(data => {
        latestInsights = data;
        btn.disabled = false;
        if (data.success) { status.textContent = `Learning complete. Analyzed ${data.samples_used || "?"} decisions.`; renderInsights(); }
        else { status.textContent = data.message || "Learning could not run — need more decisions."; }
    }).catch(err => { btn.disabled = false; status.textContent = "Learning failed — check backend server."; console.error(err); });
}

function renderInsights() {
    const panel = document.getElementById("mlResults");
    const cont = document.getElementById("resultsPanel");
    if (!panel || !cont || !latestInsights) return;
    panel.style.display = "block";
    const d = latestInsights;
    let html = "";
    html += `<div class="result-stat"><span class="label">Model Accuracy</span><span class="value">${d.model_accuracy !== null ? (d.model_accuracy * 100).toFixed(1) + "%" : "N/A"}</span></div>`;
    html += `<div class="result-stat"><span class="label">Samples Analyzed</span><span class="value">${d.samples_used || "?"}</span></div>`;
    html += `<div class="result-stat"><span class="label">Current Threshold</span><span class="value">${fmt(d.current_threshold || config.threshold)}</span></div>`;
    html += `<div class="result-stat"><span class="label">Suggested Threshold</span><span class="value">${fmt(d.suggested_threshold || config.threshold)}</span></div>`;
    if (d.insights && d.insights.length) {
        html += `<h4 style="margin-top:16px;font-size:.9rem;">Key Patterns Discovered</h4><ul class="insights-list">${d.insights.map(i => `<li>${i}</li>`).join("")}</ul>`;
    }
    if (d.recommendations && d.recommendations.length) {
        html += `<h4 style="margin-top:16px;font-size:.9rem;">Policy Recommendations</h4>`;
        d.recommendations.forEach((r, i) => {
            html += `<div class="recommendation-card"><span class="text">${r}</span><div class="recommendation-actions"><button class="btn-sm btn-accept" onclick="acceptRecommendation(${i})">Accept</button><button class="btn-sm btn-dismiss" onclick="this.closest('.recommendation-card').remove()">Dismiss</button></div></div>`;
        });
    }
    cont.innerHTML = html;
}

function acceptRecommendation(idx) {
    if (!latestInsights || !latestInsights.recommendations) return;
    const rec = latestInsights.recommendations[idx];
    if (!rec) return;
    // Try to extract suggested threshold
    const match = rec.match(/₹([\d,]+)/);
    if (match) {
        const val = Number(match[1].replace(/,/g, ""));
        if (val > 0 && val < config.threshold) {
            config.threshold = val;
            localStorage.setItem("aegis_config", JSON.stringify(config));
            addAuditEntry("SYSTEM", `Threshold updated to ${fmt(val)} based on ML recommendation`, "CONFIG_CHANGE", "⚙️ System");
            renderDelegationPanel(); renderPOQueue();
        }
    }
    addAuditEntry("SYSTEM", `Accepted recommendation: ${rec}`, "CONFIG_CHANGE", "⚙️ System");
    // Remove the card
    document.querySelectorAll(".recommendation-card")[idx]?.remove();
}

function renderPredictions() {
    const g = document.getElementById("predictionsGrid"); if (!g) return;
    const preds = [];
    for (let i = 0; i < 3; i++) {
        const po = generatePO();
        preds.push({ id: po.id, supplier: po.supplier, risk_score: po.risk_score, risk_level: po.risk_level, tier: po.tier });
        poCounter--; // don't advance counter
    }
    const colors = { low: "var(--success)", medium: "var(--warning)", high: "var(--danger)", critical: "var(--critical)" };
    g.innerHTML = preds.map(p => `<div class="prediction-card"><div class="po-id-sm">${p.id} — ${p.supplier}</div><div class="pred-risk" style="color:${colors[p.risk_level]}">${p.risk_score}/100 ${p.risk_level.toUpperCase()}</div><span class="tier-badge tier-${p.tier.toLowerCase()}">${p.tier}</span></div>`).join("");
}

/* ═══════════════════════════════════════════════════════════════════════
   BACKEND API
   ═══════════════════════════════════════════════════════════════════════ */
function logDecision(po, finalDecision, actor, overrideFlag, justification) {
    const payload = {
        enterprise_id: "aegis_demo_1", case_id: po.id, timestamp: new Date().toISOString(),
        amount: po.amount, supplier: po.supplier, category: po.category,
        risk_level: po.risk_level, risk_score: po.risk_score,
        vip_flag: po.vip ? 1 : 0, new_supplier_flag: po.new_supplier ? 1 : 0,
        ai_autonomy_tier: po.tier, ai_initial_recommendation: po.tier === "T3" ? "APPROVE" : "REVIEW",
        final_decision: finalDecision, decision_actor: actor,
        override_flag: overrideFlag,
        override_justification: justification ? JSON.stringify(justification) : null,
        notes: null
    };
    fetch(`${API}/api/log_decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(e => console.error("Log failed:", e));
}
