[CmdletBinding()]
param(
    [string]$FrontendDir = "."
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Get-NormalizedPath {
    param([string]$PathValue)

    if ([string]::IsNullOrWhiteSpace($PathValue)) {
        return $null
    }

    try {
        return (Resolve-Path -LiteralPath $PathValue).Path
    } catch {
        return $null
    }
}

function Get-FirstExistingPath {
    param([string[]]$Candidates)

    foreach ($candidate in $Candidates) {
        $resolved = Get-NormalizedPath -PathValue $candidate
        if ($resolved) {
            return $resolved
        }
    }

    return $null
}

function Test-JdkHome {
    param([string]$Candidate)

    $resolved = Get-NormalizedPath -PathValue $Candidate
    if (-not $resolved) {
        return $false
    }

    return (Test-Path -LiteralPath (Join-Path $resolved "bin\javac.exe"))
}

function Get-JdkVersion {
    param([string]$JavaHome)

    $releaseFile = Join-Path $JavaHome "release"
    if (-not (Test-Path -LiteralPath $releaseFile)) {
        return $null
    }

    $line = Select-String -Path $releaseFile -Pattern '^JAVA_VERSION=' | Select-Object -First 1
    if (-not $line) {
        return $null
    }

    return ($line.Line -replace '^JAVA_VERSION="?(.+?)"?$', '$1')
}

function Get-JavaMajorVersion {
    param([string]$VersionText)

    if ([string]::IsNullOrWhiteSpace($VersionText)) {
        return $null
    }

    if ($VersionText.StartsWith("1.")) {
        $parts = $VersionText.Split(".")
        if ($parts.Length -ge 2) {
            return [int]$parts[1]
        }
    }

    $majorText = ($VersionText.Split(".")[0])
    return [int]$majorText
}

function Find-AndroidSdk {
    $candidates = @(
        $env:ANDROID_HOME,
        $env:ANDROID_SDK_ROOT,
        "$env:LOCALAPPDATA\Android\Sdk",
        "$env:PROGRAMFILES\Android\Sdk",
        "$env:USERPROFILE\AppData\Local\Android\Sdk"
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

    foreach ($candidate in $candidates) {
        $resolved = Get-NormalizedPath -PathValue $candidate
        if (-not $resolved) {
            continue
        }

        $platformTools = Join-Path $resolved "platform-tools\adb.exe"
        if (Test-Path -LiteralPath $platformTools) {
            return $resolved
        }
    }

    return $null
}

function Find-Jdk17OrNewer {
    $candidates = @(
        $env:JAVA_HOME,
        "$env:PROGRAMFILES\Android\Android Studio\jbr",
        "$env:PROGRAMFILES\Android\Android Studio\jre",
        "$env:PROGRAMFILES\Java\jdk-21",
        "$env:PROGRAMFILES\Java\jdk-20",
        "$env:PROGRAMFILES\Java\jdk-19",
        "$env:PROGRAMFILES\Java\jdk-18",
        "$env:PROGRAMFILES\Java\jdk-17",
        "$env:PROGRAMFILES\Eclipse Adoptium\jdk-21.0.0.0-hotspot",
        "$env:PROGRAMFILES\Eclipse Adoptium\jdk-17.0.0.0-hotspot",
        "$env:LOCALAPPDATA\Programs\Microsoft\jdk-17",
        "$env:LOCALAPPDATA\Programs\Microsoft\jdk-21"
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

    $javaRoots = @(
        "$env:PROGRAMFILES\Java",
        "$env:PROGRAMFILES\Eclipse Adoptium",
        "$env:LOCALAPPDATA\Programs\Microsoft"
    ) | Where-Object { Test-Path -LiteralPath $_ }

    foreach ($root in $javaRoots) {
        $candidates += Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
    }

    $seen = @{}
    foreach ($candidate in $candidates) {
        $resolved = Get-NormalizedPath -PathValue $candidate
        if (-not $resolved -or $seen.ContainsKey($resolved)) {
            continue
        }
        $seen[$resolved] = $true

        if (-not (Test-JdkHome -Candidate $resolved)) {
            continue
        }

        $versionText = Get-JdkVersion -JavaHome $resolved
        $major = Get-JavaMajorVersion -VersionText $versionText
        if ($major -ge 17) {
            return $resolved
        }
    }

    return $null
}

function Add-UserPathEntry {
    param(
        [string]$CurrentPath,
        [string]$Entry
    )

    if ([string]::IsNullOrWhiteSpace($Entry)) {
        return $CurrentPath
    }

    $parts = @()
    if (-not [string]::IsNullOrWhiteSpace($CurrentPath)) {
        $parts = $CurrentPath.Split(";") | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    }

    if ($parts -contains $Entry) {
        return ($parts -join ";")
    }

    return (($parts + $Entry) -join ";")
}

$frontendPath = Get-NormalizedPath -PathValue $FrontendDir
if (-not $frontendPath) {
    throw "Frontend directory not found: $FrontendDir"
}

$androidDir = Join-Path $frontendPath "android"
if (-not (Test-Path -LiteralPath $androidDir)) {
    throw "Android directory not found: $androidDir"
}

Write-Step "Detecting Android SDK"
$sdkPath = Find-AndroidSdk
if (-not $sdkPath) {
    throw @"
Android SDK not found.

Install Android Studio and make sure these SDK components are installed:
- Android SDK Platform
- Android SDK Platform-Tools
- Android SDK Build-Tools
- Android Emulator

Expected default path:
$env:LOCALAPPDATA\Android\Sdk
"@
}
Write-Host "SDK: $sdkPath" -ForegroundColor Green

Write-Step "Detecting JDK 17+"
$javaHome = Find-Jdk17OrNewer
if (-not $javaHome) {
    throw @"
JDK 17 or newer not found.

Install JDK 17+ or Android Studio (which usually includes a bundled JBR),
then run this script again.
"@
}
Write-Host "JAVA_HOME: $javaHome" -ForegroundColor Green

Write-Step "Setting user environment variables"
[Environment]::SetEnvironmentVariable("ANDROID_HOME", $sdkPath, "User")
[Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", $sdkPath, "User")
[Environment]::SetEnvironmentVariable("JAVA_HOME", $javaHome, "User")

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$userPath = Add-UserPathEntry -CurrentPath $userPath -Entry (Join-Path $javaHome "bin")
$userPath = Add-UserPathEntry -CurrentPath $userPath -Entry (Join-Path $sdkPath "platform-tools")
$userPath = Add-UserPathEntry -CurrentPath $userPath -Entry (Join-Path $sdkPath "emulator")

$cmdlineTools = Get-FirstExistingPath -Candidates @(
    (Join-Path $sdkPath "cmdline-tools\latest\bin"),
    (Join-Path $sdkPath "cmdline-tools\bin")
)
if ($cmdlineTools) {
    $userPath = Add-UserPathEntry -CurrentPath $userPath -Entry $cmdlineTools
}

[Environment]::SetEnvironmentVariable("Path", $userPath, "User")

$env:ANDROID_HOME = $sdkPath
$env:ANDROID_SDK_ROOT = $sdkPath
$env:JAVA_HOME = $javaHome
$env:Path = Add-UserPathEntry -CurrentPath $env:Path -Entry (Join-Path $javaHome "bin")
$env:Path = Add-UserPathEntry -CurrentPath $env:Path -Entry (Join-Path $sdkPath "platform-tools")
$env:Path = Add-UserPathEntry -CurrentPath $env:Path -Entry (Join-Path $sdkPath "emulator")
if ($cmdlineTools) {
    $env:Path = Add-UserPathEntry -CurrentPath $env:Path -Entry $cmdlineTools
}

Write-Step "Writing android/local.properties"
$escapedSdk = $sdkPath.Replace("\", "\\")
$localPropertiesPath = Join-Path $androidDir "local.properties"
Set-Content -LiteralPath $localPropertiesPath -Value "sdk.dir=$escapedSdk`r`n" -Encoding ASCII
Write-Host "Wrote $localPropertiesPath" -ForegroundColor Green

Write-Step "Checking tools"
$adbPath = Get-FirstExistingPath -Candidates @((Join-Path $sdkPath "platform-tools\adb.exe"))
$javaExe = Join-Path $javaHome "bin\java.exe"

if ($adbPath) {
    & $adbPath version
}
& $javaExe -version

Write-Host ""
Write-Host "Android environment configured for this user." -ForegroundColor Green
Write-Host "Open a new terminal before running Expo or Gradle commands." -ForegroundColor Yellow
