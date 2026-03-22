/**
 * MINDMAP — Servidor WebSocket de Señalización
 * 
 * Actúa como relay entre el espectador (cliente) y el mago (panel).
 * No almacena datos. No registra logs identificables.
 * 
 * Dependencias: ws, express
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);

// ── Servir archivos estáticos ──
app.use(express.static(path.join(__dirname, 'public')));

// ── Rutas de acceso al panel del mago (URL ofuscada) ──
app.get('/control', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'magician.html'));
});

// ════════════════════════════════════════════════════════════════
//  WEBSOCKET SERVER
// ════════════════════════════════════════════════════════════════
const wss = new WebSocket.Server({ server });

// sessions: Map<sessionId, { spectator: ws | null, magicians: Set<ws> }>
const sessions = new Map();

function getSession(id) {
  if (!sessions.has(id)) {
    sessions.set(id, { spectator: null, magicians: new Set() });
  }
  return sessions.get(id);
}

wss.on('connection', (ws, req) => {
  const params = new URLSearchParams(req.url.replace('/?', ''));
  const sessionId = params.get('session') || 'default';
  const role = params.get('role') || 'spectator';

  const session = getSession(sessionId);

  if (role === 'spectator') {
    session.spectator = ws;
    console.log(`[${sessionId}] Spectator connected`);

    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        // Relay a todos los magos de esta sesión
        session.magicians.forEach(magWs => {
          if (magWs.readyState === WebSocket.OPEN) {
            magWs.send(JSON.stringify(data));
          }
        });
      } catch (e) { /* ignore malformed */ }
    });

    ws.on('close', () => {
      if (session.spectator === ws) session.spectator = null;
      console.log(`[${sessionId}] Spectator disconnected`);
    });

  } else if (role === 'magician') {
    session.magicians.add(ws);
    console.log(`[${sessionId}] Magician connected (${session.magicians.size} total)`);

    ws.on('close', () => {
      session.magicians.delete(ws);
      console.log(`[${sessionId}] Magician disconnected`);
    });
  }

  ws.on('error', () => { /* silencio */ });
});

// ── Limpieza de sesiones vacías cada hora ──
setInterval(() => {
  for (const [id, session] of sessions.entries()) {
    if (!session.spectator && session.magicians.size === 0) {
      sessions.delete(id);
    }
  }
}, 3600 * 1000);

// ════════════════════════════════════════════════════════════════
//  INICIAR SERVIDOR
// ════════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════╗
  ║    🔮 MINDMAP SERVER ONLINE       ║
  ║    Puerto: ${PORT}                     ║
  ║                                   ║
  ║  Espectador: http://localhost:${PORT}  ║
  ║  Panel mago: http://localhost:${PORT}/control  ║
  ╚═══════════════════════════════════╝
  `);
});
