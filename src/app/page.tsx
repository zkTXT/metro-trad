"use client";

import { useMemo, useState } from "react";
import { checkProduct, type Mode, type Verdict } from "@/lib/checker";
import { LANGUES } from "@/lib/translate";

type Traduction = { titre: string; description: string } | { error: string };

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
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <button
          onClick={copy}
          disabled={!text}
          className="rounded border px-2 py-0.5 text-xs hover:bg-gray-100 disabled:opacity-40"
        >
          {copied ? "Copié ✓" : "Copier"}
        </button>
      </div>
      <div className="rounded border bg-white p-2 text-sm whitespace-pre-wrap min-h-10">
        {text}
      </div>
    </div>
  );
}

const VERDICTS: Record<Verdict, { label: string; classes: string }> = {
  valide: {
    label: "Validé : aucun problème détecté",
    classes: "bg-green-100 text-green-900 border-green-300",
  },
  a_verifier: {
    label: "Corrigé automatiquement : à relire avant envoi",
    classes: "bg-amber-100 text-amber-900 border-amber-300",
  },
  refuse: {
    label: "Risque de refus : correction manuelle nécessaire",
    classes: "bg-red-100 text-red-900 border-red-300",
  },
};

export default function Home() {
  const [titre, setTitre] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<Mode>("supprimer");
  const [traductions, setTraductions] = useState<Record<string, Traduction> | null>(null);
  const [source, setSource] = useState<{ titre: string; description: string } | null>(null);
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
    (source.titre !== textes.titre || source.description !== textes.description);

  async function traduire() {
    setLoading(true);
    setErreur(null);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(textes),
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
    <main className="mx-auto max-w-4xl p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Metro : vérificateur de fiche produit</h1>
        <p className="text-sm text-gray-600">
          Collez le titre et la description en français. Les règles sont dans{" "}
          <code>src/lib/regles.json</code>.
        </p>
      </header>

      <section className="space-y-3">
        <label className="block">
          <span className="text-sm font-medium">Titre</span>
          <input
            className="mt-1 w-full rounded border p-2"
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
          />
          <span className="text-xs text-gray-500">{titre.length} caractères</span>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Description</span>
          <textarea
            className="mt-1 w-full rounded border p-2 h-40"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <span className="text-xs text-gray-500">
            {description.length} caractères
          </span>
        </label>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={mode === "supprimer"}
              onChange={() => setMode("supprimer")}
            />
            Supprimer automatiquement
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={mode === "signaler"}
              onChange={() => setMode("signaler")}
            />
            Signaler seulement
          </label>
        </div>
      </section>

      {!empty && (
        <section className="space-y-4">
          <div className={`rounded border p-3 font-medium ${VERDICTS[result.verdict].classes}`}>
            {VERDICTS[result.verdict].label}
          </div>

          {issues.length > 0 && (
            <ul className="space-y-2">
              {issues.map((i, k) => (
                <li key={k} className="rounded border p-2 text-sm">
                  <span className="font-semibold uppercase text-xs mr-2">
                    {i.champ}
                  </span>
                  {i.raison}
                  <div className="mt-1 text-gray-600 italic">« {i.extrait} »</div>
                  <div className="text-xs">
                    {i.supprime ? "Supprimé du texte nettoyé" : "Conservé (à corriger à la main)"}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {result.messageMetro && (
            <p className="rounded bg-gray-100 p-3 text-sm text-gray-700">
              <strong>Message type Metro :</strong> {result.messageMetro}
            </p>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h2 className="font-semibold mb-1">Titre nettoyé</h2>
              <p className="rounded border p-2 min-h-10">{result.titre.nettoye}</p>
            </div>
            <div>
              <h2 className="font-semibold mb-1">Description nettoyée</h2>
              <p className="rounded border p-2 min-h-10 whitespace-pre-wrap">
                {result.description.nettoye}
              </p>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={traduire}
              disabled={loading || result.verdict === "refuse"}
              className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Traduction en cours…" : "Traduire dans les 5 langues"}
            </button>
            {result.verdict === "refuse" && (
              <span className="ml-3 text-sm text-red-700">
                Corrigez d&apos;abord les problèmes avant de traduire.
              </span>
            )}
            {erreur && <p className="mt-2 text-sm text-red-700">{erreur}</p>}
          </div>

          {traductions && (
            <div className="space-y-4">
              {obsolete && (
                <p className="rounded bg-amber-100 p-2 text-sm text-amber-900">
                  Le texte a changé depuis la traduction : relancez « Traduire ».
                </p>
              )}
              {LANGUES.map((l) => {
                const t = traductions[l.code];
                return (
                  <div key={l.code} className="rounded border bg-gray-50 p-3 space-y-3">
                    <h3 className="font-semibold">
                      {l.drapeau} {l.nom}
                    </h3>
                    {!t || "error" in t ? (
                      <p className="text-sm text-red-700">
                        {t && "error" in t ? t.error : "Pas de résultat"}
                      </p>
                    ) : (
                      <>
                        <CopyBox label="Titre" text={t.titre} />
                        <CopyBox label="Description" text={t.description} />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
