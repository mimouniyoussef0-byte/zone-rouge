# Audit de performance — pourquoi ça rame et ça se fige

Audit mené sur la v243 par 5 analyses parallèles (allocations, blocages
synchrones, coût de rendu, physique, démarrage), chacune passée à un
contre-expert chargé de **réfuter** les trouvailles. Sur 40 trouvailles,
19 ont été réfutées ou déclassées. Ce qui suit est ce qui a survécu.

Cible : Samsung Galaxy S26 Ultra (haut de gamme).

---

## LE DÉFAUT CENTRAL : le jeu ne monte jamais en qualité

Trois faits, vérifiés directement dans le code :

**1. `gfxDepart()` (28103) ne peut jamais rendre plus que 2.**
```js
return score>=2?2:(score>=0?1:0);
```
Un S26 Ultra marque 3 points (mémoire ≥8 Go : +2, cœurs ≥8 : +2, beaucoup de
pixels : −1). Le score est plafonné à 2 à la sortie. **ULTRA est donc
inatteignable par détection automatique**, quel que soit le téléphone.

**2. `applyGFX` n'est jamais appelée au démarrage sur un bon téléphone.**
```js
var d0=gfxDepart();                              // = 2
if(d0<GFX&&!window.__noAuto){gfxCeil=d0;applyGFX(d0);}   // 2 < 2 → faux
```
`GFX` vaut déjà 2 (11364). La condition ne sert qu'à **descendre**. Elle n'est
donc jamais franchie sur un téléphone puissant.

**3. Conséquence : deux réglages de qualité ne sont jamais posés.**

`anisoTout` et `ombreCarte` n'ont **qu'un seul point d'appel chacun**, tous deux
à l'intérieur de `applyGFX` :

| Réglage | Appelé en | Valeur si `applyGFX` tourne | Valeur réelle sur S26 Ultra |
|---|---|---|---|
| Filtrage anisotrope | 28215 | 16 | **jamais appliqué** |
| Carte d'ombre | 28192 | 1536 px, portée 38 m | **1024 px, portée 28 m** (11815) |

**Ton téléphone joue en permanence en dessous du palier « haute » que le jeu a
pourtant écrit pour lui.** L'absence d'anisotropie est directement visible : les
routes et les façades vues de biais sont floues. C'est la réponse à « je veux de
meilleurs graphismes et je n'y arrive pas ».

---

## LES FREEZES

| # | Cause | Ligne | Gain |
|---|---|---|---|
| 1 | **Aucune précompilation des nuanceurs avant `startGame`.** `renderer.compile` n'existe qu'une fois (22673, dans `compilerScene`), appelée depuis 3 endroits — dont aucun n'est le chemin de démarrage (`bootCity` 29228→29259). Chaque matériau se compile donc à sa première apparition, **en pleine partie**. | 29259 | FORT |
| 2 | **`buildCity` est un seul bloc synchrone.** Aucun point de respiration entre `buildCity` (16223) → `buildFacadeDetails` → `buildStreetLife` → `buildShops` → `buildRiver` → `initMinimap` → `startGame`. Tout tient dans une seule tâche. | 29252 | FORT |
| 3 | **10 textures murales procédurales générées dans `buildCity`** : ~5,2 millions d'itérations par pixel (`makeWallVariant` 14868, canvas 512×512, puis `makeNormalTex` + `makeRoughTex`). | 16224 | FORT |
| 4 | **`cuireAO`** — le coût dominant est `champOuverture()` (14520), pas la boucle sur les sommets. | 16562 | FORT |
| 5 | **Aucun recyclage d'ennemis.** `makeErrant` clone un GLB rigué à chaque naissance (`SkeletonUtils.clone` 19110, matériaux clonés un par un 19119, ~10 géométries neuves 19193-19216). Aucun `dispose`. En vagues, **3 naissances toutes les 0,05 s**. | 19193 | FORT |
| 6 | `batirCollioure`, `batirCote` et `compilerScene` lancés par `setTimeout` pendant que le joueur joue (le carton ne suspend rien). | 22625 | MOYEN |
| 7 | `initZombieModel` : `atob` sur 2,88 Mo au chargement de la page. | 19058 | MOYEN |

## LE LAG

| # | Cause | Ligne | Gain |
|---|---|---|---|
| 1 | **`S.aliveCap = (fps<24) ? 22 : 9999`** — un bon téléphone reçoit donc **96 ennemis simultanés** (`S.queue` plafonné à 96, 20967), sortis en ~1,6 s. Le rendu et l'animation sont bien élagués par distance (`e.m.visible` 27143, LOD d'animation 27147-27165) — **mais pas l'IA** : `traquer`, `contourner` et `resolve` tournent pour les 96 à chaque image, sans aucune distance de coupe (27125-27134). | 20976 | FORT |
| 2 | **`fireRay` : 6 lancers de rayon pour le fusil à pompe, 14 pour le canon scié**, dans la même image. | 19708 | FORT |
| 3 | **SSAO en ULTRA : la scène entière est redessinée une seconde fois** (deux traversées complètes + rastérisation, plus la passe d'occlusion et son flou). | 11955 | FORT |
| 4 | `fitPost` ignore le `pixelRatio` : le composer est figé à 1,15 pour toujours (construit 11951, après le `setPixelRatio` de 11788). Inerte au réglage par défaut ; **coûteux en ULTRA** (source 1,15 rastérisée vers 2,0) et en vol (cap 0,95). ⚠️ Corriger par `composer.setPixelRatio(pr)` **ralentirait** ULTRA. | 11970 | MOYEN |
| 5 | 5 `PointLight` + 1 `SpotLight` collectés en permanence — Three.js les collecte sur la visibilité, or aucun n'est jamais mis à `visible=false`. | 11824 | MOYEN |
| 6 | Carte d'ombre redessinée 1 image sur 4 : pic réel de 1 à 3 ms (et non « 2 à 3 fois le coût d'une image »). | 27571 | MOYEN |

---

## PIÈGES — ce qu'il ne faut PAS « optimiser »

Ces pistes ont l'air bonnes et ont été **réfutées preuve à l'appui**. Ne pas y
toucher : on casserait du code qui marche pour un gain nul.

- **`collidersAt` et sa clé de chaîne** — `contourner` sort après un seul test
  quand la voie est libre (16652-16657). Le comptage alarmiste est faux.
- **Supprimer le `needsUpdate` de `anisoTout`** — en r128,
  `setTextureParameters` n'est appelé que depuis `uploadTexture` : le retirer
  **supprimerait silencieusement le filtrage anisotrope**.
- **Le Dijkstra de `cheminRues`** — `__tqBudget=2` est un plafond, pas un débit.
  Un errant ne réévalue que ~1,1 fois par seconde (garde `e.tqT` 26834-26836).
- **Les traces de balles** — la géométrie *est* libérée (21840), et le matériau
  est bien ramassé par le GC.
- **`decodeSfx`** — réfuté par l'arithmétique : 140 clés, 1,68 Mo, pas l'ordre
  de grandeur annoncé.
- **Les 18 textures WebP en data-URL** — le décodage WebP est **asynchrone** et
  hors du fil principal, même pour une data-URL.
- **`sliceEnemy` / `addBlood`** — ~9 primitives minuscules par mort. Négligeable.
- **`applyGFX` qui reconstruirait les cibles de rendu** — `setSize` du r128 est
  gardé par égalité de taille : rien n'est réalloué.
- **Les allocations par image du sabre, des chevrons, de la jauge d'endurance** —
  quelques objets de génération jeune. Coût réel : moins d'une microseconde.

---

## ORDRE DES CORRECTIONS

**Sans risque, gain immédiat :**
1. Laisser `gfxDepart` atteindre 3, et appeler `applyGFX` même quand elle
   *monte* (28281-28282). → anisotropie + ombres pleines enfin actives.
2. Permettre au réglage automatique de **remonter** (aujourd'hui `gfxCeil=nv`
   est un cliquet qui ne descend que), et abaisser le seuil de 40 à ~32 ips.
3. Mémoriser le palier choisi dans `localStorage`.

**Risque modéré, gain fort :**
4. Précompiler les nuanceurs avant `startGame` (appeler `compilerScene` dans
   `bootCity`). → supprime les à-coups de première apparition.
5. Plafonner l'IA par la distance : ne faire tourner `traquer`/`contourner`/
   `resolve` à plein régime que sous ~45 m, cadencer au-delà.
6. Ramener `aliveCap` à une valeur tenable (~30) au lieu de 9999.

**Chantier :**
7. Recycler les ennemis (réserve d'objets) au lieu de cloner un GLB par naissance.
8. Découper `buildCity` en tranches étalées sur plusieurs images.
