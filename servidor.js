const express = require("express")
const cors    = require("cors")
const path    = require("path")
const app     = express()
const PORT    = 3000

app.use(cors())
app.use(express.json())

// Servir index.html usando process.cwd()
app.get("/", (req, res) => {
    res.sendFile(process.cwd() + "/index.html")
})

let ultimoComando = "ninguno"

const COOLDOWNS = {
    "crea un bloque":     5000,
    "destruye un bloque": 10000,
    "escudo":             30000,
    "salta":              8000,
    "lava lenta":         20000,
}
const ultimoUso = {}

app.get("/comando", (req, res) => {
    res.json({ comando: ultimoComando })
    ultimoComando = "ninguno"
})

app.post("/setcomando", (req, res) => {
    const { comando } = req.body
    if (!comando) return res.json({ ok: false, error: "Sin comando" })

    const cmd    = comando.toLowerCase().trim()
    const ahora  = Date.now()
    const ultimo = ultimoUso[cmd] || 0
    const espera = COOLDOWNS[cmd] || 5000

    if (ahora - ultimo < espera) {
        const restante = Math.ceil((espera - (ahora - ultimo)) / 1000)
        console.log(`⏳ "${cmd}" en cooldown — espera ${restante}s`)
        return res.json({ ok: false, cooldown: restante })
    }

    ultimoUso[cmd] = ahora
    ultimoComando  = cmd
    console.log(`✅ [Comando recibido]: ${cmd}`)
    res.json({ ok: true })
})

app.listen(PORT, () => {
    console.log(`✅ Servidor en http://localhost:${PORT}`)
})