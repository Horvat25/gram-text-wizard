#!/usr/bin/env bash
# gatilho-reparum.sh — relógio de reserva dos stories da REPARUM TECH.
#
# POR QUE EXISTE (29/08/2026): medi as rodadas agendadas do reparum-stories.yml e elas só
# acontecem de MADRUGADA — 02:39, 00:45, 23:47, 21:58, 01:11 UTC. As janelas do dia (12,15,
# 17,20 UTC), que são justamente os três slots do cliente, o cron do GitHub engole inteiras.
# Em 29/08 o slot das 09h não saiu: o workflow simplesmente não rodou entre 12:00 e 13:40 UTC.
#
# O gatilho-local.sh já resolvia isso para o NOSSO publicador. A Reparum tinha ficado de
# fora — e falha em cliente é a que custa contrato, não só alcance.
#
# Diferença para o nosso: o workflow do cliente exige o SLOT no dispatch. Sem `inputs.slot`
# ele roda em modo `validar`, que não publica nada. O slot sai da hora local (BRT).
set -u
cd "$(dirname "$0")/.."
LOG="publicador/gatilho-local.log"

SLOT="${1:-}"
if [ -z "$SLOT" ]; then
  H=$(date +%H)
  case "$H" in
    09|10) SLOT=09 ;;
    14|15) SLOT=14 ;;
    17|18) SLOT=17 ;;
    *) echo "$(date -u +%H:%MZ) reparum: hora $H nao e slot do cliente, nada a fazer" >> "$LOG"; exit 0 ;;
  esac
fi

T=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill 2>/dev/null | grep "^password=" | cut -d= -f2-)
if [ -z "${T:-}" ]; then
  echo "$(date -u +%H:%MZ) reparum: SEM TOKEN do gerenciador de credenciais" >> "$LOG"; exit 1
fi

C=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Authorization: Bearer $T" -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/Horvat25/gram-text-wizard/actions/workflows/reparum-stories.yml/dispatches" \
  -d "{\"ref\":\"main\",\"inputs\":{\"slot\":\"$SLOT\"}}")

echo "$(date -u +%Y-%m-%dT%H:%MZ) reparum slot=$SLOT -> HTTP $C" >> "$LOG"
[ "$C" = "204" ] || exit 1
