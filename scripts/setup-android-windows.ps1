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

    $javaExe = Join-Path $resolved "bin\java.exe"
    $javacExe = Join-Path $resolved "bin\javac.exe"
    $jlinkExe = Join-Path $resolved "bin\jlink.exe"
    $jvmConfig = Join-Path $resolved "lib\jvm.cfg"

    if (
        -not (Test-Path -LiteralPath $javaExe) -or
        -not (Test-Path -LiteralPath $javacExe) -or
        -not (Test-Path -LiteralPath $jlinkExe) -or
        -not (Test-Path -LiteralPath $jvmConfig)
    ) {
        return $false
    }

    return $true
}

function Get-JavaHomeFromCommandPath {
    param([string]$CommandName)

    try {
        $command = Get-Command $CommandName -ErrorAction Stop | Select-Object -First 1
    } catch {
        return $null
    }

    if (-not $command -or [string]::IsNullOrWhiteSpace($command.Source)) {
        return $null
    }

    return Split-Path -Parent (Split-Path -Parent $command.Source)
}

function Get-EmbeddedJdkCandidates {
    $extensionRoots = @(
        "$env:USERPROFILE\.vscode\extensions",
        "$env:USERPROFILE\.cursor\extensions",
        "$env:USERPROFILE\.antigravity\extensions"
    ) | Where-Object { Test-Path -LiteralPath $_ }

    $candidates = @()
    foreach ($root in $extensionRoots) {
        $extensions = Get-ChildItem -LiteralPath $root -Directory -Filter "redhat.java-*" -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending

        foreach ($extension in $extensions) {
            $jreRoot = Join-Path $extension.FullName "jre"
            if (-not (Test-Path -LiteralPath $jreRoot)) {
                continue
            }

            $candidates += Get-ChildItem -LiteralPath $jreRoot -Directory -ErrorAction SilentlyContinue |
                Sort-Object Name -Descending |
                ForEach-Object { $_.FullName }
        }
    }

    return $candidates
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
        (Get-JavaHomeFromCommandPath -CommandName "javac"),
        (Get-JavaHomeFromCommandPath -CommandName "java"),
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

    $candidates += Get-EmbeddedJdkCandidates

    $javaRoots = @(
        "$env:PROGRAMFILES\Java",
        "$env:PROGRAMFILES\Eclipse Adoptium",
        "$env:ProgramW6432\Java",
        "$env:ProgramW6432\Eclipse Adoptium",
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
        [string]$Entry,
        [switch]$Prepend
    )

    if ([string]::IsNullOrWhiteSpace($Entry)) {
        return $CurrentPath
    }

    $parts = @()
    if (-not [string]::IsNullOrWhiteSpace($CurrentPath)) {
        $parts = $CurrentPath.Split(";") | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    }

    $parts = $parts | Where-Object { $_ -ne $Entry }

    if ($Prepend) {
        return ((@($Entry) + $parts) -join ";")
    }

    return (($parts + $Entry) -join ";")
}

function Remove-UserPathEntry {
    param(
        [string]$CurrentPath,
        [string]$Entry
    )

    if ([string]::IsNullOrWhiteSpace($CurrentPath)) {
        return $CurrentPath
    }

    if ([string]::IsNullOrWhiteSpace($Entry)) {
        return $CurrentPath
    }

    $parts = $CurrentPath.Split(";") | Where-Object {
        -not [string]::IsNullOrWhiteSpace($_) -and $_ -ne $Entry
    }

    return ($parts -join ";")
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

Install a full JDK 17+ (with javac and jlink) or repair Android Studio's bundled runtime,
then run this script again.
"@
}
Write-Host "JAVA_HOME: $javaHome" -ForegroundColor Green

Write-Step "Setting user environment variables"
[Environment]::SetEnvironmentVariable("ANDROID_HOME", $sdkPath, "User")
[Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", $sdkPath, "User")
[Environment]::SetEnvironmentVariable("JAVA_HOME", $javaHome, "User")

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$androidStudioJbrBin = Get-FirstExistingPath -Candidates @(
    "$env:PROGRAMFILES\Android\Android Studio\jbr\bin",
    "$env:ProgramW6432\Android\Android Studio\jbr\bin"
)

if ($androidStudioJbrBin) {
    $userPath = Remove-UserPathEntry -CurrentPath $userPath -Entry $androidStudioJbrBin
}

$userPath = Add-UserPathEntry -CurrentPath $userPath -Entry (Join-Path $javaHome "bin") -Prepend
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
if ($androidStudioJbrBin) {
    $env:Path = Remove-UserPathEntry -CurrentPath $env:Path -Entry $androidStudioJbrBin
}
$env:Path = Add-UserPathEntry -CurrentPath $env:Path -Entry (Join-Path $javaHome "bin") -Prepend
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
