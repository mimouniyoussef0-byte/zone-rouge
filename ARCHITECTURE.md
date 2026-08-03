# ZONE ROUGE — Perpignan Survie · carte du fichier

Relevé fait sur la v243 (`index.html`, 29 865 lignes, 10,73 Mo).
Le fichier s'appelle `index.html` parce qu'un hébergeur sert automatiquement
ce nom-là à la racine : l'adresse du jeu est donc le domaine seul, sans chemin.
**Les numéros de ligne se décalent à chaque modification.** Avant de t'y fier,
vérifie avec une recherche sur le titre de la section (`grep` ou Ctrl+F sur
`================= NOM =================`).

## Poids réel

| Bloc | Poids | Lignes |
|---|---|---|
| Audio embarqué en base64 | 4,88 Mo | 9813–9974 |
| Textures + modèles GLB + plan de la ville | 4,10 Mo | 9975–9984 |
| Three.js r128 + loaders (vendor, non modifié) | 0,80 Mo | 1618–9812 |
| **Code du jeu** | **0,85 Mo** | **9985–29865** |
| CSS | 0,09 Mo | 20–1453 |
| HUD (DOM) | — | 1454–1597 |

84 % du fichier = assets base64. Le travail réel tient dans 19 880 lignes.

⚠️ Les lignes 9976 (4,15 Mo) et 9813 (2,88 Mo) sont sur une seule ligne
chacune. Aucun éditeur ni outil de comparaison ne les ouvre. **Ne jamais
essayer de les éditer à la main.**

## Ordre de démarrage

`DÉMARRAGE` (29586) → décode le plan gravé (`decodeZPlan`) → construit la ville
(`buildCity`) → `initThree` → `applyGFX` → boucle.

Le plan de Perpignan est **embarqué** (`ZPLANB`, relevé OSM du 27/07/2026,
emprise 42.6932/2.8910 – 42.7035/2.9042, échelle 1:1, origine place de la Loge).
`fetchOSM` n'est qu'un secours réseau. **Le jeu démarre sans connexion.**

## Où trouver quoi

### Socle
| Section | Ligne |
|---|---|
| OUTILS | 9989 |
| AUDIO / synthèse loup-garou / voix de secours | 10036 · 10155 · 10215 |
| LE SOUFFLE (ambiance) | 10670 |
| GPS (échelle réelle) | 10982 |
| ÉTAT (`S`, l'objet d'état global) | 11055 |
| SCÈNE (`initThree` : renderer, lumières, ombres) | 11778 |

### Monde
| Section | Ligne |
|---|---|
| OPENSTREETMAP · CADASTRE · plan gravé | 11987 · 12049 · 12145 |
| MONUMENTS (Castillet, cathédrale, Campo Santo, Loge, palais Majorque) | 12322 |
| VÉGÉTATION · découpage par blocs · platanes | 13400 · 13418 · 13481 |
| LA BASSE ET SES QUAIS · embrasures | 13882 · 14202 |
| OCCLUSION AMBIANTE CUITE | 14418 |
| CONSTRUCTION DE LA VILLE (`buildCity`) | 14566 |
| MATÉRIAUX PHYSIQUES · textures HD · textures d'armes | 14585 · 14717 · 15070 |
| TOITURES · largeur des rues · lit des rivières | 15300 · 15390 · 15418 |
| RELIEF DES FAÇADES | 16100 |
| AMBIANCE JOUR / NUIT | 16711 |

### Jeu
| Section | Ligne |
|---|---|
| ARSENAL (armes, view model) | 16867 |
| LA MIRE SUR L'AXE (organes de visée 3D) | 15454 |
| CAISSES · props · STATIONS D'ACHAT | 18025 · 18100 · 18244 |
| MINIMAP · plan de l'anse · plan de vol | 18670 · 18699 · 18769 |
| ERRANTS (ennemis) | 18914 |
| COMBAT · découpage à la lame · VISER | 19433 · 19487 · 19741 |
| LOUP-GAROU (état) · LA MONTÉE DU LOUP | 11132 · 20787 |

### Récit
| Section | Ligne |
|---|---|
| LA VOIX DU PERSONNAGE · un seul canal · trois rôles | 20096 · 20220 · 20354 |
| OUVERTURE (cinématique) | 20582 |
| L'EXTRACTION (hélico) · missile / épave / onde | 21017 · 21845 |
| L'HOMME DU PORCHE | 22279 |
| COLLIOURE · la leçon · l'acte · la côte | 22811 · 23444 · 23498 · 23614 |
| LE VOL VERS COLLIOURE · explosion · aire de poser | 24316 · 24582 · 24690 |
| LE DIDACTICIEL : CINQ MISSIONS | 26519 |

### Boucle et système
| Section | Ligne |
|---|---|
| LE PILOTAGE · décollage | 25330 · 25538 |
| LA BOUCLE (physique) · LA CAMÉRA | 25584 · 25749 |
| BOUCLE (rendu, `frame`) | 26912 |
| **LES QUATRE PALIERS (`applyGFX`, qualité)** | **28117** |
| CYCLE DE VIE · CONTRÔLES · atelier des touches | 28276 · 28409 · 28582 |
| DÉMARRAGE | 29586 |

## Ce qu'il ne faut pas casser

1. **`S`** (ligne 11055) — l'objet d'état global. Presque tout le lit.
2. **Le canal de parole unique** (20220) — garde-fou explicite : deux répliques
   ne doivent jamais se chevaucher. Il y a eu un bug là, il est corrigé.
3. **`applyGFX`** (28117) — appelé depuis 5 endroits. Toute re-application doit
   conserver le réglage de vol (commentaire explicite ligne 28180).
4. **`renderer.shadowMap.autoUpdate=false`** — les ombres sont rafraîchies à la
   main, 1 image sur 4. Repasser en automatique coûte très cher.
5. **Le calque d'ombre cuite** (`bakedShadow`) — son opacité est réécrite par
   `applyGFX`. Un bug corrigé faisait s'empiler trois assombrissements.
6. **`POM_U`** — les uniforms de parallaxe, désactivés hors ULTRA.
7. Les monuments sont **fusionnés** (`Lot`, `fondre`) pour tenir le budget de
   draw calls. Ajouter des meshes non fusionnés dégrade les performances.

## État du versionnement

`v243` dans le titre = 243 versions faites à la main. Depuis ce dépôt, c'est
git qui tient le compte. Le numéro dans le `<title>` peut rester, il n'a plus
de rôle.
