"use client";

import { useMemo, useState } from "react";
import { checkProduct, type Mode, type Verdict } from "@/lib/checker";

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

  const result = useMemo(
    () => checkProduct(titre, description, mode),
    [titre, description, mode],
  );
  const empty = !titre.trim() && !description.trim();
  const issues = [...result.titre.issues, ...result.description.issues];

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

          <p className="text-xs text-gray-500">
            Prochaine étape : traduction FR → DE / ES / IT / PT / HR.
          </p>
        </section>
      )}
    </main>
  );
}
