#requires -Version 5.1
[CmdletBinding()]param()
$ErrorActionPreference='Stop'
Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase
$desktopDirectory=(Resolve-Path (Join-Path $PSScriptRoot '..')).ProviderPath
. (Join-Path $desktopDirectory 'LauncherPresentation.ps1')
$resources=Read-LauncherXaml (Join-Path $desktopDirectory 'LauncherResources.xaml')
$destination=Join-Path $desktopDirectory 'assets'
[void][IO.Directory]::CreateDirectory($destination)
foreach($product in @('Vision','Hub')) {
    $frames=@()
    foreach($size in @(32,48,64,128,256)) {
        $image=New-Object Windows.Controls.Image
        $image.Source=$resources[ $(if($product -eq 'Vision'){'FairyArtwork'}else{'HubArtwork'}) ]
        $image.Margin=[Windows.Thickness]::new(4)
        $image.Width=$size-8;$image.Height=$size-8
        $container=New-Object Windows.Controls.Grid
        [void]$container.Children.Add($image)
        $container.Measure([Windows.Size]::new($size,$size));$container.Arrange([Windows.Rect]::new(0,0,$size,$size));$container.UpdateLayout()
        $bitmap=[Windows.Media.Imaging.RenderTargetBitmap]::new($size,$size,96,96,[Windows.Media.PixelFormats]::Pbgra32)
        $bitmap.Render($container)
        $encoder=New-Object Windows.Media.Imaging.PngBitmapEncoder
        $encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
        $stream=New-Object IO.MemoryStream;$encoder.Save($stream)
        $frames+=,@{Size=$size;Bytes=$stream.ToArray()};$stream.Dispose()
    }
    [IO.File]::WriteAllBytes((Join-Path $destination "$($product.ToLowerInvariant()).png"),$frames[-1].Bytes)
    $stream=New-Object IO.MemoryStream;$writer=New-Object IO.BinaryWriter($stream)
    $writer.Write([uint16]0);$writer.Write([uint16]1);$writer.Write([uint16]$frames.Count)
    $offset=6+16*$frames.Count
    foreach($frame in $frames) {
        $dimension=if($frame.Size -eq 256){0}else{$frame.Size}
        $writer.Write([byte]$dimension);$writer.Write([byte]$dimension);$writer.Write([byte]0);$writer.Write([byte]0)
        $writer.Write([uint16]1);$writer.Write([uint16]32);$writer.Write([uint32]$frame.Bytes.Length);$writer.Write([uint32]$offset)
        $offset+=$frame.Bytes.Length
    }
    foreach($frame in $frames){$writer.Write([byte[]]$frame.Bytes)}
    $writer.Flush();[IO.File]::WriteAllBytes((Join-Path $destination "$($product.ToLowerInvariant()).ico"),$stream.ToArray())
    $writer.Dispose();$stream.Dispose()
}
'launcher product icons rendered'
