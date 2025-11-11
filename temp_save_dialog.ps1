Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.SaveFileDialog
$dialog.Filter = "CSV 文件 (*.csv)|*.csv|所有文件 (*.*)|*.*"
$dialog.Title = "请选择保存CSV的位置和文件名"
$dialog.InitialDirectory = [Environment]::CurrentDirectory
$dialog.FileName = "output_1762870070041.csv"
$result = $dialog.ShowDialog()
if ($result -eq 'OK') {
    Write-Output $dialog.FileName
}