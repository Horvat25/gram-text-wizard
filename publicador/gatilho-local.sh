#!/usr/bin/env bash
# gatilho-local.sh — relógio de reserva do publicador, rodando no PC do Marcelo.
#
# POR QUE EXISTE: o cron do GitHub Actions não é garantido em repositório gratuito.
# Em 27, 28 e 29/08/2026 ele engoliu períodos inteiros — na manhã de 29 foram 12,2h
# de silêncio, confirmado pelo batimento (ultima-rodada.json). O Worker do Cloudflare
# resolveria isso, mas depende de um token guardado lá fora. Este gatilho não depende:
# o destrava.sh lê a credencial do gerenciador do Windows na hora e não guarda nada.
#
# LIMITE HONESTO: só dispara com o PC ligado. É rede de segurança, não substituto
# do cron do GitHub — os dois disparam o mesmo workflow, que tem `concurrency` e só
# solta o que já venceu, então disparo repetido não duplica post (lição de 20/08).
set -u
cd "$(dirname "$0")/.."
LOG="publicador/gatilho-local.log"
echo "── $(date -u +%Y-%m-%dT%H:%MZ) ──" >> "$LOG"
bash publicador/destrava.sh >> "$LOG" 2>&1
# Mantém o log num tamanho civilizado (últimas ~600 linhas ≈ 2 meses).
tail -n 600 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
