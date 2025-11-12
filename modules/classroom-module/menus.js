function getMainMenu(options = {}) {
  const lastSyncLabel = options.lastSyncLabel
    ? `\n⏱️ Última sincronización: ${options.lastSyncLabel}\n`
    : '';

  return `🏫 *Google Classroom*
${lastSyncLabel}
1️⃣ Resumen de novedades
2️⃣ Sincronizar ahora
3️⃣ Configuración
4️⃣ Volver al menú

💡 Podés escribir *"resumen"* o *"sync"* en cualquier momento.
💡 Escribí *"menu"* para volver al inicio.`;
}

function getAuthInstructions(authUrl) {
  return `🔐 *Conectar Google Classroom*

1️⃣ Abre este enlace: ${authUrl}
2️⃣ Inicia sesión con tu cuenta y acepta los permisos (Classroom y Calendar).
3️⃣ Copia el código que te muestra Google.
4️⃣ Pégalo aquí en el chat.

Escribí *"cancelar"* para volver al menú.`;
}

function getConfigMenu() {
  return `⚙️ *Classroom - Configuración*

1️⃣ Ver cuentas conectadas
2️⃣ Agregar nueva cuenta
3️⃣ Eliminar una cuenta
4️⃣ Ver cursos sincronizados
5️⃣ Limpiar datos locales
6️⃣ Volver

💡 Escribí *"menu"* para ir al inicio.`;
}

module.exports = {
  getMainMenu,
  getAuthInstructions,
  getConfigMenu
};

