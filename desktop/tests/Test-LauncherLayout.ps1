#requires -Version 5.1
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ne 5) {
    throw 'This check requires Windows PowerShell 5.1; invoke it with powershell.exe, not pwsh.exe.'
}
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase

$reader = [System.Xml.XmlReader]::Create((Join-Path $PSScriptRoot '..\Launcher.xaml'))
try { $window = [Windows.Markup.XamlReader]::Load($reader) } finally { $reader.Dispose() }
$window.Width = 600
$window.Height = 510
$window.Left = -10000
$window.Top = -10000
$window.ShowInTaskbar = $false
$window.Show()
$window.UpdateLayout()

foreach ($buttonName in @('VisionForce', 'HubForce')) {
    $button = $window.FindName($buttonName)
    if ($null -eq $button) { throw "Missing action: $buttonName" }
    $parent = [System.Windows.Media.VisualTreeHelper]::GetParent($button)
    $card = $null
    while ($null -ne $parent) {
        if ($parent -is [System.Windows.Controls.Border] -and
                $parent.CornerRadius.TopLeft -eq 10) {
            $card = $parent
            break
        }
        $parent = [System.Windows.Media.VisualTreeHelper]::GetParent($parent)
    }
    if ($null -eq $card) { throw "Could not find card for $buttonName" }
    $top = $button.TranslatePoint([Windows.Point]::new(0, 0), $card).Y
    $bottom = $top + $button.ActualHeight
    if ($bottom -gt ($card.ActualHeight - $card.Padding.Bottom + 1)) {
        throw "Clipped action: $buttonName ends at $bottom; card height is $($card.ActualHeight)"
    }
}
$window.Width = 540
$window.Height = 420
$window.UpdateLayout()
$scroll = $window.Content
if ($scroll -isnot [System.Windows.Controls.ScrollViewer] -or $scroll.ScrollableHeight -le 0) {
    throw 'Compact launcher must allow scrolling to actions that do not fit vertically'
}
$window.Close()
'launcher action layout checks passed'
