# Metro Trad

🇬🇧 [English version](README.md) · 🇫🇷 Français

Outil web pour **préparer les fiches produit avant leur envoi sur la marketplace METRO** : il vérifie les textes selon les règles de contenu de la plateforme, supprime ce qui poserait problème, puis traduit le titre et la description dans les 6 langues attendues.

Il a été conçu pour la société **Bistromania** (mobilier et équipement CHR), qui ajoute régulièrement des dizaines de produits et devait jusqu'ici tout vérifier et traduire à la main.

> **Outil indépendant, non affilié à METRO.** « METRO » est une marque de ses propriétaires. Les règles intégrées sont celles observées dans les refus de fiches ; elles ne remplacent pas la validation de la plateforme.

---

## Sommaire

- [Ce que fait l'outil](#ce-que-fait-loutil)
- [Fonctionnalités](#fonctionnalités)
- [Installation](#installation)
- [Configuration](#configuration)
- [Utilisation](#utilisation)
- [Les règles Metro](#les-règles-metro)
- [Traduction : moteurs, quotas, mémoire, glossaire](#traduction--moteurs-quotas-mémoire-glossaire)
- [Import Excel (modèle Metro)](#import-excel-modèle-metro)
- [Structure du projet](#structure-du-projet)
- [Confidentialité](#confidentialité)
- [Limites connues](#limites-connues)
- [Dépannage](#dépannage)

---

## Ce que fait l'outil

METRO est strict sur le contenu des fiches. Erreur type renvoyée par la plateforme :

> *« Vous ne pouvez pas présenter des composants optionnels (accessoires, pièces supplémentaires…) et variantes (autres tailles, couleurs…) pour un produit. Veuillez supprimer les informations relatives aux variantes et/ou aux composants optionnels qui ne sont pas déjà inclus dans l'offre. »*

Il faut en plus traduire chaque texte dans plusieurs langues et ne jamais parler de sa boutique. Metro Trad automatise ce travail :

1. **Nettoyage** : détecte et supprime les variantes, options, mentions promotionnelles, noms de boutique, etc.
2. **Verdict** : *Validé*, *Corrigé automatiquement (à relire)* ou *Risque de refus*.
3. **Traduction** : allemand, croate, espagnol, italien, néerlandais et portugais (Portugal), à partir du français.
4. **Import Excel** : traite un fichier complet (35 produits ou plus) au format d'import METRO, en remplissant directement les bonnes colonnes.

Le tout est **gratuit** : aucune clé d'API payante, aucun compte requis.

## Fonctionnalités

### Page « Fiche produit »
- Saisie d'un titre et d'une description en français, avec compteurs de caractères.
- Deux modes : **Supprimer automatiquement** (le texte est corrigé) ou **Signaler seulement** (le texte est conservé, les problèmes sont listés).
- Liste détaillée des problèmes détectés, avec l'extrait concerné.
- Affichage du message type de METRO quand une variante ou une option est détectée.
- Traduction dans les 6 langues, affichée en grille : une carte par langue, avec une boîte *Titre*, une boîte *Description* et un bouton **Copier** pour chacune.
- Bouton « Retraduire sans la mémoire ».

### Page « Import Excel »
- Lecture d'un fichier `.xlsx` **dans le navigateur** (le fichier n'est jamais envoyé sur internet).
- **Détection automatique du modèle d'import METRO** (colonnes `Product name XX` / `Description XX`), ou choix manuel des colonnes pour un fichier libre.
- Barre de progression, temps restant estimé, boutons *Arrêter* et *Reprendre*.
- Écriture des résultats **dans les colonnes existantes** du modèle, sans en ajouter, en conservant la mise en forme, les listes déroulantes et les feuilles cachées.
- Ajout automatique des **consignes de sécurité standard** dans les 7 langues.
- Téléchargement du fichier rempli et d'un **rapport** séparé (statut et corrections par produit).

### Glossaire CHR
Corrections de vocabulaire par langue, appliquées après chaque traduction (par exemple « restauro » → « restauração » en portugais). Modifiable depuis la page.

## Installation

Prérequis : **Node.js 20.9 ou plus récent** (testé avec Node 22) et npm.

```bash
git clone https://github.com/zkTXT/metro-trad.git
cd metro-trad
npm install
```

## Configuration

Copiez le fichier d'exemple, puis renseignez-le :

```bash
cp .env.example .env.local
```

| Variable | Rôle |
|---|---|
| `MYMEMORY_EMAILS` | Adresses email (séparées par des virgules) utilisées pour identifier vos requêtes auprès de MyMemory, le moteur de secours. Chaque adresse donne un quota quotidien ; la suivante prend le relais quand l'une est épuisée. Facultatif : sans email, le quota anonyme (beaucoup plus faible) s'applique. |

`.env.local` est ignoré par git : il ne sera jamais publié. **Redémarrez le serveur après toute modification.**

## Utilisation

```bash
npm run dev
```

Puis ouvrez <http://localhost:3000>.

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Compilation de production |
| `npm start` | Lance la version compilée |
| `npm run lint` | Vérification du code |

## Les règles Metro

Toutes les règles sont dans **`src/lib/regles.json`**, modifiable sans toucher au code :

| Clé | Rôle |
|---|---|
| `titreMaxCaracteres`, `descriptionMaxCaracteres` | Longueurs maximales. Valeurs par défaut : celles indiquées dans le modèle d'import METRO, soit 150 caractères pour le titre et 4000 pour la description. |
| `boutique` | Noms de votre boutique à ne jamais citer (le nom et ses variantes, adresse web incluse). **À remplacer par le vôtre.** |
| `motsInterdits` | Mots ou expressions (expressions régulières) retirés du texte, avec la raison affichée. |
| `phrasesInterdites` | Motifs qui font supprimer la **phrase entière** (variantes et gammes : « existe en plusieurs couleurs »… ; options : « en option », « vendu séparément »… ; renvois vers d'autres produits, le site ou le catalogue : « découvrez également… », « retrouvez… », « nos fauteuils… », « notre gamme » ; formules trop publicitaires : « vous allez adorer »…). Chaque règle a une catégorie (`variante`, `option`, `reference`, `marketing`). |
| `messageMetro` | Message type affiché quand une variante ou une option est détectée. |

Comportements à connaître :
- Une description **sans aucun problème est renvoyée identique, au caractère près**.
- **Mise en forme du titre** (mécanique, sans IA) : les tirets qui séparent les attributs (`Chaise YORK - Marron - Pieds noirs`) deviennent des virgules (`Chaise YORK, marron, pieds noirs`), l'apostrophe devient typographique, et les dimensions sont ajoutées ou remises au format en fin de titre : ` – 44 x 44 x 110 cm` (largeur x profondeur x hauteur). Les dimensions ne sont jamais inventées : elles viennent du titre lui-même, des colonnes `Width` / `Length` / `Height` du modèle Metro, ou d'une mention du type `L 56 x P 62 x H 81 cm` dans la description (les valeurs étiquetées sont remises dans le bon ordre ; seul le `cm` est géré). Un titre qui ressemble déjà à `… – 44 x 44 x 110 cm` n'est pas touché. L'outil ne **réordonne pas** un titre et ne devine ni la matière ni la couleur : cela demanderait une IA générative.
- Dans le modèle Metro, chaque champ est traité séparément : un titre reformaté est retraduit, mais une description inchangée conserve ses traductions existantes.
- Quand retirer un mot laisserait un fragment orphelin (par exemple « sur. »), la phrase entière est supprimée dans une description ; dans un titre, seuls les mots pendants en fin de titre sont retirés.
- Les longueurs ne sont jamais corrigées automatiquement : un titre trop long est signalé.
- Le moteur ne trouve que ce qui figure dans les règles. **Ajoutez vos propres refus METRO** au fil du temps.
- Les motifs sont écrits pour des textes en **français**, qui est la langue source.

## Traduction : moteurs, quotas, mémoire, glossaire

### Moteurs
1. **Google Traduction** (point d'accès gratuit non officiel, sans clé) : moteur principal, meilleure qualité.
2. **MyMemory** (gratuit) : moteur de secours, utilisé quand Google refuse. Qualité un peu moindre.

Google limite le nombre de requêtes par adresse IP (erreur 429). L'outil s'en protège :
- délai entre les requêtes (300 ms en usage normal, **4 secondes pendant un import Excel**) ;
- **disjoncteur** : après un refus, Google est mis en pause 2 minutes, puis une seule requête d'essai décide de le reprendre ; la pause double à chaque refus consécutif (jusqu'à 30 minutes) ;
- une seule requête par langue et par produit (titre et description envoyés ensemble).

### Quotas MyMemory
Environ 5 000 caractères par jour sans email, et environ 50 000 par jour avec un email (d'après la documentation du service ; à vérifier). Une fiche moyenne (~1 100 caractères) coûte environ 6 600 caractères de quota pour les 6 langues.

### Mémoire des traductions
Chaque phrase traduite est mémorisée par langue dans `data/memoire.json` (ignoré par git). Retraduire un texte déjà vu ne consomme aucun quota, et si une seule phrase change, seule celle-là est retraduite.

### Glossaire
Les corrections sont dans `data/glossaire.json`, éditables depuis la page. Elles s'appliquent **après** la mémoire, donc une nouvelle correction agit immédiatement. Le remplacement ne touche que le mot exact, en respectant la casse ; ajoutez aussi les pluriels.

## Import Excel (modèle Metro)

Pour un fichier au format d'import METRO :

- **Source** : `Product name FR` et `Description FR`. Ils sont nettoyés puis réécrits dans les mêmes cases.
- **Cibles** : `Product name` / `Description` pour DE, HR, ES, IT, NL et PT.
- **Aucune colonne n'est ajoutée** au fichier.
- **Cases déjà remplies** : conservées, sauf si le français a dû être corrigé (les langues sont alors retraduites) ou si l'option « Remplacer aussi les traductions déjà présentes » est cochée.
- **Consignes de sécurité** : les cases vides de `Product safety instructions XX` reçoivent le texte standard (`src/lib/consignes.ts`). Une case déjà remplie n'est jamais modifiée.
- **Rapport** : un second fichier Excel liste le statut, les corrections et l'état de chaque langue pour chaque produit.

Pour un fichier libre, l'outil devine les colonnes titre et description d'après leurs en-têtes ; vous pouvez les corriger, ainsi que la ligne d'en-têtes. Les résultats sont alors **ajoutés en colonnes** à droite du fichier.

Seuls le titre et la description sont traduits ; les autres champs multilingues du modèle (caractéristiques clés, composition des matériaux, garantie…) ne le sont pas.

## Structure du projet

```
data/
  glossaire.json          Corrections de vocabulaire par langue
src/
  app/
    page.tsx              Page « Fiche produit »
    import/page.tsx       Page « Import Excel »
    api/translate/        Route de traduction
    api/glossaire/        Route de gestion du glossaire
  components/Chrome.tsx   En-tête et pied de page communs
  lib/
    regles.json           Règles Metro (à personnaliser)
    checker.ts            Moteur de nettoyage et de verdict
    translate.ts          Moteurs de traduction (Google, MyMemory)
    memoire.ts            Mémoire des traductions
    glossaire.ts          Application du glossaire
    excel.ts              Lecture / écriture Excel, modèle Metro
    consignes.ts          Consignes de sécurité standard
```

Technologies : Next.js (App Router), React, TypeScript, Tailwind CSS, ExcelJS, JSZip.

## Confidentialité

- Les fichiers Excel sont lus **dans le navigateur** et ne sont jamais envoyés à un serveur tiers.
- Les **textes** (titres et descriptions) sont envoyés aux services de traduction (Google, MyMemory) : n'y mettez rien de confidentiel.
- `.env.local` (vos emails) et `data/memoire.json` ne sont pas versionnés.

## Limites connues

- Le point d'accès Google utilisé est **non officiel** : il peut cesser de fonctionner ou limiter fortement l'usage sans préavis. Pour un usage intensif ou professionnel, préférez une API officielle (Azure Translator, Google Cloud Translation), qui demande généralement un compte avec moyen de paiement.
- Les traductions automatiques gratuites demandent une **relecture**, surtout avec le moteur de secours.
- Le glossaire et la mémoire sont stockés dans des **fichiers locaux** : l'application est prévue pour tourner sur un poste ou un serveur classique, pas sur un hébergement serverless à système de fichiers en lecture seule (Vercel par exemple) sans adaptation.
- Format `.xlsx` uniquement (pas `.xls` ni `.csv`).
- Aucune garantie de validation par METRO : l'outil réduit le risque de refus, il ne le supprime pas.

## Dépannage

| Problème | Solution |
|---|---|
| « Le service de traduction gratuit est temporairement saturé » | Google et MyMemory refusent. Attendez 1 à 2 minutes et relancez ; les phrases déjà traduites sont en mémoire. |
| Quota MyMemory atteint | Ajoutez des emails dans `MYMEMORY_EMAILS`, ou reprenez le lendemain. |
| Mes emails ne sont pas pris en compte | Redémarrez `npm run dev` après avoir modifié `.env.local`. |
| L'import ne détecte pas mes colonnes | Vérifiez la ligne d'en-têtes et choisissez les colonnes dans les listes. |
| Fichier refusé | Enregistrez-le au format `.xlsx`. |

## Auteur

Créé par **Ilyes Zekri** pour **Bistromania**.

## Licence

Distribué sous licence [MIT](LICENSE) : vous pouvez utiliser, modifier et redistribuer ce code, y compris commercialement, à condition de conserver la mention de copyright. Le logiciel est fourni « tel quel », sans garantie.

Les marques citées (METRO, Google, etc.) appartiennent à leurs propriétaires respectifs ; cette licence ne couvre que le code de ce dépôt.
