' Roda o gatilho-local.sh sem piscar janela de console.
' O Agendador de Tarefas do Windows chama este arquivo com: wscript.exe //B <caminho>
Set sh = CreateObject("WScript.Shell")
sh.Run """C:\Program Files\Git\bin\bash.exe"" -lc ""bash '/d/Neural Update/instagram/publicador/gatilho-local.sh'""", 0, False
