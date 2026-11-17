Add-Type -AssemblyName System.Drawing
$sizes = @(16, 48, 128)
foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $s, $s
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $brushBg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(79, 70, 229))
    $g.FillEllipse($brushBg, 0, 0, ($s - 1), ($s - 1))
    
    $brushInner = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $fontSize = [Math]::Max(7.0, [float]($s * 0.45))
    $font = New-Object System.Drawing.Font('Arial', $fontSize, [System.Drawing.FontStyle]::Bold)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF 0, 0, $s, $s
    $g.DrawString('S', $font, $brushInner, $rect, $sf)
    
    $outPath = "d:\extension\icons\icon$s.png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}
Write-Output "Icons generated successfully."
