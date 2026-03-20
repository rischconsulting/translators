param(
    [string]$SourceDir = $PSScriptRoot,
    [string]$OutputBaseName = (Split-Path -Leaf $PSScriptRoot)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$sourcePath = Resolve-Path -Path $SourceDir
$zipPath = Join-Path -Path $sourcePath -ChildPath ("{0}.zip" -f $OutputBaseName)
$xpiPath = Join-Path -Path $sourcePath -ChildPath ("{0}.xpi" -f $OutputBaseName)

Write-Host "Source: $sourcePath"
Write-Host "Zip:    $zipPath"
Write-Host "XPI:    $xpiPath"

if (Test-Path -Path $zipPath) {
    Remove-Item -Path $zipPath -Force
}

if (Test-Path -Path $xpiPath) {
    Remove-Item -Path $xpiPath -Force
}

$itemsToArchive = Get-ChildItem -Path $sourcePath -Force |
    Where-Object {
        $_.Name -notin @(
            (Split-Path -Leaf $zipPath),
            (Split-Path -Leaf $xpiPath),
            '.git'
        ) -and -not (
            $_.PSIsContainer -eq $false -and (
                $_.Extension -ieq '.ps1' -or
                $_.Extension -ieq '.bat'
            )
        )
    }

if (-not $itemsToArchive) {
    throw "No files found to archive in $sourcePath"
}

Compress-Archive -Path $itemsToArchive.FullName -DestinationPath $zipPath -CompressionLevel Optimal
Move-Item -Path $zipPath -Destination $xpiPath

Write-Host "Created package: $xpiPath" -ForegroundColor Green
