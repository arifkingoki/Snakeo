// Copies the Socket.IO browser library next to the client so the APK needs no CDN.
const fs = require('fs'), path = require('path');
try {
  const src = path.join(__dirname, 'node_modules', 'socket.io', 'client-dist', 'socket.io.min.js');
  const dst = path.join(__dirname, '..', 'client', 'socket.io.min.js');
  fs.copyFileSync(src, dst);
  console.log('Copied socket.io.min.js to client/');
} catch (e) { console.log('Skipped copying socket.io.min.js (ok on a hosting server):', e.message); }
