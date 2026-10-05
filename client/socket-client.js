// =====================================================================
//  >>> THE ONLY PLACE TO PUT YOUR ONLINE SERVER URL <<<
//  Example: const SERVER_URL = "https://my-snake-server.onrender.com";
//  - Testing locally through http://localhost:3000 : leave as "YOUR_SERVER_URL"
//    (the page then talks to the server it was loaded from).
//  - Building the APK : you MUST replace it with your real https URL.
// =====================================================================
const SERVER_URL = "YOUR_SERVER_URL";

// Event names. These strings MUST match server/server.js exactly.
const EVT = {
  JOIN: 'join',     // client -> server  {name, skin}
  INPUT: 'input',   // client -> server  {a: angle radians, b: boost 0/1}
  JOINED: 'joined', // server -> client  {id, room, w, h}
  STATE: 'state',   // server -> client  world snapshot (20 per second)
  DIED: 'died'      // server -> client  {score, by}
};

const NET_URL = SERVER_URL.indexOf('YOUR_') === 0
  ? (location.protocol.indexOf('http') === 0 ? location.origin : 'http://localhost:3000')
  : SERVER_URL;

const socket = io(NET_URL, { transports: ['websocket', 'polling'], reconnection: true, reconnectionDelay: 1000, reconnectionDelayMax: 5000 });
