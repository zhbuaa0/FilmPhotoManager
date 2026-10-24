param([string]$ImagePath, [switch]$Probe)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapTransform, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Media.FaceAnalysis.FaceDetector, Windows.Foundation, ContentType=WindowsRuntime]
$script:AsTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1 } | Select-Object -First 1
function Await($Operation, [Type]$ResultType) {
    $task = $script:AsTask.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
    if (-not $task.Wait(30000)) { throw 'Windows analysis timed out.' }
    return $task.GetAwaiter().GetResult()
}
try {
    $faceSupported = [Windows.Media.FaceAnalysis.FaceDetector]::IsSupported
    if ($Probe) { @{engine='windows-face-v1';face=$faceSupported} | ConvertTo-Json -Compress; exit 0 }
    if (-not $ImagePath) { throw 'An image path is required.' }
    $detector = if ($faceSupported) { Await ([Windows.Media.FaceAnalysis.FaceDetector]::CreateAsync()) ([Windows.Media.FaceAnalysis.FaceDetector]) } else { $null }
    $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($ImagePath)) ([Windows.Storage.StorageFile])
    $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    try {
        $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $scale = [Math]::Min(1.0, 1600.0 / [Math]::Max($decoder.PixelWidth, $decoder.PixelHeight))
        $candidates = @()
        foreach ($angle in @(0,90,180,270)) {
            $transform = [Windows.Graphics.Imaging.BitmapTransform]::new()
            $transform.ScaledWidth = [uint32][Math]::Max(1,[Math]::Round($decoder.PixelWidth*$scale))
            $transform.ScaledHeight = [uint32][Math]::Max(1,[Math]::Round($decoder.PixelHeight*$scale))
            $transform.Rotation = switch ($angle) { 0 {[Windows.Graphics.Imaging.BitmapRotation]::None} 90 {[Windows.Graphics.Imaging.BitmapRotation]::Clockwise90Degrees} 180 {[Windows.Graphics.Imaging.BitmapRotation]::Clockwise180Degrees} 270 {[Windows.Graphics.Imaging.BitmapRotation]::Clockwise270Degrees} }
            $decodedBitmap = Await ($decoder.GetSoftwareBitmapAsync([Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8,[Windows.Graphics.Imaging.BitmapAlphaMode]::Ignore,$transform,[Windows.Graphics.Imaging.ExifOrientationMode]::IgnoreExifOrientation,[Windows.Graphics.Imaging.ColorManagementMode]::DoNotColorManage)) ([Windows.Graphics.Imaging.SoftwareBitmap])
            try { $bitmap = [Windows.Graphics.Imaging.SoftwareBitmap]::Convert($decodedBitmap,[Windows.Graphics.Imaging.BitmapPixelFormat]::Gray8) } finally { $decodedBitmap.Dispose() }
            try {
                $faces=0; $faceWeight=0.0
                if ($detector) {
                    $detected = @(Await ($detector.DetectFacesAsync($bitmap)) ([System.Collections.Generic.IList[Windows.Media.FaceAnalysis.DetectedFace]]))
                    foreach ($face in $detected) {
                        $area = [double]$face.FaceBox.Width*$face.FaceBox.Height/($bitmap.PixelWidth*$bitmap.PixelHeight)
                        if ($area -ge 0.0015) { $faces++; $faceWeight += [Math]::Min($area,0.2) }
                    }
                }
                $candidates += @{angle=$angle;faces=$faces;faceWeight=$faceWeight}
            } finally { $bitmap.Dispose() }
        }
        @{engine='windows-face-v1';candidates=$candidates} | ConvertTo-Json -Depth 6 -Compress
    } finally { $stream.Dispose() }
} catch {
    @{error=$_.Exception.Message} | ConvertTo-Json -Compress
    exit 1
}
