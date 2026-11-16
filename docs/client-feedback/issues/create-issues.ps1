# Creates the GitHub issues drafted in this folder.
# First line of each .md = title, the rest = body.
# Requires GitHub CLI: winget install GitHub.cli ; gh auth login
$ErrorActionPreference = 'Stop'
Get-ChildItem -Path $PSScriptRoot -Filter '*.md' | Sort-Object Name | ForEach-Object {
    $lines = Get-Content -Path $_.FullName -Encoding utf8
    $title = $lines[0].Trim()
    $bodyFile = New-TemporaryFile
    $lines | Select-Object -Skip 2 | Set-Content -Path $bodyFile -Encoding utf8
    Write-Host "Creating: $title"
    gh issue create --title $title --body-file $bodyFile
    Remove-Item $bodyFile
}
