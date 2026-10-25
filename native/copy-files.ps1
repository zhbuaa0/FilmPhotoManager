param([Parameter(Mandatory=$true)][string]$Manifest, [switch]$ValidateOnly)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$files = New-Object System.Collections.Specialized.StringCollection
$paths = Get-Content -LiteralPath $Manifest -Raw -Encoding UTF8 | ConvertFrom-Json
if ($paths.Count -eq 0) { throw 'No files selected' }
foreach ($file in $paths) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw 'Original file unavailable' }
    [void]$files.Add($file)
}
$data = New-Object System.Windows.Forms.DataObject
$data.SetFileDropList($files)
$effect = New-Object System.IO.MemoryStream
$effect.Write([byte[]](1,0,0,0), 0, 4)
$effect.Position = 0
$data.SetData('Preferred DropEffect', $effect)
if ($ValidateOnly) {
    # Exercise manifest decoding and FileDrop construction without changing the user's clipboard.
    $data.GetFileDropList().Count
    $effect.Dispose()
    return
}
# Persist after this STA helper exits. Explorer receives CF_HDROP with COPY effect.
[System.Windows.Forms.Clipboard]::SetDataObject($data, $true, 10, 100)
$effect.Dispose()
