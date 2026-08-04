/* =====================================================================
   SURFACES IMPLICITES — la bonne methode pour l'organique
   =====================================================================

   POURQUOI CE FICHIER EXISTE

   Onze tentatives ont echoue a modeliser une main en assemblant des
   primitives : spheres, cylindres, tubes balayes. La raison est
   structurelle et non un manque de soin — deux primitives qui se
   rencontrent SE CROISENT, et ce croisement se voit. Une main, un
   visage, un corps n'ont aucune couture ; un assemblage en a partout.

   La reponse est de ne plus poser d'objets, mais de decrire un CHAMP
   DE DISTANCE : pour chaque point de l'espace, a quelle distance suis-je
   de la surface ? Deux formes se combinent alors par un minimum ADOUCI
   (smin), et elles se fondent l'une dans l'autre au lieu de se traverser.
   On extrait ensuite un maillage de ce champ.

   Ce fichier n'est pas encore branche dans le jeu : il conserve la
   technique, eprouvee et rendue, pour la suite.

   CE QUI RESTE A RESOUDRE AVANT DE L'EMBARQUER — voir le bas du fichier.
   ===================================================================== */

/* ---------- le minimum adouci : le coeur de la methode ----------
   k est le rayon de fusion, en metres. 0,003 donne une jonction nette
   (deux doigts qui se touchent), 0,020 donne une moufle. */
function smin(a, b, k) {
  var h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k));
  return b * (1 - h) + a * h - k * h * (1 - h);
}

/* ---------- capsule : le baton de base de tout ce qui est organique ----------
   Un segment avec un rayon, qui peut s'affiner d'un bout a l'autre.
   Une phalange, un avant-bras, une cuisse : tout est une capsule. */
function capsule(px, py, pz, ax, ay, az, bx, by, bz, r1, r2) {
  var abx = bx - ax, aby = by - ay, abz = bz - az;
  var apx = px - ax, apy = py - ay, apz = pz - az;
  var d = abx * abx + aby * aby + abz * abz;
  var t = d > 0 ? Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / d)) : 0;
  var cx = ax + abx * t, cy = ay + aby * t, cz = az + abz * t;
  var dx = px - cx, dy = py - cy, dz = pz - cz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (r1 + (r2 - r1) * t);
}

/* ---------- un doigt : chaine de capsules qui s'enroule ----------
   La courbure suit 0,3s + 0,7s² : peu a la base, forte aux dernieres
   phalanges. C'est ainsi qu'un doigt se referme. */
function doigtSDF(px, py, pz, ox, oy, oz, L, r0, r1, curl, n, k) {
  var d = 1e9, cz = 0, cy = 0, i;
  for (i = 0; i < n; i++) {
    var s0 = i / n, s1 = (i + 1) / n;
    var a1 = curl * (0.3 * s1 + 0.7 * s1 * s1);
    var z0 = cz, y0 = cy, seg = L / n;
    cz += Math.cos(a1) * seg;
    cy -= Math.sin(a1) * seg;
    var c = capsule(px, py, pz, ox, oy + y0, oz + z0, ox, oy + cy, oz + cz,
                    r0 + (r1 - r0) * s0, r0 + (r1 - r0) * s1);
    d = (i === 0) ? c : smin(d, c, k);
  }
  return d;
}

/* ---------- la main ----------
   Les rayons de fusion sont l'essentiel du reglage :
     0,0030 entre doigts voisins   -> ils se touchent sans se confondre
     0,0075 doigts vers la paume   -> raccord net
     0,0085 pouce vers la main     -> le pouce garde son volume
   Un premier essai a 0,014 et 0,018 avait tout fondu en moufle. */
function mainSDF(px, py, pz) {
  /* paume : capsule epaisse, ecrasee en entrant l'axe x multiplie */
  var paume = capsule(px * 2.45, py, pz * 1.30,
                      0, -0.046, 0.004, 0, 0.044, 0.008, 0.038, 0.043);
  var LG = [0.94, 1.00, 0.95, 0.82];   /* majeur le plus long */
  var CU = [1.55, 1.72, 1.86, 1.98];   /* l'auriculaire se referme le plus */
  var dg = 1e9;
  for (var f = 0; f < 4; f++) {
    var fy = 0.040 - f * 0.0250;
    var df = doigtSDF(px, py, pz, 0.001, fy, 0.030,
                      0.088 * LG[f], 0.0136, 0.0096, CU[f], 8, 0.0035);
    dg = (f === 0) ? df : smin(dg, df, 0.0030);
  }
  var d = smin(paume, dg, 0.0075);
  var dt = doigtSDF(px, py, pz, -0.030, 0.022, 0.010, 0.072, 0.0168, 0.0118, 0.95, 7, 0.0040);
  return smin(d, dt, 0.0085);
}

/* ---------- SURFACE NETS : extraire un maillage du champ ----------
   Choisi plutot que les marching cubes parce qu'il ne demande aucune
   table de 256 entrees : un sommet par cellule traversee par la surface,
   place a la moyenne des croisements d'aretes, puis un quad par arete
   qui change de signe. Environ soixante lignes contre plusieurs
   centaines, pour un resultat legerement plus lisse — ce qui va bien a
   de l'organique. */
function surfaceNets(f, min, max, N) {
  var i, j, k;
  var dx = (max[0] - min[0]) / N, dy = (max[1] - min[1]) / N, dz = (max[2] - min[2]) / N;
  var S = new Float32Array((N + 1) * (N + 1) * (N + 1));
  var idx = function (a, b, c) { return (c * (N + 1) + b) * (N + 1) + a; };
  for (k = 0; k <= N; k++) for (j = 0; j <= N; j++) for (i = 0; i <= N; i++)
    S[idx(i, j, k)] = f(min[0] + i * dx, min[1] + j * dy, min[2] + k * dz);

  var VID = new Int32Array(N * N * N).fill(-1), V = [];
  var CUB = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
  var ED = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];

  for (k = 0; k < N; k++) for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
    var s = [], neg = 0, e;
    for (e = 0; e < 8; e++) {
      var c = CUB[e], v = S[idx(i + c[0], j + c[1], k + c[2])];
      s.push(v); if (v < 0) neg++;
    }
    if (neg === 0 || neg === 8) continue;      /* cellule entierement dedans ou dehors */
    var sx = 0, sy = 0, sz = 0, n = 0;
    for (e = 0; e < 12; e++) {
      var a = ED[e][0], b = ED[e][1];
      if ((s[a] < 0) === (s[b] < 0)) continue;
      var t = s[a] / (s[a] - s[b]), A = CUB[a], B = CUB[b];
      sx += A[0] + (B[0] - A[0]) * t;
      sy += A[1] + (B[1] - A[1]) * t;
      sz += A[2] + (B[2] - A[2]) * t;
      n++;
    }
    VID[(k * N + j) * N + i] = V.length / 3;
    V.push(min[0] + (i + sx / n) * dx, min[1] + (j + sy / n) * dy, min[2] + (k + sz / n) * dz);
  }

  var P = [];
  function push(a, b, c) {
    var L = [a, b, c];
    for (var q = 0; q < 3; q++) { var v = L[q]; P.push(V[v * 3], V[v * 3 + 1], V[v * 3 + 2]); }
  }
  var dirs = [[1,0,0,[[0,-1,0],[0,-1,-1],[0,0,-1]]],
              [0,1,0,[[0,0,-1],[-1,0,-1],[-1,0,0]]],
              [0,0,1,[[-1,0,0],[-1,-1,0],[0,-1,0]]]];
  for (k = 0; k < N; k++) for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
    var v0 = S[idx(i, j, k)];
    for (var q = 0; q < 3; q++) {
      var D = dirs[q];
      if (i + D[0] > N || j + D[1] > N || k + D[2] > N) continue;
      var v1 = S[idx(i + D[0], j + D[1], k + D[2])];
      if ((v0 < 0) === (v1 < 0)) continue;
      var o = D[3], cells = [[0,0,0], o[0], o[1], o[2]], ids = [], ok = true;
      for (var c2 = 0; c2 < 4; c2++) {
        var ci = i + cells[c2][0], cj = j + cells[c2][1], ck = k + cells[c2][2];
        if (ci < 0 || cj < 0 || ck < 0 || ci >= N || cj >= N || ck >= N) { ok = false; break; }
        var id = VID[(ck * N + cj) * N + ci];
        if (id < 0) { ok = false; break; }
        ids.push(id);
      }
      if (!ok) continue;
      /* le sens de parcours suit le signe : la normale sort de la matiere */
      if (v0 < 0) { push(ids[0], ids[1], ids[2]); push(ids[0], ids[2], ids[3]); }
      else        { push(ids[0], ids[2], ids[1]); push(ids[0], ids[3], ids[2]); }
    }
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.computeVertexNormals();
  return { g: g, triangles: P.length / 9 };
}

/* =====================================================================
   CE QUI RESTE A RESOUDRE AVANT D'EMBARQUER CECI DANS LE JEU

   1. LE COUT DE MAILLAGE. Grille 72³, 3,6 secondes. Inacceptable au
      demarrage d'une partie. Trois issues : cuire une seule fois et
      garder le resultat, baisser la grille (48³ suffit peut-etre pour
      un objet vu a trente centimetres), ou exporter le maillage une
      bonne fois et l'embarquer comme donnee.

   2. LE NOMBRE DE TRIANGLES. 25 656 pour une main, donc plus de 51 000
      pour les deux. C'est beaucoup pour un objet tenu en permanence.
      A reduire par decimation ou par une grille plus grossiere.

   3. LES COORDONNEES DE TEXTURE — LE VRAI PROBLEME. Surface nets ne
      produit AUCUN uv. Sans eux, impossible de poser une texture de
      peau, des ongles, des coutures de gant : la main resterait d'une
      seule couleur. La solution habituelle pour un maillage issu d'un
      champ de distance est la projection triplanaire, faite dans le
      nuanceur a partir de la position et de la normale. C'est un
      chantier a part entiere, et c'est lui qui separe une forme juste
      d'un objet fini.
   ===================================================================== */
