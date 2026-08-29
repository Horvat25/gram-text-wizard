#!/usr/bin/env bash
# destrava.sh — dispara o publicador do Instagram na hora, sem navegador.
#
# POR QUE EXISTE: o cron do GitHub engole períodos inteiros sem avisar (28 e 29/08/2026,
# duas manhãs seguidas). Quando isso acontece o post fica parado na fila e alguém precisa
# apertar "Executar fluxo de trabalho" no site. Este script faz isso pelo terminal, usando
# o token que já está no gerenciador de credenciais do Windows — nada é digitado nem salvo.
#
#   bash publicador/destrava.sh            # dispara e mostra o estado
#   bash publicador/destrava.sh --ver      # só mostra, não dispara
set -u
REPO="Horvat25/gram-text-wizard"
WF="instagram.yml"

TOKEN=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill 2>/dev/null | grep "^password=" | cut -d= -f2-)
if [ -z "${TOKEN:-}" ]; then
  echo "✗ não consegui obter o token do GitHub pelo gerenciador de credenciais."
  echo "  Faça um 'git push' qualquer para reautenticar e rode de novo."
  exit 1
fi

echo "── fila remota (origin/main) ──"
git fetch -q origin 2>/dev/null
git show origin/main:publicador/fila.json | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  const hoje=new Date().toISOString().slice(0,10);
  const j=JSON.parse(s).filter(i=>(i.quando||'').slice(0,10)===hoje);
  if(!j.length){console.log('  (nada para hoje)');return}
  for(const i of j){
    const br=new Date(new Date(i.quando).getTime()-3*3600e3);
    const marca = i.status==='agendado' && new Date(i.quando) < new Date() ? '  ← VENCIDO' : '';
    console.log('  '+String(br.getUTCHours()).padStart(2,'0')+'h '+(i.slug||'').padEnd(30)+i.status+marca);
  }
});"

echo
echo "── última rodada do publicador ──"
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.github.com/repos/$REPO/actions/workflows/$WF/runs?per_page=1" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  const r=JSON.parse(s).workflow_runs[0];
  if(!r){console.log('  (nenhuma)');return}
  const h=((Date.now()-new Date(r.created_at))/3600000).toFixed(1);
  console.log('  #'+r.run_number+' · '+r.event+' · '+(r.conclusion||r.status)+' · há '+h+'h');
  if(h>4) console.log('  ⚠️  mais de 4h sem rodar — o cron do GitHub provavelmente engasgou');
});"

[ "${1:-}" = "--ver" ] && exit 0

echo
echo "── disparando ──"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO/actions/workflows/$WF/dispatches" -d '{"ref":"main"}')

if [ "$CODE" = "204" ]; then
  echo "  ✓ disparado. Em ~1 min confira com: bash publicador/destrava.sh --ver"
else
  echo "  ✗ HTTP $CODE — o token pode não ter escopo de Actions (precisa de 'workflow')."
fi
