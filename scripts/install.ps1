# Install stepdown-rule from GitHub Releases (Windows x64).
# Verifies SHA256SUMS before install.
#
# Preferred (download → inspect → run):
#   Invoke-WebRequest -Uri https://github.com/graffhyrum/stepdown-rule/releases/latest/download/install.ps1 -OutFile install.ps1
#   powershell -File .\install.ps1
#
# Pin: $env:VERSION = 'v0.2.0'; powershell -File .\install.ps1
#
# Pipe-to-shell (irm|iex) trusts the fetch host at runtime — prefer the path above.
$ErrorActionPreference = 'Stop'

$Repo = 'graffhyrum/stepdown-rule'
$Version = if ($env:VERSION) { $env:VERSION } else { 'latest' }
$Asset = 'stepdown-rule-windows-x64.exe'

if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') {
	throw 'Windows ARM64 release not published yet. Use WOW64 x64 or build from source.'
}

if ($Version -eq 'latest') {
	$BaseUrl = "https://github.com/$Repo/releases/latest/download"
} else {
	$BaseUrl = "https://github.com/$Repo/releases/download/$Version"
}

$InstallRoot = if ($env:INSTALL_DIR) {
	$env:INSTALL_DIR
} else {
	Join-Path $env:LOCALAPPDATA 'stepdown-rule'
}
New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null

$Tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("stepdown-install-" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Force -Path $Tmp | Out-Null

try {
	$BinPath = Join-Path $Tmp $Asset
	$SumsPath = Join-Path $Tmp 'SHA256SUMS'
	Write-Host "Downloading $Asset ($Version)..."
	Invoke-WebRequest -Uri "$BaseUrl/$Asset" -OutFile $BinPath -UseBasicParsing
	Invoke-WebRequest -Uri "$BaseUrl/SHA256SUMS" -OutFile $SumsPath -UseBasicParsing

	$Expected = $null
	Get-Content $SumsPath | ForEach-Object {
		$parts = $_ -split '\s+'
		if ($parts.Length -ge 2 -and $parts[1] -eq $Asset) {
			$Expected = $parts[0].ToLowerInvariant()
		}
	}
	if (-not $Expected) {
		throw "SHA256SUMS missing entry for $Asset"
	}

	$Actual = (Get-FileHash -Algorithm SHA256 -Path $BinPath).Hash.ToLowerInvariant()
	if ($Actual -ne $Expected) {
		throw "Checksum mismatch for $Asset`n  expected: $Expected`n  actual:   $Actual"
	}
	Write-Host "Checksum OK ($Asset)"

	$Dest = Join-Path $InstallRoot 'stepdown-rule.exe'
	Copy-Item -Force $BinPath $Dest

	$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
	if (-not $userPath) { $userPath = '' }
	$parts = $userPath -split ';' | Where-Object { $_ -ne '' }
	if ($parts -notcontains $InstallRoot) {
		$newPath = if ($userPath) { "$userPath;$InstallRoot" } else { $InstallRoot }
		[Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
		$env:Path = "$InstallRoot;$env:Path"
		Write-Host "Added $InstallRoot to User PATH (restart shells to pick up)."
	}

	Write-Host "Installed $Dest"
	& $Dest --version
} finally {
	Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue
}
