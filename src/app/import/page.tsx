"use client";

import { useMemo, useRef, useState } from "react";
import type { Workbook } from "exceljs";
import { Footer, Header } from "@/components/Chrome";
import { checkProduct } from "@/lib/checker";
import {
  detecterModeleMetro,
  devinerColonnes,
  exporterClasseur,
  exporterMetro,
  exporterRapport,
  lireClasseur,
  lireEntetes,
  lireLignes,
  lireLignesMetro,
  type LigneMetro,
  type LigneSource,
  type ModeleMetro,
  type ResultatLigne,
} from "@/lib/excel";
import { LANGUES, type LangCode } from "@/lib/translate";

type StatutLigne =
  "attente" | "encours" | "valide" | "corrige" | "acorriger" | "erreur";

type Ligne = LigneSource & {
  ref?: string;
  dimensions?: string | null;
  existant?: LigneMetro["existant"];
};

interface EtatLigne {
  statut: StatutLigne;
  res?: ResultatLigne;
  erreur?: string;
  conservees?: string[]; // langues déjà remplies dans le fichier, non retraduites
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

function telecharger(blob: Blob, nom: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export default function ImportPage() {
  const [wb, setWb] = useState<Workbook | null>(null);
  const [nomFichier, setNomFichier] = useState("");
  const [feuille, setFeuille] = useState("");
  const [metro, setMetro] = useState<ModeleMetro | null>(null);
  const [ecraser, setEcraser] = useState(false);
  const [consignes, setConsignes] = useState(true);
  const [ligneEntete, setLigneEntete] = useState(1);
  const [colTitre, setColTitre] = useState(0);
  const [colDesc, setColDesc] = useState(0);
  const [etats, setEtats] = useState<Record<number, EtatLigne>>({});
  const [running, setRunning] = useState(false);
  const [erreurFichier, setErreurFichier] = useState<string | null>(null);
  const [debut, setDebut] = useState(0);
  const [maintenant, setMaintenant] = useState(0);
  const [durees, setDurees] = useState<number[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ws = useMemo(
    () => (wb && feuille ? (wb.getWorksheet(feuille) ?? null) : null),
    [wb, feuille],
  );
  const colonnesOrigine = useMemo(
    () => (ws ? Math.max(ws.actualColumnCount, ws.columnCount) : 0),
    [ws],
  );
  const entetes = useMemo(
    () => (ws && !metro ? lireEntetes(ws, ligneEntete) : []),
    [ws, metro, ligneEntete],
  );
  const lignes: Ligne[] = useMemo(() => {
    if (!ws) return [];
    if (metro) return lireLignesMetro(ws, metro);
    return lireLignes(ws, ligneEntete, colTitre, colDesc);
  }, [ws, metro, ligneEntete, colTitre, colDesc]);

  const feuillesVisibles = wb
    ? wb.worksheets.filter((w) => w.state === "visible").map((w) => w.name)
    : [];

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
  const eta = running && moyenne ? moyenne * (lignes.length - nbTerminees) : 0;

  function choisirFeuille(w: Workbook, nom: string) {
    const sheet = w.getWorksheet(nom);
    if (!sheet) return;
    const m = detecterModeleMetro(sheet);
    setMetro(m);
    if (m) {
      setLigneEntete(m.ligneEntete);
      setColTitre(m.fr.titre);
      setColDesc(m.fr.description);
    } else {
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
      setLigneEntete(ligne);
      setColTitre(devine.titre);
      setColDesc(devine.description);
    }
    setFeuille(nom);
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
      const premiere = w.worksheets.find((x) => x.state === "visible");
      if (!premiere) throw new Error("Le fichier ne contient aucune feuille.");
      setWb(w);
      setNomFichier(file.name);
      choisirFeuille(w, premiere.name);
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
    l: Ligne,
    signal: AbortSignal,
  ): Promise<EtatLigne> {
    const check = checkProduct(l.titre, l.description, "supprimer", {
      dimensions: l.dimensions,
    });
    const listeProblemes = [...check.titre.issues, ...check.description.issues];
    const problemes = listeProblemes
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

    // Cases à écrire. Dans le modèle Metro, chaque champ est traité séparément : une
    // case déjà remplie est conservée, sauf si le français de CE champ a changé (les
    // anciennes traductions ne correspondraient plus) ou si « remplacer » est coché.
    // Ainsi, un titre reformaté ne réécrit pas une description déjà validée.
    let cibles: string[] | undefined;
    let conservees: string[] = [];
    let ecrire: ResultatLigne["ecrire"];
    if (metro) {
      const titreModifie = check.titre.issues.length > 0;
      const descModifiee = check.description.issues.length > 0;
      const disponibles = LANGUES.map((x) => x.code as string).filter(
        (c) => metro.langues[c as LangCode],
      );
      ecrire = {};
      for (const c of disponibles) {
        const e = l.existant?.[c as LangCode];
        ecrire[c] = {
          titre:
            !!base.titreNettoye.trim() &&
            (ecraser || titreModifie || !e?.titre.trim()),
          description:
            !!base.descriptionNettoyee.trim() &&
            (ecraser || descModifiee || !e?.description.trim()),
        };
      }
      const aTraduire = disponibles.filter(
        (c) => ecrire![c].titre || ecrire![c].description,
      );
      cibles = aTraduire;
      conservees = disponibles.filter((c) => !aTraduire.includes(c));
      if (aTraduire.length === 0) {
        return {
          statut: statutVerdict,
          res: { ...base, statut: LIBELLES[statutVerdict].export },
          conservees,
        };
      }
    }

    const r = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titre: base.titreNettoye,
        description: base.descriptionNettoyee,
        import: true,
        langues: cibles,
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
      res: { ...base, statut: LIBELLES[statut].export, traductions, ecrire },
      conservees,
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

  const resultats = () => {
    const map = new Map<number, ResultatLigne>();
    for (const l of lignes) {
      const res = etats[l.numero]?.res;
      if (res) map.set(l.numero, res);
    }
    return map;
  };

  async function telechargerFichier() {
    if (!wb || !ws) return;
    const blob = metro
      ? await exporterMetro(wb, ws, metro, resultats(), {
          consignes:
            consignes && Object.keys(metro.securite).length > 0
              ? { lignes: lignes.map((l) => l.numero) }
              : undefined,
        })
      : await exporterClasseur(
          wb,
          ws,
          ligneEntete,
          resultats(),
          colonnesOrigine,
        );
    const base = nomFichier.replace(/\.xlsx$/i, "");
    telecharger(blob, `${base} - ${metro ? "rempli" : "traduit"}.xlsx`);
  }

  async function telechargerRapport() {
    const blob = await exporterRapport(
      lignes
        .filter((l) => etats[l.numero]?.res)
        .map((l) => {
          const e = etats[l.numero];
          const langues = LANGUES.map((lg) => {
            const t = e.res?.traductions?.[lg.code];
            const etat = t
              ? "error" in t
                ? "erreur"
                : "traduit"
              : e.conservees?.includes(lg.code)
                ? "déjà rempli"
                : "—";
            return `${BADGES[lg.code]} ${etat}`;
          }).join(", ");
          return {
            numero: l.numero,
            ref: l.ref ?? "",
            titre: l.titre,
            statut: e.res?.statut ?? "",
            problemes: e.res?.problemes ?? "",
            langues,
          };
        }),
    );
    telecharger(blob, nomFichier.replace(/\.xlsx$/i, "") + " - rapport.xlsx");
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
              Format .xlsx (modèle d&apos;import Metro ou fichier libre). Le
              fichier reste sur votre ordinateur : il n&apos;est pas envoyé sur
              internet.
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
          <Section
            step={2}
            title={metro ? "Modèle Metro détecté" : "Colonnes à traduire"}
          >
            {feuillesVisibles.length > 1 && (
              <label className="mb-4 block max-w-xs text-xs font-semibold text-slate-700">
                Feuille
                <select
                  className={`${selectClasses} mt-1`}
                  value={feuille}
                  disabled={running}
                  onChange={(e) => choisirFeuille(wb, e.target.value)}
                >
                  {feuillesVisibles.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
            )}

            {metro ? (
              <div className="space-y-3 text-sm text-slate-700">
                <div className="rounded-xl border border-green-300 bg-green-50 p-3.5 text-green-900">
                  <p className="font-semibold">
                    Le fichier suit le modèle d&apos;import Metro (en-têtes en
                    ligne {metro.ligneEntete}).
                  </p>
                  <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-[13px]">
                    <li>
                      Source : <strong>Product name FR</strong> et{" "}
                      <strong>Description FR</strong> (nettoyés selon les règles
                      Metro, puis réécrits dans les mêmes cases).
                    </li>
                    <li>
                      Traductions écrites{" "}
                      <strong>dans les colonnes existantes</strong> :{" "}
                      {Object.keys(metro.langues)
                        .map((c) => BADGES[c])
                        .join(", ")}
                      . Aucune colonne n&apos;est ajoutée au fichier.
                    </li>
                    <li>
                      Les cases déjà remplies sont conservées, sauf si le
                      français a dû être corrigé (les langues sont alors
                      retraduites).
                    </li>
                  </ul>
                </div>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={ecraser}
                    disabled={running}
                    onChange={(e) => setEcraser(e.target.checked)}
                    className="h-4 w-4 accent-[#003a80]"
                  />
                  Remplacer aussi les traductions déjà présentes dans le fichier
                </label>
                {Object.keys(metro.securite).length > 0 && (
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={consignes}
                      onChange={(e) => setConsignes(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[#003a80]"
                    />
                    <span>
                      Ajouter les <strong>consignes de sécurité</strong>{" "}
                      standard dans les cases « Product safety instructions » (
                      {Object.keys(metro.securite)
                        .map((c) => (c === "fr" ? "FR" : BADGES[c]))
                        .join(", ")}
                      ). Les cases déjà remplies ne sont pas modifiées.
                    </span>
                  </label>
                )}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-3">
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
            )}
            <p className="mt-3 text-sm text-slate-600">
              <strong className="text-metro">{lignes.length}</strong> produit
              {lignes.length > 1 ? "s" : ""} détecté
              {lignes.length > 1 ? "s" : ""}.
              {!metro &&
                !colTitre &&
                !colDesc &&
                " Choisissez au moins une colonne."}
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
                  onClick={() => abortRef.current?.abort()}
                  className="rounded-xl border-2 border-red-300 bg-white px-6 py-3 text-base font-bold text-red-700 hover:bg-red-50"
                >
                  Arrêter
                </button>
              )}
              <button
                onClick={telechargerFichier}
                disabled={!peutExporter}
                className="rounded-xl bg-metro px-6 py-3 text-base font-bold text-white transition hover:bg-metro-dark disabled:opacity-40"
              >
                {metro
                  ? "Télécharger le fichier Metro ↓"
                  : "Télécharger l'Excel ↓"}
              </button>
              {metro && (
                <button
                  onClick={telechargerRapport}
                  disabled={!peutExporter}
                  className="rounded-xl border-2 border-metro bg-white px-5 py-3 text-base font-bold text-metro transition hover:bg-blue-50 disabled:opacity-40"
                >
                  Rapport ↓
                </button>
              )}
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
                    <th className="px-3 py-2">Produit</th>
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
                        <td className="max-w-md px-3 py-2">
                          <div className="truncate" title={l.titre}>
                            {l.titre || (
                              <span className="text-slate-400">
                                (sans titre)
                              </span>
                            )}
                          </div>
                          {l.ref && (
                            <div className="text-xs text-slate-400">
                              {l.ref}
                            </div>
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
                              const gardee = e.conservees?.includes(lg.code);
                              const absente = metro && !metro.langues[lg.code];
                              const cls = t
                                ? "error" in t
                                  ? "bg-red-100 text-red-700"
                                  : "bg-green-100 text-green-800"
                                : gardee
                                  ? "bg-sky-100 text-sky-800"
                                  : "bg-slate-100 text-slate-400";
                              return (
                                <span
                                  key={lg.code}
                                  title={
                                    absente
                                      ? "Colonne absente du fichier"
                                      : t
                                        ? "error" in t
                                          ? "Erreur"
                                          : "Traduit"
                                        : gardee
                                          ? "Déjà rempli, conservé"
                                          : ""
                                  }
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${cls} ${absente ? "line-through" : ""}`}
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
            <p className="mt-2 text-xs text-slate-500">
              <span className="rounded bg-green-100 px-1.5 py-0.5 font-bold text-green-800">
                XX
              </span>{" "}
              traduit ·{" "}
              <span className="rounded bg-sky-100 px-1.5 py-0.5 font-bold text-sky-800">
                XX
              </span>{" "}
              déjà rempli dans le fichier, conservé ·{" "}
              <span className="rounded bg-red-100 px-1.5 py-0.5 font-bold text-red-700">
                XX
              </span>{" "}
              erreur
            </p>
          </Section>
        )}
      </main>
      <Footer />
    </>
  );
}
