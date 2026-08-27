<#
.SYNOPSIS
    Run one JMeter plan at one of the four stages and write the samples plus an
    HTML report under results/.

.DESCRIPTION
    The PowerShell twin of run.sh — same stages, same output layout. Keep the
    two in step when either changes.

    Needs Apache JMeter 5.6 or newer: on PATH, or JMETER_HOME set, or
    JMETER_CMD pointing straight at jmeter.bat.

.EXAMPLE
    .\run.ps1 catalogue-browse smoke

.EXAMPLE
    .\run.ps1 order-checkout load -Extra '-Jthreads=50'
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string] $Plan,

    [Parameter(Position = 1)]
    [ValidateSet('smoke', 'load', 'stress', 'spike')]
    [string] $Stage = 'load',

    [switch] $NoReport,

    # Anything JMeter should receive unchanged, e.g. -Extra '-Jthreads=50','-Jgateway.host=192.0.2.10'
    [string[]] $Extra = @()
)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

if (-not $Plan.EndsWith('.jmx')) { $Plan = "$Plan.jmx" }
if (-not (Test-Path $Plan)) {
    throw "No such plan: $Plan. Expected catalogue-browse.jmx or order-checkout.jmx in $PSScriptRoot."
}

# The four stages, matching run.sh line for line.
$stageArgs = switch ($Stage) {
    'smoke'  { @('-Jthreads=2', '-Jrampup=1', '-Jduration=60', '-Jthink.time=500', '-Jthink.range=1000') }
    'load'   { @('-Jthreads=20', '-Jrampup=30', '-Jduration=300', '-Jthink.time=500', '-Jthink.range=1000') }
    'stress' { @('-Jthreads=100', '-Jrampup=60', '-Jduration=600', '-Jthink.time=200', '-Jthink.range=300') }
    'spike'  { @('-Jthreads=200', '-Jrampup=5', '-Jduration=120', '-Jthink.time=0', '-Jthink.range=200') }
}

# Find JMeter.
if ($env:JMETER_CMD) {
    $jmeter = $env:JMETER_CMD
}
elseif ($env:JMETER_HOME) {
    $jmeter = Join-Path $env:JMETER_HOME 'bin\jmeter.bat'
}
elseif (Get-Command jmeter -ErrorAction SilentlyContinue) {
    $jmeter = (Get-Command jmeter).Source
}
else {
    throw @'
JMeter was not found.

Install it from https://jmeter.apache.org/download_jmeter.cgi, then either put
its bin\ on PATH or set JMETER_HOME:

    $env:JMETER_HOME = 'C:\tools\apache-jmeter-5.6.3'
    .\run.ps1 catalogue-browse smoke
'@
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$name = [System.IO.Path]::GetFileNameWithoutExtension($Plan)
$out = "results\$name-$Stage-$stamp"
New-Item -ItemType Directory -Force -Path $out | Out-Null

Write-Host "Plan   : $Plan"
Write-Host "Stage  : $Stage"
Write-Host "Output : $out"
Write-Host ''

# -n headless, -t plan, -q properties, -l samples, -j JMeter's own log,
# -e/-o generate the HTML dashboard from the samples afterwards.
$args = @('-n', '-t', $Plan, '-q', 'profiles.properties', '-l', "$out\samples.jtl", '-j', "$out\jmeter.log") + $stageArgs
if (-not $NoReport) { $args += @('-e', '-o', "$out\report") }
$args += $Extra

& $jmeter $args
if ($LASTEXITCODE -ne 0) { throw "JMeter exited with $LASTEXITCODE. See $out\jmeter.log." }

Write-Host ''
Write-Host "Samples : $out\samples.jtl"
if (-not $NoReport) { Write-Host "Report  : $out\report\index.html" }
Write-Host 'Grafana : the same window is on the TechZone dashboards, per service and per endpoint.'
