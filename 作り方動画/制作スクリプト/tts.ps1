param([string]$only = "")
$d = Split-Path -Parent $MyInvocation.MyCommand.Path
Add-Type -AssemblyName System.Speech
$items = Get-Content "$d\narration.json" -Encoding UTF8 -Raw | ConvertFrom-Json
foreach ($it in $items) {
  if ($only -and $it.id -ne $only) { continue }
  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $s.SelectVoice("Microsoft Haruka Desktop")
  $s.Rate = 1
  $s.SetOutputToWaveFile("$d\audio\$($it.id).wav")
  $s.Speak($it.say)
  $s.Dispose()
  "ok $($it.id)"
}
