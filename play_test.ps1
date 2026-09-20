$wmp = New-Object -ComObject WMPlayer.OCX
$wmp.URL = "C:\Users\salih\Desktop\Antigravity Projeler,\Haxballv2\public\sounds\cheer.mp3"
$wmp.controls.play()
Start-Sleep -Seconds 4
