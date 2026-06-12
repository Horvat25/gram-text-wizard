# ═══════════════════════════════════════════════════════════════
#  NEURAL UPDATE — Launcher do Agente de Reels
# ═══════════════════════════════════════════════════════════════
#  Sobe TUDO que o fluxo de Reels precisa e abre o app LOCAL.
#
#  Por que app local (localhost:8080) e nao o site lovable.app?
#  Pagina HTTPS publica NAO consegue falar com o Neural Voice em
#  http://localhost (parede de conteudo-misto do navegador). Pagina
#  local -> voz local = MESMA origem, sempre funciona, voz boa garantida.
#  Bonus: usa sempre o codigo mais novo do projeto.
#
#  Uso: clique duplo neste arquivo (ou rode .\iniciar.ps1).
#  Primeira vez: ele se oferece pra ligar sozinho junto com o Windows.
# ═══════════════════════════════════════════════════════════════

$ErrorActionPreference = "SilentlyContinue"
$voiceDir  = "D:\Neural Update\neural-voice"
$appDir    = "D:\Neural Update\gram-text-wizard"
$voicePort = 3032
$appPort   = 8080

function Test-Port($port, $path = "/") {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:$port$path" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        return $r.StatusCode -eq 200
    } catch { return $false }
}

Write-Host ""
Write-Host "  NEURAL UPDATE - iniciando ambiente de Reels" -ForegroundColor Magenta
Write-Host "  ------------------------------------------------" -ForegroundColor DarkGray

# ── 1. NEURAL VOICE (porta 3032) ─────────────────────────────
if (Test-Port $voicePort "/health") {
    Write-Host "  [OK] Neural Voice ja rodando" -ForegroundColor Green
} else {
    Write-Host "  [..] Iniciando Neural Voice..." -ForegroundColor Cyan
    Start-Process wscript.exe -ArgumentList "`"$voiceDir\start-hidden.vbs`""
    $n = 0; do { Start-Sleep -Milliseconds 500; $n++ } while (-not (Test-Port $voicePort "/health") -and $n -lt 20)
    if (Test-Port $voicePort "/health") { Write-Host "  [OK] Neural Voice pronto (Thalita Neural)" -ForegroundColor Green }
    else { Write-Host "  [!!] Neural Voice nao subiu - veja $voiceDir\server.log" -ForegroundColor Red }
}

# ── 2. APP LOCAL (porta 8080) ────────────────────────────────
if (Test-Port $appPort) {
    Write-Host "  [OK] App local ja rodando" -ForegroundColor Green
} else {
    Write-Host "  [..] Iniciando app local (npm run dev)..." -ForegroundColor Cyan
    Start-Process powershell.exe -ArgumentList "-NoProfile -WindowStyle Minimized -Command `"cd '$appDir'; npm run dev`""
    $n = 0; do { Start-Sleep -Seconds 1; $n++ } while (-not (Test-Port $appPort) -and $n -lt 60)
    if (Test-Port $appPort) { Write-Host "  [OK] App local pronto" -ForegroundColor Green }
    else { Write-Host "  [!!] App demorou - abrindo mesmo assim, recarregue se preciso" -ForegroundColor Yellow }
}

# ── 3. Abre o app LOCAL (voz garantida) ──────────────────────
Start-Process "http://localhost:$appPort"
Write-Host ""
Write-Host "  >> Use SEMPRE este endereco para gerar Reels:" -ForegroundColor White
Write-Host "     http://localhost:$appPort" -ForegroundColor Cyan
Write-Host ""

# ── 4. Auto-start no boot (oferece uma vez) ──────────────────
$startupVbs = Join-Path ([Environment]::GetFolderPath('Startup')) "NeuralUpdate-Voice.vbs"
if (-not (Test-Path $startupVbs)) {
    Write-Host "  Quer que o Neural Voice ligue SOZINHO toda vez que o PC ligar?" -ForegroundColor Yellow
    $resp = Read-Host "  Digite S para sim (qualquer outra tecla = nao)"
    if ($resp -eq "S" -or $resp -eq "s") {
        Copy-Item "$voiceDir\start-hidden.vbs" $startupVbs -Force
        if (Test-Path $startupVbs) { Write-Host "  [OK] Neural Voice vai ligar sozinho no proximo boot." -ForegroundColor Green }
    }
}

Write-Host ""
Write-Host "  Pode fechar esta janela. Os servidores continuam rodando." -ForegroundColor DarkGray
Start-Sleep -Seconds 4
