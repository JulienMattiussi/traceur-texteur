# Traceur-texteur

Écrit un message **le long d'un tracé**, et fait varier la taille des lettres avec
la place réellement disponible, pour qu'aucune n'en recouvre une autre.

Le tracé vient d'une **forme** (spirale, cercle, rectangle, triangle, zigzag), d'un
**dessin** que vous déposez, ou d'un **trait fait à la souris**. Exports PNG, SVG et
PDF. Tout se calcule dans le navigateur : aucune image, aucun texte n'est envoyé
nulle part.

## Pourquoi

Écrire du texte sur un chemin est un problème résolu : le SVG a `textPath`. Ce qui
ne l'est pas, c'est de remplir une forme de texte **lisible**. `textPath` fait
tourner chaque lettre autour de sa ligne de base, si bien qu'elles s'empilent sur le
bord intérieur des virages ; il ne sait pas non plus changer de taille en cours de
route, alors que l'écart entre deux tours d'une spirale se réduit sans arrêt.

Ici chaque caractère est placé explicitement, et sa taille est décidée localement
par la distance au reste du dessin. La promesse tient en un chiffre affiché dans
l'interface : le nombre de paires de lettres qui se recouvrent, qui reste à zéro.

## Démarrer

```sh
make install
make start        # http://localhost:1235
```

| Commande | Effet |
|---|---|
| `make check` | build + lint + typecheck + knip + tests |
| `make test` | tests unitaires et composants |
| `make bench` | mesure les cas de référence et écrit `out/` |

La documentation technique complète est dans [AGENTS.md](AGENTS.md).

## Licence

MIT.
