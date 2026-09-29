"use client";

import { useEffect, useMemo, useState } from "react";
import { checkProduct, type Mode, type Verdict } from "@/lib/checker";
import { Footer, Header } from "@/components/Chrome";
import { LANGUES } from "@/lib/translate";

type Traduction =
  | {
      titre: string;
      description: string;
      corrections?: number;
      reprises?: number;
      nouvelles?: number;
    }
  | { error: string };

type Correction = { id: string; langue: string; mauvais: string; bon: string };

const BADGES: Record<string, string> = {
  de: "DE",
  es: "ES",
  it: "IT",
  "pt-PT": "PT",
  hr: "HR",
  nl: "NL",
};

function CopyBox({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* presse-papiers indisponible */
    }
  };
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-metro">
          {label}
        </span>
        <button
          onClick={copy}
          disabled={!text}
          className={`rounded-md px-3 py-1 text-xs font-bold transition disabled:opacity-40 ${
            copied
              ? "bg-green-600 text-white"
              : "bg-sun text-metro-dark hover:bg-sun-dark"
          }`}
        >
          {copied ? "Copié ✓" : "Copier"}
        </button>
      </div>
      <div className="min-h-11 whitespace-pre-wrap rounded-lg border border-slate-300 bg-white p-3 text-sm leading-relaxed text-slate-900">
        {text || <span className="text-slate-400">(vide)</span>}
      </div>
    </div>
  );
}

function Card({
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

const VERDICTS: Record<
  Verdict,
  { label: string; icon: string; classes: string }
> = {
  valide: {
    label: "Validé : aucun problème détecté",
    icon: "✓",
    classes: "border-green-300 bg-green-50 text-green-900",
  },
  a_verifier: {
    label: "Corrigé automatiquement : à relire avant envoi",
    icon: "!",
    classes: "border-amber-300 bg-amber-50 text-amber-900",
  },
  refuse: {
    label: "Risque de refus : correction manuelle nécessaire",
    icon: "✕",
    classes: "border-red-300 bg-red-50 text-red-900",
  },
};

const selectClasses =
  "rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 outline-none focus:border-metro focus:ring-4 focus:ring-metro/15";

function Glossaire() {
  const [entries, setEntries] = useState<Correction[]>([]);
  const [langue, setLangue] = useState<string>(LANGUES[0].code);
  const [mauvais, setMauvais] = useState("");
  const [bon, setBon] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/glossaire")
      .then((r) => r.json())
      .then((d) => setEntries(d.corrections ?? []))
      .catch(() => {});
  }, []);

  async function ajouter() {
    setErr(null);
    const res = await fetch("/api/glossaire", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ langue, mauvais, bon }),
    });
    const d = await res.json();
    if (!res.ok) return setErr(d.error ?? "Erreur");
    setEntries(d.corrections);
    setMauvais("");
    setBon("");
  }

  async function supprimer(id: string) {
    const res = await fetch(`/api/glossaire?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const d = await res.json();
    if (res.ok) setEntries(d.corrections);
    else setErr(d.error ?? "Erreur");
  }

  return (
    <details className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <summary className="flex cursor-pointer list-none items-center gap-3 text-lg font-bold text-metro">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sun text-sm font-black text-metro-dark">
          G
        </span>
        Glossaire CHR
        <span className="text-sm font-medium text-slate-500">
          ({entries.length} correction{entries.length > 1 ? "s" : ""})
        </span>
        <span className="ml-auto text-sm text-slate-400 group-open:rotate-180">
          ▾
        </span>
      </summary>

      <div className="mt-4 space-y-4">
        <p className="text-sm text-slate-600">
          Quand une traduction utilise un mot qui ne convient pas, ajoutez-le
          ici : il sera remplacé automatiquement à chaque traduction, dans la
          langue choisie. Le remplacement ne touche que le mot exact (pensez à
          ajouter aussi le pluriel).
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-slate-700">
            Langue
            <select
              className={`${selectClasses} mt-1 block`}
              value={langue}
              onChange={(e) => setLangue(e.target.value)}
            >
              {LANGUES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.nom}
                </option>
              ))}
            </select>
          </label>
          <label className="grow text-xs font-semibold text-slate-700">
            Mot à remplacer
            <input
              className={`${selectClasses} mt-1 block w-full`}
              placeholder="ex. : restauro"
              value={mauvais}
              onChange={(e) => setMauvais(e.target.value)}
            />
          </label>
          <label className="grow text-xs font-semibold text-slate-700">
            Remplacer par
            <input
              className={`${selectClasses} mt-1 block w-full`}
              placeholder="ex. : restauração"
              value={bon}
              onChange={(e) => setBon(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ajouter()}
            />
          </label>
          <button
            onClick={ajouter}
            className="rounded-lg bg-sun px-5 py-2.5 text-sm font-extrabold text-metro-dark hover:bg-sun-dark"
          >
            Ajouter
          </button>
        </div>
        {err && <p className="text-sm font-medium text-red-700">{err}</p>}

        {entries.length > 0 && (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
            {LANGUES.flatMap((l) =>
              entries
                .filter((e) => e.langue === l.code)
                .map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center gap-3 px-3 py-2 text-sm text-slate-800"
                  >
                    <span className="rounded bg-metro px-2 py-0.5 text-[11px] font-bold text-white">
                      {BADGES[l.code]}
                    </span>
                    <span className="line-through decoration-red-400">
                      {e.mauvais}
                    </span>
                    <span className="text-slate-400">→</span>
                    <span className="font-semibold">{e.bon}</span>
                    <button
                      onClick={() => supprimer(e.id)}
                      className="ml-auto rounded px-2 py-0.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      Supprimer
                    </button>
                  </li>
                )),
            )}
          </ul>
        )}
      </div>
    </details>
  );
}

const inputClasses =
  "w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-metro focus:ring-4 focus:ring-metro/15";

export default function Home() {
  const [titre, setTitre] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<Mode>("supprimer");
  const [traductions, setTraductions] = useState<Record<
    string,
    Traduction
  > | null>(null);
  const [source, setSource] = useState<{
    titre: string;
    description: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const result = useMemo(
    () => checkProduct(titre, description, mode),
    [titre, description, mode],
  );
  const empty = !titre.trim() && !description.trim();
  const issues = [...result.titre.issues, ...result.description.issues];
  const textes = {
    titre: result.titre.nettoye,
    description: result.description.nettoye,
  };
  const obsolete =
    source !== null &&
    (source.titre !== textes.titre ||
      source.description !== textes.description);
  const verdict = VERDICTS[result.verdict];
  const stats = Object.values(traductions ?? {}).reduce(
    (acc, t) =>
      "error" in t
        ? acc
        : {
            reprises: acc.reprises + (t.reprises ?? 0),
            nouvelles: acc.nouvelles + (t.nouvelles ?? 0),
          },
    { reprises: 0, nouvelles: 0 },
  );

  async function traduire(sansMemoire = false) {
    setLoading(true);
    setErreur(null);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...textes, sansMemoire }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur de traduction");
      setTraductions(data.traductions);
      setSource(textes);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur de traduction");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Header />

      <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-5">
        <Card step={1} title="Fiche produit en français">
          <div className="space-y-4">
            <label className="block">
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-sm font-semibold text-slate-800">
                  Titre
                </span>
                <span className="text-xs text-slate-500">
                  {titre.length} caractères
                </span>
              </div>
              <input
                className={inputClasses}
                placeholder="Ex. : Four à convection professionnel 4 niveaux"
                value={titre}
                onChange={(e) => setTitre(e.target.value)}
              />
            </label>
            <label className="block">
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-sm font-semibold text-slate-800">
                  Description
                </span>
                <span className="text-xs text-slate-500">
                  {description.length} caractères
                </span>
              </div>
              <textarea
                className={`${inputClasses} h-44 resize-y`}
                placeholder="Collez ici la description du produit…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-slate-800">Mode :</span>
              {(
                [
                  ["supprimer", "Supprimer automatiquement"],
                  ["signaler", "Signaler seulement"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setMode(value)}
                  className={`rounded-full border px-4 py-1.5 font-medium transition ${
                    mode === value
                      ? "border-metro bg-metro text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:border-metro"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {empty ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-6 text-center text-sm text-slate-500">
            Saisissez un titre ou une description pour lancer la vérification.
          </p>
        ) : (
          <>
            <Card step={2} title="Vérification Metro">
              <div className="space-y-4">
                <div
                  className={`flex items-center gap-3 rounded-xl border p-3.5 font-semibold ${verdict.classes}`}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-current/15 text-sm font-black">
                    {verdict.icon}
                  </span>
                  {verdict.label}
                </div>

                {issues.length > 0 && (
                  <ul className="space-y-2">
                    {issues.map((i, k) => (
                      <li
                        key={k}
                        className="rounded-lg border border-slate-200 border-l-4 border-l-sun bg-slate-50 p-3 text-sm text-slate-800"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded bg-metro px-2 py-0.5 text-[11px] font-bold uppercase text-white">
                            {i.champ}
                          </span>
                          <span className="font-semibold">{i.raison}</span>
                        </div>
                        <div className="mt-1.5 italic text-slate-600">
                          « {i.extrait} »
                        </div>
                        <div className="mt-1 text-xs font-medium text-slate-500">
                          {i.supprime
                            ? "Supprimé du texte nettoyé"
                            : "Conservé (à corriger à la main)"}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {result.messageMetro && (
                  <p className="rounded-lg border border-sun-dark/40 bg-yellow-50 p-3 text-sm leading-relaxed text-slate-800">
                    <strong className="text-metro">
                      Message type Metro :{" "}
                    </strong>
                    {result.messageMetro}
                  </p>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <CopyBox label="Titre nettoyé" text={result.titre.nettoye} />
                  <CopyBox
                    label="Description nettoyée"
                    text={result.description.nettoye}
                  />
                </div>
              </div>
            </Card>

            <Card step={3} title="Traduction">
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => traduire()}
                    disabled={loading || result.verdict === "refuse"}
                    className="rounded-xl bg-sun px-6 py-3 text-base font-extrabold text-metro-dark shadow-sm transition hover:bg-sun-dark disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading
                      ? "Traduction en cours…"
                      : "Traduire dans les 6 langues"}
                  </button>
                  <span className="text-sm text-slate-500">
                    Allemand · Croate · Espagnol · Italien · Néerlandais ·
                    Portugais
                  </span>
                </div>
                {result.verdict === "refuse" && (
                  <p className="text-sm font-medium text-red-700">
                    Corrigez d&apos;abord les problèmes avant de traduire.
                  </p>
                )}
                {erreur && (
                  <p className="text-sm font-medium text-red-700">{erreur}</p>
                )}

                {traductions && (
                  <div className="space-y-4">
                    {obsolete && (
                      <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900">
                        Le texte a changé depuis la traduction : relancez «
                        Traduire ».
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                      <span>
                        Mémoire des traductions :{" "}
                        <strong className="text-metro">{stats.reprises}</strong>{" "}
                        phrase{stats.reprises > 1 ? "s" : ""} reprise
                        {stats.reprises > 1 ? "s" : ""},{" "}
                        <strong className="text-metro">
                          {stats.nouvelles}
                        </strong>{" "}
                        nouvelle{stats.nouvelles > 1 ? "s" : ""} traduite
                        {stats.nouvelles > 1 ? "s" : ""}
                      </span>
                      <button
                        onClick={() => traduire(true)}
                        disabled={loading}
                        className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-metro disabled:opacity-50"
                      >
                        Retraduire sans la mémoire
                      </button>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {LANGUES.map((l) => {
                        const t = traductions[l.code];
                        return (
                          <div
                            key={l.code}
                            className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                          >
                            <div className="flex items-center gap-3 bg-metro px-4 py-2.5">
                              <span className="rounded bg-sun px-2 py-0.5 text-xs font-black text-metro-dark">
                                {BADGES[l.code]}
                              </span>
                              <h3 className="font-bold text-white">{l.nom}</h3>
                              {t && !("error" in t) && !!t.corrections && (
                                <span className="ml-auto rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold text-white">
                                  {t.corrections} correction
                                  {t.corrections > 1 ? "s" : ""} glossaire
                                </span>
                              )}
                            </div>
                            <div className="space-y-4 p-4">
                              {!t || "error" in t ? (
                                <p className="text-sm font-medium text-red-700">
                                  {t && "error" in t
                                    ? t.error
                                    : "Pas de résultat"}
                                </p>
                              ) : (
                                <>
                                  <CopyBox label="Titre" text={t.titre} />
                                  <CopyBox
                                    label="Description"
                                    text={t.description}
                                  />
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </>
        )}

        <Glossaire />
      </main>

      <Footer />
    </>
  );
}
