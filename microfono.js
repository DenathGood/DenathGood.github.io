// ============================================================
//  SIMULADOR DE VOZ POR TEXTO — RobloxVoice v2
//  Úsalo para probar sin micrófono: node microfono.js
// ============================================================
const axios = require("axios")
const readline = require("readline")

const COMANDOS_VALIDOS = [
    "crea un bloque",
    "destruye un bloque",
    "escudo",
    "salta",
    "lava lenta",
]

async function enviarComando(comando) {
    try {
        const res  = await axios.post("http://localhost:3000/setcomando", { comando })
        const data = res.data

        if (data.ok) {
            console.log(`🎮 Enviado al juego: "${comando}"`)
        } else if (data.cooldown) {
            console.log(`⏳ "${comando}" en cooldown — espera ${data.cooldown}s`)
        } else {
            console.log(`❌ Error: ${data.error}`)
        }
    } catch (err) {
        console.error("❌ Servidor no conectado — corre node servidor.js primero")
    }
}

function procesarTexto(texto) {
    const t = texto.toLowerCase().trim()
    console.log(`🎙️  Escuché: "${t}"`)

    for (const cmd of COMANDOS_VALIDOS) {
        if (t.includes(cmd)) {
            enviarComando(cmd)
            return
        }
    }
    console.log("🔇 No se reconoció ningún comando válido")
    console.log("   Comandos válidos: " + COMANDOS_VALIDOS.join(", "))
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

console.log("🎙️  Simulador activo — escribe un comando y Enter:")
console.log("   " + COMANDOS_VALIDOS.join(", "))
console.log("─────────────────────────────────────────────")

rl.on("line", procesarTexto)