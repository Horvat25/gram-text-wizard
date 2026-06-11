# ─────────────────────────────────────────────────────────────
#  Neural Update — Launcher
#  Garante o Neural Voice rodando e abre o app no navegador.
#
#  Dica: para o Neural Voice ligar SOZINHO com o Windows, copie
#  o start-hidden.vbs para a pasta Inicializar (uma vez só):
#    Copy-Item "D:\Neural Update\neural-voice\start-hidden.vbs" "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\NeuralUpdate-Voice.vbs"
# ─────────────────────────────────────────────────────────────

$voiceDir  = "D:\Neural Update\neural-voice"
$voicePort = 3032
$appUrl    = "https://gram-text-wizard.lovable.app"

function Test-Voice {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:$voicePort/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        return $r.StatusCode -eq 200
    } catch { return $false }
}

if (Test-Voice) {
    Write-Host "[OK] Neural Voice ja esta rodando" -ForegroundColor Green
} else {
    Write-Host "[..] Iniciando Neural Voice..." -ForegroundColor Cyan
    Start-Process wscript.exe -ArgumentList "`"$voiceDir\start-hidden.vbs`""
    $tries = 0
    do { Start-Sleep -Milliseconds 500; $tries++ } while (-not (Test-Voice) -and $tries -lt 20)
    if (Test-Voice) {
        Write-Host "[OK] Neural Voice pronto (Thalita Neural, porta $voicePort)" -ForegroundColor Green
    } else {
        Write-Host "[!!] Neural Voice nao subiu - veja $voiceDir\server.log" -ForegroundColor Red
    }
}

Start-Process $appUrl
Write-Host ""
Write-Host "App aberto. Pode fechar esta janela - a voz continua rodando." -ForegroundColor DarkGray
Start-Sleep -Seconds 5
