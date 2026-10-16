param(
  [Parameter(Mandatory=$true)]
  [ValidateSet('Initialize','Start','Stop','Status','CreateDb','Run','Sql')]
  [string]$Action,
  [string]$Database,
  [string]$Script,
  [string]$SqlFile
)
$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'GyotokuGym24PgTest\20261015'
$bin = Join-Path $root 'pgsql\bin'
$data = Join-Path $root 'data'
$credentials = Join-Path $root 'private'
$pgpass = Join-Path $credentials 'pgpass.conf'
$owner = 'gym24_test_owner'
$port = 5432
$project = Split-Path $PSScriptRoot -Parent
$results = Join-Path $project 'tests\results\2026-10-15'
[void](New-Item -ItemType Directory -Force -Path $results)
$env:PATH = $bin + [IO.Path]::PathSeparator + $env:PATH
foreach ($key in @('PGPASSWORD','PGSERVICE','PGSERVICEFILE','PGHOSTADDR','PGOPTIONS')) {
  Remove-Item -LiteralPath ("Env:" + $key) -ErrorAction SilentlyContinue
}
$env:PGHOST = '127.0.0.1'
$env:PGPORT = [string]$port
$env:PGUSER = $owner
$env:PGPASSFILE = $pgpass
$env:PGSSLMODE = 'disable'
$env:PGCLIENTENCODING = 'UTF8'
$env:GYM24_LOCAL_TEST_ACK = 'I_HAVE_CREATED_DISPOSABLE_LOCAL_DB_NO_TUNNEL'

function Check-Exit([string]$stage) {
  if ($LASTEXITCODE -ne 0) { throw "$stage failed (exit $LASTEXITCODE)" }
}
function Check-LocalDatabase {
  if ($Database -notmatch '^gym24_test_[a-z0-9_]{3,40}$') { throw 'Disposable database name required' }
  $env:PGDATABASE = $Database
  $actual = & (Join-Path $bin 'psql.exe') -X -w -qAt -v ON_ERROR_STOP=1 -c "select current_database()||'|'||host(inet_server_addr())||'|'||current_user"
  Check-Exit 'Local database check'
  if ($actual -ne "$Database|127.0.0.1|$owner") { throw "Local server identity mismatch: $actual" }
}
function Check-ProjectFile([string]$path) {
  $resolved = (Resolve-Path -LiteralPath $path).Path
  if (-not $resolved.StartsWith($project + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {
    throw 'Only scripts/fixtures inside the booking project may run'
  }
  return $resolved
}

switch ($Action) {
  'Initialize' {
    if (Test-Path -LiteralPath $data) { throw 'Existing data directory will not be overwritten' }
    [void](New-Item -ItemType Directory -Path $credentials)
    $acl = Get-Acl -LiteralPath $credentials
    $acl.SetAccessRuleProtection($true,$false)
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
    $acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $credentials -AclObject $acl
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    $password = [BitConverter]::ToString($bytes).Replace('-','')
    $pwfile = Join-Path $credentials 'init-password.txt'
    $utf8 = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($pwfile,$password + [Environment]::NewLine,$utf8)
    [IO.File]::WriteAllText($pgpass,"127.0.0.1:${port}:*:${owner}:${password}" + [Environment]::NewLine,$utf8)
    try {
      & (Join-Path $bin 'initdb.exe') -D $data -U $owner --encoding=UTF8 --locale=C --auth=scram-sha-256 --pwfile=$pwfile 2>&1 |
        Tee-Object -FilePath (Join-Path $results 'initdb.log')
      Check-Exit 'initdb'
    } finally {
      Remove-Item -LiteralPath $pwfile -ErrorAction SilentlyContinue
      $password = $null
      [Array]::Clear($bytes,0,$bytes.Length)
    }
  }
  'Start' {
    if ((Get-PSDrive -Name C).Free -lt 2GB) { throw 'At least 2GiB free is required' }
    if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) { throw 'Chosen port is occupied' }
    $arguments = @('-D',('"' + $data + '"'),'-l',('"' + (Join-Path $root 'postgres.log') + '"'),'-w','-t','30',
      '-o','"-h 127.0.0.1 -p 5432 -c max_connections=20 -c shared_buffers=32MB -c log_statement=none -c log_min_error_statement=panic"','start')
    $process = Start-Process -FilePath (Join-Path $bin 'pg_ctl.exe') -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $results 'start.log') -RedirectStandardError (Join-Path $results 'start-error.log')
    if (-not $process.WaitForExit(45000)) { throw 'pg_ctl did not finish within the bounded startup wait' }
    if ($process.ExitCode -ne 0) { throw 'Local PostgreSQL start failed; inspect local logs' }
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port)
    if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne '127.0.0.1') {
      & (Join-Path $bin 'pg_ctl.exe') -D $data -w stop -m fast
      throw 'Unexpected listener; stopped local test cluster'
    }
    Write-Output 'Started local test cluster on 127.0.0.1:5432 only.'
  }
  'Stop' {
    & (Join-Path $bin 'pg_ctl.exe') -D $data -w -t 30 stop -m fast 2>&1 |
      Tee-Object -FilePath (Join-Path $results 'stop.log')
    Check-Exit 'stop'
  }
  'Status' {
    & (Join-Path $bin 'pg_ctl.exe') -D $data status
    Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
      Select-Object LocalAddress,LocalPort,OwningProcess
  }
  'CreateDb' {
    if ($Database -notmatch '^gym24_test_[a-z0-9_]{3,40}$') { throw 'Disposable database name required' }
    $env:PGDATABASE = 'postgres'
    & (Join-Path $bin 'createdb.exe') -w -O $owner $Database
    Check-Exit 'createdb'
    Check-LocalDatabase
    Write-Output "Created disposable local database $Database."
  }
  'Run' {
    Check-LocalDatabase
    $file = Check-ProjectFile $Script
    if ([IO.Path]::GetExtension($file) -ne '.mjs') { throw 'Only a local Node test script is supported' }
    & node $file 2>&1 | Tee-Object -FilePath (Join-Path $results ($Database + '-' + [IO.Path]::GetFileNameWithoutExtension($file) + '.log'))
    Check-Exit 'Node SQL test'
  }
  'Sql' {
    Check-LocalDatabase
    $file = Check-ProjectFile $SqlFile
    if ([IO.Path]::GetExtension($file) -ne '.sql') { throw 'Only a local SQL file is supported' }
    & (Join-Path $bin 'psql.exe') -X -w -v ON_ERROR_STOP=1 -f $file 2>&1 |
      Tee-Object -FilePath (Join-Path $results ($Database + '-' + [IO.Path]::GetFileNameWithoutExtension($file) + '.log'))
    Check-Exit 'SQL test'
  }
}
