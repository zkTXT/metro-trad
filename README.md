# Metro Trad

🇬🇧 English · 🇫🇷 [Version française](README.fr.md)

A web tool to **prepare product listings before uploading them to the METRO marketplace**: it checks the texts against the platform's content rules, removes whatever would get the listing rejected, then translates the title and description into the six required languages.

It was built for **Bistromania** (furniture and equipment for the hospitality industry), a seller that adds dozens of products on a regular basis and used to check and translate everything by hand.

> **Independent tool, not affiliated with METRO.** "METRO" is a trademark of its respective owners. The built-in rules come from rejections observed in practice; they do not replace the platform's own validation.
>
> The application interface is in **French**.

---

## Table of contents

- [What it does](#what-it-does)
- [Features](#features)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [The Metro rules](#the-metro-rules)
- [Translation: engines, quotas, memory, glossary](#translation-engines-quotas-memory-glossary)
- [Excel import (Metro template)](#excel-import-metro-template)
- [Project structure](#project-structure)
- [Privacy](#privacy)
- [Known limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)

---

## What it does

METRO is strict about listing content. A typical rejection message from the platform reads (translated from French):

> *"Please note that you cannot currently present optional components (accessories, extra parts…) or variants (other sizes, colours…) for a product. Please remove any information about variants and/or optional components that are not already included in the offer. If you want to offer them, submit them as separate products."*

On top of that, every text has to be translated into several languages and must never mention your own shop. Metro Trad automates this work:

1. **Cleaning**: detects and removes variants, options, promotional wording, shop names, etc.
2. **Verdict**: *Valid*, *Automatically corrected (please review)* or *Risk of rejection*.
3. **Translation**: German, Croatian, Spanish, Italian, Dutch and Portuguese (Portugal), from French.
4. **Excel import**: processes a whole file (35 products or more) in the METRO import format, filling the right columns directly.

Everything is **free**: no paid API key, no account required.

## Features

### "Product sheet" page (*Fiche produit*)
- Enter a title and description in French, with character counters.
- Two modes: **Remove automatically** (the text is corrected) or **Flag only** (the text is kept and the problems are listed).
- Detailed list of the problems found, with the offending excerpt.
- Shows METRO's standard message when a variant or an option is detected.
- Translation into the 6 languages, displayed as a grid: one card per language, each with a *Title* box, a *Description* box and a **Copy** button.
- "Retranslate without memory" button.

### "Excel import" page (*Import Excel*)
- Reads an `.xlsx` file **in the browser** (the file is never uploaded anywhere).
- **Automatic detection of the METRO import template** (`Product name XX` / `Description XX` columns), or manual column selection for free-form files.
- Progress bar, estimated remaining time, *Stop* and *Resume* buttons.
- Writes the results **into the template's existing columns** without adding any, while keeping formatting, dropdown lists and hidden sheets.
- Automatically adds the **standard safety instructions** in the 7 languages.
- Download of the filled file and of a separate **report** (status and corrections per product).

### Hospitality glossary
Per-language vocabulary corrections applied after each translation (for example "restauro" → "restauração" in Portuguese). Editable from the page.

## Installation

Requirements: **Node.js 20.9 or newer** (tested with Node 22) and npm.

```bash
git clone https://github.com/zkTXT/metro-trad.git
cd metro-trad
npm install
```

## Configuration

Copy the example file, then fill it in:

```bash
cp .env.example .env.local
```

| Variable | Purpose |
|---|---|
| `MYMEMORY_EMAILS` | Email addresses (comma-separated) used to identify your requests to MyMemory, the fallback engine. Each address has its own daily quota; the next one takes over when one is used up. Optional: without any email, the (much smaller) anonymous quota applies. |
| `AZURE_TRANSLATOR_KEY`, `AZURE_TRANSLATOR_REGION` | Optional. Key and region of an Azure Translator resource (free F0 tier recommended). When set, Azure is used first. `AZURE_TRANSLATOR_ENDPOINT` can override the default endpoint. |

`.env.local` is ignored by git and will never be published. **Restart the server after any change.**

## Usage

```bash
npm run dev
```

Then open <http://localhost:3000>.

| Command | Effect |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Runs the production build |
| `npm run lint` | Code linting |

## The Metro rules

All the rules live in **`src/lib/regles.json`** and can be edited without touching the code:

| Key | Purpose |
|---|---|
| `titreMaxCaracteres`, `descriptionMaxCaracteres` | Maximum lengths. Defaults are the limits stated in METRO's import template: 150 characters for the title, 4000 for the description. |
| `boutique` | Names of your shop that must never appear (the name and its variants, including the web address). **Replace with your own.** |
| `motsInterdits` | Words or expressions (regular expressions) removed from the text, with the reason shown to the user. |
| `phrasesInterdites` | Patterns that cause the **whole sentence** to be removed (variants and ranges: "exists in several colours"…; options: "optional", "sold separately"…; references to other products, the website or the catalogue: "discover also…", "find…", "our armchairs…", "our range"; over-the-top promotional wording: "you will love it"…). Each rule has a category (`variante`, `option`, `reference`, `marketing`). |
| `messageMetro` | Standard message displayed when a variant or option is detected. |

Behaviours worth knowing:
- A description **with no problem is returned identical, character for character**.
- **Title formatting** (mechanical, no AI): separator dashes (`Chair YORK - Brown - Black legs`) become commas (`Chair YORK, brown, black legs`), the apostrophe becomes typographic, and the dimensions are added or reformatted at the end as ` – 44 x 44 x 110 cm` (width x depth x height). The dimensions are never invented: they come from the title itself, from the `Width` / `Length` / `Height` columns of the Metro template, or from a `L 56 x P 62 x H 81 cm` style mention in the description (labelled values are put back in the right order; only `cm` is handled). A title that already looks like `… – 44 x 44 x 110 cm` is left untouched. The tool does **not** reorder a title or guess its material or colour: that would need generative AI.
- In the Metro template, each field is handled separately: a title that gets reformatted is translated again, but a description that did not change keeps its existing translations.
- When removing a word would leave an orphan fragment (for example "on."), the whole sentence is removed from a description; in a title, only the dangling words at the end are trimmed.
- Lengths are never corrected automatically: a title that is too long is flagged.
- The engine only finds what is in the rules. **Add your own METRO rejections** over time.
- The patterns are written for **French** texts, since French is the source language.

## Translation: engines, quotas, memory, glossary

### Engines
1. **Azure Translator** (official, *optional*): used first when `AZURE_TRANSLATOR_KEY` is set in `.env.local`. The free **F0** tier allows 2 million characters per month with no arbitrary blocking, which is roughly 300 average listings per month in 6 languages. Creating the Azure account normally requires a payment card; according to a Microsoft support answer, exceeding the F0 monthly quota returns an error (`403001`) until the next month instead of billing you, and you must upgrade yourself to pay. This is not stated on the pricing page, so check your own account (Azure Cost Management: set a small budget alert) and make sure the pricing tier is *Free F0*. Set `AZURE_TRANSLATOR_REGION` too (for example `westeurope`).
2. **Google Translate** (free, unofficial endpoint, no key): main engine when Azure is not configured, good quality.
3. **MyMemory** (free): last-resort fallback, used when the others refuse. Slightly lower quality.

If Azure refuses (quota, key, rate limit), it is paused for a while and the next engine takes over automatically.

Google limits the number of requests per IP address (HTTP 429 error). The tool protects itself:
- a delay between requests (300 ms in normal use, **4 seconds during an Excel import**);
- a **circuit breaker**: after a refusal, Google is paused for 2 minutes, then a single probe request decides whether to resume it; the pause doubles on every consecutive refusal (up to 30 minutes);
- a single request per language and per product (title and description are sent together).

### MyMemory quotas
Roughly 5,000 characters per day without an email and roughly 50,000 per day with one (according to the service's documentation; please verify). An average listing (~1,100 characters) costs about 6,600 characters of quota for the 6 languages.

### Translation memory
Every translated sentence is remembered per language in `data/memoire.json` (ignored by git). Translating a text that was already seen uses no quota, and if only one sentence changes, only that one is translated again.

### Glossary
Corrections are stored in `data/glossaire.json` and are editable from the page. They are applied **after** the memory, so a new correction takes effect immediately. A replacement only affects the exact word and preserves capitalisation; remember to add plural forms too.

## Excel import (Metro template)

For a file in the METRO import format:

- **Source**: `Product name FR` and `Description FR`. They are cleaned, then written back into the same cells.
- **Targets**: `Product name` / `Description` for DE, HR, ES, IT, NL and PT.
- **No column is added** to the file.
- **Cells that are already filled**: kept, unless the French had to be corrected (the languages are then translated again) or the "Replace existing translations too" option is ticked.
- **Safety instructions**: empty `Product safety instructions XX` cells receive the standard text (`src/lib/consignes.ts`). A cell that is already filled is never modified.
- **Report**: a second Excel file lists the status, the corrections and the state of each language for every product.

For a free-form file, the tool guesses the title and description columns from their headers; you can correct them, as well as the header row. The results are then **added as new columns** on the right of the file.

Only the title and the description are translated; the template's other multilingual fields (key features, material composition, warranty…) are not.

## Project structure

```
data/
  glossaire.json          Vocabulary corrections per language
src/
  app/
    page.tsx              "Product sheet" page
    import/page.tsx       "Excel import" page
    api/translate/        Translation route
    api/glossaire/        Glossary management route
  components/Chrome.tsx   Shared header and footer
  lib/
    regles.json           Metro rules (to customise)
    checker.ts            Cleaning and verdict engine
    translate.ts          Translation engines (Google, MyMemory)
    memoire.ts            Translation memory
    glossaire.ts          Glossary application
    excel.ts              Excel reading / writing, Metro template
    consignes.ts          Standard safety instructions
```

Technologies: Next.js (App Router), React, TypeScript, Tailwind CSS, ExcelJS, JSZip.

## Privacy

- Excel files are read **in the browser** and are never sent to a third-party server.
- The **texts** (titles and descriptions) are sent to the translation services (Google, MyMemory): do not put anything confidential in them.
- `.env.local` (your emails) and `data/memoire.json` are not version-controlled.

## Known limitations

- The Google endpoint used is **unofficial**: it may stop working or become heavily rate-limited without notice. For intensive or professional use, prefer an official API (Azure Translator, Google Cloud Translation), which generally requires an account with a payment method.
- Free machine translation calls for **proofreading**, especially with the fallback engine.
- The glossary and the memory are stored in **local files**: the application is meant to run on a workstation or a regular server, not on a serverless host with a read-only file system (Vercel, for example) without adaptation.
- `.xlsx` only (no `.xls` or `.csv`).
- No guarantee of approval by METRO: the tool reduces the risk of rejection, it does not remove it.

## Troubleshooting

| Problem | Solution |
|---|---|
| "The free translation service is temporarily overloaded" (French message) | Google and MyMemory are both refusing. Wait 1 to 2 minutes and try again; the sentences already translated are in memory. |
| MyMemory quota reached | Add more emails to `MYMEMORY_EMAILS`, or resume the next day. |
| My emails are not taken into account | Restart `npm run dev` after editing `.env.local`. |
| The import does not detect my columns | Check the header row and pick the columns from the dropdowns. |
| File rejected | Save it as `.xlsx`. |

## Author

Created by **Ilyes Zekri** for **Bistromania**.

## License

Released under the [MIT license](LICENSE): you may use, modify and redistribute this code, including commercially, provided the copyright notice is kept. The software is provided "as is", without warranty.

The trademarks mentioned (METRO, Google, etc.) belong to their respective owners; this license only covers the code in this repository.
