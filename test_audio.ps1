Add-Type -AssemblyName System.Speech
# Let's see if we have Windows Media Foundation to decode MP3
$source = "C:\Users\salih\Desktop\Antigravity Projeler,\Haxballv2\public\sounds\cheer.mp3"
$target = "C:\Users\salih\Desktop\Antigravity Projeler,\Haxballv2\public\sounds\cheer.wav"

$reader = [System.IO.File]::OpenRead($source)
Write-Host "Read successfully, length: $($reader.Length)"
$reader.Close()
