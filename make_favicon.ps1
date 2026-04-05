Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap(64, 64)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

# Draw icon reflecting "file-invoice" (a document with a circle/stamp or lines)
# Invoice is typically a page with lines and a total or a dollar sign, or just lined page.
# "fa-file-invoice" looks like a document with text lines.
# We'll use the primary color from the project: likely #6366f1 (99, 102, 241)

$primaryColor = [System.Drawing.Color]::FromArgb(99, 102, 241)
$darkBorder = [System.Drawing.Color]::FromArgb(30, 41, 59) # Slate 800

# Draw document background
$docBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$docPen = New-Object System.Drawing.Pen($primaryColor, 4)
$docPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

$g.FillRectangle($docBrush, 12, 8, 40, 48)
$g.DrawRectangle($docPen, 12, 8, 40, 48)

# Draw lines
$linePen = New-Object System.Drawing.Pen($primaryColor, 4)
$linePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$linePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

$g.DrawLine($linePen, 20, 20, 44, 20)
$g.DrawLine($linePen, 20, 30, 44, 30)
$g.DrawLine($linePen, 20, 40, 34, 40)

# Draw small square/dot representing invoice stamp/total
$g.DrawLine($linePen, 40, 40, 44, 40)

$bmp.Save("c:\Users\Srikanth\Downloads\dummy\public\favicon.png", [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$bmp.Dispose()
$docBrush.Dispose()
$docPen.Dispose()
$linePen.Dispose()
