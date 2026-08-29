' Dispara o gatilho-reparum.sh sem piscar janela de console.
Set sh = CreateObject("WScript.Shell")
sh.Run """C:\Program Files\Git\bin\bash.exe"" -lc ""bash '/d/Neural Update/instagram/publicador/gatilho-reparum.sh'""", 0, False
