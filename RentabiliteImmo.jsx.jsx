import { useState, useMemo, useCallback, useRef } from "react";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";

// ─── THEME ────────────────────────────────────────────────────────────────────
const T = {
  bg: "#080c14", surface: "#0e1520", surface2: "#131c2c", surface3: "#1a2438",
  border: "#1e2d45", border2: "#243352",
  text: "#e8edf5", textSub: "#6b7fa3", textMuted: "#3d5070",
  gold: "#f0b429", goldDim: "#b8881e",
  green: "#10d98c", greenDim: "#0a7a4e",
  red: "#f05252", orange: "#f5a623", blue: "#4a9eff", purple: "#9b6dff",
};
const C = { 1: T.red, 2: T.orange, 3: T.gold, 4: T.green, 5: "#00f0c8" };

const defaultBien = {
  nom: "Mon bien", adresse: "", typeBien: "Appartement", prix: 180000, travaux: 0, surface: 80, apport: 20000,
  taux: 3, duree: 15, tauxAssurance: 0.3, loyer: 900,
  taxeFonciere: 1200, entretien: 0, assurancePNO: 500, comptable: 0, autresCharges: 0,
  emplacement: 3, regime: "micro-foncier", trancheMarginalIR: 30, vacanceLocative: 0, tauxGestion: 0,
  lots: [{ id: 1, nom: "Lot 1", surface: 80, loyer: 900, type: "Appartement" }],
};

// ─── CALCULS ──────────────────────────────────────────────────────────────────
function calculer(b) {
  const notaire = b.prix * 1.085;
  const coutTotal = notaire + b.travaux;
  const aEmprunter = coutTotal - b.apport;
  // Si immeuble avec lots : loyer et surface = somme des lots
  const loyerMensuel = b.typeBien === "Immeuble" && b.lots?.length
    ? b.lots.reduce((s, l) => s + (l.loyer || 0), 0)
    : b.loyer;
  const surfaceTotale = b.typeBien === "Immeuble" && b.lots?.length
    ? b.lots.reduce((s, l) => s + (l.surface || 0), 0)
    : b.surface;
  const loyerAnnuel = loyerMensuel * 12;
  const charges = b.taxeFonciere + b.entretien + b.assurancePNO + b.comptable + b.autresCharges;
  // Vacance locative et frais de gestion
  const vacanceMois = b.vacanceLocative || 0;
  const tauxGestion = b.tauxGestion || 0;
  const loyerAnnuelVacance = loyerMensuel * (12 - vacanceMois);
  const fraisGestion = loyerAnnuelVacance * tauxGestion / 100;
  const loyerNetGestion = loyerAnnuelVacance - fraisGestion;
  const r = b.taux / 100 / 12;
  const n = b.duree * 12;
  const mensualiteCredit = r === 0 ? aEmprunter / n : aEmprunter * (r / (1 - Math.pow(1 + r, -n)));
  const mensualiteAssurance = aEmprunter * (b.tauxAssurance / 100) / 12;
  const mensualiteTotale = mensualiteCredit + mensualiteAssurance;
  const coutTotalCredit = mensualiteTotale * n - aEmprunter;
  const rentaBrute = (loyerAnnuel / coutTotal) * 100;
  const rentaNette = ((loyerAnnuel - charges) / coutTotal) * 100;
  const rentaNetNet = b.apport + b.travaux > 0 ? ((loyerAnnuel - charges) - (mensualiteTotale * 12)) / (b.apport + b.travaux) * 100 : 0;
  const dscr = (loyerAnnuel - charges) / (mensualiteTotale * 12);
  const cashflowMensuel = loyerMensuel - mensualiteTotale - (charges / 12);
  const prixM2 = notaire / surfaceTotale;
  const prixM2Travaux = coutTotal / surfaceTotale;
  const tmb = b.trancheMarginalIR / 100;
  const ps = 0.172;
  let revenuImposable = 0, impotFiscal = 0;
  if (b.regime === "micro-foncier") { revenuImposable = loyerAnnuel * 0.70; impotFiscal = revenuImposable * (tmb + ps); }
  else if (b.regime === "reel") { revenuImposable = Math.max(0, loyerAnnuel - charges - (aEmprunter * b.taux / 100)); impotFiscal = revenuImposable * (tmb + ps); }
  else if (b.regime === "micro-bic") { revenuImposable = loyerAnnuel * 0.50; impotFiscal = revenuImposable * (tmb + ps); }
  else if (b.regime === "lmnp-reel") { const amort = (coutTotal * 0.85) / 25; revenuImposable = Math.max(0, loyerAnnuel - charges - amort - (aEmprunter * b.taux / 100)); impotFiscal = revenuImposable * (tmb + ps); }
  else if (b.regime === "sci-ir") {
    revenuImposable = Math.max(0, loyerAnnuel - charges - (aEmprunter * b.taux / 100));
    impotFiscal = revenuImposable * (tmb + ps);
  }
  else if (b.regime === "sci-is") {
    const amortBati = (coutTotal * 0.85) / 30;
    const interetsEmprunt = aEmprunter * b.taux / 100;
    revenuImposable = Math.max(0, loyerAnnuel - charges - amortBati - interetsEmprunt);
    const seuilIS = 42500;
    impotFiscal = revenuImposable <= seuilIS ? revenuImposable * 0.15 : seuilIS * 0.15 + (revenuImposable - seuilIS) * 0.25;
  }
  const cashflowAvecVacance = (loyerNetGestion - charges - (mensualiteTotale * 12)) / 12;
  const cashflowApresImpot = cashflowMensuel - impotFiscal / 12;
  const interpRentaNette = rentaNette < 4 ? ["Faible", 1] : rentaNette < 6 ? ["Correct", 2] : rentaNette < 8 ? ["Bon", 3] : rentaNette < 10 ? ["Très bon", 4] : ["Excellent", 5];
  const interpRentaNetNet = rentaNetNet < 0 ? ["Risque", 1] : rentaNetNet < 3 ? ["Faible", 2] : rentaNetNet < 6 ? ["Correct", 3] : rentaNetNet < 10 ? ["Bon", 4] : ["Excellent", 5];
  const interpDSCR = dscr < 1 ? ["Dangereux", 1] : dscr === 1 ? ["Équilibre", 2] : dscr <= 1.2 ? ["Correct", 3] : dscr <= 1.5 ? ["Solide", 4] : ["Très sécurisé", 5];
  const interpCash = cashflowMensuel < 0 ? ["Mauvais", 1] : cashflowMensuel < 100 ? ["Moyen", 2] : cashflowMensuel < 300 ? ["Correct", 3] : cashflowMensuel < 500 ? ["Bon", 4] : ["Excellent", 5];
  const score = interpRentaNetNet[1] + interpDSCR[1] + interpRentaNette[1] + interpCash[1] + b.emplacement;
  const interpScore = score < 10 ? ["Mauvais investissement", 1] : score < 15 ? ["Moyen", 2] : score < 18 ? ["Bon", 3] : score < 22 ? ["Très bon", 4] : ["Pépite 💎", 5];
  let capitalRestant = aEmprunter;
  const amortissement = [];
  for (let i = 1; i <= n; i++) {
    const interets = capitalRestant * r;
    const capitalRembourse = mensualiteCredit - interets;
    capitalRestant = Math.max(0, capitalRestant - capitalRembourse);
    amortissement.push({ mois: i, mensualiteCredit: Math.round(mensualiteCredit * 100) / 100, interets: Math.round(interets * 100) / 100, capitalRembourse: Math.round(capitalRembourse * 100) / 100, assurance: Math.round(mensualiteAssurance * 100) / 100, mensualiteTotale: Math.round(mensualiteTotale * 100) / 100, capitalRestant: Math.round(capitalRestant * 100) / 100, cashflowCumule: Math.round((cashflowMensuel * i) * 100) / 100 });
  }
  return { notaire, coutTotal, aEmprunter, loyerAnnuel, charges, mensualiteCredit, mensualiteAssurance, mensualiteTotale, coutTotalCredit, rentaBrute, rentaNette, rentaNetNet, dscr, cashflowMensuel, prixM2, prixM2Travaux, interpRentaNette, interpRentaNetNet, interpDSCR, interpCash, score, interpScore, amortissement, revenuImposable, impotFiscal, cashflowApresImpot, vacanceMois, fraisGestion, loyerAnnuelVacance, loyerNetGestion, cashflowAvecVacance };
}

function calculerScenarios(b) {
  return {
    pessimiste: calculer({ ...b, loyer: Math.round(b.loyer * 0.85), taux: b.taux + 0.5, autresCharges: b.autresCharges + 500 }),
    realiste: calculer({ ...b }),
    optimiste: calculer({ ...b, loyer: Math.round(b.loyer * 1.15), taux: Math.max(1, b.taux - 0.5), travaux: Math.round(b.travaux * 0.85) }),
  };
}

function calculerRevente(b, res, anneeRevente, tauxReval) {
  const prixRevente = b.prix * Math.pow(1 + tauxReval / 100, anneeRevente);
  const prixAchatNet = res.notaire + b.travaux;
  const plusValueBrute = Math.max(0, prixRevente - prixAchatNet);
  const abatIR = anneeRevente <= 5 ? 0 : anneeRevente <= 21 ? (anneeRevente - 5) * 6 : 100;
  const abatPS = anneeRevente <= 5 ? 0 : anneeRevente <= 21 ? (anneeRevente - 5) * 1.65 : 100;
  const pvImposableIR = plusValueBrute * (1 - Math.min(abatIR, 100) / 100);
  const pvImposablePS = plusValueBrute * (1 - Math.min(abatPS, 100) / 100);
  const impotPV = pvImposableIR * 0.19 + pvImposablePS * 0.172;
  const plusValueNette = plusValueBrute - impotPV;
  const idx = Math.min(anneeRevente * 12 - 1, res.amortissement.length - 1);
  const capitalRestantRevente = idx >= 0 ? res.amortissement[idx].capitalRestant : 0;
  const cashTotalRecupere = res.amortissement.slice(0, anneeRevente * 12).reduce((s, m) => s + (b.loyer - m.mensualiteTotale - (res.charges / 12)), 0);
  const gainTotal = plusValueNette + cashTotalRecupere - b.apport;
  const rendementGlobal = (gainTotal / b.apport) * 100;
  return { prixRevente, plusValueBrute, plusValueNette, impotPV, abatIR: Math.min(abatIR, 100), capitalRestantRevente, cashTotalRecupere, gainTotal, rendementGlobal };
}

function fmt(n, d = 0) { if (isNaN(n) || !isFinite(n)) return "—"; return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n); }
function fmtEur(n) { return fmt(n) + " €"; }
function fmtPct(n) { return fmt(n, 2) + " %"; }

// ─── AI ───────────────────────────────────────────────────────────────────────
async function fetchDiagnostic(bien, res) {
  const emplacementLabel = ["","Mauvais secteur","Secteur moyen","Correct","Bon emplacement","Très recherché"][bien.emplacement];
  const adresseInfo = bien.adresse ? `Adresse exacte du bien: ${bien.adresse}` : `Emplacement (noté manuellement): ${bien.emplacement}/5 — ${emplacementLabel}`;
  const typeBienLabel = bien.typeBien || "Appartement";
  const lotsInfo = bien.typeBien === "Immeuble" && bien.lots?.length
    ? `\nDétail des lots (${bien.lots.length} lots) :\n` + bien.lots.map(l => `  - ${l.nom} (${l.type}) : ${l.surface} m² — ${l.loyer} €/mois`).join("\n")
    : "";
  const surfaceAffichee = bien.typeBien === "Immeuble" && bien.lots?.length
    ? bien.lots.reduce((s, l) => s + (l.surface || 0), 0)
    : bien.surface;
  const loyerAffiche = bien.typeBien === "Immeuble" && bien.lots?.length
    ? bien.lots.reduce((s, l) => s + (l.loyer || 0), 0)
    : bien.loyer;

  const prompt = `Tu es un négociateur immobilier professionnel et expert-comptable spécialisé investissement locatif en France, avec 20 ans d'expérience. Tu connais parfaitement les prix du marché immobilier français par ville et par quartier.

BIEN À ANALYSER: "${bien.nom}"
Type: ${typeBienLabel} | Prix demandé: ${fmtEur(bien.prix)} | Surface totale: ${surfaceAffichee} m² | Prix/m²: ${fmtEur(Math.round(res.prixM2))}
Loyer mensuel total: ${fmtEur(loyerAffiche)} | Charges annuelles: ${fmtEur(res.charges)}${lotsInfo}
Rentabilité brute: ${fmtPct(res.rentaBrute)} | nette: ${fmtPct(res.rentaNette)} | net-net: ${fmtPct(res.rentaNetNet)}
DSCR: ${fmt(res.dscr,2)} | Cash-flow brut: ${fmtEur(Math.round(res.cashflowMensuel))}/mois | Score: ${res.score}/25
Régime fiscal: ${bien.regime} | Impôt/an: ${fmtEur(Math.round(res.impotFiscal))} | CF net après impôt: ${fmtEur(Math.round(res.cashflowApresImpot))}/mois
${adresseInfo}

${bien.adresse ? `
MISSION 1 — ANALYSE D'EMPLACEMENT PROFESSIONNELLE:
Basé sur ta connaissance experte du marché immobilier français, analyse "${bien.adresse}" :
- Prix moyen au m² constaté dans ce secteur précis (cite le chiffre)
- Quartier : dynamisme, commerces, transports, écoles, sécurité
- Tension locative : est-ce facile de louer ici ?
- Tendance des prix : hausse/baisse/stable ces 2 dernières années
- Donne une note_emplacement de 1 à 5 justifiée
` : ""}

MISSION 2 — STRATÉGIE DE NÉGOCIATION (en expert du marché) :
Basé sur ta connaissance des prix réels du marché pour ce type de bien dans ce secteur :

OFFRE AGRESSIVE : Le prix plancher que tu conseillerais d'offrir. Ce doit être bas mais défendable avec des arguments solides basés sur le marché réel. Cite des prix/m² comparables.

OFFRE JUSTE : Le prix équitable selon le marché actuel 2024-2025. Le prix qu'un vendeur de bonne foi devrait accepter. Justifie avec des données de marché concrètes.

Pour chaque offre, donne :
- Le prix exact en euros
- Le prix au m² correspondant
- L'écart avec le prix affiché en %
- 3 arguments concrets basés sur le marché réel à avancer au vendeur

Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans markdown. Tous les prix doivent être des nombres entiers (pas de strings) :
{"verdict":"phrase courte max 12 mots","note_globale":"${res.score}/25",${bien.adresse ? '"note_emplacement":3,"analyse_emplacement":"analyse pro 3-4 phrases avec prix marché chiffrés",' : ''}"resume":"3-4 phrases pro","points_forts":["p1","p2","p3"],"points_faibles":["p1","p2"],"risques":["r1","r2"],"opportunites":["o1","o2"],"analyse_cashflow":"2 phrases","analyse_credit":"2 phrases","analyse_rendement":"2 phrases avec comparaison marché local","analyse_fiscalite":"2 phrases","conseils":["c1","c2","c3"],"offre_aggressive":{"prix":150000,"prix_m2":1875,"ecart_marche":"-12% sous le marché","justification":"2-3 phrases pro avec chiffres marché","arguments":["arg concret 1 avec chiffres","arg concret 2","arg concret 3"]},"offre_juste":{"prix":165000,"prix_m2":2062,"ecart_marche":"-3% sous le marché","justification":"2-3 phrases pro avec chiffres marché","arguments":["arg concret 1 avec chiffres","arg concret 2","arg concret 3"]},"verdict_final":"3 phrases conclusion pro avec recommandation claire achat/négociation/passer"}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) throw new Error(`Erreur API ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || "Erreur API Claude");

  const raw = (data.content || []).map(i => i.text || "").join("").trim();

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Réponse IA invalide");

  let parsed;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    const cleaned = match[0]
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/,\s*([}\]])/g, "$1");
    parsed = JSON.parse(cleaned);
  }

  return {
    verdict: parsed.verdict || "Analyse disponible",
    note_globale: parsed.note_globale || `${res.score}/25`,
    note_emplacement: parsed.note_emplacement || null,
    analyse_emplacement: parsed.analyse_emplacement || "",
    resume: parsed.resume || "",
    points_forts: parsed.points_forts || [],
    points_faibles: parsed.points_faibles || [],
    risques: parsed.risques || [],
    opportunites: parsed.opportunites || [],
    analyse_cashflow: parsed.analyse_cashflow || "",
    analyse_credit: parsed.analyse_credit || "",
    analyse_rendement: parsed.analyse_rendement || "",
    analyse_fiscalite: parsed.analyse_fiscalite || "",
    conseils: parsed.conseils || [],
    offre_aggressive: parsed.offre_aggressive || null,
    offre_juste: parsed.offre_juste || null,
    verdict_final: parsed.verdict_final || "",
  };
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600;700&display=swap');
  * { box-sizing: border-box; }
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: ${T.surface}; }
  ::-webkit-scrollbar-thumb { background: ${T.border2}; border-radius: 3px; }
  @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
  @keyframes spin { to{transform:rotate(360deg)} }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
  .fu { animation: fadeUp 0.4s ease both; }
  .fu1 { animation: fadeUp 0.4s 0.07s ease both; }
  .fu2 { animation: fadeUp 0.4s 0.14s ease both; }
  .fu3 { animation: fadeUp 0.4s 0.21s ease both; }
  .fu4 { animation: fadeUp 0.4s 0.28s ease both; }

  /* ── RESPONSIVE MOBILE ── */
  @media (max-width: 768px) {
    .sidebar { display: none !important; }
    .sidebar.open { display: block !important; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 1000; overflow-y: auto; }
    .main-content { padding: 12px !important; max-height: none !important; }
    .header-kpis { display: none !important; }
    .tabs-bar { padding: 0 8px !important; }
    .mobile-bottom-bar { display: flex !important; }
    .stat-grid-4 { grid-template-columns: 1fr 1fr !important; }
    .stat-grid-3 { grid-template-columns: 1fr 1fr !important; }
    .stat-grid-5 { grid-template-columns: 1fr 1fr !important; }
  }
  @media (min-width: 769px) {
    .mobile-bottom-bar { display: none !important; }
    .mobile-header-btn { display: none !important; }
  }
  /* ── PDF PRINT STYLES ── */
  @media print {
    body { background: white !important; margin: 0; }
    .no-print { display: none !important; }
    .print-only { display: block !important; }
    .pdf-page { background: white !important; color: #1a1a2e !important; font-family: 'DM Sans', sans-serif !important; }
    .pdf-page * { color: inherit !important; }
    @page { margin: 14mm 12mm; size: A4; }
  }
  .print-only { display: none; }
`;

// ─── UI COMPONENTS ────────────────────────────────────────────────────────────
function Card({ children, style }) {
  return <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, ...style }}>{children}</div>;
}
function StatCard({ label, value, sub, note, glow }) {
  const color = note ? C[note] : T.textSub;
  return (
    <Card style={{ padding: "16px 18px", boxShadow: glow ? `0 0 20px ${color}22` : "none" }}>
      <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 7 }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 700, color: note ? color : T.text, fontFamily: "DM Serif Display, serif" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color, fontWeight: 500, marginTop: 4 }}>{sub}</div>}
    </Card>
  );
}
function Badge({ label, note }) {
  const color = C[note] || T.textSub;
  return <div style={{ background: color + "18", border: `1px solid ${color}40`, borderRadius: 8, padding: "6px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}><span style={{ fontSize: 12, color: T.textSub }}>{label}</span><span style={{ fontSize: 13, fontWeight: 700, color }}>{note}/5</span></div>;
}
function STitle({ children, accent = T.gold }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}><div style={{ width: 3, height: 18, background: accent, borderRadius: 2 }} /><h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: T.text, fontFamily: "DM Serif Display, serif" }}>{children}</h2></div>;
}
function Input({ label, value, onChange, suffix, step = 1, min = 0 }) {
  return (
    <div style={{ marginBottom: 11 }}>
      <label style={{ display: "block", fontSize: 11, color: T.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 9, overflow: "hidden" }}>
        <input type="number" value={value} min={min} step={step} onChange={e => onChange(parseFloat(e.target.value) || 0)} onFocus={e => e.target.select()} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); const inputs = Array.from(document.querySelectorAll("input")); const idx = inputs.indexOf(e.target); if (idx >= 0 && idx < inputs.length - 1) inputs[idx + 1].focus(); } }} style={{ flex: 1, border: "none", background: "transparent", padding: "8px 11px", fontSize: 13, color: T.text, fontFamily: "DM Sans, sans-serif", fontWeight: 500, outline: "none" }} />
        {suffix && <span style={{ padding: "0 9px", color: T.textMuted, fontSize: 11 }}>{suffix}</span>}
      </div>
    </div>
  );
}
function Collapsible({ title, icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 14, border: `1px solid ${T.border}`, borderRadius: 11, overflow: "hidden" }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", background: T.surface2, border: "none", padding: "11px 14px", display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span style={{ fontWeight: 600, color: T.text, fontSize: 13 }}>{title}</span>
        <span style={{ marginLeft: "auto", color: T.textMuted, fontSize: 11 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && <div style={{ padding: "13px 14px", background: T.surface }}>{children}</div>}
    </div>
  );
}

function BienForm({ bien, onChange }) {
  const f = k => v => onChange({ ...bien, [k]: v });
  const REGIMES = [{ id: "micro-foncier", label: "Micro-foncier", badge: "−30%" }, { id: "reel", label: "Réel simplifié", badge: "Charges" }, { id: "micro-bic", label: "LMNP Micro-BIC", badge: "−50%" }, { id: "lmnp-reel", label: "LMNP Réel", badge: "Amortissement" }, { id: "sci-ir", label: "SCI à l'IR", badge: "Transparente" }, { id: "sci-is", label: "SCI à l'IS", badge: "15% / 25%" }];
  return (
    <div style={{ fontFamily: "DM Sans, sans-serif" }}>
      <Collapsible title="Bien immobilier" icon="🏠">
        {/* Nom */}
        <div style={{ marginBottom: 11 }}>
          <label style={{ display: "block", fontSize: 11, color: T.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Nom du projet</label>
          <input value={bien.nom} onChange={e => onChange({ ...bien, nom: e.target.value })} onFocus={e => e.target.select()} style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 9, padding: "8px 11px", fontSize: 13, color: T.text, outline: "none" }} />
        </div>
        {/* Type de bien */}
        <div style={{ marginBottom: 11 }}>
          <label style={{ display: "block", fontSize: 11, color: T.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Type de bien</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
            {[["🏢","Appartement"],["🏠","Maison"],["🏘️","Immeuble"],["🛏️","Studio"],["🏪","Local"]].map(([em, label]) => (
              <button key={label} onClick={() => {
                const newBien = { ...bien, typeBien: label };
                if (label === "Immeuble" && (!bien.lots || bien.lots.length === 0)) {
                  newBien.lots = [{ id: 1, nom: "Lot 1", surface: 40, loyer: 500, type: "Appartement" }, { id: 2, nom: "Lot 2", surface: 40, loyer: 500, type: "Appartement" }];
                }
                onChange(newBien);
              }} style={{ background: bien.typeBien === label ? T.gold + "18" : T.surface2, border: `1px solid ${bien.typeBien === label ? T.gold + "60" : T.border}`, borderRadius: 8, padding: "7px 4px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <span style={{ fontSize: 16 }}>{em}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: bien.typeBien === label ? T.gold : T.textMuted }}>{label}</span>
              </button>
            ))}
          </div>
        </div>
        {/* Adresse */}
        <div style={{ marginBottom: 11 }}>
          <label style={{ display: "block", fontSize: 11, color: T.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Adresse du bien</label>
          <input value={bien.adresse || ""} onChange={e => onChange({ ...bien, adresse: e.target.value })} placeholder="Ex : 12 rue Victor Hugo, Lyon 69001" onFocus={e => e.target.select()} style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 9, padding: "8px 11px", fontSize: 13, color: T.text, outline: "none", fontFamily: "DM Sans, sans-serif" }} />
          {bien.adresse && <div style={{ fontSize: 10, color: T.green, marginTop: 4 }}>✓ L'IA analysera l'emplacement automatiquement</div>}
        </div>
        <Input label="Prix d'achat" value={bien.prix} onChange={f("prix")} suffix="€" step={1000} />
        <Input label="Travaux" value={bien.travaux} onChange={f("travaux")} suffix="€" step={500} />
        {bien.typeBien !== "Immeuble" && <Input label="Surface" value={bien.surface} onChange={f("surface")} suffix="m²" />}
        <Input label="Apport" value={bien.apport} onChange={f("apport")} suffix="€" step={1000} />
      </Collapsible>
      <Collapsible title="Financement" icon="🏦" defaultOpen={false}>
        <Input label="Taux d'intérêt" value={bien.taux} onChange={f("taux")} suffix="%" step={0.05} />
        <div style={{ marginBottom: 11 }}>
          <label style={{ display: "block", fontSize: 11, color: T.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Durée du prêt</label>
          <div style={{ display: "flex", gap: 5, marginBottom: 7 }}>
            {[10, 15, 20, 25].map(d => (
              <button key={d} onClick={() => onChange({ ...bien, duree: d })} style={{ flex: 1, padding: "7px 4px", border: `1px solid ${bien.duree === d ? T.gold + "80" : T.border}`, borderRadius: 8, background: bien.duree === d ? T.gold + "20" : T.surface2, color: bien.duree === d ? T.gold : T.textMuted, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                {d}<span style={{ fontSize: 9, fontWeight: 400 }}> ans</span>
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 9 }}>
            <input type="number" value={bien.duree} min={1} max={30} onFocus={e => e.target.select()} onChange={e => onChange({ ...bien, duree: Math.min(30, Math.max(1, parseInt(e.target.value) || 1)) })} style={{ flex: 1, border: "none", background: "transparent", padding: "8px 11px", fontSize: 13, color: T.text, outline: "none" }} />
            <span style={{ padding: "0 11px", fontSize: 12, color: T.textMuted }}>ans</span>
          </div>
        </div>
        <Input label="Taux assurance" value={bien.tauxAssurance} onChange={f("tauxAssurance")} suffix="%" step={0.05} />
      </Collapsible>
      <Collapsible title="Revenus & Charges" icon="💰" defaultOpen={false}>
        {bien.typeBien === "Immeuble" ? (
          <div>
            {/* Tableau des lots */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label style={{ fontSize: 11, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Détail des lots</label>
                <button onClick={() => {
                  const newId = Math.max(...(bien.lots || []).map(l => l.id), 0) + 1;
                  onChange({ ...bien, lots: [...(bien.lots || []), { id: newId, nom: `Lot ${newId}`, surface: 30, loyer: 400, type: "Appartement" }] });
                }} style={{ background: T.green + "18", border: `1px solid ${T.green}40`, borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700, color: T.green }}>+ Lot</button>
              </div>
              {(bien.lots || []).map((lot, idx) => (
                <div key={lot.id} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "9px 10px", marginBottom: 6 }}>
                  {/* Ligne 1 : nom + suppression */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
                    <span style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, flexShrink: 0 }}>#{idx + 1}</span>
                    <input value={lot.nom} onChange={e => { const lots = [...bien.lots]; lots[idx] = { ...lot, nom: e.target.value }; onChange({ ...bien, lots }); }} onFocus={e => e.target.select()} placeholder="Nom du lot" style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: "4px 8px", color: T.gold, fontWeight: 700, fontSize: 12, outline: "none", minWidth: 0 }} />
                    {bien.lots.length > 1 && <button onClick={() => onChange({ ...bien, lots: bien.lots.filter((_, i) => i !== idx) })} style={{ background: T.red + "18", border: `1px solid ${T.red}30`, borderRadius: 5, padding: "3px 7px", cursor: "pointer", color: T.red, fontSize: 11, flexShrink: 0 }}>✕</button>}
                  </div>
                  {/* Ligne 2 : type */}
                  <div style={{ display: "flex", gap: 4, marginBottom: 7 }}>
                    {["App.","Maison","Studio","Local"].map(t => (
                      <button key={t} onClick={() => { const lots = [...bien.lots]; lots[idx] = { ...lot, type: t }; onChange({ ...bien, lots }); }} style={{ flex: 1, padding: "3px 0", border: `1px solid ${lot.type === t ? T.gold + "60" : T.border}`, borderRadius: 5, background: lot.type === t ? T.gold + "18" : "transparent", color: lot.type === t ? T.gold : T.textMuted, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>{t}</button>
                    ))}
                  </div>
                  {/* Ligne 3 : surface + loyer pleine largeur */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 7, overflow: "hidden" }}>
                      <span style={{ padding: "0 7px", fontSize: 10, color: T.textMuted, flexShrink: 0 }}>m²</span>
                      <input type="number" value={lot.surface} min={1} onFocus={e => e.target.select()} onChange={e => { const lots = [...bien.lots]; lots[idx] = { ...lot, surface: parseFloat(e.target.value) || 0 }; onChange({ ...bien, lots }); }} style={{ flex: 1, border: "none", background: "transparent", padding: "6px 6px 6px 0", fontSize: 13, color: T.text, outline: "none", minWidth: 0 }} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 7, overflow: "hidden" }}>
                      <span style={{ padding: "0 7px", fontSize: 10, color: T.textMuted, flexShrink: 0 }}>€</span>
                      <input type="number" value={lot.loyer} min={0} onFocus={e => e.target.select()} onChange={e => { const lots = [...bien.lots]; lots[idx] = { ...lot, loyer: parseFloat(e.target.value) || 0 }; onChange({ ...bien, lots }); }} style={{ flex: 1, border: "none", background: "transparent", padding: "6px 6px 6px 0", fontSize: 13, color: T.text, outline: "none", minWidth: 0 }} />
                    </div>
                  </div>
                </div>
              ))}
              {/* Totaux */}
              <div style={{ background: T.gold + "12", border: `1px solid ${T.gold}30`, borderRadius: 8, padding: "8px 11px", display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontSize: 11, color: T.textSub }}><span style={{ color: T.textMuted }}>Surface totale :</span> <strong style={{ color: T.text }}>{(bien.lots || []).reduce((s, l) => s + (l.surface || 0), 0)} m²</strong></div>
                <div style={{ fontSize: 11, color: T.textSub }}><span style={{ color: T.textMuted }}>Loyer total :</span> <strong style={{ color: T.gold }}>{(bien.lots || []).reduce((s, l) => s + (l.loyer || 0), 0)} €/mois</strong></div>
              </div>
            </div>
          </div>
        ) : (
          <Input label="Loyer mensuel" value={bien.loyer} onChange={f("loyer")} suffix="€" step={50} />
        )}
        <Input label="Taxe foncière" value={bien.taxeFonciere} onChange={f("taxeFonciere")} suffix="€/an" step={100} />
        <Input label="Assurance PNO" value={bien.assurancePNO} onChange={f("assurancePNO")} suffix="€/an" step={50} />
        <Input label="Entretien" value={bien.entretien} onChange={f("entretien")} suffix="€/an" step={100} />
        {/* Vacance locative */}
        <div style={{ marginBottom: 11 }}>
          <label style={{ display: "block", fontSize: 11, color: T.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Vacance locative</label>
          <div style={{ display: "flex", gap: 5, marginBottom: 5 }}>
            {[0,1,2,3].map(m => (
              <button key={m} onClick={() => onChange({ ...bien, vacanceLocative: m })} style={{ flex: 1, padding: "6px 4px", border: `1px solid ${(bien.vacanceLocative||0) === m ? T.orange+"60" : T.border}`, borderRadius: 7, background: (bien.vacanceLocative||0) === m ? T.orange+"18" : T.surface2, color: (bien.vacanceLocative||0) === m ? T.orange : T.textMuted, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>{m} mois</button>
            ))}
          </div>
          {(bien.vacanceLocative||0) > 0 && <div style={{ fontSize: 10, color: T.orange }}>⚠️ Impact : -{fmtEur(Math.round((bien.typeBien==="Immeuble"&&bien.lots?.length?bien.lots.reduce((s,l)=>s+(l.loyer||0),0):bien.loyer) * (bien.vacanceLocative||0)))}/an</div>}
        </div>
        {/* Frais de gestion locative */}
        <div style={{ marginBottom: 11 }}>
          <label style={{ display: "block", fontSize: 11, color: T.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Gestion locative</label>
          <div style={{ display: "flex", gap: 5, marginBottom: 5 }}>
            {[0,5,7,10].map(t => (
              <button key={t} onClick={() => onChange({ ...bien, tauxGestion: t })} style={{ flex: 1, padding: "6px 4px", border: `1px solid ${(bien.tauxGestion||0) === t ? T.blue+"60" : T.border}`, borderRadius: 7, background: (bien.tauxGestion||0) === t ? T.blue+"18" : T.surface2, color: (bien.tauxGestion||0) === t ? T.blue : T.textMuted, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>{t === 0 ? "Moi" : t+"%"}</button>
            ))}
          </div>
          {(bien.tauxGestion||0) > 0 && <div style={{ fontSize: 10, color: T.blue }}>Agence : ~{bien.tauxGestion}% TTC des loyers perçus</div>}
        </div>
        <Input label="Comptable" value={bien.comptable} onChange={f("comptable")} suffix="€/an" step={50} />
        <Input label="Autres charges" value={bien.autresCharges} onChange={f("autresCharges")} suffix="€/an" step={100} />
      </Collapsible>
      <Collapsible title="Fiscalité" icon="🧾" defaultOpen={false}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 11, color: T.textMuted, marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Tranche marginale IR</label>
          <div style={{ display: "flex", gap: 5 }}>
            {[0, 11, 30, 41, 45].map(t => <button key={t} onClick={() => onChange({ ...bien, trancheMarginalIR: t })} style={{ flex: 1, padding: "6px 2px", border: `1px solid ${bien.trancheMarginalIR === t ? T.gold : T.border}`, borderRadius: 7, background: bien.trancheMarginalIR === t ? T.gold + "22" : T.surface2, color: bien.trancheMarginalIR === t ? T.gold : T.textMuted, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>{t}%</button>)}
          </div>
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {REGIMES.map(reg => <button key={reg.id} onClick={() => onChange({ ...bien, regime: reg.id })} style={{ background: bien.regime === reg.id ? T.gold + "18" : T.surface2, border: `1px solid ${bien.regime === reg.id ? T.gold + "60" : T.border}`, borderRadius: 9, padding: "9px 12px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontWeight: 700, fontSize: 12, color: bien.regime === reg.id ? T.gold : T.text }}>{reg.label}</span><span style={{ fontSize: 11, background: T.border, color: T.textMuted, borderRadius: 20, padding: "2px 8px" }}>{reg.badge}</span></button>)}
        </div>
      </Collapsible>
      <Collapsible title="Emplacement" icon="📍" defaultOpen={false}>
        <div style={{ display: "grid", gap: 5 }}>
          {[["1","🔴","Mauvais"],["2","🟠","Moyen"],["3","🟡","Correct"],["4","🟢","Bon"],["5","⭐","Très recherché"]].map(([val, em, label]) => <button key={val} onClick={() => onChange({ ...bien, emplacement: parseInt(val) })} style={{ background: bien.emplacement === parseInt(val) ? T.gold + "18" : T.surface2, color: bien.emplacement === parseInt(val) ? T.gold : T.textSub, border: `1px solid ${bien.emplacement === parseInt(val) ? T.gold + "50" : T.border}`, borderRadius: 9, padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 9, fontWeight: 600, fontSize: 12 }}><span>{em}</span><span style={{ flex: 1, textAlign: "left" }}>{label}</span><span style={{ fontSize: 10, opacity: 0.6 }}>{val}/5</span></button>)}
        </div>
      </Collapsible>
    </div>
  );
}

// ─── FICHE SYNTHÈSE BANCAIRE ──────────────────────────────────────────────────
function FicheSynthese({ bien, res }) {
  const ficheRef = useRef(null);
  const [investisseur, setInvestisseur] = useState({ nom: "", prenom: "", tel: "", email: "", ville: "" });
  const [printing, setPrinting] = useState(false);
  // Utilise directement les données du simulateur (live)
  const adresseBien = bien.adresse || "";
  const typeBien = bien.typeBien || "Appartement";
  const surfaceAffichee = bien.typeBien === "Immeuble" && bien.lots?.length
    ? bien.lots.reduce((s, l) => s + (l.surface || 0), 0)
    : bien.surface;
  const loyerMensuelAffiche = bien.typeBien === "Immeuble" && bien.lots?.length
    ? bien.lots.reduce((s, l) => s + (l.loyer || 0), 0)
    : bien.loyer;
  const today = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const scoreColor = res.score >= 18 ? "#16a34a" : res.score >= 10 ? "#ca8a04" : "#dc2626";

  const amortAnnuel = useMemo(() => {
    const arr = [];
    for (let a = 0; a < Math.min(bien.duree, 10); a++) {
      const slice = res.amortissement.slice(a * 12, (a + 1) * 12);
      if (!slice.length) break;
      arr.push({ an: `An ${a + 1}`, capital: Math.round(slice[slice.length - 1]?.capitalRestant || 0), cashflow: Math.round(slice[slice.length - 1]?.cashflowCumule || 0), interets: Math.round(slice.reduce((s, m) => s + m.interets, 0)), remb: Math.round(slice.reduce((s, m) => s + m.capitalRembourse, 0)) });
    }
    return arr;
  }, [res.amortissement, bien.duree]);

  const handlePrint = () => {
    setPrinting(true);
    try {
      const regimeLabelPDF = {
        "micro-foncier": "Micro-foncier (abat. 30%)",
        "reel": "Reel simplifie",
        "micro-bic": "LMNP Micro-BIC (abat. 50%)",
        "lmnp-reel": "LMNP Reel (amortissement)",
        "sci-ir": "SCI a l'IR",
        "sci-is": "SCI a l'IS (15%/25%)"
      }[bien.regime] || bien.regime;

      const empLabelPDF = ["","Mauvais secteur","Secteur moyen","Correct","Bon emplacement","Tres recherche"][bien.emplacement];
      const scColor = res.score >= 18 ? "#16a34a" : res.score >= 10 ? "#ca8a04" : "#dc2626";
      const cfColor = res.cashflowMensuel >= 0 ? "#16a34a" : "#dc2626";
      const dscrColor = res.dscr >= 1.2 ? "#16a34a" : res.dscr >= 1 ? "#ca8a04" : "#dc2626";

      const amortRows = [];
      for (let a = 0; a < Math.min(bien.duree, 15); a++) {
        const slice = res.amortissement.slice(a * 12, (a + 1) * 12);
        if (!slice.length) break;
        amortRows.push({
          an: "An " + (a + 1),
          capital: Math.round(slice[slice.length - 1]?.capitalRestant || 0),
          cashflow: Math.round(slice[slice.length - 1]?.cashflowCumule || 0),
          interets: Math.round(slice.reduce((s, m) => s + m.interets, 0)),
          remb: Math.round(slice.reduce((s, m) => s + m.capitalRembourse, 0))
        });
      }

      const criteres = [
        ["Net-net", res.interpRentaNetNet[1]],
        ["DSCR", res.interpDSCR[1]],
        ["Renta nette", res.interpRentaNette[1]],
        ["Cash-flow", res.interpCash[1]],
        ["Emplacement", bien.emplacement]
      ];

      const html = [
        "<!DOCTYPE html><html lang='fr'><head><meta charset='UTF-8'>",
        "<title>Fiche Bancaire - " + bien.nom + "</title>",
        "<style>",
        "*{box-sizing:border-box;margin:0;padding:0}",
        "body{font-family:Arial,sans-serif;font-size:11px;color:#1a1a2e;background:white;padding:10mm 12mm}",
        "@media print{.noprint{display:none}@page{margin:8mm 10mm;size:A4}}",
        ".header{background:#0f172a;color:white;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;border-radius:6px 6px 0 0}",
        ".band{background:#f0b429;padding:8px 16px;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}",
        ".grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px}",
        ".grid4{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:10px}",
        ".grid5{display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:6px;margin-bottom:10px}",
        "table{width:100%;border-collapse:collapse}",
        "td{padding:4px 6px;border-bottom:1px solid #f1f5f9;font-size:10px}",
        "tr:nth-child(even){background:#f8fafc}",
        ".stitle{font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;padding-bottom:3px;border-bottom:2px solid #e2e8f0;margin:12px 0 6px}",
        ".kpi{background:#f8fafc;border-radius:5px;padding:8px;text-align:center}",
        ".kpi-l{font-size:8px;color:#64748b;text-transform:uppercase;margin-bottom:3px}",
        ".kpi-v{font-size:14px;font-weight:bold}",
        ".kpi-s{font-size:8px;font-weight:bold;margin-top:2px}",
        ".amort th{background:#0f172a;color:white;padding:5px 8px;text-align:right;font-size:9px}",
        ".amort td{text-align:right;font-size:9px;font-family:monospace;padding:4px 8px}",
        ".footer{border-top:1px solid #e2e8f0;padding-top:6px;display:flex;justify-content:space-between;font-size:8px;color:#94a3b8;margin-top:12px}",
        ".btn{background:#f0b429;color:#1a0000;border:none;padding:8px 20px;font-size:12px;font-weight:bold;border-radius:6px;cursor:pointer;margin-bottom:12px}",
        "</style></head><body>",
        "<button class='noprint btn' onclick='window.print()'>&#128438; Enregistrer en PDF (Ctrl+P)</button>",
        "<div class='header'>",
        "<div><div style='font-size:9px;color:#94a3b8'>DOSSIER DE FINANCEMENT IMMOBILIER</div>",
        "<div style='font-size:15px;font-weight:bold;margin:3px 0'>&#127968; Fiche Synthese Bancaire</div>",
        "<div style='font-size:9px;color:#94a3b8'>Etablie le " + today + "</div></div>",
        "<div style='text-align:right;font-size:10px;color:#94a3b8'>",
        (investisseur.prenom || investisseur.nom ? "<strong style='color:white;font-size:12px'>" + investisseur.prenom + " " + investisseur.nom + "</strong>" : "<em style='color:#475569'>Non renseigne</em>"),
        (investisseur.tel ? "<br>" + investisseur.tel : ""),
        (investisseur.email ? "<br>" + investisseur.email : ""),
        "</div></div>",
        "<div class='band'>",
        "<div><strong style='font-size:13px;color:#1a0000'>" + typeBien.toUpperCase() + " &mdash; " + bien.nom + "</strong>",
        (bien.adresse ? "<div style='font-size:9px;color:#78350f'>" + bien.adresse + "</div>" : ""),
        "</div><div style='font-weight:bold;color:#1a0000'>" + bien.surface + " m&sup2; &nbsp;|&nbsp; " + fmtEur(Math.round(res.prixM2)) + "/m&sup2;</div></div>",

        // Acquisition + Credit
        "<div class='grid2'>",
        "<div><div class='stitle' style='color:#1e40af;border-color:#bfdbfe'>Acquisition</div><table>",
        "<tr><td style='color:#64748b'>Prix d'achat</td><td style='text-align:right;font-weight:bold'>" + fmtEur(bien.prix) + "</td></tr>",
        "<tr><td style='color:#64748b'>Frais notaire</td><td style='text-align:right;font-weight:bold'>" + fmtEur(Math.round(res.notaire - bien.prix)) + "</td></tr>",
        "<tr><td style='color:#64748b'>Travaux</td><td style='text-align:right;font-weight:bold'>" + fmtEur(bien.travaux) + "</td></tr>",
        "<tr><td style='font-weight:bold'>Cout total</td><td style='text-align:right;font-weight:bold'>" + fmtEur(Math.round(res.coutTotal)) + "</td></tr>",
        "<tr><td style='color:#64748b'>Apport</td><td style='text-align:right;font-weight:bold'>" + fmtEur(bien.apport) + "</td></tr>",
        "<tr><td style='font-weight:bold'>Montant emprunte</td><td style='text-align:right;font-weight:bold'>" + fmtEur(Math.round(res.aEmprunter)) + "</td></tr>",
        "</table></div>",
        "<div><div class='stitle' style='color:#7e22ce;border-color:#ede9fe'>Credit immobilier</div><table>",
        "<tr><td style='color:#64748b'>Taux</td><td style='text-align:right;font-weight:bold'>" + bien.taux + " %</td></tr>",
        "<tr><td style='color:#64748b'>Duree</td><td style='text-align:right;font-weight:bold'>" + bien.duree + " ans</td></tr>",
        "<tr><td style='color:#64748b'>Mensualite credit</td><td style='text-align:right;font-weight:bold'>" + fmtEur(Math.round(res.mensualiteCredit)) + "</td></tr>",
        "<tr><td style='color:#64748b'>Assurance/mois</td><td style='text-align:right;font-weight:bold'>" + fmtEur(Math.round(res.mensualiteAssurance)) + "</td></tr>",
        "<tr><td style='font-weight:bold'>Mensualite totale</td><td style='text-align:right;font-weight:bold'>" + fmtEur(Math.round(res.mensualiteTotale)) + "</td></tr>",
        "<tr><td style='color:#64748b'>Cout total credit</td><td style='text-align:right;font-weight:bold'>" + fmtEur(Math.round(res.coutTotalCredit)) + "</td></tr>",
        "</table></div></div>",

        // Revenus + Charges
        "<div class='grid2'>",
        "<div><div class='stitle' style='color:#15803d;border-color:#dcfce7'>Revenus locatifs</div><table>",
        "<tr><td style='color:#64748b'>Loyer mensuel</td><td style='text-align:right;font-weight:bold'>" + fmtEur(loyerMensuelAffiche) + "</td></tr>",
        "<tr><td style='font-weight:bold'>Loyer annuel</td><td style='text-align:right;font-weight:bold'>" + fmtEur(res.loyerAnnuel) + "</td></tr>",
        ...(bien.typeBien === "Immeuble" && bien.lots?.length ? bien.lots.map(l => "<tr><td style='color:#94a3b8;padding-left:12px'>" + l.nom + " (" + l.type + ") · " + l.surface + " m²</td><td style='text-align:right;color:#64748b'>" + fmtEur(l.loyer) + "/mois</td></tr>") : []),
        "</table></div>",
        "<div><div class='stitle' style='color:#b45309;border-color:#fef3c7'>Charges annuelles</div><table>",
        "<tr><td style='color:#64748b'>Taxe fonciere</td><td style='text-align:right;font-weight:bold'>" + fmtEur(bien.taxeFonciere) + "</td></tr>",
        "<tr><td style='color:#64748b'>Assurance PNO</td><td style='text-align:right;font-weight:bold'>" + fmtEur(bien.assurancePNO) + "</td></tr>",
        "<tr><td style='color:#64748b'>Entretien</td><td style='text-align:right;font-weight:bold'>" + fmtEur(bien.entretien) + "</td></tr>",
        "<tr><td style='font-weight:bold'>Total charges</td><td style='text-align:right;font-weight:bold'>" + fmtEur(res.charges) + "</td></tr>",
        "</table></div></div>",

        // Indicateurs
        "<div class='stitle'>Indicateurs de rentabilite</div><div class='grid5'>",
        "<div class='kpi' style='border-top:3px solid #2563eb'><div class='kpi-l'>Renta brute</div><div class='kpi-v' style='color:#2563eb'>" + fmtPct(res.rentaBrute) + "</div></div>",
        "<div class='kpi' style='border-top:3px solid " + (res.rentaNette>=6?"#16a34a":"#ca8a04") + "'><div class='kpi-l'>Renta nette</div><div class='kpi-v' style='color:" + (res.rentaNette>=6?"#16a34a":"#ca8a04") + "'>" + fmtPct(res.rentaNette) + "</div><div class='kpi-s' style='color:" + (res.rentaNette>=6?"#16a34a":"#ca8a04") + "'>" + res.interpRentaNette[0] + "</div></div>",
        "<div class='kpi' style='border-top:3px solid " + (res.rentaNetNet>=6?"#16a34a":"#ca8a04") + "'><div class='kpi-l'>Renta net-net</div><div class='kpi-v' style='color:" + (res.rentaNetNet>=6?"#16a34a":"#ca8a04") + "'>" + fmtPct(res.rentaNetNet) + "</div><div class='kpi-s' style='color:" + (res.rentaNetNet>=6?"#16a34a":"#ca8a04") + "'>" + res.interpRentaNetNet[0] + "</div></div>",
        "<div class='kpi' style='border-top:3px solid " + dscrColor + "'><div class='kpi-l'>DSCR</div><div class='kpi-v' style='color:" + dscrColor + "'>" + fmt(res.dscr,2) + "</div><div class='kpi-s' style='color:" + dscrColor + "'>" + res.interpDSCR[0] + "</div></div>",
        "<div class='kpi' style='border-top:3px solid " + cfColor + "'><div class='kpi-l'>Cash-flow/mois</div><div class='kpi-v' style='color:" + cfColor + "'>" + fmtEur(Math.round(res.cashflowMensuel)) + "</div><div class='kpi-s' style='color:" + cfColor + "'>" + res.interpCash[0] + "</div></div>",
        "</div>",

        // Fiscalite
        "<div class='stitle'>Fiscalite &mdash; " + regimeLabelPDF + " | TMI : " + bien.trancheMarginalIR + "%</div><div class='grid4'>",
        "<div class='kpi' style='border-top:3px solid #7c3aed'><div class='kpi-l'>Tranche IR</div><div class='kpi-v' style='color:#7c3aed'>" + bien.trancheMarginalIR + " %</div></div>",
        "<div class='kpi' style='border-top:3px solid #7c3aed'><div class='kpi-l'>Rev. imposable/an</div><div class='kpi-v' style='color:#7c3aed;font-size:11px'>" + fmtEur(Math.round(res.revenuImposable)) + "</div></div>",
        "<div class='kpi' style='border-top:3px solid #dc2626'><div class='kpi-l'>Impot annuel</div><div class='kpi-v' style='color:#dc2626;font-size:11px'>" + fmtEur(Math.round(res.impotFiscal)) + "</div></div>",
        "<div class='kpi' style='border-top:3px solid " + (res.cashflowApresImpot>=0?"#16a34a":"#dc2626") + "'><div class='kpi-l'>CF net/mois</div><div class='kpi-v' style='color:" + (res.cashflowApresImpot>=0?"#16a34a":"#dc2626") + ";font-size:11px'>" + fmtEur(Math.round(res.cashflowApresImpot)) + "</div></div>",
        "</div>",

        // Amortissement
        "<div class='stitle'>Tableau d'amortissement (15 premieres annees)</div>",
        "<table class='amort'><thead><tr>",
        "<th style='text-align:left'>Annee</th><th>Mensualite</th><th>Interets</th><th>Capital remb.</th><th>Capital restant</th><th>CF cumule</th>",
        "</tr></thead><tbody>",
        ...amortRows.map((r, i) =>
          "<tr style='background:" + (i%2===0?"#f8fafc":"white") + "'>" +
          "<td style='text-align:left;font-weight:bold;color:#475569'>" + r.an + "</td>" +
          "<td>" + fmtEur(Math.round(res.mensualiteTotale)) + "</td>" +
          "<td style='color:#dc2626'>" + fmtEur(r.interets) + "</td>" +
          "<td style='color:#16a34a'>" + fmtEur(r.remb) + "</td>" +
          "<td style='color:#2563eb;font-weight:bold'>" + fmtEur(r.capital) + "</td>" +
          "<td style='color:" + (r.cashflow>=0?"#16a34a":"#dc2626") + ";font-weight:bold'>" + fmtEur(r.cashflow) + "</td>" +
          "</tr>"
        ),
        "</tbody></table>",

        // Score
        "<div class='stitle' style='margin-top:12px'>Evaluation globale</div>",
        "<div style='display:flex;align-items:center;gap:14px;margin-top:6px'>",
        "<div style='background:" + scColor + "18;border:2px solid " + scColor + ";border-radius:8px;padding:12px 16px;text-align:center;min-width:80px'>",
        "<div style='font-size:9px;color:#64748b'>Score global</div>",
        "<div style='font-size:28px;font-weight:bold;color:" + scColor + "'>" + res.score + "</div>",
        "<div style='font-size:9px;color:#64748b'>/25</div>",
        "<div style='font-size:10px;font-weight:bold;color:" + scColor + "'>" + res.interpScore[0] + "</div>",
        "</div>",
        "<div style='flex:1'><div class='grid5'>",
        ...criteres.map(([label, note]) => {
          const col = note >= 4 ? "#16a34a" : note === 3 ? "#ca8a04" : "#dc2626";
          return "<div style='background:#f8fafc;border-left:3px solid " + col + ";border-radius:4px;padding:6px;text-align:center'>" +
            "<div style='font-size:8px;color:#64748b'>" + label + "</div>" +
            "<div style='font-size:13px;font-weight:bold;color:" + col + "'>" + note + "/5</div>" +
            "</div>";
        }),
        "</div>",
        "<div style='margin-top:6px;font-size:9px;color:#475569'>Emplacement : " + empLabelPDF + " &nbsp;&bull;&nbsp; " + regimeLabelPDF + " &nbsp;&bull;&nbsp; TMI : " + bien.trancheMarginalIR + "%</div>",
        "</div></div>",

        "<div class='footer'><span>Genere le " + today + " · Rentabilite Immo</span><span>Document indicatif &mdash; Non contractuel</span></div>",
        "</body></html>"
      ].join("");

      // Create a Blob and download as .html file — works in all browsers including Edge
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Fiche_Bancaire_" + bien.nom.replace(/[^a-zA-Z0-9]/g, "_") + ".html";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch(err) {
      alert("Erreur : " + err.message);
    }
    setPrinting(false);
  }

  const DSCR_COLOR = res.dscr >= 1.25 ? "#16a34a" : res.dscr >= 1 ? "#ca8a04" : "#dc2626";
  const regimeLabel = { "micro-foncier": "Micro-foncier (abat. 30%)", "reel": "Réel simplifié", "micro-bic": "LMNP Micro-BIC (abat. 50%)", "lmnp-reel": "LMNP Réel (amortissement)", "sci-ir": "SCI à l'IR (revenus fonciers)", "sci-is": "SCI à l'IS (15%/25%)" }[bien.regime];
  const empLabel = ["","Mauvais secteur","Secteur moyen","Correct","Bon emplacement","Très recherché"][bien.emplacement];

  return (
    <div style={{ fontFamily: "DM Sans, sans-serif" }}>
      <div className="no-print">
        {/* Bandeau live */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: T.green + "12", border: `1px solid ${T.green}30`, borderRadius: 10, padding: "9px 16px", marginBottom: 18 }}>
          <span style={{ fontSize: 16 }}>🔴</span>
          <span style={{ fontSize: 12, color: T.green, fontWeight: 700 }}>Aperçu en direct</span>
          <span style={{ fontSize: 12, color: T.textSub }}>— La fiche se met à jour automatiquement quand tu modifies les données dans le simulateur</span>
        </div>

        {/* Infos investisseur uniquement (le reste vient du simulateur) */}
        <Card style={{ padding: 18, marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>👤 Informations investisseur (facultatif)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
            {[["Prénom", "prenom"], ["Nom", "nom"], ["Téléphone", "tel"]].map(([label, key]) => (
              <div key={key}>
                <label style={{ display: "block", fontSize: 10, color: T.textMuted, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>{label}</label>
                <input value={investisseur[key]} onChange={e => setInvestisseur({ ...investisseur, [key]: e.target.value })} placeholder={label} onFocus={e => e.target.select()} style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "7px 10px", fontSize: 12, color: T.text, outline: "none" }} />
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[["Email", "email"], ["Ville", "ville"]].map(([label, key]) => (
              <div key={key}>
                <label style={{ display: "block", fontSize: 10, color: T.textMuted, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>{label}</label>
                <input value={investisseur[key]} onChange={e => setInvestisseur({ ...investisseur, [key]: e.target.value })} placeholder={label} onFocus={e => e.target.select()} style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "7px 10px", fontSize: 12, color: T.text, outline: "none" }} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: T.textMuted, fontStyle: "italic" }}>
            💡 Nom, adresse, type de bien → modifie-les dans le formulaire à gauche (onglet 📊 Simulateur)
          </div>
        </Card>

        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
          <button onClick={handlePrint} style={{ background: `linear-gradient(135deg, ${T.gold}, ${T.goldDim})`, color: "#0a0c10", border: "none", borderRadius: 12, padding: "13px 32px", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, boxShadow: `0 6px 20px ${T.gold}35` }}>
            {printing ? "⏳ Préparation..." : "📄 Exporter en PDF"}
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          FICHE PDF — tout ce qui suit sera imprimé
          ══════════════════════════════════════════════ */}
      <div ref={ficheRef} className="pdf-page" style={{ background: "white", color: "#1a1a2e", fontFamily: "DM Sans, sans-serif", maxWidth: 900, margin: "0 auto" }}>

        {/* En-tête */}
        <div style={{ background: "#0f172a", color: "white", padding: "24px 32px", borderRadius: "12px 12px 0 0", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 0 }}>
          <div>
            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 4 }}>Dossier de financement immobilier</div>
            <div style={{ fontSize: 22, fontWeight: 400, fontFamily: "DM Serif Display, serif", color: "white" }}>🏠 Fiche Synthèse Bancaire</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>Établie le {today}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            {investisseur.prenom || investisseur.nom ? (
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "white" }}>{investisseur.prenom} {investisseur.nom}</div>
                {investisseur.tel && <div style={{ fontSize: 12, color: "#94a3b8" }}>📞 {investisseur.tel}</div>}
                {investisseur.email && <div style={{ fontSize: 12, color: "#94a3b8" }}>✉️ {investisseur.email}</div>}
                {investisseur.ville && <div style={{ fontSize: 12, color: "#94a3b8" }}>📍 {investisseur.ville}</div>}
              </div>
            ) : <div style={{ fontSize: 13, color: "#475569", fontStyle: "italic" }}>Investisseur non renseigné</div>}
          </div>
        </div>

        {/* Bandeau bien */}
        <div style={{ background: "#f0b429", padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#78350f", textTransform: "uppercase", letterSpacing: "0.1em" }}>{typeBien}</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: "#1a0000", marginLeft: 12, fontFamily: "DM Serif Display, serif" }}>{bien.nom}</span>
            {adresseBien && <span style={{ fontSize: 13, color: "#78350f", marginLeft: 14 }}>📍 {adresseBien}</span>}
          </div>
          <div style={{ display: "flex", gap: 20 }}>
            <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: "#92400e", fontWeight: 700 }}>SURFACE</div><div style={{ fontSize: 16, fontWeight: 700, color: "#1a0000" }}>{surfaceAffichee} m²</div></div>
            <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: "#92400e", fontWeight: 700 }}>PRIX/m²</div><div style={{ fontSize: 16, fontWeight: 700, color: "#1a0000" }}>{fmtEur(Math.round(res.prixM2))}</div></div>
          </div>
        </div>

        <div style={{ padding: "28px 32px", background: "white" }}>

          {/* Section 1 : Acquisition & Financement */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
            {/* Acquisition */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1e40af", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12, paddingBottom: 6, borderBottom: "2px solid #dbeafe" }}>💰 Acquisition</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <tbody>
                  {[["Prix d'achat", fmtEur(bien.prix)], ["Frais de notaire", fmtEur(Math.round(res.notaire - bien.prix))], ["Travaux", fmtEur(bien.travaux)], ["Coût total", fmtEur(Math.round(res.coutTotal)), true], ["Apport personnel", fmtEur(bien.apport)], ["Montant emprunté", fmtEur(Math.round(res.aEmprunter)), true]].map(([k, v, bold]) => (
                    <tr key={k} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "7px 0", color: "#64748b", fontWeight: bold ? 700 : 400 }}>{k}</td>
                      <td style={{ padding: "7px 0", textAlign: "right", fontWeight: bold ? 700 : 600, color: bold ? "#0f172a" : "#334155" }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Financement */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#7e22ce", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12, paddingBottom: 6, borderBottom: "2px solid #ede9fe" }}>🏦 Crédit immobilier</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <tbody>
                  {[["Taux d'intérêt", `${bien.taux} %`], ["Durée", `${bien.duree} ans (${bien.duree * 12} mensualités)`], ["Taux assurance", `${bien.tauxAssurance} %`], ["Mensualité crédit", fmtEur(Math.round(res.mensualiteCredit))], ["Mensualité assurance", fmtEur(Math.round(res.mensualiteAssurance))], ["Mensualité totale", fmtEur(Math.round(res.mensualiteTotale)), true], ["Coût total crédit", fmtEur(Math.round(res.coutTotalCredit))]].map(([k, v, bold]) => (
                    <tr key={k} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "7px 0", color: "#64748b", fontWeight: bold ? 700 : 400 }}>{k}</td>
                      <td style={{ padding: "7px 0", textAlign: "right", fontWeight: bold ? 700 : 600, color: bold ? "#0f172a" : "#334155" }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2 : Revenus & Charges */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#15803d", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12, paddingBottom: 6, borderBottom: "2px solid #dcfce7" }}>💵 Revenus locatifs</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <tbody>
                  {[["Loyer mensuel", fmtEur(loyerMensuelAffiche)], ["Loyer annuel", fmtEur(res.loyerAnnuel), true], ["Taux d'occupation estimé", "100 %"], ["Rendement brut", fmtPct(res.rentaBrute)]].map(([k, v, bold]) => (
                    <tr key={k} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "7px 0", color: "#64748b", fontWeight: bold ? 700 : 400 }}>{k}</td>
                      <td style={{ padding: "7px 0", textAlign: "right", fontWeight: bold ? 700 : 600, color: bold ? "#0f172a" : "#334155" }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#b45309", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12, paddingBottom: 6, borderBottom: "2px solid #fef3c7" }}>📋 Charges annuelles</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <tbody>
                  {[["Taxe foncière", fmtEur(bien.taxeFonciere)], ["Assurance PNO", fmtEur(bien.assurancePNO)], ["Entretien", fmtEur(bien.entretien)], ["Comptable", fmtEur(bien.comptable)], ["Autres charges", fmtEur(bien.autresCharges)], ["Total charges", fmtEur(res.charges), true]].map(([k, v, bold]) => (
                    <tr key={k} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "6px 0", color: "#64748b", fontWeight: bold ? 700 : 400 }}>{k}</td>
                      <td style={{ padding: "6px 0", textAlign: "right", fontWeight: bold ? 700 : 600, color: bold ? "#0f172a" : "#334155" }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3 : Indicateurs clés — les cartes bancaires */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14, paddingBottom: 6, borderBottom: "2px solid #e2e8f0" }}>📊 Indicateurs de rentabilité</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
              {[
                ["Renta brute", fmtPct(res.rentaBrute), "#2563eb", ""],
                ["Renta nette", fmtPct(res.rentaNette), res.rentaNette >= 6 ? "#16a34a" : "#ca8a04", res.interpRentaNette[0]],
                ["Renta net-net", fmtPct(res.rentaNetNet), res.rentaNetNet >= 6 ? "#16a34a" : res.rentaNetNet >= 3 ? "#ca8a04" : "#dc2626", res.interpRentaNetNet[0]],
                ["DSCR", fmt(res.dscr, 2), DSCR_COLOR, res.interpDSCR[0]],
                ["Cash-flow/mois", fmtEur(Math.round(res.cashflowMensuel)), res.cashflowMensuel >= 0 ? "#16a34a" : "#dc2626", res.interpCash[0]],
              ].map(([label, value, color, sub]) => (
                <div key={label} style={{ background: "#f8fafc", border: `1.5px solid ${color}30`, borderTop: `3px solid ${color}`, borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase", marginBottom: 6, letterSpacing: "0.06em" }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: "DM Serif Display, serif" }}>{value}</div>
                  {sub && <div style={{ fontSize: 11, color, fontWeight: 600, marginTop: 4 }}>{sub}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Section 4 : Fiscalité */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12, paddingBottom: 6, borderBottom: "2px solid #e2e8f0" }}>🧾 Fiscalité — Régime {regimeLabel}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {[["Tranche marginale IR", `${bien.trancheMarginalIR} %`, "#6d28d9"], ["Revenu imposable/an", fmtEur(Math.round(res.revenuImposable)), "#7c3aed"], ["Impôt annuel estimé", fmtEur(Math.round(res.impotFiscal)), "#dc2626"], ["CF net après impôt", fmtEur(Math.round(res.cashflowApresImpot)), res.cashflowApresImpot >= 0 ? "#16a34a" : "#dc2626"]].map(([label, value, color]) => (
                <div key={label} style={{ background: "#f8fafc", border: `1px solid ${color}25`, borderLeft: `3px solid ${color}`, borderRadius: 9, padding: "11px 13px" }}>
                  <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase", marginBottom: 5, letterSpacing: "0.06em" }}>{label}</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color, fontFamily: "DM Serif Display, serif" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 5 : Tableau amortissement résumé */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12, paddingBottom: 6, borderBottom: "2px solid #e2e8f0" }}>🗓️ Tableau d'amortissement (résumé annuel)</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#0f172a" }}>
                  {["Année", "Mensualité totale", "Intérêts", "Capital remb.", "Capital restant", "Cash-flow cumulé"].map(h => <th key={h} style={{ padding: "9px 12px", textAlign: "right", color: "white", fontWeight: 600, fontSize: 11, whiteSpace: "nowrap" }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {amortAnnuel.map((row, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#f8fafc" : "white", borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "7px 12px", fontWeight: 700, color: "#475569", textAlign: "right" }}>{row.an}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right", color: "#334155", fontFamily: "monospace" }}>{fmtEur(Math.round(res.mensualiteTotale))}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right", color: "#dc2626", fontFamily: "monospace" }}>{fmtEur(row.interets)}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right", color: "#16a34a", fontFamily: "monospace" }}>{fmtEur(row.remb)}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right", color: "#2563eb", fontWeight: 700, fontFamily: "monospace" }}>{fmtEur(row.capital)}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right", color: row.cashflow >= 0 ? "#16a34a" : "#dc2626", fontWeight: 700, fontFamily: "monospace" }}>{fmtEur(row.cashflow)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Section 6 : Graphiques */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>📉 Capital restant dû</div>
              <div style={{ background: "#f8fafc", borderRadius: 10, padding: "8px 4px", border: "1px solid #e2e8f0" }}>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={amortAnnuel}>
                    <defs><linearGradient id="pg1" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} /><stop offset="95%" stopColor="#2563eb" stopOpacity={0} /></linearGradient></defs>
                    <XAxis dataKey="an" tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={v => fmt(v / 1000) + "k"} tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 11 }} formatter={v => fmtEur(v)} />
                    <Area type="monotone" dataKey="capital" stroke="#2563eb" fill="url(#pg1)" strokeWidth={2} name="Capital restant" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>📈 Cash-flow cumulé</div>
              <div style={{ background: "#f8fafc", borderRadius: 10, padding: "8px 4px", border: "1px solid #e2e8f0" }}>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={amortAnnuel}>
                    <defs><linearGradient id="pg2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#16a34a" stopOpacity={0.25} /><stop offset="95%" stopColor="#16a34a" stopOpacity={0} /></linearGradient></defs>
                    <XAxis dataKey="an" tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={v => fmt(v / 1000) + "k"} tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 11 }} formatter={v => fmtEur(v)} />
                    <Area type="monotone" dataKey="cashflow" stroke="#16a34a" fill="url(#pg2)" strokeWidth={2} name="Cash-flow cumulé" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Section 7 : Score & évaluation globale */}
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <div style={{ textAlign: "center", background: scoreColor + "15", border: `2px solid ${scoreColor}40`, borderRadius: 14, padding: "16px 22px" }}>
                <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Score global</div>
                <div style={{ fontSize: 40, fontWeight: 400, color: scoreColor, fontFamily: "DM Serif Display, serif", lineHeight: 1 }}>{res.score}</div>
                <div style={{ fontSize: 13, color: "#64748b" }}>/25</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: scoreColor, marginTop: 4 }}>{res.interpScore[0]}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 12 }}>Notation par critère</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                  {[["Net-net", res.interpRentaNetNet[1]], ["DSCR", res.interpDSCR[1]], ["Renta nette", res.interpRentaNette[1]], ["Cash-flow", res.interpCash[1]], ["Emplacement", bien.emplacement]].map(([label, note]) => {
                    const col = note >= 4 ? "#16a34a" : note === 3 ? "#ca8a04" : "#dc2626";
                    return (
                      <div key={label} style={{ background: col + "12", border: `1px solid ${col}30`, borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                        <div style={{ fontSize: 10, color: "#64748b", marginBottom: 4 }}>{label}</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: col }}>{note}/5</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 12, fontSize: 12, color: "#475569", lineHeight: 1.6 }}>
                  <strong>Emplacement :</strong> {empLabel} · <strong>Régime fiscal :</strong> {regimeLabel} · <strong>TMI :</strong> {bien.trancheMarginalIR}%
                </div>
              </div>
            </div>
          </div>

          {/* Pied de page */}
          <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>Document généré le {today} · Rentabilité Immo</div>
            <div style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>Document à titre indicatif — Non contractuel</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── DIAGNOSTIC IA ────────────────────────────────────────────────────────────

// ─── FISCALITÉ TAB ────────────────────────────────────────────────────────────
function FiscaliteTab({ bien, res, calculer }) {
  const REGIMES = [
    { id: "micro-foncier", label: "Micro-foncier", badge: "−30%", color: T.blue,
      desc: "Location nue, revenus < 15 000€/an. Abattement forfaitaire de 30% sur les loyers bruts.",
      avantages: ["Très simple à déclarer", "Aucun comptable requis", "Idéal si charges < 30% des loyers"],
      inconvenients: ["Abattement limité à 30%", "Pas de déduction des gros travaux", "Pas d'amortissement"] },
    { id: "reel", label: "Réel simplifié", badge: "Charges réelles", color: T.purple,
      desc: "Location nue. Toutes les charges réelles déductibles : taxe foncière, intérêts, travaux, assurance.",
      avantages: ["Déduction de toutes les charges", "Intérêts d'emprunt déductibles", "Déficit foncier imputable (10 700€/an)"],
      inconvenients: ["Plus complexe à gérer", "Nécessite un comptable", "Pas d'amortissement"] },
    { id: "micro-bic", label: "LMNP Micro-BIC", badge: "−50%", color: T.gold,
      desc: "Location meublée, revenus < 77 700€/an. Abattement forfaitaire de 50% sur les recettes.",
      avantages: ["Abattement de 50%", "Simple à gérer", "Statut LMNP avantageux"],
      inconvenients: ["Obligation de meubler", "Limité à 77 700€/an", "Pas d'amortissement"] },
    { id: "lmnp-reel", label: "LMNP Réel", badge: "Amortissement", color: T.green,
      desc: "Location meublée régime réel. Amortissement du bien sur 25 ans. Fiscalité souvent nulle pendant de nombreuses années.",
      avantages: ["Amortissement bien (≈85% sur 25 ans)", "Impôt = 0 souvent pendant 10-15 ans", "Déficit BIC reportable"],
      inconvenients: ["Expert-comptable obligatoire", "Gestion plus lourde", "Pas compatible SCI"] },
    { id: "sci-ir", label: "SCI à l'IR", badge: "Transparente", color: "#06b6d4",
      desc: "Société Civile Immobilière transparente fiscalement. Les revenus fonciers sont imposés directement entre les mains des associés à leur TMI.",
      avantages: ["Idéale pour la transmission patrimoniale", "Déduction charges réelles + intérêts", "Gestion à plusieurs associés simplifiée", "Déficit foncier reportable 10 ans"],
      inconvenients: ["Imposition au TMI des associés + PS 17.2%", "Moins avantageuse si TMI élevé", "Pas d'amortissement du bien"] },
    { id: "sci-is", label: "SCI à l'IS", badge: "15% / 25%", color: T.orange,
      desc: "SCI soumise à l'Impôt sur les Sociétés. Amortissement du bâti sur 30 ans. Taux 15% jusqu'à 42 500€ de bénéfice, 25% au-delà.",
      avantages: ["Amortissement du bâti sur 30 ans", "Taux IS réduit 15% (< 42 500€)", "Optimisation si réinvestissement", "Capitalisation des bénéfices dans la société"],
      inconvenients: ["Double imposition : IS puis IR sur dividendes", "Plus-value très élevée à la revente (valeur amortie)", "Expert-comptable obligatoire", "Incompatible avec le statut LMNP"] },
  ];

  const calcRegime = (id) => calculer({ ...bien, regime: id });

  return (
    <div style={{ fontFamily: "DM Sans, sans-serif" }}>
      <STitle accent={T.gold}>🧾 Comparaison des 6 régimes fiscaux</STitle>

      {/* Tableau comparatif */}
      <Card style={{ marginBottom: 22, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead>
              <tr style={{ background: T.surface2 }}>
                <th style={{ padding: "12px 14px", textAlign: "left", color: T.textMuted, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Indicateur</th>
                {REGIMES.map(r => (
                  <th key={r.id} style={{ padding: "12px 10px", textAlign: "center", color: r.id === bien.regime ? r.color : T.textSub, fontSize: 11, fontWeight: 700, borderBottom: r.id === bien.regime ? `2px solid ${r.color}` : "2px solid transparent", whiteSpace: "nowrap" }}>
                    {r.label}{r.id === bien.regime ? " ✓" : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["Revenu imposable/an", r => fmtEur(Math.round(calcRegime(r.id).revenuImposable))],
                ["Impôt annuel estimé", r => fmtEur(Math.round(calcRegime(r.id).impotFiscal))],
                ["Cash-flow brut/mois", r => fmtEur(Math.round(calcRegime(r.id).cashflowMensuel))],
                ["Cash-flow net impôt/mois", r => fmtEur(Math.round(calcRegime(r.id).cashflowApresImpot))],
              ].map(([label, fn], idx) => {
                const vals = REGIMES.map(r => parseFloat(fn(r).replace(/[^\d.-]/g, "")));
                const best = label.includes("Impôt") ? Math.min(...vals) : Math.max(...vals);
                return (
                  <tr key={label} style={{ borderBottom: `1px solid ${T.border}`, background: idx % 2 === 0 ? T.surface : T.surface2 }}>
                    <td style={{ padding: "11px 14px", color: T.textSub, fontSize: 12 }}>{label}</td>
                    {REGIMES.map((r, i) => {
                      const isBest = vals[i] === best;
                      return <td key={r.id} style={{ padding: "11px 10px", textAlign: "center", fontWeight: 700, color: isBest ? r.color : T.text, fontSize: 13, background: isBest ? r.color + "12" : "transparent" }}>{isBest && "★ "}{fn(r)}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Cartes détail */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        {REGIMES.map(r => {
          const rCalc = calcRegime(r.id);
          const isActive = bien.regime === r.id;
          return (
            <Card key={r.id} style={{ padding: 20, border: `1px solid ${isActive ? r.color + "60" : T.border}`, boxShadow: isActive ? `0 0 16px ${r.color}18` : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: r.color, fontFamily: "DM Serif Display, serif" }}>{r.label}</span>
                <span style={{ background: r.color + "20", color: r.color, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "2px 8px", whiteSpace: "nowrap" }}>{r.badge}</span>
              </div>
              <p style={{ color: T.textMuted, fontSize: 12, lineHeight: 1.6, margin: "0 0 12px" }}>{r.desc}</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
                <div style={{ background: T.green + "12", border: `1px solid ${T.green}20`, borderRadius: 7, padding: "8px 10px" }}>
                  <div style={{ fontSize: 9, color: T.green, fontWeight: 700, marginBottom: 4, textTransform: "uppercase" }}>✅ Avantages</div>
                  {r.avantages.map((a, i) => <div key={i} style={{ fontSize: 11, color: T.textSub, marginBottom: 2 }}>+ {a}</div>)}
                </div>
                <div style={{ background: T.red + "12", border: `1px solid ${T.red}20`, borderRadius: 7, padding: "8px 10px" }}>
                  <div style={{ fontSize: 9, color: T.red, fontWeight: 700, marginBottom: 4, textTransform: "uppercase" }}>⚠️ Limites</div>
                  {r.inconvenients.map((a, i) => <div key={i} style={{ fontSize: 11, color: T.textSub, marginBottom: 2 }}>− {a}</div>)}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <div style={{ background: T.surface2, borderRadius: 7, padding: "8px 10px", border: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 9, color: T.textMuted, marginBottom: 2, textTransform: "uppercase" }}>Impôt/an</div>
                  <div style={{ fontWeight: 700, color: T.red, fontSize: 13 }}>{fmtEur(Math.round(rCalc.impotFiscal))}</div>
                </div>
                <div style={{ background: T.surface2, borderRadius: 7, padding: "8px 10px", border: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 9, color: T.textMuted, marginBottom: 2, textTransform: "uppercase" }}>CF net/mois</div>
                  <div style={{ fontWeight: 700, color: rCalc.cashflowApresImpot >= 0 ? T.green : T.red, fontSize: 13 }}>{fmtEur(Math.round(rCalc.cashflowApresImpot))}</div>
                </div>
              </div>
              {r.id === "sci-is" && (
                <div style={{ marginTop: 10, background: T.orange + "12", border: `1px solid ${T.orange}30`, borderRadius: 7, padding: "8px 10px", fontSize: 11, color: T.orange, lineHeight: 1.5 }}>
                  ⚠️ <strong>Attention :</strong> À la revente, la plus-value est calculée sur la valeur nette comptable (après amortissements), ce qui peut générer une imposition très élevée.
                </div>
              )}
              {r.id === "sci-ir" && (
                <div style={{ marginTop: 10, background: "#06b6d4" + "12", border: `1px solid #06b6d430`, borderRadius: 7, padding: "8px 10px", fontSize: 11, color: "#06b6d4", lineHeight: 1.5 }}>
                  💡 La SCI à l'IR est la structure préférée pour <strong>transmettre un patrimoine</strong> à ses enfants (démembrement de propriété possible).
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Note SCI IS dividendes */}
      <div style={{ marginTop: 18, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 18px", fontSize: 12, color: T.textSub, lineHeight: 1.7 }}>
        <strong style={{ color: T.gold }}>💡 Note sur la SCI à l'IS :</strong> Les calculs affichés correspondent à l'impôt au niveau de la société uniquement. Si vous vous versez des dividendes, il faudra ajouter la flat tax de <strong style={{ color: T.text }}>30%</strong> (12.8% IR + 17.2% PS) sur les sommes distribuées. Le taux effectif global peut alors dépasser 40%.
      </div>
    </div>
  );
}

function DiagnosticIA({ bien, res }) {
  const [diag, setDiag] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const lancer = async () => {
    setLoading(true); setError(null); setDiag(null);
    try { setDiag(await fetchDiagnostic(bien, res)); }
    catch (e) { setError("Erreur : " + (e.message || "Réponse inattendue. Réessayez.")); }
    setLoading(false);
  };
  const sc = res.score;
  return (
    <div style={{ fontFamily: "DM Sans, sans-serif" }}>
      <div style={{ background: `linear-gradient(135deg,${T.surface2},#0a1628)`, border: `1px solid ${T.border}`, borderRadius: 20, padding: "28px 32px", marginBottom: 22, display: "flex", gap: 24, alignItems: "center" }}>
        <div style={{ fontSize: 48 }}>🤖</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: T.gold, letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>Powered by Claude AI</div>
          <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 400, color: T.text, fontFamily: "DM Serif Display, serif" }}>Diagnostic Expert</h2>
          <p style={{ margin: 0, color: T.textSub, fontSize: 13, lineHeight: 1.65 }}>Analyse approfondie de <strong style={{ color: T.text }}>{bien.nom}</strong> — rentabilité, fiscalité, risques, conseils.</p>
        </div>
        <div style={{ textAlign: "center", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: "14px 20px" }}>
          <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 3 }}>Score</div>
          <div style={{ fontSize: 40, fontWeight: 400, color: sc >= 18 ? T.green : sc >= 10 ? T.gold : T.red, fontFamily: "DM Serif Display, serif" }}>{sc}</div>
          <div style={{ fontSize: 11, color: T.textMuted }}>/ 25</div>
        </div>
      </div>
      {!diag && !loading && <div style={{ textAlign: "center", marginBottom: 24 }}><button onClick={lancer} style={{ background: `linear-gradient(135deg,${T.gold},${T.goldDim})`, color: "#0a0c10", border: "none", borderRadius: 12, padding: "14px 44px", fontSize: 15, fontWeight: 700, cursor: "pointer", boxShadow: `0 6px 24px ${T.gold}35` }}>✨ Lancer le Diagnostic IA</button></div>}
      {loading && <Card style={{ padding: "48px 40px", textAlign: "center" }}><div style={{ fontSize: 44, animation: "spin 3s linear infinite", display: "inline-block", marginBottom: 14 }}>🔍</div><div style={{ fontSize: 18, fontWeight: 400, color: T.text, fontFamily: "DM Serif Display, serif", marginBottom: 6 }}>Analyse en cours…</div><div style={{ color: T.textSub, fontSize: 13, marginBottom: 20 }}>{bien.adresse ? "🏡 Analyse du marché local et stratégie de négociation..." : "Claude examine tous vos indicateurs"}</div><div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>{(bien.adresse ? ["Emplacement","Marché local","Rentabilité","Cash-flow","Négociation"] : ["Rentabilité","Fiscalité","Cash-flow","DSCR","Risques"]).map((s, i) => <span key={s} style={{ background: T.gold + "18", border: `1px solid ${T.gold}30`, borderRadius: 20, padding: "5px 14px", fontSize: 12, color: T.gold, fontWeight: 600, animation: `pulse 1.6s ${i * 0.25}s infinite` }}>{s}</span>)}</div></Card>}
      {error && <div style={{ background: T.red + "15", border: `1px solid ${T.red}40`, borderRadius: 12, padding: 16, marginBottom: 18, display: "flex", alignItems: "center", gap: 12 }}><span style={{ fontSize: 22 }}>⚠️</span><div style={{ flex: 1, color: T.red, fontSize: 13 }}>{error}</div><button onClick={lancer} style={{ background: T.red, color: "white", border: "none", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Réessayer</button></div>}
      {diag && (
        <div className="fu">
          <div style={{ background: `linear-gradient(135deg,${sc >= 18 ? "#0a2018" : sc >= 10 ? "#1a1204" : "#1a0808"},${T.surface2})`, border: `1px solid ${sc >= 18 ? T.green + "40" : sc >= 10 ? T.gold + "40" : T.red + "40"}`, borderRadius: 18, padding: "24px 28px", marginBottom: 18 }}>
            <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
              <div style={{ fontSize: 40 }}>{sc >= 18 ? "💎" : sc >= 10 ? "🟡" : "🔴"}</div>
              <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 5 }}>Verdict</div><div style={{ fontSize: 20, fontWeight: 400, color: T.text, fontFamily: "DM Serif Display, serif", marginBottom: 8 }}>{diag.verdict}</div><p style={{ margin: 0, color: T.textSub, lineHeight: 1.75, fontSize: 14 }}>{diag.resume}</p></div>
              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 16px", textAlign: "center", flexShrink: 0 }}><div style={{ fontSize: 9, color: T.textMuted, marginBottom: 3 }}>NOTE</div><div style={{ fontSize: 28, fontWeight: 400, color: T.gold, fontFamily: "DM Serif Display, serif" }}>{diag.note_globale}</div></div>
            </div>
          </div>
          {/* Note emplacement IA si adresse fournie */}
          {diag.note_emplacement && (
            <div className="fu1" style={{ marginBottom: 14 }}>
              <Card style={{ padding: 22, border: `1px solid ${T.blue}30`, background: `linear-gradient(135deg,#0a1628,${T.surface2})` }}>
                <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                  <div style={{ textAlign: "center", flexShrink: 0 }}>
                    <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 4, textTransform: "uppercase" }}>📍 Note emplacement</div>
                    <div style={{ fontSize: 44, fontWeight: 400, fontFamily: "DM Serif Display, serif", color: diag.note_emplacement >= 4 ? T.green : diag.note_emplacement >= 3 ? T.gold : T.red, lineHeight: 1 }}>{diag.note_emplacement}</div>
                    <div style={{ fontSize: 13, color: T.textMuted }}>/5</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: diag.note_emplacement >= 4 ? T.green : diag.note_emplacement >= 3 ? T.gold : T.red, marginTop: 3 }}>
                      {diag.note_emplacement >= 5 ? "Très recherché" : diag.note_emplacement >= 4 ? "Bon emplacement" : diag.note_emplacement >= 3 ? "Correct" : diag.note_emplacement >= 2 ? "Secteur moyen" : "Mauvais secteur"}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.blue, marginBottom: 8 }}>🤖 Analyse IA de l'emplacement</div>
                    <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8, fontStyle: "italic" }}>Basée sur : {bien.adresse}</div>
                    <p style={{ margin: 0, color: T.textSub, fontSize: 13, lineHeight: 1.75 }}>{diag.analyse_emplacement}</p>
                  </div>
                </div>
              </Card>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            {[[diag.points_forts,"✅ Points forts",T.green],[diag.points_faibles,"⚠️ Points faibles",T.red]].map(([items,title,color]) => <Card key={title} style={{ padding: 20, border: `1px solid ${color}25` }}><div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 14 }}><span style={{ background: color + "20", borderRadius: 6, padding: "3px 10px" }}>{title}</span></div>{items?.map((p,i) => <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", marginBottom: 9, fontSize: 13, color: T.textSub, lineHeight: 1.6 }}><span style={{ color, fontWeight: 700, flexShrink: 0 }}>{color===T.green?"+":"−"}</span>{p}</div>)}</Card>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            {[[diag.risques,"🔺 Risques",T.orange],[diag.opportunites,"💡 Opportunités",T.blue]].map(([items,title,color]) => <Card key={title} style={{ padding: 20, border: `1px solid ${color}25` }}><div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 14 }}><span style={{ background: color + "20", borderRadius: 6, padding: "3px 10px" }}>{title}</span></div>{items?.map((p,i) => <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", marginBottom: 9, fontSize: 13, color: T.textSub, lineHeight: 1.6 }}><span style={{ color, fontWeight: 700, flexShrink: 0 }}>{color===T.orange?"▲":"→"}</span>{p}</div>)}</Card>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            {[["💵 Cash-flow",diag.analyse_cashflow,T.green],["🏦 Crédit",diag.analyse_credit,T.blue],["📊 Rendement",diag.analyse_rendement,T.purple],["🧾 Fiscalité",diag.analyse_fiscalite,T.gold]].map(([title,content,color]) => <Card key={title} style={{ padding: 18, borderTop: `3px solid ${color}` }}><div style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 8 }}>{title}</div><p style={{ margin: 0, color: T.textSub, fontSize: 13, lineHeight: 1.75 }}>{content}</p></Card>)}
          </div>
          <Card style={{ padding: 22, marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.gold, marginBottom: 16, background: T.gold + "18", borderRadius: 8, padding: "4px 12px", display: "inline-block" }}>🎯 Conseils actionnables</div>
            {diag.conseils?.map((c,i) => <div key={i} style={{ display: "flex", gap: 13, alignItems: "flex-start", background: T.surface2, borderRadius: 11, padding: "13px 15px", marginBottom: 9, border: `1px solid ${T.border}` }}><div style={{ background: T.gold, color: T.bg, borderRadius: 7, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 11, flexShrink: 0 }}>{i+1}</div><p style={{ margin: 0, color: T.text, fontSize: 13, lineHeight: 1.7 }}>{c}</p></div>)}
          </Card>
          {/* Offres de négociation */}
          {(diag.offre_aggressive || diag.offre_juste) && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 12, display: "flex", alignItems: "center", gap: 9 }}>
                <div style={{ width: 3, height: 18, background: T.gold, borderRadius: 2 }} />
                🤝 Stratégie de négociation
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {/* Offre agressive */}
                {diag.offre_aggressive && (
                  <Card style={{ padding: 22, border: `1px solid ${T.red}40`, background: `linear-gradient(135deg,#1a0808,${T.surface2})` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.red, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>🔴 Offre agressive</div>
                        <div style={{ fontSize: 28, fontWeight: 400, fontFamily: "DM Serif Display, serif", color: T.red }}>{fmtEur(diag.offre_aggressive.prix)}</div>
                        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
                          soit {fmt((1 - diag.offre_aggressive.prix / bien.prix) * 100, 1)}% sous le prix demandé
                          {diag.offre_aggressive.prix_m2 && <span style={{ marginLeft: 8, color: T.red }}>• {fmtEur(diag.offre_aggressive.prix_m2)}/m²</span>}
                        </div>
                        {diag.offre_aggressive.ecart_marche && <div style={{ fontSize: 11, background: T.red+"15", border:`1px solid ${T.red}25`, borderRadius: 6, padding: "3px 9px", display: "inline-block", color: T.red, marginTop: 4 }}>📊 {diag.offre_aggressive.ecart_marche}</div>}
                      </div>
                    </div>
                    <p style={{ margin: "0 0 12px", color: T.textSub, fontSize: 12, lineHeight: 1.7 }}>{diag.offre_aggressive.justification}</p>
                    <div style={{ borderTop: `1px solid ${T.red}20`, paddingTop: 10 }}>
                      <div style={{ fontSize: 10, color: T.red, fontWeight: 700, marginBottom: 7, textTransform: "uppercase" }}>Arguments à avancer :</div>
                      {diag.offre_aggressive.arguments?.map((a, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 12, color: T.textSub, lineHeight: 1.6 }}>
                          <span style={{ color: T.red, fontWeight: 700, flexShrink: 0 }}>→</span>{a}
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
                {/* Offre juste */}
                {diag.offre_juste && (
                  <Card style={{ padding: 22, border: `1px solid ${T.green}40`, background: `linear-gradient(135deg,#0a1a0a,${T.surface2})` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.green, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>🟢 Offre au juste prix</div>
                        <div style={{ fontSize: 28, fontWeight: 400, fontFamily: "DM Serif Display, serif", color: T.green }}>{fmtEur(diag.offre_juste.prix)}</div>
                        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
                          soit {fmt((1 - diag.offre_juste.prix / bien.prix) * 100, 1)}% sous le prix demandé
                          {diag.offre_juste.prix_m2 && <span style={{ marginLeft: 8, color: T.green }}>• {fmtEur(diag.offre_juste.prix_m2)}/m²</span>}
                        </div>
                        {diag.offre_juste.ecart_marche && <div style={{ fontSize: 11, background: T.green+"15", border:`1px solid ${T.green}25`, borderRadius: 6, padding: "3px 9px", display: "inline-block", color: T.green, marginTop: 4 }}>📊 {diag.offre_juste.ecart_marche}</div>}
                      </div>
                    </div>
                    <p style={{ margin: "0 0 12px", color: T.textSub, fontSize: 12, lineHeight: 1.7 }}>{diag.offre_juste.justification}</p>
                    <div style={{ borderTop: `1px solid ${T.green}20`, paddingTop: 10 }}>
                      <div style={{ fontSize: 10, color: T.green, fontWeight: 700, marginBottom: 7, textTransform: "uppercase" }}>Arguments à avancer :</div>
                      {diag.offre_juste.arguments?.map((a, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 12, color: T.textSub, lineHeight: 1.6 }}>
                          <span style={{ color: T.green, fontWeight: 700, flexShrink: 0 }}>→</span>{a}
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            </div>
          )}

          <div style={{ background: `linear-gradient(135deg,${T.surface2},#0a1020)`, border: `1px solid ${T.border}`, borderRadius: 18, padding: "24px 28px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.green, marginBottom: 12 }}>📋 Recommandation finale</div>
            <p style={{ margin: "0 0 18px", color: T.textSub, fontSize: 14, lineHeight: 1.85 }}>{diag.verdict_final}</p>
            <button onClick={lancer} style={{ background: T.surface3, color: T.textSub, border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>🔄 Relancer</button>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── CALCULATEUR TRAVAUX ─────────────────────────────────────────────────────
const REGIONS_FR = [
  "Île-de-France","Auvergne-Rhône-Alpes","Provence-Alpes-Côte d'Azur","Occitanie",
  "Nouvelle-Aquitaine","Grand Est","Hauts-de-France","Bretagne","Normandie",
  "Pays de la Loire","Bourgogne-Franche-Comté","Centre-Val de Loire","Corse",
];

// ─── POSTES TRAVAUX DÉTAILLÉS ────────────────────────────────────────────────
const POSTES_TRAVAUX_DETAIL = [
  {
    id: "toiture", label: "Toiture & Charpente", icon: "🏚️",
    sousPostes: [
      { id: "t1", label: "Remplacement tuiles / ardoises (partiel)", unite: "m²", prixMin: 40, prixMax: 90 },
      { id: "t2", label: "Réfection complète toiture", unite: "m²", prixMin: 80, prixMax: 180 },
      { id: "t3", label: "Réparation charpente (renforts)", unite: "forfait", prixMin: 1500, prixMax: 6000 },
      { id: "t4", label: "Remplacement charpente complète", unite: "m²", prixMin: 60, prixMax: 130 },
      { id: "t5", label: "Zinguerie (gouttières, noues)", unite: "ml", prixMin: 30, prixMax: 80 },
      { id: "t6", label: "Velux / fenêtre de toit", unite: "unité", prixMin: 800, prixMax: 2500 },
    ]
  },
  {
    id: "facade", label: "Façade & Ravalement", icon: "🧱",
    sousPostes: [
      { id: "f1", label: "Peinture façade seule", unite: "m²", prixMin: 10, prixMax: 25 },
      { id: "f2", label: "Enduit de finition (crépi)", unite: "m²", prixMin: 20, prixMax: 50 },
      { id: "f3", label: "Ravalement complet (piquage + enduit)", unite: "m²", prixMin: 40, prixMax: 100 },
      { id: "f4", label: "Réparation fissures (injection résine)", unite: "ml", prixMin: 30, prixMax: 80 },
      { id: "f5", label: "Isolation thermique extérieure (ITE)", unite: "m²", prixMin: 80, prixMax: 180 },
      { id: "f6", label: "Bardage bois / composite", unite: "m²", prixMin: 60, prixMax: 140 },
    ]
  },
  {
    id: "electricite", label: "Électricité", icon: "⚡",
    sousPostes: [
      { id: "e1", label: "Mise aux normes tableau électrique", unite: "forfait", prixMin: 800, prixMax: 2000 },
      { id: "e2", label: "Remplacement tableau + disjoncteurs", unite: "forfait", prixMin: 1200, prixMax: 3000 },
      { id: "e3", label: "Mise aux normes complète (logement)", unite: "m²", prixMin: 50, prixMax: 100 },
      { id: "e4", label: "Ajout prises / interrupteurs", unite: "unité", prixMin: 60, prixMax: 150 },
      { id: "e5", label: "Mise à la terre complète", unite: "forfait", prixMin: 500, prixMax: 1500 },
      { id: "e6", label: "Câblage réseau / fibre / domotique", unite: "forfait", prixMin: 800, prixMax: 3000 },
    ]
  },
  {
    id: "plomberie", label: "Plomberie", icon: "🚿",
    sousPostes: [
      { id: "p1", label: "Remplacement robinetterie (lavabo, WC)", unite: "unité", prixMin: 150, prixMax: 400 },
      { id: "p2", label: "Réfection salle de bain complète", unite: "forfait", prixMin: 4000, prixMax: 12000 },
      { id: "p3", label: "Remplacement tuyauterie (cuivre/PER)", unite: "forfait", prixMin: 2000, prixMax: 8000 },
      { id: "p4", label: "Installation WC suspendu", unite: "unité", prixMin: 600, prixMax: 1800 },
      { id: "p5", label: "Ballon eau chaude / chauffe-eau", unite: "unité", prixMin: 500, prixMax: 1500 },
      { id: "p6", label: "Douche à l'italienne", unite: "unité", prixMin: 1500, prixMax: 4000 },
    ]
  },
  {
    id: "chauffage", label: "Chauffage", icon: "🔥",
    sousPostes: [
      { id: "ch1", label: "Remplacement chaudière gaz", unite: "forfait", prixMin: 2500, prixMax: 6000 },
      { id: "ch2", label: "Pompe à chaleur air/air", unite: "forfait", prixMin: 3000, prixMax: 8000 },
      { id: "ch3", label: "Pompe à chaleur air/eau", unite: "forfait", prixMin: 8000, prixMax: 18000 },
      { id: "ch4", label: "Radiateurs électriques (inertie)", unite: "unité", prixMin: 250, prixMax: 700 },
      { id: "ch5", label: "Remplacement radiateurs eau", unite: "unité", prixMin: 300, prixMax: 800 },
      { id: "ch6", label: "Plancher chauffant (rénovation)", unite: "m²", prixMin: 60, prixMax: 130 },
      { id: "ch7", label: "Poêle à bois / insert", unite: "unité", prixMin: 2000, prixMax: 6000 },
    ]
  },
  {
    id: "isolation", label: "Isolation", icon: "🌡️",
    sousPostes: [
      { id: "i1", label: "Isolation combles perdus (soufflage)", unite: "m²", prixMin: 15, prixMax: 35 },
      { id: "i2", label: "Isolation combles aménagés", unite: "m²", prixMin: 25, prixMax: 60 },
      { id: "i3", label: "Isolation murs intérieure (ITI)", unite: "m²", prixMin: 30, prixMax: 70 },
      { id: "i4", label: "Isolation plancher bas", unite: "m²", prixMin: 20, prixMax: 50 },
      { id: "i5", label: "Isolation cave / vide sanitaire", unite: "m²", prixMin: 15, prixMax: 40 },
    ]
  },
  {
    id: "menuiseries", label: "Menuiseries & Vitrages", icon: "🪟",
    sousPostes: [
      { id: "m1", label: "Fenêtre PVC double vitrage", unite: "unité", prixMin: 350, prixMax: 700 },
      { id: "m2", label: "Fenêtre ALU double vitrage", unite: "unité", prixMin: 500, prixMax: 1000 },
      { id: "m3", label: "Fenêtre bois double vitrage", unite: "unité", prixMin: 600, prixMax: 1200 },
      { id: "m4", label: "Porte d'entrée (sécurité)", unite: "unité", prixMin: 800, prixMax: 2500 },
      { id: "m5", label: "Porte de garage (motorisée)", unite: "unité", prixMin: 1500, prixMax: 4000 },
      { id: "m6", label: "Volets roulants (électriques)", unite: "unité", prixMin: 400, prixMax: 900 },
      { id: "m7", label: "Garde-corps / rampe escalier", unite: "ml", prixMin: 150, prixMax: 400 },
    ]
  },
  {
    id: "sols", label: "Sols", icon: "🏠",
    sousPostes: [
      { id: "s1", label: "Carrelage (pose + fourniture)", unite: "m²", prixMin: 35, prixMax: 80 },
      { id: "s2", label: "Parquet massif (pose + fourniture)", unite: "m²", prixMin: 50, prixMax: 120 },
      { id: "s3", label: "Parquet stratifié / contrecollé", unite: "m²", prixMin: 25, prixMax: 60 },
      { id: "s4", label: "Béton ciré / résine", unite: "m²", prixMin: 60, prixMax: 150 },
      { id: "s5", label: "Ragréage / remise à niveau", unite: "m²", prixMin: 15, prixMax: 35 },
      { id: "s6", label: "Démolition ancien revêtement", unite: "m²", prixMin: 8, prixMax: 20 },
    ]
  },
  {
    id: "cloisons", label: "Cloisons & Plâtrerie", icon: "🧱",
    sousPostes: [
      { id: "cl1", label: "Cloison placo (fourniture + pose)", unite: "m²", prixMin: 30, prixMax: 70 },
      { id: "cl2", label: "Démolition cloison existante", unite: "m²", prixMin: 15, prixMax: 40 },
      { id: "cl3", label: "Faux plafond placo", unite: "m²", prixMin: 25, prixMax: 60 },
      { id: "cl4", label: "Enduit / rebouchage murs", unite: "m²", prixMin: 10, prixMax: 25 },
      { id: "cl5", label: "Isolation phonique cloison", unite: "m²", prixMin: 40, prixMax: 90 },
    ]
  },
  {
    id: "peinture", label: "Peinture intérieure", icon: "🎨",
    sousPostes: [
      { id: "pe1", label: "Peinture murs (lasure 2 couches)", unite: "m²", prixMin: 8, prixMax: 18 },
      { id: "pe2", label: "Peinture murs + plafonds", unite: "m²", prixMin: 12, prixMax: 28 },
      { id: "pe3", label: "Peinture avec préparation (enduit)", unite: "m²", prixMin: 18, prixMax: 40 },
      { id: "pe4", label: "Papier peint (pose + fourniture)", unite: "m²", prixMin: 20, prixMax: 50 },
      { id: "pe5", label: "Peinture boiseries / huisseries", unite: "ml", prixMin: 10, prixMax: 25 },
    ]
  },
  {
    id: "cuisine", label: "Cuisine", icon: "🍳",
    sousPostes: [
      { id: "cu1", label: "Cuisine équipée entrée de gamme", unite: "forfait", prixMin: 3000, prixMax: 6000 },
      { id: "cu2", label: "Cuisine équipée milieu de gamme", unite: "forfait", prixMin: 6000, prixMax: 12000 },
      { id: "cu3", label: "Cuisine équipée haut de gamme", unite: "forfait", prixMin: 12000, prixMax: 30000 },
      { id: "cu4", label: "Remplacement plan de travail seul", unite: "ml", prixMin: 150, prixMax: 400 },
      { id: "cu5", label: "Carrelage / crédence cuisine", unite: "m²", prixMin: 40, prixMax: 90 },
    ]
  },
  {
    id: "gros_oeuvre", label: "Gros œuvre & Démolition", icon: "⛏️",
    sousPostes: [
      { id: "g1", label: "Abattage mur porteur (avec IPN)", unite: "ml", prixMin: 800, prixMax: 2500 },
      { id: "g2", label: "Abattage cloison non porteuse", unite: "m²", prixMin: 30, prixMax: 80 },
      { id: "g3", label: "Traitement humidité (injection)", unite: "ml", prixMin: 80, prixMax: 200 },
      { id: "g4", label: "Reprise de fissures structurelles", unite: "ml", prixMin: 100, prixMax: 300 },
      { id: "g5", label: "Création ou agrandissement ouverture", unite: "unité", prixMin: 1500, prixMax: 5000 },
      { id: "g6", label: "Évacuation gravats (benne)", unite: "forfait", prixMin: 300, prixMax: 1000 },
    ]
  },
  {
    id: "vmc", label: "VMC & Ventilation", icon: "💨",
    sousPostes: [
      { id: "v1", label: "VMC simple flux (pose complète)", unite: "forfait", prixMin: 600, prixMax: 1500 },
      { id: "v2", label: "VMC double flux", unite: "forfait", prixMin: 3000, prixMax: 7000 },
      { id: "v3", label: "Remplacement VMC existante", unite: "forfait", prixMin: 300, prixMax: 800 },
      { id: "v4", label: "Grilles de ventilation", unite: "unité", prixMin: 50, prixMax: 150 },
    ]
  },
];

async function fetchPrixTravauxDetail(sousPostesActifs, region, annee) {
  if (!sousPostesActifs.length) return null;
  const liste = sousPostesActifs.map(p => `- ${p.label} (${p.unite})`).join("\n");
  const prompt = `Expert chiffrage travaux immobiliers France. Donne les prix unitaires actuels ${annee} pour ces travaux en ${region}.

${liste}

Réponds UNIQUEMENT en JSON valide :
{"postes":[{"id":"t1","prixMin":40,"prixMax":90,"note":"info marché court"},...]}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1500, messages: [{ role: "user", content: prompt }] })
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  const data = await response.json();
  const raw = (data.content || []).map(i => i.text || "").join("").trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Réponse invalide");
  try { return JSON.parse(match[0]); }
  catch { return JSON.parse(match[0].replace(/[\u0000-\u001F\u007F]/g, " ").replace(/,\s*([}\]])/g, "$1")); }
}

function CalculateurTravaux({ bien, onChange }) {
  const surface = bien.typeBien === "Immeuble" && bien.lots?.length
    ? bien.lots.reduce((s, l) => s + (l.surface || 0), 0) : bien.surface;
  const annee = new Date().getFullYear();

  // État : pour chaque sous-poste { actif, quantite, niveau, prixIA, noteIA }
  const [detail, setDetail] = useState(() => {
    const d = {};
    POSTES_TRAVAUX_DETAIL.forEach(p => {
      p.sousPostes.forEach(sp => {
        d[sp.id] = { actif: false, quantite: sp.unite === "m²" ? surface : 1, niveau: "standard", prixIA: null, noteIA: "" };
      });
    });
    return d;
  });
  const [openPostes, setOpenPostes] = useState({});
  const [region, setRegion] = useState(() => {
    const adresse = (bien.adresse || "").toLowerCase();
    if (adresse.includes("paris") || adresse.includes("75")) return "Île-de-France";
    if (adresse.includes("lyon") || adresse.includes("69")) return "Auvergne-Rhône-Alpes";
    if (adresse.includes("marseille") || adresse.includes("13")) return "Provence-Alpes-Côte d'Azur";
    if (adresse.includes("toulouse") || adresse.includes("31")) return "Occitanie";
    if (adresse.includes("bordeaux") || adresse.includes("33")) return "Nouvelle-Aquitaine";
    return "Auvergne-Rhône-Alpes";
  });
  const [marge, setMarge] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [prixIAActifs, setPrixIAActifs] = useState(false);

  const togglePoste = id => setOpenPostes(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleSP = id => setDetail(prev => ({ ...prev, [id]: { ...prev[id], actif: !prev[id].actif } }));
  const updateSP = (id, key, val) => setDetail(prev => ({ ...prev, [id]: { ...prev[id], [key]: val } }));

  const getPrixUnit = (sp, d) => {
    if (d.prixIA !== null) return d.prixIA;
    return d.niveau === "eco" ? sp.prixMin : d.niveau === "premium" ? sp.prixMax : Math.round((sp.prixMin + sp.prixMax) / 2);
  };

  const totalParPoste = POSTES_TRAVAUX_DETAIL.map(p => ({
    ...p,
    total: p.sousPostes.reduce((s, sp) => {
      const d = detail[sp.id];
      return d.actif ? s + getPrixUnit(sp, d) * d.quantite : s;
    }, 0),
    nbActifs: p.sousPostes.filter(sp => detail[sp.id].actif).length,
  }));

  const total = totalParPoste.reduce((s, p) => s + p.total, 0);
  const totalAvecMarge = Math.round(total * (1 + marge / 100));

  const lancerIA = async () => {
    const actifs = [];
    POSTES_TRAVAUX_DETAIL.forEach(p => p.sousPostes.forEach(sp => { if (detail[sp.id].actif) actifs.push({ ...sp }); }));
    if (!actifs.length) { setError("Coche au moins un sous-poste !"); return; }
    setLoading(true); setError("");
    try {
      const result = await fetchPrixTravauxDetail(actifs, region, annee);
      if (!result?.postes) throw new Error("Pas de résultat");
      const newDetail = { ...detail };
      result.postes.forEach(r => {
        if (newDetail[r.id]) {
          const d = newDetail[r.id];
          const sp = POSTES_TRAVAUX_DETAIL.flatMap(p => p.sousPostes).find(s => s.id === r.id);
          if (!sp) return;
          const prix = d.niveau === "eco" ? r.prixMin : d.niveau === "premium" ? r.prixMax : Math.round((r.prixMin + r.prixMax) / 2);
          newDetail[r.id] = { ...d, prixIA: prix, noteIA: r.note || "", prixMin: r.prixMin, prixMax: r.prixMax };
        }
      });
      setDetail(newDetail);
      setPrixIAActifs(true);
    } catch (e) { setError("Erreur IA : " + e.message); }
    finally { setLoading(false); }
  };

  const resetIA = () => {
    setDetail(prev => {
      const n = { ...prev };
      Object.keys(n).forEach(k => { n[k] = { ...n[k], prixIA: null, noteIA: "" }; });
      return n;
    });
    setPrixIAActifs(false);
  };

  const nbActifsTotal = Object.values(detail).filter(d => d.actif).length;

  return (
    <div>
      <STitle accent={T.orange}>🔨 Calculateur de travaux détaillé — {annee}</STitle>

      {/* Région + IA */}
      <Card style={{ padding: 16, marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, marginBottom: 12, alignItems: "end" }}>
          <div>
            <label style={{ display: "block", fontSize: 11, color: T.textMuted, marginBottom: 5, textTransform: "uppercase", fontWeight: 600 }}>📍 Région</label>
            <select value={region} onChange={e => { setRegion(e.target.value); resetIA(); }} style={{ width: "100%", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "7px 10px", fontSize: 12, color: T.text, outline: "none" }}>
              {REGIONS_FR.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <button onClick={lancerIA} disabled={loading || nbActifsTotal === 0} style={{ padding: "8px 14px", background: loading ? T.surface3 : prixIAActifs ? T.green+"20" : "linear-gradient(135deg,#7c3aed,#4a9eff)", color: prixIAActifs ? T.green : "white", border: `1px solid ${prixIAActifs ? T.green+"40" : "transparent"}`, borderRadius: 9, fontWeight: 700, fontSize: 12, cursor: loading || nbActifsTotal === 0 ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
            {loading ? "⏳ Analyse..." : prixIAActifs ? "✅ Prix IA actifs" : `🤖 Prix IA ${annee}`}
          </button>
        </div>
        {error && <div style={{ color: T.red, fontSize: 11 }}>⚠️ {error}</div>}
        {prixIAActifs && <div style={{ fontSize: 10, color: T.green }}>✓ Prix actualisés {annee} pour {region} — {nbActifsTotal} sous-poste(s)</div>}
      </Card>

      {/* Totaux */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <Card style={{ padding: 14, textAlign: "center", border: `1px solid ${T.orange}30` }}>
          <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", marginBottom: 3 }}>Total HT ({nbActifsTotal} postes)</div>
          <div style={{ fontSize: 26, fontWeight: 400, fontFamily: "DM Serif Display, serif", color: T.orange }}>{fmtEur(total)}</div>
        </Card>
        <Card style={{ padding: 14, textAlign: "center", border: `1px solid ${T.red}30` }}>
          <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", marginBottom: 3 }}>
            Avec imprévus : {[5,10,15,20].map(m => <button key={m} onClick={() => setMarge(m)} style={{ marginLeft: 4, padding: "1px 6px", border: `1px solid ${marge===m?T.gold+"60":T.border}`, borderRadius: 4, background: marge===m?T.gold+"18":"transparent", color: marge===m?T.gold:T.textMuted, fontSize: 9, fontWeight: 700, cursor: "pointer" }}>{m}%</button>)}
          </div>
          <div style={{ fontSize: 26, fontWeight: 400, fontFamily: "DM Serif Display, serif", color: T.red }}>{fmtEur(totalAvecMarge)}</div>
        </Card>
      </div>

      {/* Postes détaillés */}
      <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        {POSTES_TRAVAUX_DETAIL.map(poste => {
          const isOpen = openPostes[poste.id];
          const pTotal = totalParPoste.find(p => p.id === poste.id);
          return (
            <Card key={poste.id} style={{ overflow: "hidden" }}>
              {/* Header poste */}
              <div onClick={() => togglePoste(poste.id)} style={{ padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, background: pTotal.nbActifs > 0 ? T.orange+"08" : T.surface2 }}>
                <span style={{ fontSize: 18 }}>{poste.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: pTotal.nbActifs > 0 ? T.text : T.textSub }}>{poste.label}</div>
                  <div style={{ fontSize: 11, color: T.textMuted }}>{pTotal.nbActifs > 0 ? `${pTotal.nbActifs} sous-poste(s) sélectionné(s)` : `${poste.sousPostes.length} sous-postes disponibles`}</div>
                </div>
                {pTotal.total > 0 && <div style={{ fontSize: 14, fontWeight: 700, color: T.orange, marginRight: 8 }}>{fmtEur(pTotal.total)}</div>}
                <span style={{ color: T.textMuted, fontSize: 12 }}>{isOpen ? "▲" : "▼"}</span>
              </div>

              {/* Sous-postes */}
              {isOpen && (
                <div style={{ padding: "8px 14px 12px", background: T.surface }}>
                  {poste.sousPostes.map(sp => {
                    const d = detail[sp.id];
                    const prixUnit = getPrixUnit(sp, d);
                    const prixTotal = prixUnit * d.quantite;
                    return (
                      <div key={sp.id} style={{ background: d.actif ? T.surface2 : "transparent", border: `1px solid ${d.actif ? T.orange+"30" : T.border}`, borderRadius: 8, padding: "9px 11px", marginBottom: 6 }}>
                        {/* Ligne titre */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => toggleSP(sp.id)}>
                          <div style={{ width: 18, height: 18, border: `2px solid ${d.actif ? T.orange : T.border}`, borderRadius: 4, background: d.actif ? T.orange : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {d.actif && <span style={{ color: T.bg, fontSize: 11, fontWeight: 900 }}>✓</span>}
                          </div>
                          <span style={{ flex: 1, fontSize: 12, color: d.actif ? T.text : T.textSub, fontWeight: d.actif ? 600 : 400 }}>{sp.label}</span>
                          {d.actif && <span style={{ fontSize: 12, fontWeight: 700, color: T.orange }}>{fmtEur(prixTotal)}</span>}
                          <span style={{ fontSize: 10, color: T.textMuted }}>{fmtEur(Math.round((sp.prixMin+sp.prixMax)/2))}/{sp.unite}</span>
                        </div>
                        {/* Détails si actif */}
                        {d.actif && (
                          <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                            {/* Quantité */}
                            <div>
                              <div style={{ fontSize: 9, color: T.textMuted, marginBottom: 3, textTransform: "uppercase" }}>Quantité ({sp.unite})</div>
                              <div style={{ display: "flex", alignItems: "center", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6 }}>
                                <input type="number" value={d.quantite} min={1} onFocus={e => e.target.select()} onChange={e => updateSP(sp.id, "quantite", parseFloat(e.target.value)||1)} style={{ flex: 1, border: "none", background: "transparent", padding: "5px 7px", fontSize: 12, color: T.text, outline: "none" }} />
                                <span style={{ padding: "0 6px", fontSize: 9, color: T.textMuted }}>{sp.unite}</span>
                              </div>
                            </div>
                            {/* Niveau */}
                            <div>
                              <div style={{ fontSize: 9, color: T.textMuted, marginBottom: 3, textTransform: "uppercase" }}>Niveau</div>
                              <div style={{ display: "flex", gap: 3 }}>
                                {[["eco","Éco"],["standard","Std"],["premium","Pro"]].map(([val, lbl]) => (
                                  <button key={val} onClick={() => {
                                    const newNiveau = val;
                                    let newPrixIA = d.prixIA;
                                    if (d.prixMin !== undefined && d.prixIA !== null) {
                                      newPrixIA = val === "eco" ? d.prixMin : val === "premium" ? d.prixMax : Math.round((d.prixMin+d.prixMax)/2);
                                    }
                                    updateSP(sp.id, "niveau", newNiveau);
                                    if (newPrixIA !== d.prixIA) updateSP(sp.id, "prixIA", newPrixIA);
                                  }} style={{ flex: 1, padding: "4px 2px", border: `1px solid ${d.niveau===val?T.gold+"60":T.border}`, borderRadius: 4, background: d.niveau===val?T.gold+"18":"transparent", color: d.niveau===val?T.gold:T.textMuted, fontSize: 9, fontWeight: 700, cursor: "pointer" }}>{lbl}</button>
                                ))}
                              </div>
                            </div>
                            {/* Prix */}
                            <div>
                              <div style={{ fontSize: 9, color: T.textMuted, marginBottom: 3, textTransform: "uppercase" }}>Prix unitaire</div>
                              <div style={{ background: T.surface, border: `1px solid ${prixIAActifs && d.prixIA !== null ? T.green+"40" : T.border}`, borderRadius: 6, padding: "5px 7px", fontSize: 12, fontWeight: 700, color: prixIAActifs && d.prixIA !== null ? T.green : T.text }}>
                                {fmtEur(prixUnit)}/{sp.unite}
                                {prixIAActifs && d.prixIA !== null && <span style={{ fontSize: 8, color: T.green, display: "block" }}>IA {annee}</span>}
                              </div>
                            </div>
                          </div>
                        )}
                        {d.actif && d.noteIA && <div style={{ marginTop: 6, fontSize: 10, color: T.blue }}>🤖 {d.noteIA}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {total > 0 && (
        <button onClick={() => onChange({ ...bien, travaux: totalAvecMarge })} style={{ width: "100%", background: `linear-gradient(135deg,${T.orange},${T.gold})`, color: T.bg, border: "none", borderRadius: 12, padding: "14px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          ✅ Appliquer {fmtEur(totalAvecMarge)} dans le simulateur ({nbActifsTotal} postes)
        </button>
      )}
    </div>
  );
}

// ─── SIMULATION REVENTE ───────────────────────────────────────────────────────
function SimulationRevente({ bien, res }) {
  const [annee, setAnnee] = useState(10);
  const [tauxReval, setTauxReval] = useState(2);
  const rev = useMemo(() => calculerRevente(bien, res, annee, tauxReval), [bien, res, annee, tauxReval]);

  const data = useMemo(() => Array.from({ length: Math.min(bien.duree, 25) }, (_, i) => {
    const a = i + 1;
    const r = calculerRevente(bien, res, a, tauxReval);
    return { annee: `An ${a}`, gainNet: Math.round(r.gainTotal), prixRevente: Math.round(r.prixRevente), capitalRestant: Math.round(r.capitalRestantRevente), impot: Math.round(r.impotPV) };
  }), [bien, res, tauxReval]);

  const gainColor = rev.gainTotal >= 0 ? T.green : T.red;

  return (
    <div>
      <STitle accent={T.purple}>📈 Simulation de revente</STitle>
      <Card style={{ padding: 20, marginBottom: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, color: T.textMuted, marginBottom: 6, textTransform: "uppercase", fontWeight: 600 }}>Année de revente</label>
            <div style={{ display: "flex", gap: 5, marginBottom: 8, flexWrap: "wrap" }}>
              {[3, 5, 10, 15, 20].map(a => (
                <button key={a} onClick={() => setAnnee(a)} style={{ padding: "6px 12px", border: `1px solid ${annee === a ? T.purple + "60" : T.border}`, borderRadius: 7, background: annee === a ? T.purple + "18" : T.surface2, color: annee === a ? T.purple : T.textMuted, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>An {a}</button>
              ))}
            </div>
            <input type="range" min={1} max={Math.min(bien.duree, 25)} value={annee} onChange={e => setAnnee(parseInt(e.target.value))} style={{ width: "100%", accentColor: T.purple }} />
            <div style={{ textAlign: "center", fontSize: 12, color: T.purple, fontWeight: 700 }}>Année {annee}</div>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, color: T.textMuted, marginBottom: 6, textTransform: "uppercase", fontWeight: 600 }}>Revalorisation annuelle</label>
            <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
              {[0, 1, 2, 3, 5].map(t => (
                <button key={t} onClick={() => setTauxReval(t)} style={{ flex: 1, padding: "6px 4px", border: `1px solid ${tauxReval === t ? T.gold + "60" : T.border}`, borderRadius: 7, background: tauxReval === t ? T.gold + "18" : T.surface2, color: tauxReval === t ? T.gold : T.textMuted, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>{t}%</button>
              ))}
            </div>
          </div>
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>
        {[
          ["Prix de revente", fmtEur(Math.round(rev.prixRevente)), T.blue, ""],
          ["Plus-value nette", fmtEur(Math.round(rev.plusValueNette)), T.green, `Impôt PV: ${fmtEur(Math.round(rev.impotPV))}`],
          ["Capital restant dû", fmtEur(Math.round(rev.capitalRestantRevente)), T.orange, `Abattement IR: ${rev.abatIR}%`],
          ["Gain total net", fmtEur(Math.round(rev.gainTotal)), gainColor, `Rendement: ${fmt(rev.rendementGlobal, 1)}%`],
        ].map(([label, value, color, sub]) => (
          <Card key={label} style={{ padding: 16, textAlign: "center", border: `1px solid ${color}30` }}>
            <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 400, fontFamily: "DM Serif Display, serif", color }}>{value}</div>
            {sub && <div style={{ fontSize: 10, color: T.textMuted, marginTop: 4 }}>{sub}</div>}
          </Card>
        ))}
      </div>
      <Card style={{ padding: 20, marginBottom: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 14 }}>📊 Évolution du gain net selon l'année de revente</div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="gainGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={T.green} stopOpacity={0.3} />
                <stop offset="95%" stopColor={T.green} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
            <XAxis dataKey="annee" stroke={T.textMuted} tick={{ fontSize: 10 }} />
            <YAxis stroke={T.textMuted} tick={{ fontSize: 10 }} tickFormatter={v => Math.round(v/1000) + "k€"} />
            <Tooltip formatter={v => fmtEur(Math.round(v))} contentStyle={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12 }} />
            <Area type="monotone" dataKey="gainNet" stroke={T.green} fill="url(#gainGrad)" strokeWidth={2} name="Gain net" />
            <Area type="monotone" dataKey="prixRevente" stroke={T.blue} fill="none" strokeWidth={1.5} strokeDasharray="4 2" name="Prix revente" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>
      <Card style={{ padding: 16, background: rev.gainTotal >= 0 ? T.green + "08" : T.red + "08", border: `1px solid ${gainColor}30` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: gainColor, marginBottom: 6 }}>
          {rev.gainTotal >= 0 ? "✅ Opération rentable" : "⚠️ Opération déficitaire"} à {annee} an{annee > 1 ? "s" : ""}
        </div>
        <div style={{ fontSize: 12, color: T.textSub, lineHeight: 1.7 }}>
          Après {annee} ans : revente à {fmtEur(Math.round(rev.prixRevente))}, cash cumulé {fmtEur(Math.round(rev.cashTotalRecupere))}, impôt plus-value {fmtEur(Math.round(rev.impotPV))} ({rev.abatIR}% d'abattement). Gain net total : <strong style={{ color: gainColor }}>{fmtEur(Math.round(rev.gainTotal))}</strong> pour un apport de {fmtEur(bien.apport)}.
        </div>
      </Card>
    </div>
  );
}

// ─── ALERTE RENTABILITÉ ───────────────────────────────────────────────────────
function AlerteRentabilite({ bien, res, onChange }) {
  const [cibleRenta, setCibleRenta] = useState(8);
  const [cibleCash, setCibleCash] = useState(200);
  const [cibleScore, setCibleScore] = useState(18);

  // Prix max pour atteindre la renta nette cible
  const charges = res.charges;
  const loyerAnnuel = res.loyerAnnuel;
  const prixMaxRenta = loyerAnnuel > 0 ? Math.round((loyerAnnuel - charges) / (cibleRenta / 100)) : 0;
  const prixMaxNotaire = Math.round(prixMaxRenta / 1.085);

  // Loyer min pour le cash-flow cible
  const loyerMinCash = Math.round(res.mensualiteTotale + (charges / 12) + cibleCash);
  const loyerMinRenta = loyerAnnuel > 0 ? Math.round(Math.sqrt((cibleRenta / 100) * res.coutTotal * loyerAnnuel / 12 * 12)) : 0;

  // Écarts actuels
  const ecartPrix = bien.prix - prixMaxNotaire;
  const ecartLoyer = loyerMinCash - (bien.typeBien === "Immeuble" && bien.lots?.length ? bien.lots.reduce((s,l)=>s+l.loyer,0) : bien.loyer);

  return (
    <div>
      <STitle accent={T.green}>🎯 Calculateur de rentabilité cible</STitle>
      <Card style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.textMuted, marginBottom: 14, textTransform: "uppercase" }}>Tes objectifs</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, color: T.textMuted, marginBottom: 6, textTransform: "uppercase" }}>Renta nette cible</label>
            <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
              {[5, 6, 7, 8, 10].map(v => (
                <button key={v} onClick={() => setCibleRenta(v)} style={{ flex: 1, padding: "5px 2px", border: `1px solid ${cibleRenta === v ? T.green + "60" : T.border}`, borderRadius: 6, background: cibleRenta === v ? T.green + "18" : T.surface2, color: cibleRenta === v ? T.green : T.textMuted, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>{v}%</button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, color: T.textMuted, marginBottom: 6, textTransform: "uppercase" }}>Cash-flow min/mois</label>
            <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
              {[0, 100, 200, 300, 500].map(v => (
                <button key={v} onClick={() => setCibleCash(v)} style={{ flex: 1, padding: "5px 2px", border: `1px solid ${cibleCash === v ? T.blue + "60" : T.border}`, borderRadius: 6, background: cibleCash === v ? T.blue + "18" : T.surface2, color: cibleCash === v ? T.blue : T.textMuted, fontWeight: 700, fontSize: 10, cursor: "pointer" }}>{v}€</button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, color: T.textMuted, marginBottom: 6, textTransform: "uppercase" }}>Score minimum</label>
            <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
              {[12, 15, 18, 20, 22].map(v => (
                <button key={v} onClick={() => setCibleScore(v)} style={{ flex: 1, padding: "5px 2px", border: `1px solid ${cibleScore === v ? T.gold + "60" : T.border}`, borderRadius: 6, background: cibleScore === v ? T.gold + "18" : T.surface2, color: cibleScore === v ? T.gold : T.textMuted, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>{v}</button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
        {/* Prix max */}
        <Card style={{ padding: 20, border: `1px solid ${ecartPrix <= 0 ? T.green + "40" : T.red + "40"}` }}>
          <div style={{ fontSize: 11, color: T.textMuted, textTransform: "uppercase", marginBottom: 8 }}>💰 Prix max d'achat</div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4 }}>Pour atteindre {cibleRenta}% de renta nette :</div>
          <div style={{ fontSize: 28, fontWeight: 400, fontFamily: "DM Serif Display, serif", color: ecartPrix <= 0 ? T.green : T.red, marginBottom: 6 }}>{fmtEur(prixMaxNotaire)}</div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 10 }}>Frais notaire inclus : {fmtEur(prixMaxRenta)}</div>
          {ecartPrix > 0 ? (
            <div style={{ background: T.red + "12", border: `1px solid ${T.red}25`, borderRadius: 8, padding: "8px 12px", fontSize: 12, color: T.red }}>
              ⚠️ Tu dois négocier <strong>{fmtEur(ecartPrix)}</strong> de baisse
              <button onClick={() => onChange({ ...bien, prix: prixMaxNotaire })} style={{ display: "block", marginTop: 6, background: T.red + "20", border: `1px solid ${T.red}40`, borderRadius: 6, padding: "4px 10px", color: T.red, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Appliquer ce prix</button>
            </div>
          ) : (
            <div style={{ background: T.green + "12", border: `1px solid ${T.green}25`, borderRadius: 8, padding: "8px 12px", fontSize: 12, color: T.green }}>✅ Prix actuel OK pour cet objectif</div>
          )}
        </Card>

        {/* Loyer min */}
        <Card style={{ padding: 20, border: `1px solid ${ecartLoyer <= 0 ? T.green + "40" : T.orange + "40"}` }}>
          <div style={{ fontSize: 11, color: T.textMuted, textTransform: "uppercase", marginBottom: 8 }}>🏠 Loyer minimum</div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4 }}>Pour un cash-flow de +{cibleCash}€/mois :</div>
          <div style={{ fontSize: 28, fontWeight: 400, fontFamily: "DM Serif Display, serif", color: ecartLoyer <= 0 ? T.green : T.orange, marginBottom: 6 }}>{fmtEur(loyerMinCash)}/mois</div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 10 }}>Mensualité : {fmtEur(Math.round(res.mensualiteTotale))} + Charges : {fmtEur(Math.round(res.charges / 12))}</div>
          {ecartLoyer > 0 ? (
            <div style={{ background: T.orange + "12", border: `1px solid ${T.orange}25`, borderRadius: 8, padding: "8px 12px", fontSize: 12, color: T.orange }}>
              📊 Il te manque <strong>{fmtEur(ecartLoyer)}</strong>/mois de loyer
            </div>
          ) : (
            <div style={{ background: T.green + "12", border: `1px solid ${T.green}25`, borderRadius: 8, padding: "8px 12px", fontSize: 12, color: T.green }}>✅ Loyer actuel suffisant</div>
          )}
        </Card>
      </div>

      {/* Résumé */}
      <Card style={{ padding: 20, background: res.score >= cibleScore ? T.green + "06" : T.red + "06", border: `1px solid ${res.score >= cibleScore ? T.green : T.red}25` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: res.score >= cibleScore ? T.green : T.red, marginBottom: 12 }}>
          {res.score >= cibleScore ? "🎯 Objectifs atteints !" : "📋 Actions nécessaires"}
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {[
            [res.rentaNette >= cibleRenta, `Renta nette ${fmtPct(res.rentaNette)} / cible ${cibleRenta}%`],
            [res.cashflowMensuel >= cibleCash, `Cash-flow ${fmtEur(Math.round(res.cashflowMensuel))}/mois / cible ${cibleCash}€`],
            [res.score >= cibleScore, `Score ${res.score}/25 / cible ${cibleScore}/25`],
            [res.dscr >= 1.2, `DSCR ${fmt(res.dscr, 2)} / minimum recommandé 1.2`],
          ].map(([ok, label], i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: ok ? T.green : T.red }}>
              <span>{ok ? "✅" : "❌"}</span> {label}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── MODE MARCHAND DE BIENS ──────────────────────────────────────────────────
function MarchandBiens({ bien, res }) {
  const [prixRevente, setPrixRevente] = useState(Math.round(bien.prix * 1.20));
  const [dureePortage, setDureePortage] = useState(12);
  const [coutFinancement, setCoutFinancement] = useState(bien.taux);
  const [fraisAgence, setFraisAgence] = useState(5);
  const [tvaOption, setTvaOption] = useState("marge"); // marge ou totale

  const surface = bien.typeBien === "Immeuble" && bien.lots?.length
    ? bien.lots.reduce((s, l) => s + (l.surface || 0), 0) : bien.surface;

  // Calculs marchand de biens
  const prixAchatHT = bien.prix;
  const fraisNotaire = bien.prix * 0.085;
  const coutTravaux = bien.travaux || 0;
  const fraisPortage = (bien.prix * coutFinancement / 100) * (dureePortage / 12);
  const fraisAgenceMontant = prixRevente * fraisAgence / 100;
  const coutTotal = prixAchatHT + fraisNotaire + coutTravaux + fraisPortage + fraisAgenceMontant;

  // TVA sur marge
  const marge = prixRevente - prixAchatHT;
  const tvaBase = tvaOption === "marge" ? marge : prixRevente;
  const tva = Math.max(0, tvaBase * 0.20);
  const margeNette = prixRevente - coutTotal - tva;
  const margePct = ((margeNette / coutTotal) * 100);

  // IS sur bénéfice
  const isBase = Math.max(0, margeNette);
  const is = isBase <= 42500 ? isBase * 0.15 : 42500 * 0.15 + (isBase - 42500) * 0.25;
  const beneficeNet = margeNette - is;
  const roi = coutTotal > 0 ? (beneficeNet / coutTotal) * 100 : 0;
  const roiAnnualise = dureePortage > 0 ? (roi / dureePortage) * 12 : 0;

  // Prix de revente minimum
  const prixMinRevente = Math.round(coutTotal / (1 - 0.20 * (tvaOption === "marge" ? 0 : 1)) + tva);
  const prixMinRentable = Math.round(coutTotal * 1.10); // 10% marge mini

  const margeColor = margeNette >= 0 ? T.green : T.red;

  return (
    <div>
      <STitle accent={T.purple}>🏗️ Mode Marchand de Biens</STitle>

      {/* Paramètres */}
      <Card style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, color: T.textMuted, marginBottom: 4, textTransform: "uppercase", fontWeight: 600 }}>Prix de revente visé</label>
            <div style={{ display: "flex", alignItems: "center", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 9, overflow: "hidden" }}>
              <input type="number" value={prixRevente} min={0} step={1000} onFocus={e => e.target.select()} onChange={e => setPrixRevente(parseFloat(e.target.value) || 0)} style={{ flex: 1, border: "none", background: "transparent", padding: "8px 11px", fontSize: 13, color: T.gold, fontWeight: 700, outline: "none" }} />
              <span style={{ padding: "0 9px", color: T.textMuted, fontSize: 11 }}>€</span>
            </div>
            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 3 }}>{surface > 0 ? `${Math.round(prixRevente / surface).toLocaleString("fr-FR")} €/m²` : ""}</div>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, color: T.textMuted, marginBottom: 4, textTransform: "uppercase", fontWeight: 600 }}>Durée de portage</label>
            <div style={{ display: "flex", gap: 5 }}>
              {[6, 12, 18, 24].map(d => (
                <button key={d} onClick={() => setDureePortage(d)} style={{ flex: 1, padding: "7px 4px", border: `1px solid ${dureePortage === d ? T.purple + "60" : T.border}`, borderRadius: 7, background: dureePortage === d ? T.purple + "18" : T.surface2, color: dureePortage === d ? T.purple : T.textMuted, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>{d}m</button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, color: T.textMuted, marginBottom: 4, textTransform: "uppercase", fontWeight: 600 }}>Taux financement %</label>
            <div style={{ display: "flex", alignItems: "center", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 9, overflow: "hidden" }}>
              <input type="number" value={coutFinancement} min={0} step={0.1} onFocus={e => e.target.select()} onChange={e => setCoutFinancement(parseFloat(e.target.value) || 0)} style={{ flex: 1, border: "none", background: "transparent", padding: "8px 11px", fontSize: 13, color: T.text, outline: "none" }} />
              <span style={{ padding: "0 9px", color: T.textMuted, fontSize: 11 }}>%</span>
            </div>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, color: T.textMuted, marginBottom: 4, textTransform: "uppercase", fontWeight: 600 }}>Frais agence vente %</label>
            <div style={{ display: "flex", alignItems: "center", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 9, overflow: "hidden" }}>
              <input type="number" value={fraisAgence} min={0} step={0.5} onFocus={e => e.target.select()} onChange={e => setFraisAgence(parseFloat(e.target.value) || 0)} style={{ flex: 1, border: "none", background: "transparent", padding: "8px 11px", fontSize: 13, color: T.text, outline: "none" }} />
              <span style={{ padding: "0 9px", color: T.textMuted, fontSize: 11 }}>%</span>
            </div>
          </div>
        </div>

        {/* TVA */}
        <div>
          <label style={{ display: "block", fontSize: 11, color: T.textMuted, marginBottom: 6, textTransform: "uppercase", fontWeight: 600 }}>Régime TVA</label>
          <div style={{ display: "flex", gap: 8 }}>
            {[["marge","TVA sur marge","Achat + revente immeuble ancien"],["totale","TVA sur prix total","Immeuble neuf ou VEFA"]].map(([val, lbl, desc]) => (
              <button key={val} onClick={() => setTvaOption(val)} style={{ flex: 1, padding: "10px", border: `1px solid ${tvaOption === val ? T.purple + "60" : T.border}`, borderRadius: 9, background: tvaOption === val ? T.purple + "18" : T.surface2, cursor: "pointer", textAlign: "left" }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: tvaOption === val ? T.purple : T.text }}>{lbl}</div>
                <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>{desc}</div>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Résultats clés */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
        <Card style={{ padding: 16, textAlign: "center", border: `1px solid ${margeColor}30` }}>
          <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", marginBottom: 4 }}>Bénéfice net IS</div>
          <div style={{ fontSize: 24, fontWeight: 400, fontFamily: "DM Serif Display, serif", color: margeColor }}>{fmtEur(Math.round(beneficeNet))}</div>
          <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>après TVA + IS</div>
        </Card>
        <Card style={{ padding: 16, textAlign: "center", border: `1px solid ${T.gold}30` }}>
          <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", marginBottom: 4 }}>ROI annualisé</div>
          <div style={{ fontSize: 24, fontWeight: 400, fontFamily: "DM Serif Display, serif", color: T.gold }}>{fmt(roiAnnualise, 1)}%</div>
          <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>sur {dureePortage} mois</div>
        </Card>
        <Card style={{ padding: 16, textAlign: "center", border: `1px solid ${T.blue}30` }}>
          <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", marginBottom: 4 }}>Marge brute</div>
          <div style={{ fontSize: 24, fontWeight: 400, fontFamily: "DM Serif Display, serif", color: T.blue }}>{fmt(margePct, 1)}%</div>
          <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>avant IS</div>
        </Card>
      </div>

      {/* Décomposition des coûts */}
      <Card style={{ padding: 18, marginBottom: 16 }}>
        <STitle accent={T.purple}>📊 Décomposition des coûts</STitle>
        {[
          ["Prix d'achat", prixAchatHT, T.text],
          ["Frais de notaire (8,5%)", fraisNotaire, T.textSub],
          ["Travaux", coutTravaux, T.orange],
          ["Frais de portage", fraisPortage, T.blue],
          ["Frais d'agence vente", fraisAgenceMontant, T.textSub],
          ["TVA (" + (tvaOption === "marge" ? "sur marge" : "totale") + ")", tva, T.red],
          ["IS (15%/25%)", is, T.red],
        ].map(([label, val, color], i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 12, color: T.textSub }}>{label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color }}>{fmtEur(Math.round(val))}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", marginTop: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Prix de vente</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: T.gold }}>{fmtEur(prixRevente)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: beneficeNet >= 0 ? T.green + "12" : T.red + "12", border: `1px solid ${beneficeNet >= 0 ? T.green : T.red}30`, borderRadius: 9 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: margeColor }}>💰 Bénéfice net final</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: margeColor }}>{fmtEur(Math.round(beneficeNet))}</span>
        </div>
      </Card>

      {/* Prix de revente minimum */}
      <Card style={{ padding: 18, border: `1px solid ${T.gold}30` }}>
        <STitle accent={T.gold}>🎯 Seuils à retenir</STitle>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ background: T.surface2, borderRadius: 9, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, color: T.textMuted }}>Prix de revente minimum (seuil 0)</div>
              <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>Pour ne pas perdre d'argent</div>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.red }}>{fmtEur(Math.round(coutTotal + tva))}</div>
          </div>
          <div style={{ background: T.surface2, borderRadius: 9, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, color: T.textMuted }}>Prix pour 10% de marge nette</div>
              <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>Minimum recommandé marchand de biens</div>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.orange }}>{fmtEur(Math.round(coutTotal * 1.10 + tva))}</div>
          </div>
          <div style={{ background: T.surface2, borderRadius: 9, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, color: T.textMuted }}>Prix pour 20% de marge nette</div>
              <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>Objectif confortable</div>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.green }}>{fmtEur(Math.round(coutTotal * 1.20 + tva))}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── TRI ──────────────────────────────────────────────────────────────────────
function CalculateurTRI({ bien, res }) {
  const [tauxReval, setTauxReval] = useState(2);
  const [anneeRevente, setAnneeRevente] = useState(10);

  const surface = bien.typeBien === "Immeuble" && bien.lots?.length
    ? bien.lots.reduce((s, l) => s + (l.surface || 0), 0) : bien.surface;

  const loyerMensuel = bien.typeBien === "Immeuble" && bien.lots?.length
    ? bien.lots.reduce((s, l) => s + (l.loyer || 0), 0) : bien.loyer;

  // Calcul TRI par bissection
  const calculerTRI = (fluxInitial, flux) => {
    let lo = -0.99, hi = 10.0;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      let npv = fluxInitial;
      flux.forEach((f, t) => { npv += f / Math.pow(1 + mid, t + 1); });
      if (Math.abs(npv) < 0.01) return mid * 100;
      if (npv > 0) lo = mid; else hi = mid;
    }
    return ((lo + hi) / 2) * 100;
  };

  const triData = useMemo(() => {
    const results = [];
    for (let annee = 3; annee <= Math.min(bien.duree, 25); annee++) {
      const rev = calculerRevente(bien, res, annee, tauxReval);
      const fluxInitial = -(res.aEmprunter > 0 ? bien.apport + bien.travaux : res.coutTotal);
      const flux = [];
      for (let m = 1; m <= annee * 12; m++) {
        flux.push(loyerMensuel - res.mensualiteTotale - (res.charges / 12));
      }
      // Ajouter prix de revente net - capital restant
      const idx = Math.min(annee * 12 - 1, res.amortissement.length - 1);
      const capRestant = idx >= 0 ? res.amortissement[idx].capitalRestant : 0;
      flux[flux.length - 1] += rev.plusValueNette - capRestant;

      // TRI annuel
      const fluxAnnuels = [];
      for (let a = 0; a < annee; a++) {
        const slice = flux.slice(a * 12, (a + 1) * 12);
        fluxAnnuels.push(slice.reduce((s, v) => s + v, 0));
      }
      const tri = calculerTRI(fluxInitial, fluxAnnuels);
      results.push({ annee, tri: Math.round(tri * 100) / 100, gainNet: Math.round(rev.gainTotal), prixRevente: Math.round(rev.prixRevente) });
    }
    return results;
  }, [bien, res, tauxReval, loyerMensuel]);

  const triActuel = triData.find(d => d.annee === anneeRevente);
  const triMax = triData.length ? triData.reduce((a, b) => a.tri > b.tri ? a : b) : null;
  const triColor = triActuel ? (triActuel.tri >= 10 ? T.green : triActuel.tri >= 5 ? T.gold : T.red) : T.textMuted;

  return (
    <div>
      <STitle accent={T.blue}>📊 Taux de Rendement Interne (TRI)</STitle>

      <Card style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, color: T.textMuted, marginBottom: 6, textTransform: "uppercase", fontWeight: 600 }}>Revalorisation annuelle</label>
            <div style={{ display: "flex", gap: 5 }}>
              {[0, 1, 2, 3, 5].map(t => (
                <button key={t} onClick={() => setTauxReval(t)} style={{ flex: 1, padding: "7px 4px", border: `1px solid ${tauxReval === t ? T.gold + "60" : T.border}`, borderRadius: 7, background: tauxReval === t ? T.gold + "18" : T.surface2, color: tauxReval === t ? T.gold : T.textMuted, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>{t}%</button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, color: T.textMuted, marginBottom: 6, textTransform: "uppercase", fontWeight: 600 }}>Année de revente simulée</label>
            <input type="range" min={3} max={Math.min(bien.duree, 25)} value={anneeRevente} onChange={e => setAnneeRevente(parseInt(e.target.value))} style={{ width: "100%", accentColor: T.blue }} />
            <div style={{ textAlign: "center", fontSize: 12, color: T.blue, fontWeight: 700 }}>Année {anneeRevente}</div>
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
        <Card style={{ padding: 16, textAlign: "center", border: `1px solid ${triColor}30` }}>
          <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", marginBottom: 4 }}>TRI An {anneeRevente}</div>
          <div style={{ fontSize: 28, fontWeight: 400, fontFamily: "DM Serif Display, serif", color: triColor }}>{triActuel ? fmt(triActuel.tri, 2) : "—"}%</div>
          <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>annualisé</div>
        </Card>
        <Card style={{ padding: 16, textAlign: "center", border: `1px solid ${T.green}30` }}>
          <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", marginBottom: 4 }}>TRI optimal</div>
          <div style={{ fontSize: 28, fontWeight: 400, fontFamily: "DM Serif Display, serif", color: T.green }}>{triMax ? fmt(triMax.tri, 2) : "—"}%</div>
          <div style={{ fontSize: 10, color: T.green, marginTop: 2 }}>An {triMax?.annee}</div>
        </Card>
        <Card style={{ padding: 16, textAlign: "center", border: `1px solid ${T.gold}30` }}>
          <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", marginBottom: 4 }}>Gain net An {anneeRevente}</div>
          <div style={{ fontSize: 22, fontWeight: 400, fontFamily: "DM Serif Display, serif", color: T.gold }}>{triActuel ? fmtEur(triActuel.gainNet) : "—"}</div>
        </Card>
      </div>

      {/* Interprétation */}
      <Card style={{ padding: 14, marginBottom: 16, background: triActuel?.tri >= 10 ? T.green+"08" : triActuel?.tri >= 5 ? T.gold+"08" : T.red+"08", border: `1px solid ${triColor}25` }}>
        <div style={{ fontSize: 12, color: triColor, fontWeight: 700 }}>
          {triActuel?.tri >= 15 ? "🚀 Excellent TRI — Investissement très performant" :
           triActuel?.tri >= 10 ? "✅ Bon TRI — Comparable aux meilleurs fonds immobiliers" :
           triActuel?.tri >= 5  ? "🟡 TRI correct — Mieux que le livret A, moins que la bourse" :
           triActuel?.tri >= 0  ? "⚠️ TRI faible — Rentabilité insuffisante" : "🔴 TRI négatif — Opération perdante"}
        </div>
        <div style={{ fontSize: 11, color: T.textSub, marginTop: 6 }}>
          Référence : livret A ~3% | Fonds euro ~4% | SCPI ~5-6% | Bourse long terme ~7-9% | Bon investissement immo &gt;10%
        </div>
      </Card>

      {/* Graphique */}
      <Card style={{ padding: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.textSub, marginBottom: 12 }}>Évolution du TRI selon l'année de revente</div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={triData}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
            <XAxis dataKey="annee" tickFormatter={v => `An ${v}`} tick={{ fontSize: 10, fill: T.textMuted }} />
            <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 10, fill: T.textMuted }} />
            <Tooltip formatter={(v) => [`${fmt(v,2)}%`, "TRI"]} labelFormatter={v => `Année ${v}`} contentStyle={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8 }} />
            <Line type="monotone" dataKey="tri" stroke={T.blue} strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

// ─── CHECKLIST DE VISITE ──────────────────────────────────────────────────────
const CHECKLIST_ITEMS = [
  { id:"toiture_etat", cat:"🏚️ Toiture & Structure", label:"État de la toiture (tuiles, ardoises, zinc)", critique:true },
  { id:"charpente", cat:"🏚️ Toiture & Structure", label:"Charpente (pas de déformation, insectes)", critique:true },
  { id:"facade_etat", cat:"🏚️ Toiture & Structure", label:"Façade (fissures, infiltrations, état enduit)", critique:true },
  { id:"sous_sol", cat:"🏚️ Toiture & Structure", label:"Sous-sol / cave (humidité, fissures murs)", critique:true },
  { id:"planchers", cat:"🏚️ Toiture & Structure", label:"Planchers (pas de flexion, craquements)", critique:false },
  { id:"humidite", cat:"💧 Humidité & Isolation", label:"Traces d'humidité sur murs et plafonds", critique:true },
  { id:"isolation_combles", cat:"💧 Humidité & Isolation", label:"Isolation des combles (présence et état)", critique:false },
  { id:"fenetre_etat", cat:"💧 Humidité & Isolation", label:"Fenêtres (simple/double vitrage, état joints)", critique:false },
  { id:"vmc", cat:"💧 Humidité & Isolation", label:"Ventilation (VMC, aération salle de bain)", critique:false },
  { id:"elec_tableau", cat:"⚡ Électricité", label:"Tableau électrique (disjoncteurs, mise aux normes)", critique:true },
  { id:"elec_prises", cat:"⚡ Électricité", label:"Prises et interrupteurs (état, mise à la terre)", critique:false },
  { id:"elec_gaine", cat:"⚡ Électricité", label:"Gaines électriques apparentes (état, protection)", critique:false },
  { id:"plomberie_etat", cat:"🚿 Plomberie & Chauffage", label:"Plomberie (état tuyaux, rouille, fuites)", critique:true },
  { id:"chaudiere", cat:"🚿 Plomberie & Chauffage", label:"Chaudière / chauffage (âge, entretien, marque)", critique:true },
  { id:"wc_sdb", cat:"🚿 Plomberie & Chauffage", label:"WC et salle de bain (état, fonctionnement)", critique:false },
  { id:"eau_chaude", cat:"🚿 Plomberie & Chauffage", label:"Eau chaude sanitaire (ballon, chauffe-eau)", critique:false },
  { id:"dpe", cat:"📋 Diagnostics & Juridique", label:"DPE (classe énergie, étiquette GES)", critique:true },
  { id:"amiante", cat:"📋 Diagnostics & Juridique", label:"Diagnostic amiante (avant 1997)", critique:true },
  { id:"plomb", cat:"📋 Diagnostics & Juridique", label:"Diagnostic plomb (CREP avant 1949)", critique:true },
  { id:"termites", cat:"📋 Diagnostics & Juridique", label:"Zones termites / mérule (selon région)", critique:false },
  { id:"copro", cat:"📋 Diagnostics & Juridique", label:"Si copro : PV AG, charges, travaux votés", critique:true },
  { id:"permis", cat:"📋 Diagnostics & Juridique", label:"Permis de construire / déclaration travaux", critique:false },
  { id:"voisinage", cat:"🏘️ Environnement", label:"Nuisances sonores (rue, voisins, commerces)", critique:false },
  { id:"stationnement", cat:"🏘️ Environnement", label:"Stationnement (parking, garage, facilité)", critique:false },
  { id:"transports", cat:"🏘️ Environnement", label:"Transports en commun (arrêt, gare)", critique:false },
  { id:"commerces", cat:"🏘️ Environnement", label:"Commerces et services à proximité", critique:false },
  { id:"luminosite", cat:"🏘️ Environnement", label:"Luminosité (exposition, vis-à-vis)", critique:false },
  { id:"notes_libres", cat:"📝 Notes", label:"Points spécifiques à vérifier", critique:false },
];

function ChecklistVisite({ bien }) {
  const [checks, setChecks] = useState(() => Object.fromEntries(CHECKLIST_ITEMS.map(i => [i.id, null]))); // null=non vu, true=ok, false=pb
  const [notes, setNotes] = useState({});
  const [filtreCategorie, setFiltreCategorie] = useState("Tout");

  const categories = ["Tout", ...new Set(CHECKLIST_ITEMS.map(i => i.cat))];
  const itemsFiltres = filtreCategorie === "Tout" ? CHECKLIST_ITEMS : CHECKLIST_ITEMS.filter(i => i.cat === filtreCategorie);

  const toggle = (id) => {
    setChecks(prev => {
      const cur = prev[id];
      return { ...prev, [id]: cur === null ? true : cur === true ? false : null };
    });
  };

  const total = CHECKLIST_ITEMS.length;
  const vus = Object.values(checks).filter(v => v !== null).length;
  const problemes = Object.values(checks).filter(v => v === false).length;
  const pbCritiques = CHECKLIST_ITEMS.filter(i => i.critique && checks[i.id] === false).length;
  const pct = Math.round(vus / total * 100);

  const exportChecklist = () => {
    const today = new Date().toLocaleDateString("fr-FR");
    const lignes = categories.slice(1).map(cat => {
      const items = CHECKLIST_ITEMS.filter(i => i.cat === cat);
      const rows = items.map(i => {
        const etat = checks[i.id] === true ? "✓ OK" : checks[i.id] === false ? "✗ PROBLÈME" : "— Non vérifié";
        const note = notes[i.id] ? ` (${notes[i.id]})` : "";
        return `  ${i.label}${i.critique ? " ⚠️" : ""} : ${etat}${note}`;
      });
      return `\n${cat}\n${rows.join("\n")}`;
    }).join("\n");

    const contenu = `CHECKLIST DE VISITE — ${bien.nom}\nDate : ${today}\nAdresse : ${bien.adresse || "Non renseignée"}\n\nAvancement : ${vus}/${total} points vérifiés\nProblèmes détectés : ${problemes} (dont ${pbCritiques} critiques)\n${lignes}`;
    const blob = new Blob([contenu], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `checklist-visite-${bien.nom.replace(/\s+/g,"-")}.txt`;
    a.click();
  };

  return (
    <div>
      <STitle accent={T.green}>✅ Checklist de visite</STitle>

      {/* Progression */}
      <Card style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{bien.adresse || bien.nom}</div>
            <div style={{ fontSize: 11, color: T.textMuted }}>{vus}/{total} points vérifiés</div>
          </div>
          <div style={{ textAlign: "right" }}>
            {problemes > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: T.red }}>⚠️ {problemes} problème{problemes > 1 ? "s" : ""} {pbCritiques > 0 ? `(${pbCritiques} critique${pbCritiques > 1 ? "s" : ""})` : ""}</div>}
            {problemes === 0 && vus > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: T.green }}>✅ Aucun problème détecté</div>}
          </div>
        </div>
        <div style={{ background: T.surface2, borderRadius: 10, height: 8, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,${T.green},${T.blue})`, borderRadius: 10, transition: "width 0.3s" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10, color: T.textMuted }}>
          <span>{pct}% complété</span>
          <span>🟢 OK &nbsp; 🔴 Problème &nbsp; ⬜ Non vu</span>
        </div>
      </Card>

      {/* Légende */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, fontSize: 11, color: T.textMuted }}>
        <span>Cliquer pour basculer :</span>
        <span style={{ color: T.textMuted }}>⬜ Non vu</span>
        <span>→</span>
        <span style={{ color: T.green }}>✅ OK</span>
        <span>→</span>
        <span style={{ color: T.red }}>❌ Problème</span>
        <span>→</span>
        <span style={{ color: T.textMuted }}>⬜</span>
      </div>

      {/* Filtre catégories */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", paddingBottom: 4 }}>
        {categories.map(cat => (
          <button key={cat} onClick={() => setFiltreCategorie(cat)} style={{ padding: "5px 10px", border: `1px solid ${filtreCategorie === cat ? T.green + "60" : T.border}`, borderRadius: 20, background: filtreCategorie === cat ? T.green + "18" : T.surface2, color: filtreCategorie === cat ? T.green : T.textMuted, fontWeight: 600, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>{cat === "Tout" ? cat : cat.split(" ").slice(0,2).join(" ")}</button>
        ))}
      </div>

      {/* Liste */}
      <div style={{ display: "grid", gap: 6, marginBottom: 16 }}>
        {itemsFiltres.map(item => {
          const etat = checks[item.id];
          const bg = etat === true ? T.green + "12" : etat === false ? T.red + "12" : T.surface;
          const borderColor = etat === true ? T.green + "40" : etat === false ? T.red + "40" : T.border;
          const icon = etat === true ? "✅" : etat === false ? "❌" : "⬜";
          return (
            <div key={item.id} style={{ background: bg, border: `1px solid ${borderColor}`, borderRadius: 9, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => toggle(item.id)}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 12, color: etat === null ? T.textSub : T.text, fontWeight: etat !== null ? 600 : 400 }}>{item.label}</span>
                  {item.critique && <span style={{ marginLeft: 6, fontSize: 9, color: T.orange, fontWeight: 700, background: T.orange+"20", borderRadius: 4, padding: "1px 5px" }}>CRITIQUE</span>}
                </div>
              </div>
              {etat === false && (
                <div style={{ marginTop: 7 }}>
                  <input value={notes[item.id] || ""} onChange={e => setNotes(prev => ({ ...prev, [item.id]: e.target.value }))} placeholder="Note sur le problème (coût estimé, urgence...)" style={{ width: "100%", background: T.surface2, border: `1px solid ${T.red}30`, borderRadius: 7, padding: "6px 10px", fontSize: 11, color: T.text, outline: "none" }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button onClick={exportChecklist} style={{ width: "100%", background: `linear-gradient(135deg,${T.green},${T.blue})`, color: "white", border: "none", borderRadius: 12, padding: "13px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
        📥 Exporter la checklist ({vus}/{total} points)
      </button>
    </div>
  );
}

// ─── SAUVEGARDE ──────────────────────────────────────────────────────────────
const STORAGE_KEY = "rentabilite_immo_biens";
function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}
function saveToDB(list) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState("simulateur");
  const [biens, setBiens] = useState([{ ...defaultBien }]);
  const [activeBien, setActiveBien] = useState(0);
  const [showAmortMensuel, setShowAmortMensuel] = useState(false);
  const [savedBiens, setSavedBiens] = useState(loadSaved);
  const [showSaved, setShowSaved] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSave = () => {
    const name = bien.nom || "Mon bien";
    const entry = { id: Date.now(), nom: name, date: new Date().toLocaleDateString("fr-FR"), data: bien };
    const updated = [entry, ...savedBiens.filter(b => b.nom !== name)].slice(0, 20);
    setSavedBiens(updated);
    saveToDB(updated);
    setSaveMsg("✅ Sauvegardé !");
    setTimeout(() => setSaveMsg(""), 2000);
  };

  const handleLoad = (entry) => {
    const idx = activeBien;
    setBiens(prev => { const n = [...prev]; n[idx] = { ...entry.data }; return n; });
    setShowSaved(false);
  };

  const handleDelete = (id) => {
    const updated = savedBiens.filter(b => b.id !== id);
    setSavedBiens(updated);
    saveToDB(updated);
  };

  const resultats = useMemo(() => biens.map(calculer), [biens]);
  const res = resultats[activeBien];
  const bien = biens[activeBien];

  const updateBien = useCallback((idx, val) => { setBiens(prev => { const n = [...prev]; n[idx] = val; return n; }); }, []);
  const addBien = () => { if (biens.length < 3) { setBiens(prev => [...prev, { ...defaultBien, nom: `Bien ${prev.length + 1}` }]); setActiveBien(biens.length); } };
  const removeBien = idx => { if (biens.length > 1) { setBiens(prev => prev.filter((_, i) => i !== idx)); setActiveBien(Math.max(0, activeBien - 1)); } };

  const amortAnnuel = useMemo(() => {
    const arr = [];
    for (let a = 0; a < bien.duree; a++) {
      const slice = res.amortissement.slice(a * 12, (a + 1) * 12);
      if (!slice.length) break;
      arr.push({ annee: `An ${a+1}`, capitalRestant: slice[slice.length-1]?.capitalRestant||0, cashflowCumule: slice[slice.length-1]?.cashflowCumule||0, interets: Math.round(slice.reduce((s,m)=>s+m.interets,0)), capital: Math.round(slice.reduce((s,m)=>s+m.capitalRembourse,0)) });
    }
    return arr;
  }, [res.amortissement, bien.duree]);

  const scoreColor = res.score >= 18 ? T.green : res.score >= 10 ? T.gold : T.red;

  const TABS = [["simulateur","📊 Simulateur"],["diagnostic","🤖 IA"],["marchand","🏗️ Marchand"],["tri","📊 TRI"],["checklist","✅ Visite"],["travaux","🔨 Travaux"],["revente","📈 Revente"],["rentabilite","🎯 Rentabilité"],["fiscalite","🧾 Fiscalité"],["fiche","🏦 Fiche Bancaire"],["graphiques","📉 Graphiques"],["amortissement","🗓️ Amortissement"],["comparaison","⚖️ Comparaison"]];

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "DM Sans, sans-serif", color: T.text }}>
      <style>{css}</style>
      {/* Header */}
      <div className="no-print" style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <button className="mobile-header-btn" onClick={() => setSidebarOpen(true)} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "7px 10px", cursor: "pointer", fontSize: 16, color: T.gold }}>⚙️</button>
        <div>
          <div style={{ fontSize: 9, color: T.textMuted, letterSpacing: "0.2em", textTransform: "uppercase" }}>Simulateur pro</div>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 400, fontFamily: "DM Serif Display, serif" }}>🏠 Rentabilité <span style={{ color: T.gold }}>Immo</span></h1>
        </div>
        <div className="header-kpis" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: T.textMuted, marginBottom: 1 }}>Cash-flow net</div><div style={{ fontSize: 17, fontWeight: 700, color: res.cashflowMensuel >= 0 ? T.green : T.red, fontFamily: "DM Serif Display, serif" }}>{fmtEur(Math.round(res.cashflowMensuel))}<span style={{ fontSize: 10, color: T.textMuted }}>/mois</span></div></div>
          <div style={{ width: 1, height: 30, background: T.border }} />
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: T.textMuted, marginBottom: 1 }}>Score</div><div style={{ fontSize: 24, fontWeight: 400, color: scoreColor, fontFamily: "DM Serif Display, serif" }}>{res.score}<span style={{ fontSize: 12, color: T.textMuted }}>/25</span></div></div>
          <div style={{ background: scoreColor + "18", border: `1px solid ${scoreColor}40`, borderRadius: 8, padding: "5px 12px" }}><div style={{ fontSize: 12, fontWeight: 700, color: scoreColor }}>{res.interpScore[0]}</div></div>
        </div>
        {/* KPIs mobile */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, color: T.textMuted }}>CF</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: res.cashflowMensuel >= 0 ? T.green : T.red }}>{fmtEur(Math.round(res.cashflowMensuel))}</div>
          </div>
          <div style={{ background: scoreColor+"18", border: `1px solid ${scoreColor}40`, borderRadius: 7, padding: "4px 8px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: scoreColor }}>{res.score}/25</div>
          </div>
        </div>
      </div>
      {/* Overlay mobile */}
      {sidebarOpen && <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "rgba(0,0,0,0.7)", zIndex: 999, display: "none" }} className="mobile-header-btn" />}
      {/* Tabs */}
      <div className="no-print" style={{ background: T.surface2, borderBottom: `1px solid ${T.border}`, padding: "0 28px", display: "flex", gap: 2, overflowX: "auto" }}>
        {TABS.map(([t, label]) => (
          <button key={t} onClick={() => setActiveTab(t)} style={{ padding: "11px 15px", border: "none", cursor: "pointer", fontWeight: activeTab === t ? 700 : 500, fontSize: 12, background: "transparent", color: activeTab === t ? T.gold : T.textMuted, borderBottom: activeTab === t ? `2px solid ${T.gold}` : "2px solid transparent", transition: "all 0.15s", whiteSpace: "nowrap", fontFamily: "DM Sans, sans-serif" }}>
            {t === "fiche" ? <span style={{ display: "flex", alignItems: "center", gap: 6 }}>{label}<span style={{ background: T.blue, color: "white", fontSize: 9, padding: "1px 6px", borderRadius: 20, fontWeight: 900 }}>PDF</span></span> : label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex" }}>
        {/* Sidebar */}
        <div className={`no-print sidebar${sidebarOpen ? " open" : ""}`} style={{ width: 300, minWidth: 300, background: T.surface, borderRight: `1px solid ${T.border}`, padding: "18px 14px", overflowY: "auto", maxHeight: "calc(100vh - 104px)", position: "sticky", top: 0 }}>
          <button className="mobile-header-btn" onClick={() => setSidebarOpen(false)} style={{ width: "100%", marginBottom: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px", cursor: "pointer", fontSize: 13, color: T.textMuted, fontWeight: 700 }}>✕ Fermer</button>
          {biens.length > 1 && <div style={{ display: "flex", gap: 5, marginBottom: 12 }}>{biens.map((b, i) => <button key={i} onClick={() => setActiveBien(i)} style={{ flex: 1, padding: "6px 7px", border: `1px solid ${activeBien===i?T.gold:T.border}`, borderRadius: 7, background: activeBien===i?T.gold+"18":T.surface2, color: activeBien===i?T.gold:T.textMuted, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>{b.nom}</button>)}</div>}
          <BienForm bien={bien} onChange={v => updateBien(activeBien, v)} />
          <div style={{ display: "flex", gap: 7, marginTop: 6 }}>
            {biens.length < 3 && <button onClick={addBien} style={{ flex: 1, padding: "9px", border: `1px dashed ${T.green}50`, borderRadius: 9, background: T.green+"0a", color: T.green, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>+ Ajouter</button>}
            {biens.length > 1 && <button onClick={() => removeBien(activeBien)} style={{ padding: "9px 12px", border: `1px solid ${T.red}40`, borderRadius: 9, background: T.red+"10", color: T.red, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>🗑️</button>}
          </div>
          {/* Sauvegarde */}
          <div style={{ marginTop: 10, display: "flex", gap: 7 }}>
            <button onClick={handleSave} style={{ flex: 1, padding: "9px", border: `1px solid ${T.gold}50`, borderRadius: 9, background: T.gold+"12", color: T.gold, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
              💾 {saveMsg || "Sauvegarder"}
            </button>
            <button onClick={() => setShowSaved(!showSaved)} style={{ position: "relative", padding: "9px 12px", border: `1px solid ${T.blue}50`, borderRadius: 9, background: T.blue+"12", color: T.blue, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
              📂 {savedBiens.length > 0 && <span style={{ position: "absolute", top: -4, right: -4, background: T.gold, color: T.bg, borderRadius: 10, fontSize: 9, fontWeight: 900, padding: "1px 5px" }}>{savedBiens.length}</span>}
            </button>
          </div>
          {/* Liste biens sauvegardés */}
          {showSaved && (
            <div style={{ marginTop: 10, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 11, padding: 10 }}>
              <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>📂 Biens sauvegardés</div>
              {savedBiens.length === 0 && <div style={{ fontSize: 12, color: T.textMuted, fontStyle: "italic" }}>Aucun bien sauvegardé</div>}
              {savedBiens.map(entry => (
                <div key={entry.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 10px", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.nom}</div>
                    <div style={{ fontSize: 10, color: T.textMuted }}>{entry.date}</div>
                  </div>
                  <button onClick={() => handleLoad(entry)} style={{ padding: "4px 8px", border: `1px solid ${T.green}40`, borderRadius: 6, background: T.green+"12", color: T.green, fontSize: 10, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>Charger</button>
                  <button onClick={() => handleDelete(entry.id)} style={{ padding: "4px 7px", border: `1px solid ${T.red}40`, borderRadius: 6, background: T.red+"12", color: T.red, fontSize: 10, cursor: "pointer", flexShrink: 0 }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Main */}
        <div className="main-content" style={{ flex: 1, padding: "24px 24px", overflowY: "auto", maxHeight: "calc(100vh - 104px)" }}>

          {activeTab === "simulateur" && (
            <div>
              <div style={{ background: `linear-gradient(135deg,${T.surface2},${T.surface3})`, border: `1px solid ${scoreColor}30`, borderRadius: 18, padding: "20px 26px", marginBottom: 24, display: "flex", alignItems: "center", gap: 18 }}>
                <div style={{ fontSize: 40 }}>{res.score>=22?"💎":res.score>=18?"🟢":res.score>=10?"🟡":"🔴"}</div>
                <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 3 }}>Verdict</div><div style={{ fontSize: 22, fontWeight: 400, color: T.text, fontFamily: "DM Serif Display, serif" }}>{res.interpScore[0]}</div><div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{bien.nom} · Score {res.score}/25</div></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>{[["Prix",fmtEur(bien.prix)],["Loyer",fmtEur(bien.loyer)+"/m"],["Surface",bien.surface+" m²"]].map(([k,v]) => <div key={k} style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: T.textMuted, marginBottom: 2 }}>{k}</div><div style={{ fontWeight: 700, color: T.text, fontSize: 13 }}>{v}</div></div>)}</div>
              </div>
              <div style={{ marginBottom: 20 }}><STitle accent={T.blue}>💰 Coûts</STitle><div className="stat-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}><StatCard label="Prix+Notaire" value={fmtEur(Math.round(res.notaire))} sub={`Notaire: ${fmtEur(Math.round(res.notaire-bien.prix))}`} /><StatCard label="Coût total" value={fmtEur(Math.round(res.coutTotal))} /><StatCard label="À emprunter" value={fmtEur(Math.round(res.aEmprunter))} sub={`Apport: ${fmtEur(bien.apport)}`} /><StatCard label="Prix au m²" value={fmtEur(Math.round(res.prixM2))} /></div></div>
              <div style={{ marginBottom: 20 }}><STitle accent={T.purple}>🏦 Financement</STitle><div className="stat-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}><StatCard label="Mensualité crédit" value={fmtEur(Math.round(res.mensualiteCredit))} /><StatCard label="Assurance/mois" value={fmtEur(Math.round(res.mensualiteAssurance))} /><StatCard label="Mensualité totale" value={fmtEur(Math.round(res.mensualiteTotale))} /><StatCard label="Coût total crédit" value={fmtEur(Math.round(res.coutTotalCredit))} /></div></div>
              <div style={{ marginBottom: 20 }}><STitle accent={T.green}>📊 Rentabilité</STitle><div className="stat-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 10 }}><StatCard label="Renta brute" value={fmtPct(res.rentaBrute)} /><StatCard label="Renta nette" value={fmtPct(res.rentaNette)} sub={res.interpRentaNette[0]} note={res.interpRentaNette[1]} /><StatCard label="Renta net-net" value={fmtPct(res.rentaNetNet)} sub={res.interpRentaNetNet[0]} note={res.interpRentaNetNet[1]} glow /></div><div className="stat-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}><StatCard label="DSCR" value={fmt(res.dscr,2)} sub={res.interpDSCR[0]} note={res.interpDSCR[1]} /><StatCard label="Cash-flow brut/mois" value={fmtEur(Math.round(res.cashflowMensuel))} sub={res.interpCash[0]} note={res.interpCash[1]} glow /><StatCard label={`CF net (${bien.regime})`} value={fmtEur(Math.round(res.cashflowApresImpot))} sub={`Impôt: ${fmtEur(Math.round(res.impotFiscal/12))}/mois`} note={res.cashflowApresImpot>=0?4:1} /></div></div>
              {/* Vacance + Gestion si activés */}
              {((bien.vacanceLocative||0) > 0 || (bien.tauxGestion||0) > 0) && (
                <div style={{ marginBottom: 20 }}>
                  <STitle accent={T.orange}>🏠 Scénario réaliste (vacance + gestion)</STitle>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
                    <StatCard label={`Vacance ${res.vacanceMois} mois/an`} value={fmtEur(Math.round(res.loyerAnnuelVacance/12)+"€/m")} sub={`Loyer effectif/mois`} note={(bien.vacanceLocative||0)===0?4:3} />
                    <StatCard label={`Frais gestion ${bien.tauxGestion||0}%`} value={fmtEur(Math.round(res.fraisGestion))} sub="par an" note={(bien.tauxGestion||0)===0?4:3} />
                    <StatCard label="Loyer net/an" value={fmtEur(Math.round(res.loyerNetGestion))} sub="après vacance + gestion" />
                    <StatCard label="CF réaliste/mois" value={fmtEur(Math.round(res.cashflowAvecVacance))} sub="vacance + gestion inclus" note={res.cashflowAvecVacance>=300?4:res.cashflowAvecVacance>=0?3:1} glow />
                  </div>
                </div>
              )}
              <div><STitle accent={T.gold}>🎯 Score (/5 par critère)</STitle><div className="stat-grid-5" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 9 }}><Badge label="Net-net" note={res.interpRentaNetNet[1]} /><Badge label="DSCR" note={res.interpDSCR[1]} /><Badge label="Renta nette" note={res.interpRentaNette[1]} /><Badge label="Cash-flow" note={res.interpCash[1]} /><Badge label="Emplacement" note={bien.emplacement} /></div></div>
            </div>
          )}

          {activeTab === "diagnostic" && <DiagnosticIA key={bien.nom+bien.loyer} bien={bien} res={res} />}
          {activeTab === "fiscalite" && <FiscaliteTab bien={bien} res={res} calculer={calculer} />}
          {activeTab === "fiche" && <FicheSynthese bien={bien} res={res} />}

          {activeTab === "graphiques" && (
            <div style={{ display: "grid", gap: 20 }}>
              <Card style={{ padding: 22 }}><STitle>📉 Capital restant dû</STitle><ResponsiveContainer width="100%" height={220}><AreaChart data={amortAnnuel}><defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={T.blue} stopOpacity={0.3}/><stop offset="95%" stopColor={T.blue} stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke={T.border}/><XAxis dataKey="annee" tick={{fontSize:10,fill:T.textMuted}} tickLine={false}/><YAxis tickFormatter={v=>fmt(v/1000)+"k€"} tick={{fontSize:10,fill:T.textMuted}} tickLine={false}/><Tooltip contentStyle={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,fontSize:11}} formatter={v=>fmtEur(v)}/><Area type="monotone" dataKey="capitalRestant" stroke={T.blue} fill="url(#g1)" strokeWidth={2} name="Capital restant"/></AreaChart></ResponsiveContainer></Card>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                <Card style={{ padding: 22 }}><STitle>🟢 Cash-flow cumulé</STitle><ResponsiveContainer width="100%" height={180}><AreaChart data={amortAnnuel}><defs><linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={T.green} stopOpacity={0.3}/><stop offset="95%" stopColor={T.green} stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke={T.border}/><XAxis dataKey="annee" tick={{fontSize:9,fill:T.textMuted}} tickLine={false}/><YAxis tickFormatter={v=>fmt(v/1000)+"k€"} tick={{fontSize:9,fill:T.textMuted}} tickLine={false}/><Tooltip contentStyle={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,fontSize:11}} formatter={v=>fmtEur(v)}/><Area type="monotone" dataKey="cashflowCumule" stroke={T.green} fill="url(#g2)" strokeWidth={2} name="Cash-flow cumulé"/></AreaChart></ResponsiveContainer></Card>
                <Card style={{ padding: 22 }}><STitle>📊 Intérêts vs Capital/an</STitle><ResponsiveContainer width="100%" height={180}><BarChart data={amortAnnuel}><CartesianGrid strokeDasharray="3 3" stroke={T.border}/><XAxis dataKey="annee" tick={{fontSize:9,fill:T.textMuted}} tickLine={false}/><YAxis tickFormatter={v=>fmt(v/1000)+"k€"} tick={{fontSize:9,fill:T.textMuted}} tickLine={false}/><Tooltip contentStyle={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,fontSize:11}} formatter={v=>fmtEur(v)}/><Legend wrapperStyle={{fontSize:11}}/><Bar dataKey="interets" name="Intérêts" fill={T.red} radius={[3,3,0,0]}/><Bar dataKey="capital" name="Capital remb." fill={T.green} radius={[3,3,0,0]}/></BarChart></ResponsiveContainer></Card>
              </div>
            </div>
          )}

          {activeTab === "amortissement" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}><STitle>🗓️ Tableau d'amortissement</STitle><button onClick={() => setShowAmortMensuel(!showAmortMensuel)} style={{ padding: "7px 13px", border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface2, color: T.textSub, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>{showAmortMensuel?"Vue annuelle":"Vue mensuelle"}</button></div>
              <Card style={{ overflow: "hidden" }}>
                <div style={{ overflowX: "auto", maxHeight: "62vh", overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead style={{ position: "sticky", top: 0, background: T.surface2 }}>
                      <tr>{["Mois","Mensualité","Intérêts","Capital remb.","Assurance","Total","Capital restant","CF cumulé"].map(h => <th key={h} style={{ padding: "11px 13px", textAlign: "right", fontWeight: 600, fontSize: 10, color: T.textMuted, whiteSpace: "nowrap", borderBottom: `1px solid ${T.border}` }}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {(showAmortMensuel?res.amortissement:res.amortissement.filter(m=>m.mois%12===0||m.mois===1)).map((row,i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${T.border}`, background: i%2===0?T.surface:T.surface2 }}>
                          <td style={{ padding: "9px 13px", fontWeight: 700, color: T.textMuted, fontSize: 11 }}>{row.mois}</td>
                          {[row.mensualiteCredit,row.interets,row.capitalRembourse,row.assurance,row.mensualiteTotale].map((v,j) => <td key={j} style={{ padding: "9px 13px", textAlign: "right", color: T.text, fontFamily: "monospace", fontSize: 11 }}>{fmtEur(v)}</td>)}
                          <td style={{ padding: "9px 13px", textAlign: "right", color: T.blue, fontWeight: 700, fontFamily: "monospace", fontSize: 11 }}>{fmtEur(row.capitalRestant)}</td>
                          <td style={{ padding: "9px 13px", textAlign: "right", color: row.cashflowCumule>=0?T.green:T.red, fontWeight: 700, fontFamily: "monospace", fontSize: 11 }}>{fmtEur(row.cashflowCumule)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {activeTab === "marchand" && <MarchandBiens bien={bien} res={res} />}
          {activeTab === "tri" && <CalculateurTRI bien={bien} res={res} />}
          {activeTab === "checklist" && <ChecklistVisite bien={bien} />}
          {activeTab === "travaux" && <CalculateurTravaux bien={bien} onChange={v => updateBien(activeBien, v)} />}

          {activeTab === "revente" && <SimulationRevente bien={bien} res={res} />}

          {activeTab === "rentabilite" && <AlerteRentabilite bien={bien} res={res} onChange={v => updateBien(activeBien, v)} />}

          {activeTab === "comparaison" && (
            <div>
              <STitle>⚖️ Comparaison des biens</STitle>
              {biens.length < 2 ? <Card style={{ padding: 40, textAlign: "center", border: `1px dashed ${T.border}` }}><div style={{ fontSize: 32, marginBottom: 10 }}>➕</div><div style={{ color: T.textSub, fontSize: 13 }}>Ajoutez un deuxième bien dans la barre latérale</div></Card> : (
                <Card style={{ overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr style={{ background: T.surface2 }}><th style={{ padding: "12px 16px", textAlign: "left", color: T.textMuted, fontSize: 10, fontWeight: 600, textTransform: "uppercase" }}>Indicateur</th>{biens.map((b,i) => <th key={i} style={{ padding: "12px 16px", textAlign: "center", color: T.gold, fontSize: 13, fontWeight: 700 }}>{b.nom}</th>)}</tr></thead>
                    <tbody>
                      {[["Prix d'achat",(r,b)=>fmtEur(b.prix),false],["Coût total",r=>fmtEur(r.coutTotal),false],["Loyer mensuel",(r,b)=>fmtEur(b.loyer),true],["Mensualité totale",r=>fmtEur(Math.round(r.mensualiteTotale)),false],["Renta nette",r=>fmtPct(r.rentaNette),true],["Renta net-net",r=>fmtPct(r.rentaNetNet),true],["DSCR",r=>fmt(r.dscr,2),true],["Cash-flow/mois",r=>fmtEur(Math.round(r.cashflowMensuel)),true],["Score/25",r=>r.score,true]].map(([label,fn,higher],idx) => {
                        const values = resultats.map((r,i)=>fn(r,biens[i]));
                        const numValues = values.map(v=>typeof v==="number"?v:parseFloat(v.replace(/[^\d.-]/g,"")));
                        const best = higher?Math.max(...numValues):null;
                        return <tr key={label} style={{ borderBottom: `1px solid ${T.border}`, background: idx%2===0?T.surface:T.surface2 }}><td style={{ padding: "11px 16px", color: T.textSub, fontSize: 12 }}>{label}</td>{values.map((v,i) => { const isBest=higher&&numValues[i]===best&&numValues.filter(n=>n===best).length<numValues.length; return <td key={i} style={{ padding: "11px 16px", textAlign: "center", fontWeight: 700, color: isBest?T.green:T.text, background: isBest?T.green+"10":"transparent", fontSize: 13 }}>{isBest&&"✓ "}{v}</td>; })}</tr>;
                      })}
                    </tbody>
                  </table>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
