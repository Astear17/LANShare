# $batPath is no longer needed if installed globally, but we'll keep the script flexible
$iconPath = "shell32.dll,145" # Networking icon

# Function to add context menu item
function Add-ContextMenu($keyPath, $name, $command) {
    if (!(Test-Path "Registry::$keyPath")) {
        New-Item -Path "Registry::$keyPath" -Force
    }
    Set-ItemProperty -Path "Registry::$keyPath" -Name "(Default)" -Value $name
    Set-ItemProperty -Path "Registry::$keyPath" -Name "Icon" -Value $iconPath
    
    $cmdPath = Join-Path $keyPath "command"
    if (!(Test-Path "Registry::$cmdPath")) {
        New-Item -Path "Registry::$cmdPath" -Force
    }
    Set-ItemProperty -Path "Registry::$cmdPath" -Name "(Default)" -Value $command
}

# 1. Folder Right-Click
Add-ContextMenu "HKEY_CLASSES_ROOT\Directory\shell\LANShare" "Host on LAN with LANShare" "cmd.exe /c lanshare `"%1`""

# 2. Folder Background Right-Click
Add-ContextMenu "HKEY_CLASSES_ROOT\Directory\Background\shell\LANShare" "Host on LAN with LANShare" "cmd.exe /c lanshare `"%V`""

Write-Host "`n------------------------------------------------" -ForegroundColor Cyan
Write-Host " LANShare Context Menu Installed!" -ForegroundColor Green
Write-Host "------------------------------------------------" -ForegroundColor Cyan
Write-Host " You can now right-click any folder or folder background"
Write-Host " and select 'Host on LAN with LANShare'."
Write-Host "------------------------------------------------`n"
