# ─────────────────────────────────────────────────────────────
#  Neural Update — Launcher local
#  Inicia o servidor de voz neural em background e abre o app.
#
#  Como usar:  clique duplo em iniciar.ps1
#              ou no terminal: .\iniciar.ps1
# ─────────────────────────────────────────────────────────────

$voiceDir  = "D:\Neural Update\neural-voice"
$appDir    = "D:\Neural Update\gram-text-wizard"
$voicePort = 3032
$appUrl    = "https://gram-text-wizard.lovable.app"   # troque pelo seu domínio Lovable se mudar

# ── 1. Verifica se o servidor de voz já está rodando ─────────
function Test-VoiceServer {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:$voicePort/health" `
                               -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
        return $r.StatusCode -eq 200
    } catch { return $false }
}

if (Test-VoiceServer) {
    Write-Host "✅ Neural Voice já está rodando na porta $voicePort" -ForegroundColor Green
} else {
    Write-Host "🚀 Iniciando Neural Voice..." -ForegroundColor Cyan

    if (-not (Test-Path $voiceDir)) {
        Write-Host "❌ Pasta não encontrada: $voiceDir" -ForegroundColor Red
    } else {
        # Inicia em nova janela minimizada; fecha automaticamente se já houver outra
        Start-Process powershell.exe `
            -ArgumentList "-NoProfile -WindowStyle Minimized -Command `"cd '$voiceDir'; npm start`"" `
            -PassThru | Out-Null

        # Aguarda o servidor subir (máx 8 s)
        $tries = 0
        do {
            Start-Sleep -Milliseconds 500
            $tries++
        } while (-not (Test-VoiceServer) -and $tries -lt 16)

        if (Test-VoiceServer) {
            Write-Host "✅ Neural Voice pronto na porta $voicePort" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Neural Voice demorou para subir — o app vai usar voz Edge TTS como fallback" -ForegroundColor Yellow
        }
    }
}

# ── 2. Abre o app no navegador padrão ────────────────────────
Write-Host "🌐 Abrindo o app..." -ForegroundColor Cyan
Start-Process $appUrl

Write-Host ""
Write-Host "──────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host " Neural Voice : http://localhost:$voicePort" -ForegroundColor White
Write-Host " App          : $appUrl" -ForegroundColor White
Write-Host "──────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Pressione qualquer tecla para fechar este terminal..." -ForegroundColor DarkGray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
