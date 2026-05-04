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
Add-ContextMenu "HKEY_CLASSES_ROOT\Directory\shell\LANShare" "Host on LAN with LANShare" "powershell -WindowStyle Hidden -Command `\"Start-Process cmd -ArgumentList '/c lanshare start `\\`\"%1`\\`\"' -Verb RunAs`\""

# 2. Folder Background Right-Click
Add-ContextMenu "HKEY_CLASSES_ROOT\Directory\Background\shell\LANShare" "Host on LAN with LANShare" "powershell -WindowStyle Hidden -Command `\"Start-Process cmd -ArgumentList '/c lanshare start `\\`\"%V`\\`\"' -Verb RunAs`\""

Write-Host "`n------------------------------------------------" -ForegroundColor Cyan
Write-Host " LANShare Context Menu Installed!" -ForegroundColor Green
Write-Host "------------------------------------------------" -ForegroundColor Cyan
Write-Host " You can now right-click any folder or folder background"
Write-Host " and select 'Host on LAN with LANShare'."
Write-Host "------------------------------------------------`n"
