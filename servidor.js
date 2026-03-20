// ============================================================
//  SERVIDOR ROBLOX VOICE — con Base de Datos y Login
// ============================================================
const express  = require("express")
const cors     = require("cors")
const { Pool } = require("pg")
const bcrypt   = require("bcrypt")
const jwt      = require("jsonwebtoken")

const app  = express()
const PORT = process.env.PORT || 3000
const JWT_SECRET = "robloxvoice_secreto_2024"

app.use(cors())
app.use(express.json())

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/index.html")
})

// ── Conexión a PostgreSQL ──
const pool = new Pool({
    connectionString: "postgresql://roblox_voice_db_user:YAtUpRX6rZdlJQx2R7dxTQVQgSLKBC77@dpg-d6u4c49aae7s73ea0c00-a.oregon-postgres.render.com/roblox_voice_db",
    ssl: { rejectUnauthorized: false }
})

// ── Cooldowns por comando (ms) ──
const COOLDOWNS = {
    "lanza fuego":        2000,
    "explosion":          15000,
    "escudo de fuego":    30000,
    "crea un bloque":     5000,
    "destruye un bloque": 10000,
    "escudo":             30000,
    "salta":              8000,
    "lava lenta":         20000,
}

const ultimoUso = {}

// ── Crear tablas si no existen ──
async function iniciarDB() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id          SERIAL PRIMARY KEY,
            username    VARCHAR(50) UNIQUE NOT NULL,
            password    VARCHAR(100) NOT NULL,
            created_at  TIMESTAMP DEFAULT NOW()
        )
    `)
    await pool.query(`
        CREATE TABLE IF NOT EXISTS sesiones (
            id          SERIAL PRIMARY KEY,
            codigo      VARCHAR(20) UNIQUE NOT NULL,
            user_id     INTEGER REFERENCES usuarios(id),
            roblox_uid  VARCHAR(50),
            job_id      VARCHAR(100),
            nombre      VARCHAR(50),
            activo      BOOLEAN DEFAULT TRUE,
            created_at  TIMESTAMP DEFAULT NOW()
        )
    `)
    await pool.query(`
        CREATE TABLE IF NOT EXISTS comandos (
            id          SERIAL PRIMARY KEY,
            user_id     INTEGER REFERENCES usuarios(id),
            roblox_uid  VARCHAR(50),
            job_id      VARCHAR(100),
            comando     VARCHAR(50) NOT NULL,
            ejecutado   BOOLEAN DEFAULT FALSE,
            created_at  TIMESTAMP DEFAULT NOW()
        )
    `)
    console.log("✅ Base de datos lista")
}

// ── Verificar token ──
function verificarToken(req, res, next) {
    const token = req.headers["authorization"]?.split(" ")[1]
    if (!token) return res.status(401).json({ error: "Sin token" })
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: "Token inválido" })
        req.usuario = decoded
        next()
    })
}

// ============================================================
// AUTH
// ============================================================

app.post("/auth/registro", async (req, res) => {
    const { username, password } = req.body
    if (!username || !password) return res.json({ ok: false, error: "Faltan datos" })
    try {
        const hash = await bcrypt.hash(password, 10)
        await pool.query("INSERT INTO usuarios (username, password) VALUES ($1,$2)", [username.toLowerCase(), hash])
        res.json({ ok: true })
    } catch (e) {
        res.json({ ok: false, error: e.code === "23505" ? "Usuario ya existe" : "Error al registrar" })
    }
})

app.post("/auth/login", async (req, res) => {
    const { username, password } = req.body
    if (!username || !password) return res.json({ ok: false, error: "Faltan datos" })
    try {
        const r = await pool.query("SELECT * FROM usuarios WHERE username=$1", [username.toLowerCase()])
        if (!r.rows.length) return res.json({ ok: false, error: "Usuario no encontrado" })
        const valido = await bcrypt.compare(password, r.rows[0].password)
        if (!valido) return res.json({ ok: false, error: "Contraseña incorrecta" })
        const token = jwt.sign({ id: r.rows[0].id, username: r.rows[0].username }, JWT_SECRET, { expiresIn: "24h" })
        res.json({ ok: true, token, username: r.rows[0].username })
    } catch (e) {
        res.json({ ok: false, error: "Error al iniciar sesión" })
    }
})

// ============================================================
// SESIONES ROBLOX
// ============================================================

app.post("/registrar", async (req, res) => {
    const { codigo, userId, jobId, nombre } = req.body
    if (!codigo || !userId || !jobId) return res.json({ ok: false, error: "Faltan datos" })
    try {
        const existe = await pool.query("SELECT * FROM sesiones WHERE codigo=$1", [codigo])
        if (existe.rows.length > 0) {
            await pool.query("UPDATE sesiones SET roblox_uid=$1,job_id=$2,nombre=$3,activo=TRUE WHERE codigo=$4", [userId, jobId, nombre, codigo])
        } else {
            await pool.query("INSERT INTO sesiones (codigo,roblox_uid,job_id,nombre) VALUES ($1,$2,$3,$4)", [codigo, userId, jobId, nombre])
        }
        console.log(`[Roblox] ${nombre} registrado con código: ${codigo}`)
        res.json({ ok: true })
    } catch (e) {
        res.json({ ok: false, error: "Error al registrar" })
    }
})

app.post("/vincular", verificarToken, async (req, res) => {
    const { codigo } = req.body
    if (!codigo) return res.json({ ok: false, error: "Falta el código" })
    try {
        const s = await pool.query("SELECT * FROM sesiones WHERE codigo=$1 AND activo=TRUE", [codigo.toUpperCase()])
        if (!s.rows.length) return res.json({ ok: false, error: "Código inválido o expirado" })
        await pool.query("UPDATE sesiones SET user_id=$1 WHERE codigo=$2", [req.usuario.id, codigo.toUpperCase()])
        res.json({ ok: true, nombre: s.rows[0].nombre, robloxUid: s.rows[0].roblox_uid })
    } catch (e) {
        res.json({ ok: false, error: "Error al vincular" })
    }
})

app.post("/setcomando", verificarToken, async (req, res) => {
    const { comando, codigo } = req.body
    if (!comando || !codigo) return res.json({ ok: false, error: "Faltan datos" })

    const cmd    = comando.toLowerCase().trim()
    const ahora  = Date.now()
    const key    = req.usuario.id + "_" + cmd
    const ultimo = ultimoUso[key] || 0
    const espera = COOLDOWNS[cmd] || 3000

    if (ahora - ultimo < espera) {
        const restante = Math.ceil((espera - (ahora - ultimo)) / 1000)
        console.log(`⏳ "${cmd}" en cooldown — espera ${restante}s`)
        return res.json({ ok: false, cooldown: restante })
    }

    try {
        const s = await pool.query(
            "SELECT * FROM sesiones WHERE codigo=$1 AND user_id=$2 AND activo=TRUE",
            [codigo.toUpperCase(), req.usuario.id]
        )
        if (!s.rows.length) return res.json({ ok: false, error: "Sesión no válida — vincula tu código primero" })

        ultimoUso[key] = ahora
        await pool.query(
            "INSERT INTO comandos (user_id,roblox_uid,job_id,comando) VALUES ($1,$2,$3,$4)",
            [req.usuario.id, s.rows[0].roblox_uid, s.rows[0].job_id, cmd]
        )
        console.log(`[Comando] ${s.rows[0].nombre}: "${cmd}"`)
        res.json({ ok: true })
    } catch (e) {
        res.json({ ok: false, error: "Error al guardar comando" })
    }
})

app.get("/comando", async (req, res) => {
    const { userId, jobId } = req.query
    if (!userId || !jobId) return res.json({ comando: "ninguno" })
    try {
        const r = await pool.query(
            "SELECT * FROM comandos WHERE roblox_uid=$1 AND job_id=$2 AND ejecutado=FALSE ORDER BY created_at ASC LIMIT 1",
            [userId, jobId]
        )
        if (!r.rows.length) return res.json({ comando: "ninguno" })
        await pool.query("UPDATE comandos SET ejecutado=TRUE WHERE id=$1", [r.rows[0].id])
        res.json({ comando: r.rows[0].comando })
    } catch (e) {
        res.json({ comando: "ninguno" })
    }
})

// ── Iniciar ──
iniciarDB().then(() => {
    app.listen(PORT, () => console.log(`✅ Servidor corriendo en puerto ${PORT}`))
})