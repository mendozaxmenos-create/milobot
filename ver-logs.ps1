# Script para ver logs del bot en tiempo real
Write-Host "🔍 Buscando procesos de Node.js..." -ForegroundColor Cyan

# Ver procesos de Node
$nodeProcesses = Get-Process -Name node -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    Write-Host "`n✅ Procesos de Node.js encontrados:" -ForegroundColor Green
    $nodeProcesses | Format-Table Id, ProcessName, StartTime -AutoSize
    
    Write-Host "`n💡 Para ver los logs:" -ForegroundColor Yellow
    Write-Host "1. Si usas PM2: pm2 logs" -ForegroundColor White
    Write-Host "2. Si lo ejecutaste con 'npm start': Busca la ventana de terminal donde lo iniciaste" -ForegroundColor White
    Write-Host "3. Si está en segundo plano, reinícialo con: npm start" -ForegroundColor White
} else {
    Write-Host "❌ No se encontraron procesos de Node.js corriendo" -ForegroundColor Red
    Write-Host "`n💡 Para iniciar el bot y ver los logs:" -ForegroundColor Yellow
    Write-Host "   npm start" -ForegroundColor White
}

Write-Host "`n📋 Para ver logs en tiempo real, ejecuta en otra terminal:" -ForegroundColor Cyan
Write-Host "   npm start" -ForegroundColor White

