' Curato - WoL relay launcher
' Starts the Wake-on-LAN host relay hidden (no console window) at user logon.
' Placed in the user's Startup folder so it runs automatically once Docker
' Desktop (and the curato-app container) are available in the session.
Set sh = CreateObject("WScript.Shell")
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\Users\abrah\Downloads\curato\scripts\wol-relay.ps1""", 0, False
