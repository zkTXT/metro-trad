import { LANGUES, translateText } from "@/lib/translate";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    titre?: unknown;
    description?: unknown;
  } | null;

  const titre = typeof body?.titre === "string" ? body.titre : "";
  const description = typeof body?.description === "string" ? body.description : "";

  if (!titre.trim() && !description.trim()) {
    return Response.json({ error: "Aucun texte à traduire" }, { status: 400 });
  }
  if (titre.length > 5000 || description.length > 20000) {
    return Response.json({ error: "Texte trop long" }, { status: 413 });
  }

  const results = await Promise.all(
    LANGUES.map(async ({ code }) => {
      try {
        const [t, d] = await Promise.all([
          translateText(titre, code),
          translateText(description, code),
        ]);
        return [code, { titre: t, description: d }] as const;
      } catch {
        return [code, { error: "La traduction a échoué, réessayez." }] as const;
      }
    }),
  );

  return Response.json({ traductions: Object.fromEntries(results) });
}
