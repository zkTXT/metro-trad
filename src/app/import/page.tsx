"use client";

import { useMemo, useRef, useState } from "react";
import type { Workbook } from "exceljs";
import { Footer, Header } from "@/components/Chrome";
import { checkProduct } from "@/lib/checker";
import {
  devinerColonnes,
  exporterClasseur,
  lireClasseur,
  lireEntetes,
  lireLignes,
  nomsFeuilles,
  type LigneSource,
  type ResultatLigne,
} from "@/lib/excel";
import { LANGUES } from "@/lib/translate";

type StatutLigne =
  "attente" | "encours" | "valide" | "corrige" | "acorriger" | "erreur";

interface EtatLigne {
  statut: StatutLigne;
  res?: ResultatLigne;
  erreur?: string;
}

const LIBELLES: Record<
  StatutLigne,
  { label: string; classes: string; export: string }
> = {
  attente: {
    label: "En attente",
    classes: "bg-slate-100 text-slate-600",
    export: "",
  },
  encours: {
    label: "En cours…",
    classes: "bg-blue-100 text-blue-800",
    export: "",
  },
  valide: {
    label: "Validé",
    classes: "bg-green-100 text-green-800",
    export: "Validé",
  },
  corrige: {
    label: "Corrigé auto",
    classes: "bg-amber-100 text-amber-800",
    export: "Corrigé automatiquement (à relire)",
  },
  acorriger: {
    label: "À corriger",
    classes: "bg-red-100 text-red-800",
    export: "À corriger avant envoi",
  },
  erreur: {
    label: "Erreur",
    classes: "bg-red-100 text-red-800",
    export: "Erreur de traduction (relancer)",
  },
};

const BADGES: Record<string, string> = {
  de: "DE",
  hr: "HR",
  es: "ES",
  it: "IT",
  nl: "NL",
  "pt-PT": "PT",
};

const terminee = (s: StatutLigne) =>
  s === "valide" || s === "corrige" || s === "acorriger";

const formatDuree = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s >= 60
    ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`
    : `${s} s`;
};

const selectClasses =
  "w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 outline-none focus:border-metro focus:ring-4 focus:ring-metro/15";

function Section({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="mb-4 flex items-center gap-3 text-lg font-bold text-metro">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-metro text-sm font-bold text-sun">
          {step}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function ImportPage() {
  const [wb, setWb] = useState<Workbook | null>(null);
  const [nomFichier, setNomFichier] = useState("");
  const [feuille, setFeuille] = useState("");
  const [ligneEntete, setLigneEntete] = useState(1);
  const [colTitre, setColTitre] = useState(0);
  const [colDesc, setColDesc] = useState(0);
  const [etats, setEtats] = useState<Record<number, EtatLigne>>({});
  const [running, setRunning] = useState(false);
  const [erreurFichier, setErreurFichier] = useState<string | null>(null);
  const [debut, setDebut] = useState(0);
  const [maintenant, setMaintenant] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const [durees, setDurees] = useState<number[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ws = useMemo(
    () => (wb && feuille ? (wb.getWorksheet(feuille) ?? null) : null),
    [wb, feuille],
  );
  const entetes = useMemo(
    () => (ws ? lireEntetes(ws, ligneEntete) : []),
    [ws, ligneEntete],
  );
  const lignes: LigneSource[] = useMemo(
    () => (ws ? lireLignes(ws, ligneEntete, colTitre, colDesc) : []),
    [ws, ligneEntete, colTitre, colDesc],
  );

  const compte = (f: (s: StatutLigne) => boolean) =>
    lignes.filter((l) => f(etats[l.numero]?.statut ?? "attente")).length;
  const nbTerminees = compte(terminee);
  const nbErreurs = compte((s) => s === "erreur");
  const nbAttente = lignes.length - nbTerminees - nbErreurs;
  const pct = lignes.length
    ? Math.round((nbTerminees / lignes.length) * 100)
    : 0;

  const recents = durees.slice(-5);
  const moyenne = recents.length
    ? recents.reduce((a, b) => a + b, 0) / recents.length
    : 0;
  const restantes = lignes.length - nbTerminees;
  const eta = running && moyenne ? moyenne * restantes : 0;

  function choisirFeuille(w: Workbook, nom: string) {
    const sheet = w.getWorksheet(nom);
    if (!sheet) return;
    // Cherche la ligne d'en-têtes parmi les 10 premières.
    let ligne = 1;
    let devine = devinerColonnes(lireEntetes(sheet, 1));
    for (let r = 1; r <= 10; r++) {
      const d = devinerColonnes(lireEntetes(sheet, r));
      if (d.titre || d.description) {
        ligne = r;
        devine = d;
        break;
      }
    }
    setFeuille(nom);
    setLigneEntete(ligne);
    setColTitre(devine.titre);
    setColDesc(devine.description);
    setEtats({});
    setDurees([]);
  }

  async function onFichier(file: File | undefined) {
    if (!file) return;
    setErreurFichier(null);
    if (!/\.xlsx$/i.test(file.name)) {
      setErreurFichier(
        "Format non pris en charge : enregistrez le fichier au format .xlsx puis réessayez.",
      );
      return;
    }
    try {
      const w = await lireClasseur(file);
      if (w.worksheets.length === 0)
        throw new Error("Le fichier ne contient aucune feuille.");
      setWb(w);
      setNomFichier(file.name);
      choisirFeuille(w, w.worksheets[0].name);
    } catch (e) {
      setWb(null);
      setErreurFichier(
        `Impossible de lire ce fichier (${e instanceof Error ? e.message : "erreur"}).`,
      );
    }
  }

  function majEtat(numero: number, e: EtatLigne) {
    setEtats((prev) => ({ ...prev, [numero]: e }));
  }

  async function traiterLigne(
    l: LigneSource,
    signal: AbortSignal,
  ): Promise<EtatLigne> {
    const check = checkProduct(l.titre, l.description, "supprimer");
    const problemes = [...check.titre.issues, ...check.description.issues]
      .map((i) => `${i.champ} : ${i.raison} (« ${i.extrait} »)`)
      .join("\n");
    const base = {
      problemes,
      titreNettoye: check.titre.nettoye,
      descriptionNettoyee: check.description.nettoye,
    };
    const statutVerdict: StatutLigne =
      check.verdict === "valide"
        ? "valide"
        : check.verdict === "a_verifier"
          ? "corrige"
          : "acorriger";

    if (!base.titreNettoye.trim() && !base.descriptionNettoyee.trim()) {
      return {
        statut: "acorriger",
        res: { ...base, statut: LIBELLES.acorriger.export },
      };
    }

    const r = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titre: base.titreNettoye,
        description: base.descriptionNettoyee,
        import: true,
      }),
      signal,
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error ?? "Erreur de traduction");
    const traductions = data.traductions as ResultatLigne["traductions"];
    const enErreur = Object.values(traductions ?? {}).some((t) => "error" in t);
    const statut = enErreur ? "erreur" : statutVerdict;
    return {
      statut,
      res: { ...base, statut: LIBELLES[statut].export, traductions },
      erreur: enErreur
        ? "Une ou plusieurs langues ont échoué : relancez pour les compléter."
        : undefined,
    };
  }

  async function lancer() {
    if (running || !lignes.length) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setRunning(true);
    setDebut(Date.now());
    setMaintenant(Date.now());
    tickRef.current = setInterval(() => setMaintenant(Date.now()), 1000);
    try {
      for (const l of lignes) {
        if (ac.signal.aborted) break;
        const deja = etats[l.numero]?.statut;
        if (deja && terminee(deja)) continue;
        majEtat(l.numero, { statut: "encours" });
        const t0 = Date.now();
        try {
          const e = await traiterLigne(l, ac.signal);
          majEtat(l.numero, e);
          setDurees((d) => [...d, Date.now() - t0]);
        } catch (err) {
          if (ac.signal.aborted) {
            majEtat(l.numero, { statut: "attente" });
            break;
          }
          majEtat(l.numero, {
            statut: "erreur",
            erreur: err instanceof Error ? err.message : "Erreur inconnue",
          });
        }
      }
    } finally {
      if (tickRef.current) clearInterval(tickRef.current);
      setRunning(false);
    }
  }

  function arreter() {
    abortRef.current?.abort();
  }

  async function telecharger() {
    if (!wb || !ws) return;
    const map = new Map<number, ResultatLigne>();
    for (const l of lignes) {
      const res = etats[l.numero]?.res;
      if (res) map.set(l.numero, res);
    }
    const blob = await exporterClasseur(wb, ws, ligneEntete, map);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomFichier.replace(/\.xlsx$/i, "") + " - traduit.xlsx";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  const peutExporter = Object.values(etats).some((e) => e.res);

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-5">
        <Section step={1} title="Fichier Excel">
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!running) onFichier(e.dataTransfer.files[0]);
            }}
            className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center transition hover:border-metro hover:bg-blue-50/40"
          >
            <span className="text-3xl">📄</span>
            <span className="font-semibold text-metro">
              {nomFichier
                ? nomFichier
                : "Glissez votre fichier Excel ici ou cliquez pour le choisir"}
            </span>
            <span className="text-xs text-slate-500">
              Format .xlsx. Le fichier reste sur votre ordinateur : il
              n&apos;est pas envoyé sur internet.
            </span>
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              disabled={running}
              onChange={(e) => {
                onFichier(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          {erreurFichier && (
            <p className="mt-3 text-sm font-medium text-red-700">
              {erreurFichier}
            </p>
          )}
        </Section>

        {wb && ws && (
          <Section step={2} title="Colonnes à traduire">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-semibold text-slate-700">
                Feuille
                <select
                  className={`${selectClasses} mt-1`}
                  value={feuille}
                  disabled={running}
                  onChange={(e) => choisirFeuille(wb, e.target.value)}
                >
                  {nomsFeuilles(wb).map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Ligne des en-têtes
                <input
                  type="number"
                  min={1}
                  className={`${selectClasses} mt-1`}
                  value={ligneEntete}
                  disabled={running}
                  onChange={(e) => {
                    setLigneEntete(Math.max(1, Number(e.target.value) || 1));
                    setEtats({});
                  }}
                />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Colonne du titre
                <select
                  className={`${selectClasses} mt-1`}
                  value={colTitre}
                  disabled={running}
                  onChange={(e) => {
                    setColTitre(Number(e.target.value));
                    setEtats({});
                  }}
                >
                  <option value={0}>(aucune)</option>
                  {entetes.map((c) => (
                    <option key={c.index} value={c.index}>
                      {c.nom}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Colonne de la description
                <select
                  className={`${selectClasses} mt-1`}
                  value={colDesc}
                  disabled={running}
                  onChange={(e) => {
                    setColDesc(Number(e.target.value));
                    setEtats({});
                  }}
                >
                  <option value={0}>(aucune)</option>
                  {entetes.map((c) => (
                    <option key={c.index} value={c.index}>
                      {c.nom}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              <strong className="text-metro">{lignes.length}</strong> produit
              {lignes.length > 1 ? "s" : ""} détecté
              {lignes.length > 1 ? "s" : ""}.
              {!colTitre && !colDesc && " Choisissez au moins une colonne."}
            </p>
          </Section>
        )}

        {wb && ws && lignes.length > 0 && (
          <Section step={3} title="Traduction">
            <div className="flex flex-wrap items-center gap-3">
              {!running ? (
                <button
                  onClick={lancer}
                  className="rounded-xl bg-sun px-6 py-3 text-base font-extrabold text-metro-dark shadow-sm transition hover:bg-sun-dark"
                >
                  {nbTerminees > 0 || nbErreurs > 0
                    ? "Reprendre la traduction"
                    : "Lancer la traduction"}
                </button>
              ) : (
                <button
                  onClick={arreter}
                  className="rounded-xl border-2 border-red-300 bg-white px-6 py-3 text-base font-bold text-red-700 hover:bg-red-50"
                >
                  Arrêter
                </button>
              )}
              <button
                onClick={telecharger}
                disabled={!peutExporter}
                className="rounded-xl bg-metro px-6 py-3 text-base font-bold text-white transition hover:bg-metro-dark disabled:opacity-40"
              >
                Télécharger l&apos;Excel ↓
              </button>
              <span className="text-xs text-slate-500">
                {running
                  ? "Ne fermez pas cette page pendant la traduction."
                  : "Les traductions déjà faites sont gardées en mémoire : en cas d'arrêt, vous pouvez reprendre."}
              </span>
            </div>

            <div className="mt-5">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold text-slate-800">
                  {nbTerminees} / {lignes.length} produits ({pct} %)
                </span>
                <span className="text-slate-500">
                  {running &&
                    eta > 0 &&
                    `Temps restant estimé : ${formatDuree(eta)} · `}
                  {running &&
                    debut > 0 &&
                    `écoulé : ${formatDuree(maintenant - debut)}`}
                </span>
              </div>
              <div className="h-4 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-metro to-sun transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
                <span>
                  <strong className="text-green-700">
                    {compte((s) => s === "valide")}
                  </strong>{" "}
                  validés
                </span>
                <span>
                  <strong className="text-amber-700">
                    {compte((s) => s === "corrige")}
                  </strong>{" "}
                  corrigés
                </span>
                <span>
                  <strong className="text-red-700">
                    {compte((s) => s === "acorriger")}
                  </strong>{" "}
                  à corriger
                </span>
                <span>
                  <strong className="text-red-700">{nbErreurs}</strong> en
                  erreur
                </span>
                <span>
                  <strong>{nbAttente}</strong> en attente
                </span>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Ligne</th>
                    <th className="px-3 py-2">Titre</th>
                    <th className="px-3 py-2">Statut</th>
                    <th className="px-3 py-2">Problèmes</th>
                    <th className="px-3 py-2">Langues</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lignes.slice(0, 300).map((l) => {
                    const e = etats[l.numero] ?? {
                      statut: "attente" as StatutLigne,
                    };
                    const lib = LIBELLES[e.statut];
                    const nbPb = e.res?.problemes
                      ? e.res.problemes.split("\n").length
                      : 0;
                    return (
                      <tr key={l.numero} className="text-slate-800">
                        <td className="px-3 py-2 text-slate-500">{l.numero}</td>
                        <td
                          className="max-w-md truncate px-3 py-2"
                          title={l.titre}
                        >
                          {l.titre || (
                            <span className="text-slate-400">(sans titre)</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${lib.classes}`}
                          >
                            {lib.label}
                          </span>
                          {e.erreur && (
                            <div className="mt-1 max-w-xs text-xs text-red-700">
                              {e.erreur}
                            </div>
                          )}
                        </td>
                        <td
                          className="px-3 py-2 text-xs text-slate-600"
                          title={e.res?.problemes}
                        >
                          {nbPb
                            ? `${nbPb} correction${nbPb > 1 ? "s" : ""}`
                            : e.res
                              ? "—"
                              : ""}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            {LANGUES.map((lg) => {
                              const t = e.res?.traductions?.[lg.code];
                              const cls = !t
                                ? "bg-slate-100 text-slate-400"
                                : "error" in t
                                  ? "bg-red-100 text-red-700"
                                  : "bg-green-100 text-green-800";
                              return (
                                <span
                                  key={lg.code}
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${cls}`}
                                >
                                  {BADGES[lg.code]}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {lignes.length > 300 && (
                <p className="bg-slate-50 p-2 text-center text-xs text-slate-500">
                  Affichage des 300 premières lignes (les {lignes.length} sont
                  traitées et exportées).
                </p>
              )}
            </div>
          </Section>
        )}
      </main>
      <Footer />
    </>
  );
}
