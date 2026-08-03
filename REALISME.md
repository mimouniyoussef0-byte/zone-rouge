# PLAN D'EXÉCUTION — ZONE ROUGE
## Fichier unique : `C:\Users\youss\OneDrive\Bureau\DOSSIER JEU\index.html`

J'ai revérifié moi-même dans le fichier les lignes porteuses de ce plan : 11787-11828, 11951-11976, 11420-11473, 14612-14711, 15234-15245, 16760-16859, 24300-24313, 27555-27595, 28140-28330. Tout ce qui suit s'appuie sur du code lu, pas sur les audits seuls.

**Premier constat de méthode : votre liste de 34 propositions en contient 27 réelles.** Sept doublons se recouvrent intégralement et doivent être fusionnés avant d'écrire une ligne, sinon vous appliquerez deux fois le même correctif avec deux chiffres différents :

| Doublon | Version à retenir |
|---|---|
| 5 et 27 (SSAO) | **27** pour le diagnostic, **5** pour le rafraîchissement des uniformes de caméra — les deux moitiés sont indispensables |
| 20 et 28 (`composer.setPixelRatio`) | **20**, qui a vu le gaspillage de 3,0x sur `gradePass` |
| 11 et 33 (palette) | **11** — la version 33 plante le jeu (décalages signés) |
| 13 et 34 (POM par matériau) | **34** (forme `{u,c}`, immune aux doublons de `POM_U`) ; **rejeter le (c) de 13** |
| 4 et 30 (`__envCiel`) | **30** pour le constat, **4** pour le placement de l'appel |
| 1 (corollaire) et 32 (calque d'ombre) | **32**, avec ses chiffres corrigés : `ox=-h*1.60*sx, oz=h*1.90*szc` |
| 2 et 28 (near/far) | **2**, avec les valeurs assouplies : `near=170, far=420` |

---

# 1. LES TROIS CHANGEMENTS QUI TRANSFORMERONT LE PLUS L'IMAGE

Je suis catégorique. Ce sont ceux-ci, dans cet ordre d'importance.

## N°1 — LE RAPPORT LUMIÈRE/OMBRE (prop. 3 + 30 + 6) — ligne 16813

**C'est le seul défaut qui explique pourquoi l'image est plate, et aucun autre correctif ne le compensera.**

Aujourd'hui, ligne 16813-16814 : `hemiL.intensity=(0.88-0.55*envT)` et `sunL.intensity=1.45-1.23*envT`. De jour : soleil 1,45 contre hémisphère 0,88. J'ai vérifié le shader vendorisé — `irradiance *= PI` puis `BRDF_Lambert` en 1/PI, `physicallyCorrectLights` à false : la diffuse vaut exactement `intensité × NdotL × albedo`, sans facteur caché. Sur une façade verticale, le rapport ombre/lumière ressort à **~30 %**. Un ciel clair réel donne **12 à 18 %**.

Traduction concrète : **une façade en plein soleil et la même façade à l'ombre du bâtiment d'en face ne diffèrent aujourd'hui que d'un tiers.** L'œil ne lit pas ça comme du volume, il le lit comme un aplat teinté. Tout ce que vous avez construit — POM, cartes de normales, relief de façade, chaînes d'angle, génoises, embrasures — n'existe à l'écran **que dans la mesure où une lumière directionnelle domine**. Elle ne domine pas. Vous payez le relief et vous ne le voyez pas.

Pire : la `HemisphereLight` verse cette lumière plate **en plus** de `scene.environment` (ligne 16796). L'indirect est compté deux fois, et c'est la moitié la plus grossière des deux qui écrase l'autre.

Après correction (hémisphère à 0,34 constant, soleil à 2,30 de jour, exposition compensée à 0,72+0,10·envT), le rapport tombe à 12 %. **Les rues étroites deviennent des puits, les places s'ouvrent, le modelé réapparaît sur chaque mur.** C'est le changement dont tous les autres dépendent pour se voir.

Condition non négociable : **ne jamais livrer la prop. 3 sans la 30 et la 6.** Retirer 0,54 d'hémisphère sans rendre la part indirecte par la carte d'environnement transforme les ombres en trous gris. Le paquet se tient, ses moitiés non.

## N°2 — LES OMBRES : LA DIRECTION ET LE CONTACT (prop. 1 + 2 + 32) — lignes 27570 et 11816-11819

Deux bugs distincts, un seul symptôme : **rien n'a l'air posé au sol.**

**(a) Le soleil éclaire depuis le côté opposé à celui où il est dessiné.** Ligne 27570 : `sunL.position.set(_sx-190,120,_sz+95)` s'exécute chaque image, après `applyEnv()` (26933) donc après `majCiel()` qui venait de poser la vraie direction lignes 16776-16778. L'écriture de 27570 écrase celle de 16776. `_solV` vaut (+0,598, +0,375, -0,708) — sud-est ; l'offset figé normalisé donne (-0,779, +0,492, +0,389) — nord-ouest. **124 degrés d'écart en 3D, 157 en azimut.** L'auréole du soleil est peinte d'un côté du ciel, les ombres tombent de l'autre, et `majRais` (11484) fait sortir les rais volumétriques d'un point de l'écran où il n'y a rien.

**(b) L'ombre décolle du pied de ce qui la projette.** Ligne 11816 : `bias=-0.0009`, `normalBias=0.15`. Ligne 11819 : `near=10, far=900`, jamais retouchés par `ombreCarte()` (28151-28162, qui ne touche que left/right/top/bottom). Le `bias` est en profondeur **normalisée** sur near..far : −0,0009 × 890 m = **0,80 m de recul**. À 22° d'élévation, cela fait **2 mètres de décalage latéral au sol**. L'ombre d'un lampadaire commence deux mètres après son pied. Le `normalBias` de 0,15 m ajoute 3,3 texels.

Le contact franc entre un objet et le sol est **le** signal que le cerveau lit comme « posé dans le monde » plutôt que « collé par-dessus ». C'est le plus gros gain par ligne modifiée de toute la liste, et il coûte zéro.

**Dépendance dure : (b) n'est valide qu'après (a).** Avec la position figée (norme 244 m), un `near=200` fait disparaître la moitié des casseurs d'ombre. Verrouillez l'ordre.

## N°3 — LA MATIÈRE : RUGOSITÉ, SALISSURE, VARIÉTÉ (prop. 9 + 10 + 11 + 12a)

Une fois la lumière directionnelle et les ombres en place, **c'est la surface qui trahit encore le décor.** Quatre défauts qui se cumulent :

- **`matPierre` (12520-12521) n'a NI normale NI carte de rugosité.** Rugosité constante 0,92, `envMapIntensity` 0,8 — soit 45 % de plus que les façades ordinaires. Les cinq monuments (Castillet, cathédrale, Campo Santo, Loge, palais) sont donc **plus plats et plus vernis que la ville qui les entoure**. C'est la définition du plastique moulé. Incohérence interne éloquente : le corps du Castillet (12850) a `normalMap:texBriqueN`, sa propre tour (12908) n'en a pas. Les deux sont côte à côte.
- **Aucun mur de la ville n'a de salissure au pied ni de délavage en haut.** `makeDirtTex` (15263) ne sert qu'au plan de terre. Les façades sortent du pavé avec exactement la même teinte et la même rugosité au ras du sol qu'à la gouttière.
- **Il n'existe que dix apparences d'immeuble dans tout Perpignan.** Lignes 16329 et 16332 : `PAL_RGB[__sd%10]` et `(__sd%10)+"|"+ck` — même graine, même modulo. La variante K porte toujours la teinte K. Le seul brassage est un facteur de **luminosité** (0,90 à 1,08), jamais de teinte.
- **`normalScale` des façades à 0,62** (16348), quand l'église est à 1,1, la toiture à 1,05 et le pavé à 0,95. Le mur qui occupe 70 % de l'image en rue est la surface la plus plate du jeu.

Pris ensemble et éclairés par le lot n°1, c'est ce qui fait passer une rue de « pile de rectangles peints » à « lieu qui a pris quarante ans d'eau ».

## Pourquoi PAS le SSAO, PAS le bloom, PAS la résolution dans ce trio

- **Le SSAO (prop. 27) est un vrai bug** — seuils à 6,40 m et 208 m au lieu de 2 cm et 72 cm — mais il vient **s'ajouter à trois couches d'occlusion déjà présentes** (`cuireAO` par sommet, occlusion cuite dans l'albédo, calque `bakedShadow`). Le gain est réel, le risque de boue dans les angles aussi. Quatrième, pas troisième.
- **Le bloom (prop. 24) et la courbe (prop. 22)** sont excellents, gratuits et à faire tôt — mais ils règlent la **restitution**, pas la scène. Un bon étalonnage sur une image plate donne une image plate bien étalonnée.
- **La résolution (prop. 20)** est le bug le plus rentable du fichier, mais **en performance, pas en image** : voir ci-dessous.

---

# 2. L'ORDRE D'EXÉCUTION EN LOTS

Sept lots. Chacun se teste seul, se livre seul, et se `git revert` seul. Faites un commit par lot.

---

## LOT 0 — PLOMBERIE ET IMAGES PAR SECONDE
**Image quasi inchangée. FPS en forte hausse. À faire avant tout le reste.**

| # | Ligne | Action |
|---|---|---|
| 20a | 11970 (`fitPost`) | Insérer `composer.setPixelRatio(pr);` **avant** `composer.setSize(...)`. `pr` est déjà calculé ligne 11969. |
| 20b | 28196 | `var cap=ultra?1.15:...` (au lieu de `2.0`) |
| 19 | 16274 → après 16323 | Déplacer et conditionner le `push(rgeo)` : drapeau `toitPose`, ne poser la dalle plate que si aucun versant n'a été créé |
| 26 | 11470-11471 | Remplacer le hash `sin/43758` par l'IGN de Jimenez, **avec un temps quantifié par image** (`floor(time*60.0)` ou l'uniforme `frame`), amplitude pondérée par la luminance |
| 8b | 16853 | Supprimer `scene.fog.near=...; scene.fog.far=...` — `FogExp2` n'a ni l'un ni l'autre, ce sont deux propriétés inertes |

**Le point 20 est le bug le plus rentable du fichier.** Le constructeur d'`EffectComposer` (ligne 8666 du vendorisé) fige `this._pixelRatio = renderer.getPixelRatio()` **une seule fois**, à 1,15, puisqu'il est construit ligne 11951 juste après le `setPixelRatio(1.15)` de la ligne 11788. `composer.setPixelRatio` existe en r128 (ligne 8851) et **n'est appelé nulle part**. Conséquence : en ULTRA, `applyGFX` monte le renderer à 2,0 mais **toute la chaîne reste dimensionnée à 1,15x**. Seul `gradePass`, qui a `renderToScreen=true`, écrit dans le canevas à 2,0x — **il étire en bilinéaire une image qui ne contient pas un bit d'information de plus.**

Or `gradePass` est de loin la passe la plus chère : jusqu'à 24 prélèvements pour les rais (`nRais=24` en ULTRA) + 2 d'aberration + 4 pour le masque flou + 2 pour la ruée = **jusqu'à 33 taps par pixel**. Vous payez `(2,0/1,15)² = 3,0 fois trop de pixels` sur cette passe, pour rien. Sur une dalle S26 Ultra, le canevas à 2,0x fait environ 10,4 Mpixels contre 3,4 à 1,15 — soit **~230 millions de lectures de texture gaspillées par image**.

Le commentaire de la ligne 28140 (« la résolution de rendu passe de 1,15 à 2,0 — c'est de loin le plus gros gain ») est **faux**. Corrigez-le en même temps.

- **Gain visuel** : nul, sauf le grain qui cesse de moirer et de se figer après dix minutes (bug latent réel : `S.elapsed` n'est jamais borné ligne 26921, `time*61.7` dépasse 37 000 à dix minutes et la précision mobile s'effondre).
- **Coût FPS** : **négatif. Comptez +8 à +15 ips en ULTRA**, et l'essentiel vient du seul point 20b.
- **Risque de casse** : nul. Aucune API hors r128.
- **Test** : ouvrir en ULTRA, lire le compteur d'ips du bandeau de debug (ligne 28295) avant/après, sur la même position joueur.

---

## LOT 1 — LA COURBE ET LES ARÊTES
**Gratuit. À faire avant la lumière : on ne peut pas sculpter une ombre quand la courbe écrase déjà tout sous 20/255.**

| # | Ligne | Action |
|---|---|---|
| 21 | 11797-11798, 15962 | Vider le filtre CSS **mais le reposer conditionnellement quand `GFX===0`** |
| 22 | 11433 | Remplacer le contraste linéaire par une courbe en S |
| 23 | 11424, 11445-11446 | Sauvegarder `cRaw` avant l'aberration ; `net=cRaw-fl*0.25` ; **gain 0,42 → 0,28** ; `px` sur la taille du tampon, pas du canevas |
| 25 | 7562, 8583-8585 | FXAA preset 12 → 23 ; `edgeThreshold` 0,166 → 0,125 ; `edgeThresholdMin` 0,0833 → 0,0625 ; **`subpix` reste à 0,80-0,85, PAS 1,00** |
| 24 | 11953-11954 | `UnrealBloomPass(vec2, 0.24, 0.80, 0.56)` + `bloom.highPassUniforms['smoothWidth'].value=0.10` |

Le contraste actuel, ligne 11433 : `c=(c-0.5)*1.12+0.5`, **plus** le `contrast(1.055)` du CSS = gain total 1,1816. Points de coupure recalculés : la sortie vaut 0 pour une entrée de 0,0768 et 1 pour 0,9107. **Tout ce qui est sous 20/255 devient noir plat, tout ce qui dépasse 232/255 devient blanc plat.** Dans une ville à l'ombre des ruelles, c'est exactement là où vit le détail que vous vous apprêtez à créer au lot 2.

Le remplacement, exposition-neutre par construction (gris moyen 0,4379 → 0,4382) :

```glsl
vec3 cs=clamp(c,0.0,1.0); cs=cs*cs*(3.0-2.0*cs); c=mix(c,cs,0.36);
```

Le `clamp` est indispensable et pas décoratif : ligne 11431, `c += rais(vUv)*solRais*...` et `rais()` est borné à 0,34 — `c` peut atteindre 1,34 en regardant le soleil. Sans clamp, le polynôme redescend au-delà de 1 et le halo solaire s'assombrirait.

**21 et 22 forment un bloc indissociable.** La courbe en S absorbe le `contrast(1.055)`. Appliquée seule, la pente totale devient 1,18 × 1,055 = 1,245 — **pire qu'aujourd'hui**.

Le bloom : seuil 0,80 **linéaire** (la passe est avant `GammaCorrectionShader`, ligne 11961) = sRGB 0,906 = 231/255. Rien de naturel dans la scène n'atteint ça — le bloom ne s'allume aujourd'hui que sur le disque solaire et les halos additifs. Et `smoothWidth=0.01` en dur (9503) est une marche : c'est votre scintillement de lucioles.

- **Gain visuel** : fort. Les ombres cessent d'être des trous noirs, les hautes lumières cessent de coller au blanc, le ciel autour du soleil se met à rayonner, les arêtes de toit arrêtent de fourmiller. C'est le changement le plus « photographique » du plan.
- **Coût FPS** : environ nul. La courbe en S coûte 4 ALU. Le bloom coûte exactement pareil (le rayon ne change que des poids). Le FXAA preset 23 ajoute ~2 taps. Le filtre CSS retiré **rend** une couche de compositeur.
- **Risque de casse** : faible, mais **deux régressions à couvrir explicitement**. (i) Au palier 0 le composer est court-circuité (ligne 28297) : le filtre CSS y est le **seul** étalonnage. Reposez-le conditionnellement. (ii) Le CSS s'appliquait après le mode wolf et la ruée ; fondu ligne 11435, il ne les désature plus. Écart petit, mais ne promettez pas l'identité parfaite.
- **Test** : une ruelle à l'ombre à envT=0, puis face au soleil, puis en mode wolf, puis au palier 0 forcé.

---

## LOT 2 — LE SOLEIL ET SES OMBRES
**Le lot n°2 du trio. Gratuit. Ordre interne strict.**

| Ordre | Ligne | Action |
|---|---|---|
| 2.1 | 27570 | Remplacer par la vraie direction, avec plancher d'élévation |
| 2.2 | 24308 | `sunL.position.y/260` → **`_solV.y`** — sinon une traînée de soleil apparaît sur la mer en pleine nuit |
| 2.3 | 11816 | `bias=-0.0002; normalBias=0.07;` |
| 2.4 | 11819 | `near=170; far=420;` — **et rappeler ces deux lignes à la fin de `ombreCarte()`** (28159) |
| 2.5 | 15238 | `var ox=-h*1.60*sx, oz=h*1.90*szc;` |

```js
var _sy=Math.max(0.30,_solV.y);
var _sl=Math.hypot(_solV.x,_sy,_solV.z)||1;
sunL.position.set(_sx+_solV.x/_sl*300, _sy/_sl*300, _sz+_solV.z/_sl*300);
```

La distance lumière-cible devient exactement 300 m à toute heure — **c'est la condition d'entrée de 2.3 et 2.4.** Avec `near=170, far=420` (plage 250 m), `bias=-0.0002` vaut 5 cm, soit un texel en ULTRA (46 m de demi-cascade / 2048 = 4,49 cm). Le `far` à 420 laisse la marge nécessaire au mode vol (`VOL`, ligne 24830), où un modèle à plus de 130 m d'altitude passerait devant un `near=200`.

`normalBias` : visez **0,07, pas 0,035**. À 0,035 vous êtes sous 1 texel en qualité haute (1536 sur demi=38 → 4,95 cm/texel) et l'acné revient sur les façades rasantes — précisément ce que l'ancien réglage masquait.

Point 2.5 : j'ai vérifié le repère (`PlaneGeometry` + `rotation.x=-PI/2` + flipY → +X toile = +X monde, +Y toile = +Z monde). La direction dessinée (0,894 ; −0,447) est **exactement** celle qu'impose le `sunL.position.set(-190,120,95)` codé en dur ligne 11811 : le calque a été calé contre une position de soleil que `majCiel` écrase depuis. C'est un réglage périmé, pas un choix esthétique.

**Une promesse à retirer de votre tête tout de suite** : ce lot **ne fera pas balayer l'ombre du Castillet sur la place**. `majCiel` fige `azim=2.44` ligne 16766 : **l'azimut ne varie jamais**, seule l'élévation bouge (0,384 → −0,166). Avec le plancher à 0,30, l'allongement total sur tout le cycle est de +34 % puis se fige. Le gain réel de ce lot est la **cohérence** auréole/ombre/rais/perspective aérienne — réelle, mais pas spectaculaire à elle seule. Le spectaculaire, c'est le contact retrouvé (2.3-2.4).

- **Gain visuel** : fort. La façade éclairée est enfin celle tournée vers le disque solaire visible. Les rais sortent du soleil. Et surtout **l'ombre recolle au pied des murs, des bornes, des marches, des ennemis**.
- **Coût FPS** : **strictement nul.** Même nombre d'écritures par image.
- **Risque de casse** : modéré, entièrement concentré sur 2.4. Si des ombres disparaissent, votre `near` est trop haut ; si l'acné revient, votre `normalBias` est trop bas.
- **Test** : une borne isolée sur une place, à 8 h et 18 h. Regarder son pied. Puis regarder la mer de nuit (2.2).

---

## LOT 3 — LE RAPPORT LUMIÈRE/OMBRE
**Le n°1 du trio. Le lot le plus important et le plus délicat du plan.**

| Ordre | Ligne | Action |
|---|---|---|
| 3.1 | 16740 | `if(true){` — ou poser `window.__envCiel=1;` en tête de `buildPMREM` |
| 3.2 | ~16562 | **Appeler `buildPMREM()` explicitement pendant la construction du monde**, à côté de `cuireAO()` |
| 3.3 | 16731 | `expo` jour : **1,9 → 1,0** (à régler ensuite à l'œil) |
| 3.4 | 16813 | `hemiL.intensity=0.34;` (constante) |
| 3.5 | 16814 | `sunL.intensity=2.30-2.08*envT;` — **2,08, pas 2,20** |
| 3.6 | 11787 + après 16814 | `renderer.toneMappingExposure=0.72;` puis `=0.72+0.10*envT;` dans `applyEnv` |
| 3.7 | ~16562 + après création des ennemis/armes | Registre `ENVMATS` + `envEchelle(k)` |
| 3.8 | avant 16796 | `envEchelle(1.55-1.25*Math.exp(-_d*_d))` avec `_d=(envT-0.5)/0.11` |
| 3.9 | 16840 | `var nf=Math.max(0.22,Math.min(0.92,mf*0.96));` — **plancher 0,22, pas 0,14** |

**Trois pièges vérifiés, à ne pas rater.**

**(a) Le 2,20 casse la nuit.** Le commentaire des lignes 16810-16812 est explicite : « LA NUIT N'EST PAS UN TROU NOIR : le ciel nocturne remonte à 0,33, la lune à 0,22. » `sunL=2.30-2.20*envT` donne 0,10 la nuit — **55 % de clair de lune en moins**. Écrivez `2.30-2.08*envT` : jour 2,30, nuit 0,22, inchangée. `hemiL=0.34` est en revanche exact (0,88−0,55 = 0,33).

**(b) Le plancher de brume à 0,14 casse la nuit aussi.** En nuit pleine, `cielCPU` sort `mf ≈ 0,043` ; aujourd'hui `nf=0,364`, avec 0,14 la ville lointaine devient **2,6 fois plus sombre**. Le correctif de jour est juste (à `mf=0,55`, `nf` actuel = 0,6425, soit 17 % **plus clair** que le ciel qu'il imite — d'où la bande claire au ras des toits). Gardez le plancher haut et descendez-le à l'œil, de nuit.

**(c) `buildPMREM` n'est PAS appelé au chargement.** Ligne 16795, `if(!envDay)buildPMREM()` est **dans `applyEnv`**, donc à la première image de jeu. Poser le drapeau ne déplace rien : sur un jeu qui a déjà des gels, vous ajoutez deux `fromScene` (12 rendus de sphère + deux chaînes de flou PMREM, 40-90 ms) en plein démarrage de partie. **Forcez la cuisson pendant l'écran de chargement.** `CIEL_TURB` est défini ligne 11229, un appel précoce est sûr.

Deux réserves d'honnêteté sur ce lot :
- Le facteur **1,55 de `envEchelle` n'est pas une compensation calculée**, contrairement à ce qu'affirme la prop. 6. L'hémisphère verse une irradiance plate proportionnelle à l'albédo, la carte d'environnement verse une irradiance directionnelle préfiltrée par la rugosité : les deux ne s'échangent pas à un scalaire près. **C'est un nombre à régler à l'œil.** Démarrez à 1,55 et ajustez.
- **Le registre `ENVMATS` doit être peuplé après la création des gabarits d'ennemis (16961-16977) et de l'arme (14279, `envMapIntensity` 1,35)**, sinon tout ce qui n'est pas la ville restera visiblement plus terne qu'elle. Et le matériau d'eau réécrit son propre `envMapIntensity` chaque image ligne 16823 : excluez-le ou appliquez-lui l'échelle après coup.
- Tous les `envMapIntensity` du jeu (0,03 à 2,8) ont été calés à la main **contre un dégradé peint à trois teintes** (`makeEnvCube`, 128×128, `#6E9CD0`/`#B9CBDD`/`#E4D2AE`). Passer au vrai ciel HDR **exige un passage de recalage**, pas juste un `expo` à 1,0. Prévoyez-le dans le lot, pas après.

- **Gain visuel** : **le plus fort du plan.** Le modelé réapparaît. Les métaux (lunette 2,8, acier 2,1, ferronneries 1,5, mer 0,80) cessent de refléter une peinture et prennent l'auréole solaire et l'horizon chaud.
- **Coût FPS** : nul en jeu. **+40 à 90 ms au chargement.**
- **Risque de casse** : **le plus élevé du plan.** C'est le lot qui peut détruire la nuit et déséquilibrer tous les métaux.
- **Test obligatoire** : trois captures à `envT = 0`, `0,5`, `1,0`, sur la même position. Plus une capture de l'arme en main et d'une ferronnerie de balcon à chaque valeur.

---

## LOT 4 — LE CONTACT : SSAO ET PARALLAXE
**Le premier lot qui coûte réellement des images par seconde.**

| Ordre | Ligne | Action |
|---|---|---|
| 4.1 | 28220-28221 | `kernelRadius=ultra?0.70:0.50; minDistance=0.00005; maxDistance=ultra?0.00045:0.00030;` |
| 4.2 | 11956 | Aligner la construction sur les mêmes valeurs |
| 4.3 | 28250-28256 | **Rafraîchir chaque image** `cameraNear`, `cameraFar`, `cameraProjectionMatrix`, `cameraInverseProjectionMatrix` |
| 4.4 | 28218-28219 | Supprimer le commentaire (faux : `kernelRadius` est en mètres d'espace vue, il ne dépend pas du nombre de pixels) |
| 4.5 | dans `startGame` | Rappeler `applyGFX(GFX)` une fois **après la première image** (`requestAnimationFrame`) |
| 4.6 | 14635 + 28170 | `POM_U.push({u:sh.uniforms.pomAmp, c:ampMetres/echMetres});` puis `POM_U[ip].u.value=(GFX>=3)?POM_U[ip].c:0.0;` |

Le SSAO : `minDistance` et `maxDistance` sont comparés à `delta = sampleDepth - realDepth`, **profondeurs normalisées sur [near, far]**. Caméra 0,25/1600 → plage 1599,75 m. Donc `0.004 = 6,40 m` et `0.13 = 208 m`. `kernelRadius`, lui, est bien en mètres (`samplePoint = viewPosition + sampleVector*kernelRadius`). **Le résultat n'est pas une occlusion de contact, c'est un halo de neuf mètres autour des silhouettes de premier plan** — c'est probablement lui que le commentaire de la ligne 28218 prend pour de l'AO. Le corriger supprime donc aussi un artefact.

Le rafraîchissement des uniformes (4.3) **n'est pas optionnel** : `camera.near` bascule de 0,25 à 0,04 à la visée (27445) et `camera.fov` est animé en continu (28002-28004), alors que les uniformes ne sont posés qu'au constructeur (9144-9148). Sans 4.3, votre calibration ne tient pas dès qu'on épaule.

Trois réserves chiffrées :
- **`minDistance` à 0,00005 (8 cm), pas 0,000025.** La texture de profondeur du SSAO est en `UnsignedShortType` (16 bits, ligne 9105). Le pas de quantification vaut `6,1e-5 × d²` : 2,4 cm à 20 m, 5,5 cm à 30 m. Un plancher à 4 cm passe **sous le bruit** au-delà de ~28 m — vous aurez du moucheté sur les sols plats lointains.
- **`kernelRadius` à 0,70, pas 0,35.** 0,35 m est très serré sur un téléphone ; démarrez large et resserrez.
- **L'occlusion s'empile déjà trois fois** : `cuireAO` par sommet (jusqu'à 0,2 sur les façades, 0,61 au sol), l'occlusion cuite dans l'albédo (commentaire 14595-14597), et le calque `bakedShadow`. Surveillez la boue dans les angles.

La parallaxe : ligne 14634 `sh.uniforms.pomAmp={value:0.0}`, et `onBeforeCompile` ne s'exécute **qu'au premier dessin**. J'ai vérifié la trace : `bootCity` (29275) enchaîne `buildCity` (29299) puis `startGame` (29306) **sans rendre une seule image**. Donc `POM_U` est prouvé vide quand la boucle 28169 le parcourt. Les uniformes naissent à 0,0 et **plus personne ne les touche**. Pire : le bouton Rejouer rappelle `startGame`, mais le verrou `S.__gfxInit` (28310) saute `applyGFX` — **la parallaxe reste éteinte partie après partie**.

**Autrement dit : ce code n'a jamais tourné une seule fois sur l'appareil cible. Son coût est totalement non mesuré.** C'est pourquoi 4.5 doit être livré **seul**, mesuré, avant 4.6.

Et **rejetez le point (c) de la prop. 13** (remonter le pavé de 0,021 à 0,030). On ne peut pas dire « le bitume nage parce qu'on lui donne le creux d'un pavé » puis donner au pavé un creux 43 % plus grand **à nombre de pas constant** (12, lignes 14671-14678). C'est le rapport amplitude/pas qui gouverne l'artefact. Si vous voulez vraiment 3 cm de joint, il faut 16-20 pas — et là le coût n'est plus nul.

- **Gain visuel** : fort. Angles de rue, jonction mur-sol, seuils, dessous des génoises, contour des ennemis contre le mur. Et le pavé se creuse pour de bon quand on baisse les yeux en marchant.
- **Coût FPS** : SSAO **nul, probablement négatif** (0,70 m au lieu de 9 m rend les 32 prélèvements cohérents en cache de texture). POM : **1 à 3 ms par image** quand le sol occupe l'écran, soit **−3 à −8 ips en ULTRA**. C'est le premier vrai débit du plan.
- **Risque de casse** : modéré (empilement d'occlusions ; moucheté lointain).
- **Test** : 4.1-4.4 d'abord, capture d'un angle de rue. Puis 4.5 seul, compteur d'ips en marchant sur une grande place. Puis 4.6.

---

## LOT 5 — LA MATIÈRE
**Le n°3 du trio. Entièrement visuel, entièrement réversible ligne par ligne.**

| Ordre | Ligne | Action |
|---|---|---|
| 5.1 | 16329-16331 | Décorrélation teinte/variante — **avec `>>>` partout** |
| 5.2 | 12520-12521 | `matPierre` : `normalMap` + `roughnessMap` + `envMapIntensity` 0,8 → 0,52 |
| 5.3 | 16345, 16354, 16386 | `salirMur(...)` sur `wallMats`, `churchMat`, `reliefMat` |
| 5.4 | 16348 | `normalScale` 0,62 → **0,85** (pas 1,00) |
| 5.5 | 11838 | Ajouter `envMapIntensity:0.42` (pas 0,34) |

**5.1 — la version de la prop. 33 plante le jeu, n'écrivez jamais celle-là.** `__sd >> 11` est un décalage **signé** : pour la moitié des bâtiments (`__sd >= 2^31`) il rend un négatif, `% 10` rend un reste négatif, `PAL_RGB[-3]` vaut `undefined`, `pc[0]` lève une TypeError — et le `try` le plus proche se referme ligne 16324, donc **`buildCity` s'interrompt et la ville n'existe plus**. Écrivez la version de la prop. 11 :

```js
var pc=PAL_RGB[((((__sd/10)|0)^(__sd>>>7))>>>0)%PAL_RGB.length];
var jit=0.97+(__sd%97)/540;                    /* plancher remonté */
var jr=jit*(0.965+((__sd>>>3)%13)/186);
var jb=jit*(0.955+((__sd>>>6)%17)/213);
tintGeo(geo,Math.min(1,pc[0]*jr),Math.min(1,pc[1]*jit),Math.min(1,pc[2]*jb));
```

La **ligne 16332 ne bouge pas** : elle indexe `wallMats`, elle doit rester `__sd%10`. Coût réellement nul — les couleurs de sommet existent déjà et sont posées avant la fusion. **Remontez le plancher de `jit` de 0,90 à 0,97** : en libérant l'appariement vous créez des produits `V.base × PAL_RGB × jit × ao` qui n'existaient pas, et le pire cas (variante 6 × palette 7) descend à 0,549/0,237/0,108 — du chocolat en bas de rue une fois `cuireAO` et le SSAO passés dessus.

**5.2 — corrigez le repli.** Le code de la prop. 9 écrit `roughness:1.0` en dur ; si le `try/catch` de `nrmDe` avale une exception, les cinq monuments passent de 0,92 à **1,0 plat — plus mats qu'avant**. Écrivez `roughness: NR.r?1.0:0.92`. Et conservez `opts.r` : c'est le seul point de réglage manuel.

**5.3 — deux réglages à changer par rapport à la prop. 10.** (i) `sin(vSalW.x*0.83+vSalW.z*0.61)` a une période de 7,57 m : **ce ne sont pas des coulures, c'est un marbrage à l'échelle d'un immeuble entier.** Montez d'un facteur 4 à 8 (`x*4.7+z*3.3`) ou superposez deux sinus. (ii) Ramenez le `0.85` vers **0,50** : `cuireAO` donne déjà `ao=0,46` minimum à y=0, le SSAO s'y ajoute en ULTRA, et vous multiplieriez encore par 0,68 — cumul possible à 0,31 de l'albédo au ras du sol, **avant l'ombre portée**. (iii) `smoothstep(9.0,17.0)` ne mord presque pas : les immeubles font 8,6 à 13,2 m (16259). Descendez à `smoothstep(6.5,13.0)`.

**5.4 — appliquez (a) SEUL, jetez (b).** Le (b) de la prop. 12 veut baisser les alphas des trois dégradés des lignes 14951-14959 par crainte qu'ils s'estampent en relief. C'est faux : ce sont des rampes **linéaires** sur 40 px, `makeNormalTex` en tire une dérivée d'ordre 0,007 par pixel, soit ~0,4° d'inclinaison de normale — invisible à 0,62 comme à 1,00. En revanche ces dégradés vivent aussi dans l'**albédo**, où le commentaire 14946-14950 les déclare conservés à dessein. **N'y touchez pas.**

Le vrai risque est l'inverse : `drawWindow` (14812-14818) peint un triangle `rgba(255,255,255,0.30)` dans le coin haut-gauche de chaque vitre — un faux reflet de verre. À 1,00 la normale dérivée en fait **un coin en relief physique qui s'éclaire par le haut alors qu'il est censé être un reflet**. D'où 0,85, et regardez une fenêtre de près avant de pousser plus loin.

**5.5 — 0,42, pas 0,34.** Le pavé de place à 0,34 a une AO cuite par sommet, une carte de rugosité et de la parallaxe ; le plan de terre n'a **rien** de tout cela (`roughness` 0,97 constant, normale à 0,35). Lui retirer 66 % de son irradiance risque de l'aplatir en gris terne à l'ombre et au crépuscule. Notez aussi que le voile bleu vient **pour moitié** de `hemiL` (`0xBFD0E8`), donc ce correctif ne le supprime qu'à moitié — le vrai motif est la cohérence avec la ville, pas la disparition du bleu.

- **Gain visuel** : fort. Cent combinaisons de façade au lieu de dix, avec dérive de **teinte** et non plus de clair. Les joints de chaux du Castillet et les blocs de la Loge se creusent au soleil rasant. Le pied de chaque mur se charge sur deux mètres.
- **Coût FPS** : **−0,5 à −1,5 ips.** Deux prélèvements de plus sur les seuls pixels de monument ; un `sin`, deux `smoothstep`, deux `mix` sur les murs, **sans prélèvement de texture ajouté**. Plus **25-40 ms au chargement** et **~3 Mo de VRAM**.
- **Risque de casse** : modéré. 5.1 est le seul point qui peut tuer la ville, et seulement si vous écrivez la mauvaise version.
- **Test** : une rue étroite du centre ancien, à 8 h et 18 h. Compter les répétitions à l'œil sur 30 immeubles. Puis une fenêtre de près (5.4).

---

## LOT 6 — LE VOLUME NOCTURNE ET LA SILHOUETTE
**Facultatif. À traiter seulement si les lots 0-5 tiennent et que le budget d'images est là.**

| # | Ligne | Action | Verdict |
|---|---|---|---|
| 7 | 27589-27595 | **Le fondu SEUL sur les trois lampes existantes** | À prendre |
| 7b | 11824 | Passer à 5 lampes / 22 m / 3,4 | **À tester séparément, abandonner si > 2 ms** |
| 18 | 13806, 13802 | Prisme à deux pentes (**−3 720 triangles**) + loi de hauteur à queue longue | À prendre |
| 15 | 16183 | `if(Math.abs(v1x*v2x+v1z*v2z)>0.55)continue;` + test de convexité + variante 4 pierres (60 tri/coin) | À prendre |
| 16 | 16281-16286 | Décalage de contour mitré | Tiède |
| 17 | 15344 | Trois typologies de toit | Tiède |
| 31 | 14691 | Canal rouge ORM → `<aomap_fragment>` | À prendre, force 0,40 |

**Sur le 7b, soyez lucide.** En Three.js le nombre de lumières est figé dans le shader (`NUM_POINT_LIGHTS`) : **une lumière à intensité zéro est quand même évaluée par fragment**. Deux lampes de plus se paient **sur chaque pixel éclairé, en plein jour comme la nuit**, pour un bénéfice exclusivement nocturne. Et on ne s'en sort pas par `visible=false` : changer le compte recompile tous les programmes, soit exactement le gel qu'on veut éviter. Le fondu sur les trois lampes existantes, lui, est **strictement gratuit** et supprime l'essentiel du défaut visible. Attention : le code proposé remet `k=0` en une image — vous remplacez une téléportation par une **extinction sèche**. Il faut une descente, puis le déplacement, puis la remontée : machine à deux états.

**Sur le 15**, le test est bien inversé (`dot > -0.62` ne laisse passer que les angles intérieurs > 128,3°, et un mur parfaitement droit à `dot = -1` **passe le test**). Mais `|dot| < 0.55` ne distingue pas convexe et concave : sur un sommet rentrant de bâtiment en L, le décalage de la ligne 16192 pousse la boîte **dans le mur**. Ajoutez le test de convexité par signe de l'aire signée. Et prenez la variante neutre en budget : les meshes `relB` sont `castShadow` **et** `receiveShadow` (16392), chaque triangle est payé deux fois.

**Sur le 16, l'effet annoncé est survendu** : le mesh de corniche (16382-16384) n'a **ni `castShadow` ni `receiveShadow`**. Il n'existe aucune ombre portée sous la corniche aujourd'hui et il n'en existera pas demain. Ce qu'on gagne est une sous-face non éclairée de largeur constante — un bandeau sombre, pas une ombre. Et il faut d'abord normaliser le sens de parcours des contours, jamais fait dans le fichier (16308-16313 prend `Math.abs` de l'aire signée précisément pour ne pas avoir à le savoir).

**Sur le 18, la brume mange le gain** : `FogExp2` à 0,00235, un faubourg est à 530-930 m, donc 76 à 99 % fondu dans la couleur du ciel. Le gain se lit depuis le bord de ZONE, depuis le haut du Castillet, et surtout **pendant la cinématique** où la densité tombe à 0,00092 (20735, 20748). À prendre parce que c'est **négatif en triangles**, pas parce que c'est spectaculaire. Piège : `rr()` est un LCG à état partagé — gardez **exactement un appel** dans l'expression de `h`, sinon toute la ceinture change de forme.

**Sur le 31, corrigez le point d'injection.** Multiplier `diffuseColor` assombrit aussi la lumière **directe**, ce qui est physiquement faux et donne le rendu sale et plat classique. Remplacez plutôt `#include <aomap_fragment>` (présent dans `meshphysical_frag` en r128, il fait `reflectedLight.indirectDiffuse *= ambientOcclusion` **avant** la multiplication par l'albédo) par `reflectedLight.indirectDiffuse *= mix(1.0, texture2D(roughnessMap,vUv).r, 0.40);`. Même coût, aucune unité de texture en plus, physiquement correct. Réserve : les WebP sont en `VP8 ` (avec perte, YUV 4:2:0) — le rouge est reconstruit avec une chrominance sous-échantillonnée à 512×512. C'est utilisable, mais la promesse « à l'échelle du centimètre » est optimiste.

- **Gain visuel** : moyen. La nuit cesse de clignoter quand on marche, la ligne d'horizon prend des accidents, les chaînes d'angle apparaissent où l'œil les cherche.
- **Coût FPS** : le 18 est **positif** (−3 720 tri). Le 15 coûte ~11 000 triangles payés deux fois. Le 7b coûte sur chaque pixel éclairé, jour compris.
- **Risque de casse** : le 15 et le 16 touchent la géométrie de la ville. Le 17 n'est **pas** gratuit contrairement à ce qui est annoncé (les tympans partent dans `penteB` avec `roofTex` en tuile canal, et l'UV de la ligne 16365 s'étire en traînée verticale sur un tympan) — laissez-le en dernier ou abandonnez-le.

---

## LOT 7 — LES GELS (hors périmètre visuel, mais bloquant)

Vous me signalez trois gels non corrigés. Ils vont **empirer** avec ce plan si vous ne les traitez pas, parce que les lots 3 et 5 ajoutent des variantes de programme (`salirMur` crée un `customProgramCacheKey` nouveau, la carte d'environnement change les uniformes).

1. **`renderer.compile(scene, camera)` existe en r128.** C'est la réponse au gel de compilation de nuanceurs. Appelez-le pendant l'écran de chargement, **après** avoir posé `scene.environment` et créé tous les matériaux, y compris les gabarits d'ennemis et d'armes. Un matériau non dessiné = un programme non compilé = un gel la première fois qu'il entre dans le champ.
2. **`buildCity` synchrone** : découpez la boucle 16240-16344 en tranches sur plusieurs images avec un budget de ~8 ms par tranche. C'est un chantier séparé.
3. **96 ennemis sans plafond d'IA** : budget de N mises à jour complètes par image, les autres en pas réduit selon la distance. Chantier séparé.

Le 1 est à faire **avant le lot 5**, sinon vous ajouterez un gel de plus.

---

# 3. CE QUI EST GRATUIT

Coût GPU strictement nul ou négatif. **Tout ce qui suit passe en premier, sans discussion, et se livre en deux commits (lots 0 et 1) plus les lots 2 et 3.**

| Ligne | Changement | Coût réel |
|---|---|---|
| **11970** | `composer.setPixelRatio(pr)` | **Négatif** — débloque tout le reste |
| **28196** | cap ULTRA 2,0 → 1,15 | **Négatif : −67 % de pixels sur `gradePass`, image identique** |
| 16274 | Dalles de toit conditionnelles | **Négatif : −15 000 triangles** |
| 13806 | Toit de faubourg en prisme | **Négatif : −3 720 triangles** |
| 11797 | Filtre CSS retiré | **Négatif** — supprime une couche de compositeur |
| 27570 | Direction réelle du soleil | Nul — même nombre d'écritures |
| 24308 | `COTE_SOLEIL` sur `_solV.y` | Nul |
| 11816, 11819 | `bias`, `normalBias`, `near`, `far` | Nul |
| 15238 | Direction du calque d'ombre cuite | Nul — cuit une fois au chargement |
| 16813, 16814, 11787 | Ratio soleil/ciel + exposition | Nul |
| 16796 (avant) | `envEchelle` | Nul — quelques dizaines d'écritures scalaires par cycle |
| 16840, 16853 | Luminosité de brume + `near`/`far` morts | Nul |
| 11433 | Courbe en S | 4 ALU au lieu de 2 |
| 11445 | `cRaw` pour le masque net | **Zéro prélèvement ajouté** — le sample existe déjà ligne 11424 |
| 11470 | Grain IGN | 3 ALU, aucun `sin` |
| 11953 | Bloom seuil/force/rayon/genou | **Identique** — mêmes passes, mêmes cibles |
| 28220 | Seuils SSAO | **Négatif** — meilleure cohérence de cache |
| 28170 | POM par matériau | Nul |
| 16329 | Palette décorrélée | Nul — couleurs de sommet déjà là |
| 16348 | `normalScale` 0,85 | Nul — un scalaire |
| 11838 | `envMapIntensity` du plan de terre | Nul — une clé de littéral |
| 27589 | Fondu des trois lampes | Nul |

**Bilan des lots 0 à 3 : vous transformez l'éclairage, les ombres, la courbe tonale, le bloom, le grain, la brume et l'anticrénelage, et vous finissez avec PLUS d'images par seconde qu'au départ.** Comptez **+8 à +15 ips en ULTRA** après le seul lot 0.

Les lots 4 et 5 sont les premiers à débiter : **−4 à −10 ips au total**, dont l'essentiel vient de la parallaxe, dont le coût n'a **jamais été mesuré une seule fois** sur l'appareil. Vous partez donc du lot 0 avec une avance de 8 à 15 ips à dépenser. Dépensez-la en connaissance de cause.

---

# 4. LE VERDICT SUR L'AMBITION

## Ce que ce moteur peut atteindre

Vous n'irez pas à Call of Duty. Vous pouvez aller **très loin ailleurs**, et l'endroit où vous irez est meilleur que ce que vous croyez.

Le rendu accessible, une fois ce plan appliqué, est celui d'une **photographie d'architecture à l'heure dorée** : une clé directionnelle forte, des ombres qui touchent le sol, une occlusion de contact dans chaque angle, des matériaux qui se lisent comme de la pierre et du crépi, une courbe filmique avec pied et épaule, un grain qui trame la quantification, une halation d'objectif autour du soleil. Une image qui se lit comme **captée** plutôt que **calculée**.

Les références justes ne sont pas COD Warzone. Ce sont les jeux dont la force est la **direction artistique et le lieu** : *Assassin's Creed* sur mobile, *The Division* en version portable, *Dishonored*. Et sur un axe précis, **vous avez déjà un avantage que COD n'a pas** : Perpignan à l'échelle 1:1 relevée sur OpenStreetMap, avec cinq monuments modélisés à la main. Aucun FPS mobile n'a ça. C'est votre argument, et il faut le servir — d'où le poids que je donne aux lots 3 et 5.

Chiffré, l'objectif réaliste après ce plan sur un S26 Ultra :

- **45-60 ips stables** en ULTRA à 1,3-1,4x de résolution de rendu
- Un rapport ombre/lumière de **8:1** au lieu de 3:1 aujourd'hui
- Une carte d'ombre à **4,5 cm par texel** sur 46 m, avec des contacts nets
- **Cent apparences de façade** au lieu de dix
- Zéro gel de compilation de nuanceur

## Ce qui restera hors d'atteinte, et pourquoi

Ce n'est pas une question de talent, c'est une question de version et de silicium.

**Impossible en r128 sans écrire un moteur :**
- **Éclairage global dynamique** (Lumen, SSGI, sondes d'irradiance). Le PMREM est une approximation figée à deux états. Il n'y aura jamais de rebond de lumière de la façade ensoleillée vers la rue d'en face — c'est justement ce que le facteur `envEchelle` imite grossièrement.
- **Réflexions en espace écran (SSR).** Aucune `SSRPass` n'est vendorisée. Écrite à la main, elle coûte une passe de profondeur + une passe de normales + un raymarch : **3 à 6 ms**. Vos vitrages et votre pavé mouillé ne refléteront jamais la rue, seulement le ciel.
- **Anticrénelage temporel.** J'ai inventorié tout le bundle : `CopyShader`, `SSAOShader/Blur/Depth`, `LuminosityHighPass`, `FXAAShader`, `GammaCorrection`, `EffectComposer`, `FullScreenQuad`, `Pass`, `RenderPass`, `ShaderPass`, `SSAOPass`, `UnrealBloomPass`. **C'est tout.** Ni SMAA, ni TAA, ni SSAA, ni SAO. Et `TAARenderPass` accumule 2^n rendus complets par image : injouable. **FXAA bien réglé est votre plafond d'anticrénelage**, et le crénelage rampant en mouvement ne disparaîtra jamais complètement.
- **Ombres à contact durcissant (PCSS), cascades multiples (CSM), lumières surfaciques.** Une seule cascade de 46 m, PCFSoft, point.
- **Flou de profondeur de champ, flou de mouvement par objet.** Pas de tampon de vitesse, pas de passe DOF.
- **Brouillard volumétrique 3D.** Vos rais sont en espace écran, ils le resteront.
- **Pas de WebGPU, pas de nodes, pas de TSL.** Rien de ce qui est sorti après 2021 n'est mobilisable sans changer de version — et changer de version, sur un fichier de 10,7 Mo dont la moitié des effets passent par `onBeforeCompile` et des substitutions de chaînes dans `meshphysical_frag`, est un chantier de plusieurs semaines avec une forte probabilité d'écran noir.

**Et le vrai écart avec Call of Duty n'est pas là.** Il est dans les **actifs et l'animation** : personnages skinnés à 50 000 triangles avec cartes de normales cuites depuis un maillage haute densité, animations capturées, transitions à quatre couches, ragdoll, retour visuel d'impact par matériau, arme en main animée à 120 images par seconde avec inertie procédurale. C'est 80 % de la sensation COD, et c'est du travail d'atelier, pas du moteur. Aucun réglage de `bias` ne le remplacera.

## Ma recommandation finale

**Faites les lots 0, 1, 2 et 3.** Ils sont gratuits ou négatifs en coût, ils sont les trois quarts du gain visuel total, et ils vous laissent avec plus d'images par seconde qu'aujourd'hui. Prenez une capture avant, une après. La différence sera plus grande que tout ce que vous avez obtenu jusqu'ici, et elle n'aura rien coûté.

**Puis mesurez avant les lots 4 et 5.** Le POM en particulier : ce code n'a jamais tourné une seule fois. Allumez-le seul, regardez le compteur, décidez.

**Le lot 7 (`renderer.compile` pendant le chargement) doit passer avant le lot 5.** Sinon chaque nouveau `customProgramCacheKey` que vous introduisez est un gel de plus à la première apparition à l'écran.

Et un dernier avertissement de méthode, valable pour tout le plan : **six de vos propositions promettent un cycle jour/nuit qui n'existe pas.** `majCiel` fige `azim=2.44` ligne 16766. L'azimut du soleil ne varie **jamais** — seule l'élévation bouge. Après tous les correctifs, l'ombre du Castillet s'allongera de 34 % puis se figera ; elle ne balaiera pas la place. Si vous voulez ce balayage — et c'est le signal numéro un qu'un moteur d'éclairage est vivant — c'est **une ligne de plus** : faire varier `azim` avec `envT`. Mais alors le PMREM cuit à deux états et le calque d'ombre cuit une fois ne suivront plus, et il faudra les recuire. C'est un chantier à part entière, à décider consciemment, pas un effet de bord.