# traceur-texteur

Écrit un message **le long d'un tracé**, 100 % front-end, en faisant varier le
corps de la police avec la place réellement disponible. Interface en français.
Partage la stack et les conventions de `traceur-compteur`, dont il réutilise le
moteur d'extraction d'image.

Le tracé vient d'une **forme de base** (spirale, cercle, rectangle, triangle,
zigzag), d'un **dessin** déposé, ou d'un **geste à la souris**.

---

## Le problème résolu

Écrire du texte sur un chemin est un problème résolu depuis longtemps : le SVG a
`textPath`, tous les logiciels de dessin savent le faire. Ce qui n'est pas résolu,
c'est de **remplir une forme de texte lisible**, et `textPath` échoue sur les trois
points qui comptent :

1. **Il fait tourner chaque glyphe autour de sa ligne de base.** Dans un virage
   serré, les lettres s'empilent sur le bord intérieur jusqu'à devenir un pâté.
2. **Il ne sait pas faire varier le corps en cours de route.** Or sur une spirale,
   l'écart entre deux tours se réduit : une taille unique est soit trop grosse au
   centre, soit inutilement timide au bord.
3. **Il ne sait pas remplir.** On lui donne un texte, il l'écrit ; il ne cherche
   pas à occuper la longueur offerte.

D'où le parti pris : **chaque caractère est placé explicitement**, et sa taille est
décidée localement par la place libre autour du tracé. La promesse tient en une
mesure, `stats.overlaps`, qui compte les paires de lettres qui se recouvrent et qui
doit rester à zéro. Elle est vérifiée, pas supposée.

---

## Stack technique

| Outil | Usage |
|---|---|
| React 19 + TypeScript | UI |
| Vite | Build / dev server (port **1235**) |
| Tailwind CSS v4 | Styles (via `@tailwindcss/vite`, pas de config JS) |
| Vitest + Testing Library | Tests unitaires et composants |
| Prettier | Formatage |
| ESLint (typescript-eslint) | Linting |
| Knip | Détection des fichiers / exports / dépendances inutilisés |
| AFM URW base35 | **Uniquement** pour régénérer les tables de métriques |

Aucune dépendance de traitement d'image, aucune bibliothèque de police, aucune
bibliothèque PDF. Le navigateur décode l'image via `canvas`, tout le reste est du
TypeScript.

---

## Arborescence

```
src/
├── lib/                      # Logique pure : aucun React, aucun DOM
│   ├── types.ts              # Feuille de l'arbre de dépendances : aucun import
│   ├── fonts.ts              # GÉNÉRÉ : largeurs de glyphes Helvetica/Times/Courier
│   ├── metrics.ts            # Mesure du texte : avance, bande d'encre, découpage
│   ├── page.ts               # Formats, marges, mm <-> pixels, cadrage
│   ├── settings.ts           # Réglages exposés à l'interface
│   ├── geometry.ts           # Rééchantillonnage, tangentes, courbure, interpolation
│   ├── shapes.ts             # Formes de base et arrondi des angles
│   ├── smooth.ts             # Lissage d'un tracé fait à la main
│   ├── binarize.ts           # Otsu + seuillage + despeckle  (porté)
│   ├── contour.ts            # Suivi de contour par balayage radial
│   ├── thin.ts               # Squelettisation Zhang-Suen   (porté)
│   ├── graph.ts              # Squelette -> graphe           (porté)
│   ├── graph-cleanup.ts      # Barbules, micro-boucles, faux sommets (porté)
│   ├── trace.ts              # Dessin -> tracés : contour ou squelette
│   ├── clearance.ts          # LE COEUR : combien de place le tracé laisse-t-il ?
│   ├── relax.ts              # Élargit les virages trop serrés pour du texte lisible
│   ├── sizing.ts             # Champ de tailles : deux plafonds et un lissage
│   ├── flow.ts               # Pose des glyphes le long du tracé
│   ├── fit.ts                # Dichotomie du mode « une seule fois »
│   ├── quality.ts            # Compte les lettres qui se recouvrent
│   ├── pipeline.ts           # compose() : tracés -> composition
│   ├── logo.ts               # Géométrie de la marque, partagée avec le favicon
│   ├── svg.ts                # Rendu SVG (aperçu et export : une seule source)
│   └── pdf.ts                # Export PDF écrit à la main, sans dépendance
├── platform/
│   ├── image.ts              # Frontière navigateur : décodage canvas, téléchargement
│   └── raster.ts             # SVG -> PNG via canvas
├── components/
│   ├── Logo.tsx              # Marque : un mot sur une spirale qui se resserre
│   ├── Field.tsx             # Curseur et choix segmenté, partagés
│   ├── SourcePanel.tsx       # Trois onglets : Forme, Dessin, À la souris
│   ├── Dropzone.tsx          # Dépôt de fichier
│   ├── DrawPad.tsx           # Tracé à la souris
│   ├── TextPanel.tsx         # Message, police, remplissage, couleur
│   ├── Controls.tsx          # Format et bornes de corps
│   ├── Toolbar.tsx           # Deux groupes : Affichage et Exporter
│   ├── StatsPanel.tsx        # Voyant de chevauchement et mesures
│   └── Preview.tsx           # Aperçu
├── App.tsx                   # État, mémoïsation en deux étages, exports
├── main.tsx                  # Point d'entrée
└── index.css                 # Import Tailwind, fond, styles d'impression
tools/                        # Tournent sous Node (pas livrés)
├── afm.ts                    # Régénère src/lib/fonts.ts depuis les AFM
├── favicon.ts                # Régénère public/favicon.svg depuis src/lib/logo.ts
├── og.ts                     # Régénère public/og.png : une vraie composition
├── drawing.ts                # Dessin au trait de synthèse, pour le mode « dessin »
└── bench.ts                  # Mesure les cas de référence, écrit out/
tests/
├── fixtures.ts               # Tracés et dessins synthétiques
├── unit/                     # Vitest sur src/lib
└── component/                # Vitest + Testing Library sur App
```

### Règles d'architecture

- **`src/lib` ne connaît ni React ni le DOM.** Tout ce qui dépend du navigateur
  vit dans `src/platform`. C'est ce qui permet de tester le moteur entier sans
  navigateur, et de le faire tourner tel quel sous Node dans `tools/`.
- **`types.ts` est une feuille** : il n'importe rien.
- **`fonts.ts`, `favicon.svg` et `og.png` sont générés.** Ne pas les éditer à la
  main : `make afm`, `make favicon` et `make og`.
- **Une seule source pour chaque grandeur.** `page.ts` pour les tailles de page,
  `metrics.ts` pour les mesures de texte, `logo.ts` pour la marque. Chaque fois
  qu'une valeur a été dupliquée dans ce projet, les deux copies ont divergé.
- **Viser moins de 300 lignes par fichier.**

---

## Le pipeline, étape par étape

```
forme | dessin | souris
  └─0─ fitStrokes    cadre tout dans la page          -> un seul repère
  └─1─ resample      pas constant qui divise la longueur -> abscisse = index
  └─2─ relax         ouvre les virages trop serrés      -> courbure bornée
  └─3─ tangentes     lissées sur 1,5 mm                 -> direction du texte
  └─4─ courbure      arc réel, lissée sur 3 mm          -> rayon des virages
  └─5─ clearance     place libre autour du tracé        -> champ de distance
  └─6─ sizeField     min(place, virage), puis lissé     -> un corps par point
  └─7─ flow / fit    un caractère après l'autre         -> glyphes placés
  └─8─ quality       boîtes orientées                   -> chevauchements = 0
  └─9─ svg / pdf     export
```

### 1. Le pas doit diviser la longueur

Tout le moteur lit l'abscisse curviligne comme `index * step`. Un pas fixe ne
divise pas la longueur du tracé, et l'erreur s'accumule : mesuré sur un cercle,
l'écart atteignait **1 % de la longueur**, ce qui se voit comme une couture sur une
spirale de vingt tours. Sur un tracé ouvert, un pas fixe laissait en plus **jusqu'à
un pas entier sans échantillon** à la fin, donc autant de tracé sans texte.

`resample` renvoie donc le **pas réellement utilisé**, ajusté pour tomber pile.
C'est la raison de sa signature en `{ points, step }`.

### 2. La place libre, et pourquoi elle a besoin de deux critères

C'est la mesure qui porte tout le projet. La place disponible en un point, c'est la
distance à la portion la plus proche du dessin **qui ne soit pas son propre
voisinage** : sur une courbe lisse, les échantillons voisins sont évidemment à côté,
et les compter donnerait une place nulle partout. D'où une **porte** exprimée en
longueur le long du tracé.

Cette porte ne peut pas être plus petite que le plafond de recherche, et ce n'est
pas un réglage à tâtonner mais une conséquence : sur une courbe douce, deux points
distants de `L` le long du tracé sont à peu près distants de `L` dans le plan. Une
porte trop petite ferait donc voir à chaque point son propre voisinage comme un
obstacle. `GATE_RATIO = 2` laisse de la marge, et un test vérifie l'invariant.

**La porte seule ne suffit pas.** Dans la pointe d'une dent de zigzag, les deux
branches se longent à moins d'un millimètre alors qu'il faut parcourir plusieurs
centimètres de tracé pour passer de l'une à l'autre : la porte les déclarait
voisines, et le texte s'y recouvrait (226 paires mesurées). D'où le second critère,
un **test de corde** : un vrai voisin est un point que la corde rejoint presque
aussi vite que l'arc. Mesuré, une courbe lisse reste au-dessus de 0,95 et une pointe
de dent tombe sous 0,1 ; le seuil à 0,85 les sépare franchement.

Le bord de la page compte aussi comme obstacle, mais comme un obstacle **qui ne
porte pas de texte** : le tracé peut s'en approcher deux fois plus que d'un autre
tracé, qui lui réclame sa moitié du couloir. C'est le bord de la **feuille** qu'il
faut passer, pas la zone utile : les tracés étant cadrés dans celle-ci, ils la
touchent, et la donner comme cadre écrase le texte sur tout le contour d'un
rectangle (défaut effectivement rencontré).

### 3. Deux plafonds complémentaires, pas redondants

- **La place libre.** La bande d'encre est centrée sur le tracé, donc elle en
  déborde de sa demi-hauteur de chaque côté. Deux portions distantes de `d` se
  recouvrent dès que la bande dépasse `d`.
- **Le virage.** Un texte dans un virage de rayon `r` a son bord intérieur au rayon
  `r - bande/2` : quand la bande approche `2r`, ce bord passe par le centre et le
  mot se replie sur lui-même. On exige `bande <= r / 2`.

Le premier voit les rapprochements lointains (deux tours de spirale) mais pas les
replis courts, que la porte écarte volontairement ; le second voit exactement ces
replis, puisqu'un tracé ne peut revenir sur lui-même en peu de longueur sans tourner
fort. Ils se partagent le travail.

**La bande d'encre, pas le corps.** Ce qui ne doit rien recouvrir, c'est l'étendue
réelle de l'encre, du bas du `p` au sommet du `É` : en Helvetica elle vaut 1,17 fois
le corps. `fonts.ts` la mesure sur tout le jeu de caractères couvert, accents des
capitales compris. Les champs `Ascender` et `Descender` des AFM d'URW sont à zéro,
mais c'était de toute façon la mauvaise mesure.

### 4. Lisser le champ de tailles par balayages de minimums

Le champ brut tressaute, et le texte changerait de corps d'une lettre à l'autre.
Une **moyenne glissante serait fausse** : elle relève la taille au-dessus de son
plafond dans les creux étroits, donc réintroduit exactement les chevauchements
qu'on vient d'écarter.

`limitSlope` fait deux balayages de minimums, l'un dans chaque sens, et donne le
plus grand champ qui respecte à la fois tous les plafonds et une pente maximale.
C'est optimal, linéaire, et ça ne peut par construction jamais relever une valeur.
Sur un tracé fermé il faut deux tours, pour qu'une contrainte née juste après le
point de recollement se propage jusqu'avant lui.

### 5. La correction de courbure sur l'avance

Un caractère est un bloc rigide posé tangentiellement. Avancer de sa seule avance
laisserait le suivant empiéter sur lui du côté intérieur du virage. Le facteur de
correction est exactement le rapport des rayons des deux bords de la bande, soit
`1 + |k| * bande / 2`. Vérifié au millième dans les tests, en mesurant l'angle
balayé autour du centre du cercle et non la distance entre deux lettres : celles-ci
sont posées sur un cercle **concentrique plus petit** que le tracé, puisque la bande
d'encre est centrée dessus.

### 6. Enjamber plutôt qu'écrire illisible

Là où même le corps minimal ne tiendrait pas, le moteur **ne écrit rien** et
enjambe. C'est le seul endroit qui renonce, et il le fait explicitement : écrire au
plancher dans un couloir plus étroit produirait des lettres empilées, donc fausses.
La longueur sautée est comptée (`stats.skippedMm`) et l'interface l'affiche.

Le plancher vaut **2,5 mm** et non 1,2 comme au départ. En dessous, le texte est
encore mesurable mais plus lisible, et le laisser descendre si bas était le vrai
défaut : sur une boucle à quatre pointes, **un tiers des lettres tombait sous
2,5 mm**, jusqu'à 1,3 mm, ce qui produit une traînée et non un mot.

### 7. Élargir le virage plutôt que rétrécir le texte

Enjamber garde le tracé exact mais laisse des trous et coupe les mots. Il existe une
autre sortie, qui retourne le problème : au lieu de rétrécir le texte pour tenir dans
le virage, **élargir le virage pour tenir le texte** (`relax.ts`). C'est le réglage
*Angles trop serrés* de l'interface, et c'est le défaut.

Le critère n'est pas esthétique mais une conséquence du plancher : on ouvre juste
assez pour que la courbure ne dicte jamais un corps inférieur à lui, soit un rayon
d'au moins `2 x bande(corps minimal)`. Ce n'est pas non plus une nouveauté, c'est une
généralisation : les formes de base arrondissent déjà leurs angles pour exactement
cette raison, et un dessin déposé ou un geste à la souris n'y avaient pas droit.

Mesuré sur la même boucle à quatre pointes, à corps minimal égal :

| | lettres | sous 2,5 mm | tracé nu | écart au dessin |
|---|---:|---:|---:|---:|
| rétrécir (l'ancien défaut) | 377 | **130** | 0 mm | 0 mm |
| enjamber | 244 | 0 | 125 mm | 0 mm |
| **élargir** | 261 | **0** | **48 mm** | 2,3 mm |

L'écart au dessin est mesuré (`stats.roundedMm`) et affiché, comme tout ce que le
moteur retouche.

Deux pièges, tous deux mesurés :

- **Il faut rééchantillonner à chaque passe.** Ouvrir un virage y resserre les
  points. Sans rééchantillonnage, la courbure calculée en divisant par `fenêtre x
  pas` sous-estime les virages (mesuré : la boucle s'arrêtait à 0,054 en croyant
  avoir atteint 0,043), et surtout le lissage se met à agir à une échelle de plus en
  plus petite et cesse d'ouvrir quoi que ce soit. C'est aussi pourquoi
  `curvatures` divise par l'**arc réellement mesuré** et non par un pas supposé.
- **Le coût doit être borné par un budget, pas par le nombre de passes.** Chaque
  passe coûte le tracé entier alors que le défaut est local : sur une spirale de
  vingt-cinq tours, 27 échantillons sur 19 213 dépassaient la cible, et les ouvrir
  coûtait 377 ms pour ne récupérer que 25 mm de texte. `RELAX_BUDGET` borne le total
  de passes par la longueur du tracé, ce qui rend le coût à peu près constant quelle
  que soit la taille du dessin. S'y ajoute une rupture sur stagnation : certains
  tracés ne peuvent pas s'ouvrir sans cesser d'être eux-mêmes.

### 8. Les métriques de police sont une table, pas une mesure

`canvas.measureText` aurait été plus souple mais donne un résultat dépendant des
polices installées sur le poste, alors que le PDF, lui, est écrit avec les métriques
Adobe : les deux auraient divergé. `src/lib/fonts.ts` est **la seule source** des
mesures, partagée par le placement, l'aperçu et l'export. C'est aussi ce qui permet
au moteur de tourner sous Node sans navigateur.

Conséquence assumée : **trois familles seulement**, celles des quatorze polices de
base que tout lecteur PDF possède. En ajouter une rendrait l'export PDF approximatif,
ou obligerait à convertir chaque lettre en courbes.

---

## Ce que valent les résultats

Mesuré par `make bench`, sur A4 portrait, corps maximal 7 mm, message de 95
caractères en Times.

| Cas | Tracés | Glyphes | Répét. | Couverture | Corps (mm) | Enjambé | Chevauch. | Temps |
|---|---:|---:|---:|---:|---|---:|---:|---:|
| spirale (7 tours) | 1 | 835 | 10,8 | 100 % | 4,5 à 7,0 | 0 | **0** | 26 ms |
| spirale (20 tours) | 1 | 4158 | 54,0 | 100 % | 2,6 à 4,8 | 14 mm | **0** | 143 ms |
| cercle | 1 | 215 | 2,8 | 100 % | 7,0 | 0 | **0** | 5 ms |
| rectangle | 1 | 339 | 4,4 | 100 % | 2,8 à 7,0 | 0 | **0** | 9 ms |
| triangle | 1 | 273 | 3,5 | 95 % | 2,5 à 7,0 | 33 mm | **0** | 20 ms |
| zigzag (6 dents) | 1 | 985 | 12,8 | 80 % | 2,5 à 7,0 | 651 mm | **0** | 32 ms |
| dessin, contour | 1 | 325 | 4,2 | 82 % | 2,6 à 4,7 | 122 mm | **0** | 12 ms |
| dessin, squelette | 4 | 277 | 3,6 | 69 % | 2,6 à 4,9 | 205 mm | **0** | 7 ms |

Les deux derniers cas partent d'une **étoile à cinq branches** dessinée par
`tools/drawing.ts` : une image de synthèse plutôt qu'une photo, pour la même raison
que les fixtures de test (déterministe, aucun binaire dans git, résultat attendu
connu). Elle exerce toute la chaîne du mode dessin, de la binarisation au cadrage,
sans dépendre du décodeur d'images du navigateur, qui est la seule pièce que
`src/lib` ne contient pas. Ses pointes serrées et ses longs côtés droits font jouer
les deux plafonds de taille l'un après l'autre.

**Le bon réglage** : environ **7 mm de corps maximal, 2,5 mm de corps minimal et
85 % de remplissage**, avec l'élargissement des angles actif. Le vérifier à l'oeil
est indispensable, les chiffres seuls trompent, et de deux façons : zéro
chevauchement n'empêche pas un texte de tourner la tête en bas sur la moitié d'un
cercle, ce qui est inhérent au procédé ; et il n'empêchait pas non plus, avant que le
plancher ne monte, un tiers des lettres d'être trop petites pour être lues.

Le zigzag est le cas qui coûte le plus cher à ce plancher : ses pointes passent de
292 mm enjambés à **651 mm**, soit 80 % de couverture. C'est le prix honnête d'un
texte lisible dans une dent trop étroite pour en porter.

### Optimisations qui ont compté

La spirale de vingt tours prenait **3436 ms** à la première version, ce qui rendait
les curseurs inutilisables. Deux changements l'ont ramenée à **63 ms** :

- **Clés de grille numériques** au lieu de chaînes (`"12,7"`). Les grilles sont
  lues neuf fois par point sur des dizaines de milliers de points, et chaque
  lecture allouait une chaîne. Facteur trois.
- **Pas d'échantillonnage à 0,5 mm** au lieu de 0,25 mm. Le coût de la place libre
  est quadratique en densité d'échantillons, et plus fin ne mesure rien de plus :
  tangente et courbure sont de toute façon lissées sur plusieurs millimètres.

L'élargissement des angles l'a ensuite remontée à **143 ms**, et c'est là qu'il
coûte le plus cher pour ce qu'il rapporte : voir `RELAX_BUDGET`, qui borne
justement cette dépense. Les cas où il sert vraiment, un dessin ou un geste à la
souris, restent sous les 30 ms.

### Limites connues

- **Le texte tourne la tête en bas** sur la moitié inférieure d'une forme fermée.
  C'est inhérent à un texte qui suit une courbe fermée, pas un défaut ; aucun
  réglage ne l'évite.
- **Le mode squelette produit un nuage de fragments**, pas un texte. Le squelette
  d'un coloriage donne des dizaines de traits courts, sur chacun desquels il n'y a
  la place que d'une syllabe. C'est un effet graphique valable mais ce n'est plus
  de la lecture, d'où le contour par défaut.
- **Le squelette d'une forme pleine et compacte dégénère.** Zhang-Suen ramène un
  carré parfait à un seul pixel. C'est une propriété de l'amincissement, pas un
  défaut d'implémentation, mais ça veut dire que le mode squelette ne convient qu'aux
  dessins au trait.
- **Élargir un angle trahit le dessin.** L'écart est petit et mesuré
  (`stats.roundedMm`, de l'ordre de 2 mm sur une boucle à pointes), mais il existe :
  un triangle aux angles vifs ressort avec des angles arrondis. Qui veut le tracé
  exact bascule le réglage sur *Laisser nu*.
- **Un angle ne s'ouvre pas si son voisinage est déjà encombré.** Élargir déplace le
  tracé vers ce qui l'entoure ; là où la place libre est déjà la contrainte
  dominante, c'est elle qui décide et l'élargissement ne rend rien. C'est le cas du
  centre d'une spirale très serrée.
- **Le mode « une seule fois » ne peut que réduire.** Si le message est trop court
  pour le tracé, il ne peut pas être agrandi sans violer la place libre : la fin du
  tracé reste nue et `coverage` le dit, plutôt que de faire semblant.
- **Les mots sont coupés** aux endroits enjambés et aux passages d'un tracé au
  suivant. Aucune césure n'est gérée.
- **Le PDF est toujours dans l'une des trois familles de base.** Voir plus haut :
  c'est le prix de la cohérence exacte entre aperçu et export.
- **Un tracé à la souris très tremblé** reste tremblé si on dépasse la capacité du
  lissage. Six passes suffisent en pratique, mais un geste en dents de scie de grande
  amplitude garde une courbure élevée, donc un texte petit.

---

## Parti pris d'interface

- **Une composition s'affiche dès l'ouverture**, sans rien demander. Une page vide
  n'apprend rien ; la spirale par défaut montre immédiatement ce que fait l'outil.
- **Le curseur s'appelle « corps maximal », pas « taille du texte ».** C'est une
  borne : le moteur écrit toujours le plus gros qu'il peut sans rien chevaucher, et
  le curseur dit seulement où s'arrêter quand la place ne manque pas.
- **Les trois sources sont des onglets.** Chacune a ses propres réglages ; les
  empiler donnerait une colonne où l'on ne saurait plus lesquels s'appliquent.
- **La barre est en deux groupes étiquetés**, *Affichage* et *Exporter*. Mélangés,
  il fallait relire toute la barre pour trouver le bouton de sortie.
- **Les choix sont des boutons segmentés, pas des listes déroulantes.** Il n'y a
  jamais plus de cinq options, et savoir ce qui existe fait partie de la
  compréhension de l'outil.
- **La marque montre ce que fait le moteur** : un mot sur le tour extérieur d'une
  spirale, et le tracé qui continue nu là où il n'y a plus la place. Deux essais ont
  été nécessaires : une spirale serrée d'un tour et demi se lisait comme du bruit à
  36 px, et cinq lettres réparties à angle égal sur un tour ne se lisaient plus
  comme un mot mais comme des lettres éparpillées. Les lettres sont donc espacées de
  leur **avance réelle**, lue dans la même table que le reste du projet.
- **Le voyant de chevauchement** ne s'appuie jamais sur la couleur seule : toujours
  un symbole et un libellé.
- **Les cartes portent `aria-labelledby`**, sinon elles n'ont pas de nom accessible
  et un lecteur d'écran ne peut pas sauter de « Le texte » à « Mesures ».

### Voir l'interface pour de vrai

Les tests de composant couvrent la structure, pas l'aspect. Pour regarder :

```sh
make start
google-chrome --headless=new --no-sandbox --hide-scrollbars \
  --virtual-time-budget=4000 --screenshot=/tmp/app.png \
  --window-size=1400,1500 http://localhost:1235/
```

Pour contrôler le rendu réel d'un export :

```sh
make bench
google-chrome --headless=new --no-sandbox --screenshot=/tmp/v.png \
  --window-size=840,1188 "file://$PWD/out/spirale.svg"
pdfinfo out/spirale.pdf                      # 1 page, A4
pdftoppm -r 100 -png -singlefile out/spirale.pdf /tmp/page
```

---

## Métadonnées de partage

Les robots des réseaux sociaux ne lisent que du HTML statique : ils n'exécutent
aucun script, et `og:image` n'accepte pas d'URL relative. Le domaine doit donc être
écrit en dur au moment du build, d'où **`VITE_SITE_URL` dans `.env`**, que Vite
substitue dans `index.html`. Ce fichier est versionné : il ne contient qu'une URL
publique.

**Changer d'hébergeur veut dire changer cette ligne**, sinon l'aperçu affiche un
titre et une description corrects avec une image cassée.

L'image elle-même, `public/og.png` (1200x630), est produite par **`make og`**. Ce
n'est pas une maquette : la spirale est une vraie composition calculée par le moteur
avec les réglages de l'application. Une image dessinée à la main finirait par
promettre autre chose que ce que le produit fait, et personne ne s'en apercevrait.
Elle est **versionnée**, parce qu'un robot la demande au déploiement et qu'elle ne
peut pas être calculée à ce moment-là.

Le titre est posé **à côté** de la spirale et non par-dessus : une vignette de
partage s'affiche souvent sur trois cents pixels de large, où le texte de la spirale
n'est plus qu'une texture. Ce qui doit survivre à cette taille, c'est le nom.

À vérifier après déploiement :

```sh
curl -sI https://traceur-texteur.vercel.app/og.png | head -2   # 200 image/png
curl -s https://traceur-texteur.vercel.app/ | grep 'og:image'  # même hôte
```

En plus des balises, `index.html` porte un bloc **JSON-LD** `WebApplication` : il dit
aux moteurs que c'est une application qui tourne dans le navigateur et qu'elle est
gratuite, ce qu'aucune balise classique n'exprime.

### L'icône est la spirale seule

La marque du site porte le mot `Texte` sur le tour extérieur d'une spirale. L'icône,
elle, n'en garde que **la spirale**, avec moins de tours et un trait plus épais : un
onglet fait seize pixels de côté, où les cinq lettres devenaient quatre taches
grises. C'est la même figure réduite à ce qui survit, pas une autre marque, et les
deux sortent de `src/lib/logo.ts` via `spiralPoints`.

## Contraintes techniques

- **100 % front-end** : aucun appel serveur, l'image ne quitte pas le poste.
- **Pas de SSR** : Vite SPA. Ne pas introduire Next.js ou Remix.
- **Alias `@/`** pointe vers `src/`. Toujours l'utiliser pour les imports
  internes, jamais de chemins relatifs `../../`.
- **Tailwind v4** : `@import 'tailwindcss'` dans le CSS, pas de
  `tailwind.config.js`.
- **TypeScript strict** : `noUnusedLocals`, `noUnusedParameters`,
  `noUncheckedIndexedAccess`, `erasableSyntaxOnly` activés. Ne pas les
  désactiver. Conséquences à connaître : indexer un tableau donne `T | undefined`
  (d'où les `!` dans les boucles chaudes), et les propriétés de paramètre de
  constructeur sont interdites.

---

## Règles de développement

### Qualité du code
- **Factoriser, ne pas dupliquer** : le SVG a **une** implémentation, partagée
  entre l'aperçu et l'export ; la marque en a une, partagée avec le favicon.
- **Pas de code mort** : tout export doit être utilisé ou testé. `make knip`
  doit rester vert.
- **Commentaires utiles seulement** : expliquer le pourquoi / le non-évident ;
  ne jamais paraphraser le code.
- **Rien ne disparaît en silence** : quand le moteur enjambe une portion, il la
  compte (`skippedMm`, `cramped`) et l'UI l'affiche. Quand il élargit un virage, il
  dit de combien il s'écarte du dessin (`roundedMm`).

### Tests
- **Logique pure entièrement testée** (`src/lib/`), sur des tracés synthétiques
  (`tests/fixtures.ts`) plutôt que sur des images : c'est déterministe, sans
  fichier binaire dans git, et surtout **on connaît la réponse exacte**. Un cercle
  de rayon connu a une courbure connue.
- **Vérifier contre la géométrie, jamais contre une capture du résultat.** La
  courbure d'un cercle vaut `1/r`, la correction d'avance vaut le rapport des
  rayons, les décalages `xref` du PDF se relisent dans le fichier produit.
- **Aucune assertion en millisecondes dans la suite.** Elle mesurerait la machine :
  seize fichiers de tests tournent en parallèle, et le même calcul y est passé de
  216 ms à 4733 ms sans qu'une ligne de moteur change. Le temps se mesure par
  `make bench`, qui chauffe le code et traite un cas à la fois ; la suite, elle,
  vérifie que le pire cas ne dégénère pas (zéro chevauchement, couverture, écart au
  dessin borné).
- Les invariants qui comptent : la place libre est exacte entre deux parallèles,
  la porte reste au-dessus du plafond, le lissage n'augmente jamais une taille, les
  boîtes de lettres ne se recouvrent pas, un caractère de la source vaut un octet
  du PDF.

### Deux pièges rencontrés, à ne pas réintroduire
- **Un texte vide en mode répétition** donne un cycle fait d'une seule espace, et
  la boucle qui saute les espaces de début tourne alors sans fin. Le garde-fou porte
  sur l'encre du cycle, pas sur sa longueur.
- **Une avance nulle** empêcherait la pose de progresser le long du tracé.
  `advanceOf` retombe donc sur la largeur de l'espace, jamais sur zéro, pour un
  caractère absent de la table.

---

## Commandes

Tout passe par le Makefile.

| Commande | Effet |
|---|---|
| `make install` | Installe les dépendances |
| `make start` | Serveur de développement sur http://localhost:1235 |
| `make build` | Build de production |
| `make check` | **build + lint + typecheck + knip + tests** |
| `make test` | Tests unitaires et composants |
| `make fix` | Formate puis lint |
| `make afm` | Régénère `src/lib/fonts.ts` depuis les AFM d'URW base35 |
| `make favicon` | Régénère `public/favicon.svg` depuis `src/lib/logo.ts` |
| `make og` | Régénère `public/og.png` (nécessite google-chrome) |
| `make bench` | Mesure les cas de référence et écrit `out/` |
