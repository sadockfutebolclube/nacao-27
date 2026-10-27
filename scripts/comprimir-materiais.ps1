# NAÇÃO 27 — reduz as texturas baixadas por `npm run fetch-assets` (Fase 12).
# Cor e emissão ficam em 1024 px; normal e rugosidade em 512 px; JPEG qualidade 84.
# De ~64 MB para ~6 MB, sem perda visível na distância de jogo.
#
#   powershell -NoProfile -File scripts/comprimir-materiais.ps1

Add-Type -AssemblyName System.Drawing
$pasta = Join-Path $PSScriptRoot '..\public\assets\materiais'
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters(1)
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]84)

foreach ($f in Get-ChildItem $pasta -Filter *.jpg) {
  $lado = if ($f.BaseName -match '_(normal|rug)$') { 512 } else { 1024 }
  $img = [System.Drawing.Image]::FromFile($f.FullName)
  if ($img.Width -le $lado) { $img.Dispose(); continue }
  $bmp = New-Object System.Drawing.Bitmap($lado, $lado)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($img, 0, 0, $lado, $lado)
  $img.Dispose(); $g.Dispose()
  $tmp = "$($f.FullName).tmp"
  $bmp.Save($tmp, $codec, $params)
  $bmp.Dispose()
  Move-Item -Force $tmp $f.FullName
  Write-Output "  $($f.Name): $lado px"
}
