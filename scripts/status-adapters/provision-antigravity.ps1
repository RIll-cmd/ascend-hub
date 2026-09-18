param(
    [string]$InstanceId = 'antigravity-local-1',
    [string]$CoreEventsUrl = 'http://127.0.0.1:8000/api/status/events',
    [string]$CoreServerPath = 'D:\ascend-core\server'
)
$ErrorActionPreference = 'Stop'
if ($InstanceId -notmatch '^[a-z0-9][a-z0-9._-]{0,127}$') { throw 'Invalid producer instance ID.' }
$endpoint = [uri]$CoreEventsUrl
if ($endpoint.AbsolutePath -ne '/api/status/events' -or $endpoint.UserInfo -or $endpoint.Query -or $endpoint.Fragment -or
    -not ($endpoint.Scheme -eq 'https' -or ($endpoint.Scheme -eq 'http' -and $endpoint.Host -in @('localhost', '127.0.0.1', '[::1]')))) {
    throw 'Use HTTPS or a loopback Core producer endpoint.'
}
$settingsDirectory = Join-Path 'D:\ascend-status-adapters\antigravity-cli' $InstanceId
$configPath = Join-Path $settingsDirectory 'config.json'
$credentialPath = Join-Path $settingsDirectory 'credential.dpapi'
if ((Test-Path -LiteralPath $configPath) -or (Test-Path -LiteralPath $credentialPath)) {
    throw 'Local Antigravity configuration already exists. No credential was created or rotated.'
}
$pythonPath = Join-Path $CoreServerPath '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) { throw 'Ascend Core Python environment was not found.' }
New-Item -ItemType Directory -Path $settingsDirectory -Force | Out-Null
$operatorSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls.exe $settingsDirectory /inheritance:r /grant:r "*$($operatorSid):(OI)(CI)F" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict the local secret directory. No credential was created.' }
$oldLocation = Get-Location
$previousPythonPath = $env:PYTHONPATH
$plaintext = $null
$provisionOutput = $null
try {
    Set-Location -LiteralPath $CoreServerPath
    $env:PYTHONPATH = Split-Path -Parent $CoreServerPath
    # Credential creation, hash storage, binding and duplicate protection belong to StatusService.
    $provisionOutput = & $pythonPath -m server.cli.status_credentials create --service-id antigravity-cli --instance-id $InstanceId 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'Core credential creation failed. Existing credentials were unchanged.' }
    $plaintext = @($provisionOutput | Where-Object { $_ -is [string] -and $_ -match '^antigravity-cli-[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]{8,256}$' })
    if ($plaintext.Count -ne 1) { throw 'Unexpected credential result. Check safe credential metadata before retrying.' }
    Add-Type -AssemblyName System.Security
    $plainBytes = [Text.Encoding]::UTF8.GetBytes($plaintext[0])
    try { $protectedBytes = [Security.Cryptography.ProtectedData]::Protect($plainBytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser) }
    finally { [Array]::Clear($plainBytes, 0, $plainBytes.Length) }
    $encrypted = -join ($protectedBytes | ForEach-Object { $_.ToString('x2') })
    [IO.File]::WriteAllText($credentialPath, $encrypted, [Text.UTF8Encoding]::new($false))
    $config = @{ schemaVersion = 1; instanceId = $InstanceId; coreEventsUrl = $CoreEventsUrl } | ConvertTo-Json
    [IO.File]::WriteAllText($configPath, $config, [Text.UTF8Encoding]::new($false))
    Write-Host "Provisioned dedicated antigravity-cli/$InstanceId credential; protected with CurrentUser DPAPI."
    Write-Host "Configuration: $configPath"
} finally {
    $plaintext = $null
    $provisionOutput = $null
    $env:PYTHONPATH = $previousPythonPath
    Set-Location -LiteralPath $oldLocation
}
