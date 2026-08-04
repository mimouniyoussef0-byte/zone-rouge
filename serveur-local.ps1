# =====================================================================
#  ZONE ROUGE - serveur local pour tester sur telephone
#
#  Sert le jeu sur le reseau WiFi de la maison. Le telephone ouvre
#  l'adresse affichee au demarrage, et joue.
#
#  Aucun compte, aucun hebergeur, rien de televerse, aucun nom expose.
#  Le fichier est relu du disque A CHAQUE requete : apres une
#  correction, il suffit de rafraichir la page sur le telephone.
#
#  Pour lancer  : clic droit sur ce fichier > Executer avec PowerShell
#  Pour arreter : Ctrl+C, ou fermer la fenetre
#
#  (Ecrit sans accents : PowerShell 5.1 lit les fichiers sans BOM
#   comme de l'ANSI, et les caracteres accentues y sont corrompus.)
# =====================================================================

$dossier = Split-Path -Parent $MyInvocation.MyCommand.Path
$port    = 8000

$ip = (Get-NetIPAddress -AddressFamily IPv4 |
       Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
       Select-Object -First 1).IPAddress

$types = @{
  ".html" = "text/html; charset=utf-8"
  ".htm"  = "text/html; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".webp" = "image/webp"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".ogg"  = "audio/ogg"
  ".glb"  = "model/gltf-binary"
  ".ico"  = "image/x-icon"
}

try {
  $ecouteur = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $port)
  $ecouteur.Start()
} catch {
  Write-Host "IMPOSSIBLE D'OUVRIR LE PORT $port" -ForegroundColor Red
  Write-Host $_.Exception.Message
  Read-Host "Entree pour fermer"
  exit 1
}

$adresse = "http://" + $ip + ":" + $port

Write-Host ""
Write-Host "  ZONE ROUGE - serveur local" -ForegroundColor Green
Write-Host "  ==========================" -ForegroundColor Green
Write-Host ""
Write-Host "  Sur ton telephone, meme WiFi, ouvre :" -ForegroundColor White
Write-Host ""
Write-Host ("      " + $adresse) -ForegroundColor Yellow
Write-Host ""
Write-Host ("  Sur ce PC : http://localhost:" + $port)
Write-Host ""
Write-Host "  Ctrl+C pour arreter. Laisse cette fenetre ouverte."
Write-Host ""

while ($true) {
  $client = $null
  try {
    $client = $ecouteur.AcceptTcpClient()
    $flux   = $client.GetStream()

    $tampon = New-Object byte[] 8192
    $lu = $flux.Read($tampon, 0, 8192)
    if ($lu -le 0) { $client.Close(); continue }

    $requete  = [System.Text.Encoding]::ASCII.GetString($tampon, 0, $lu)
    $premiere = ($requete -split "`r`n")[0]
    $morceaux = $premiere -split " "
    if ($morceaux.Count -lt 2) { $client.Close(); continue }

    # ---------------------------------------------------------------
    #  POST /capture : le navigateur renvoie une image rendue hors ecran.
    #  C'est la voie de retour qui permet de VOIR ce que le code fabrique
    #  au lieu de le supposer. Le corps est du base64 brut ; on l'ecrit
    #  tel quel, le decodage se fait ensuite.
    # ---------------------------------------------------------------
    if ($morceaux[0] -eq "POST" -and $morceaux[1].StartsWith("/capture")) {
      $sep = $requete.IndexOf("`r`n`r`n")
      $lon = 0
      foreach ($ligne in ($requete -split "`r`n")) {
        if ($ligne -match '^(?i)content-length:\s*(\d+)') { $lon = [int]$matches[1] }
      }
      $corps = ""
      if ($sep -ge 0) {
        $debut = $sep + 4
        $corps = $requete.Substring($debut)
        $reste = $lon - $corps.Length
        while ($reste -gt 0) {
          $bt = New-Object byte[] 65536
          $n2 = $flux.Read($bt, 0, [Math]::Min(65536, $reste))
          if ($n2 -le 0) { break }
          $corps += [System.Text.Encoding]::ASCII.GetString($bt, 0, $n2)
          $reste -= $n2
        }
      }
      $nom = "capture.txt"
      if ($morceaux[1] -match 'n=([A-Za-z0-9_.-]+)') { $nom = $matches[1] }
      try { [System.IO.File]::WriteAllText((Join-Path $dossier $nom), $corps) } catch {}
      $tete = "HTTP/1.1 200 OK`r`nAccess-Control-Allow-Origin: *`r`nContent-Length: 2`r`nConnection: close`r`n`r`nok"
      $ob = [System.Text.Encoding]::ASCII.GetBytes($tete)
      $flux.Write($ob, 0, $ob.Length); $flux.Flush(); $client.Close()
      Write-Host ("  CAPTURE  " + $nom + "  " + $corps.Length + " car.") -ForegroundColor Cyan
      continue
    }

    $chemin = ($morceaux[1] -split "\?")[0]
    $chemin = [System.Uri]::UnescapeDataString($chemin)
    if ($chemin -eq "/" -or $chemin -eq "") { $chemin = "/index.html" }

    $relatif = $chemin.TrimStart("/").Replace("/", "\")
    $plein   = ""
    $ok      = $false
    try {
      $plein  = [System.IO.Path]::GetFullPath((Join-Path $dossier $relatif))
      $racine = [System.IO.Path]::GetFullPath($dossier)
      if ($plein.StartsWith($racine) -and (Test-Path $plein -PathType Leaf)) { $ok = $true }
    } catch { $ok = $false }

    if (-not $ok) {
      $corps = [System.Text.Encoding]::UTF8.GetBytes("404")
      $tete  = "HTTP/1.1 404 Not Found`r`nContent-Length: " + $corps.Length + "`r`nConnection: close`r`n`r`n"
      $ob = [System.Text.Encoding]::ASCII.GetBytes($tete)
      $flux.Write($ob, 0, $ob.Length)
      $flux.Write($corps, 0, $corps.Length)
      $flux.Flush()
      $client.Close()
      Write-Host ("  404  " + $chemin) -ForegroundColor DarkGray
      continue
    }

    # relu du disque a chaque requete : la correction est vue tout de suite
    $octets = [System.IO.File]::ReadAllBytes($plein)
    $ext  = [System.IO.Path]::GetExtension($plein).ToLower()
    $type = $types[$ext]
    if (-not $type) { $type = "application/octet-stream" }

    $tete = "HTTP/1.1 200 OK`r`n" +
            "Content-Type: " + $type + "`r`n" +
            "Content-Length: " + $octets.Length + "`r`n" +
            "Cache-Control: no-store`r`n" +
            "Connection: close`r`n`r`n"

    $ob = [System.Text.Encoding]::ASCII.GetBytes($tete)
    $flux.Write($ob, 0, $ob.Length)
    $flux.Write($octets, 0, $octets.Length)
    $flux.Flush()
    $client.Close()

    $ko = [math]::Round($octets.Length / 1024)
    Write-Host ("  200  " + $chemin + "  " + $ko + " Ko") -ForegroundColor DarkGreen
  } catch {
    if ($client -ne $null) { try { $client.Close() } catch {} }
  }
}
