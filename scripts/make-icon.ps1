# Generate FreeMD app icon (icon.ico): rounded gradient + white M + down arrow
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$size = 256
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'

# rounded rect gradient background
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$r = 56
$path.AddArc(8, 8, $r, $r, 180, 90)
$path.AddArc(248 - $r, 8, $r, $r, 270, 90)
$path.AddArc(248 - $r, 248 - $r, $r, $r, 0, 90)
$path.AddArc(8, 248 - $r, $r, $r, 90, 90)
$path.CloseFigure()
$rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect,
    [System.Drawing.Color]::FromArgb(79, 168, 248),
    [System.Drawing.Color]::FromArgb(35, 105, 222), 90)
$g.FillPath($brush, $path)

# white M (slightly left)
$font = New-Object System.Drawing.Font -ArgumentList ('Segoe UI', [float]108, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = 'Center'
$fmt.LineAlignment = 'Center'
$g.DrawString('M', $font, [System.Drawing.Brushes]::White,
    (New-Object System.Drawing.RectangleF(-18, 6, 190, 244)), $fmt)

# white down arrow (right of M): shaft + triangle head
$g.FillRectangle([System.Drawing.Brushes]::White, 186, 84, 26, 66)
$head = @(
    (New-Object System.Drawing.Point(168, 140)),
    (New-Object System.Drawing.Point(230, 140)),
    (New-Object System.Drawing.Point(199, 178))
)
$g.FillPolygon([System.Drawing.Brushes]::White, $head)

$g.Dispose()

# pack multi-size PNG entries into ICO
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)
$bw.Write([UInt16]0)
$bw.Write([UInt16]1)
$bw.Write([UInt16]$sizes.Count)

$entries = @()
foreach ($s in $sizes) {
    $b2 = New-Object System.Drawing.Bitmap($s, $s)
    $g2 = [System.Drawing.Graphics]::FromImage($b2)
    $g2.InterpolationMode = 'HighQualityBicubic'
    $g2.SmoothingMode = 'AntiAlias'
    $g2.DrawImage($bmp, 0, 0, $s, $s)
    $g2.Dispose()
    $png = New-Object System.IO.MemoryStream
    $b2.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
    $entries += , @($s, $png.ToArray())
    $b2.Dispose()
}

$offset = 6 + 16 * $entries.Count
foreach ($e in $entries) {
    $s = $e[0]
    $bw.Write([Byte]($(if ($s -ge 256) { 0 } else { $s })))
    $bw.Write([Byte]($(if ($s -ge 256) { 0 } else { $s })))
    $bw.Write([Byte]0)
    $bw.Write([Byte]0)
    $bw.Write([UInt16]1)
    $bw.Write([UInt16]32)
    $bw.Write([UInt32]$e[1].Length)
    $bw.Write([UInt32]$offset)
    $offset += $e[1].Length
}
foreach ($e in $entries) { $bw.Write($e[1]) }
$bw.Flush()

$out = Join-Path $PSScriptRoot "..\src\MyTypora.App\icon.ico"
[System.IO.File]::WriteAllBytes($out, $ms.ToArray())
$bmp.Dispose()
Write-Host "icon generated: $out ($($ms.Length) bytes)"
