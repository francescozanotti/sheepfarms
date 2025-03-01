const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const session = require('express-session');
const path = require('path');
const bodyParser = require('body-parser');

// Create Express app
const app = express();
const server = http.createServer(app);

// Set up WebSocket server
const wss = new WebSocket.Server({ server });

// Configure session middleware
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false, // ✅ Only create session when needed
  cookie: { secure: false, httpOnly: true } // ✅ Prevent JavaScript access to session cookies
}));


// Parse request bodies
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Set up EJS as view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));





// Sample data (this would come from your database in a real app)
const clients = [];

const connectedClients = {}; // Store connected machines
const sessionTracker = {}; // Track session IDs per hostname


wss.on('connection', (ws) => {
  console.log('Render node connected');

  ws.on('message', (message) => {
      try {
          const parsedMessage = JSON.parse(message);

          if (parsedMessage.type === 'registerNode') {
              const { hostname, sessionId, files } = parsedMessage.data;

              // Check if this hostname already has a registered session
              if (sessionTracker[hostname]) {
                  // A second instance is trying to register on the same machine
                  console.warn(`⚠️ Multiple instances detected for ${hostname}: New sessionId=${sessionId}, Existing sessionId=${sessionTracker[hostname]}`);

                  // Send warning message to the new connection
                  ws.send(JSON.stringify({
                      type: 'multipleInstancesWarning',
                      message: `Another client.js instance is already running on ${hostname}`,
                      otherSessionId: sessionTracker[hostname]
                  }));
              } else {
                  // Register this machine with sessionId
                  sessionTracker[hostname] = sessionId;
              }

              // Store connected client info
              connectedClients[sessionId] = {
                  hostname,
                  sessionId,
                  files: files || [],
                  isRendering: false,
                  lastSeen: Date.now(),
                  isSynced: isSynced,
                  ws //store websocket for some reason
              };

              console.log(`Node registered: ${hostname} (sessionId: ${sessionId})`);

              // Broadcast updated clients list
              broadcastClients();
          }

          if (parsedMessage.type === 'renderingState') {
              const { sessionId, isRendering } = parsedMessage;
              if (connectedClients[sessionId]) {
                  connectedClients[sessionId].isRendering = isRendering;
              }
              broadcastClients();
          }

          if (parsedMessage.type === 'nodeStatus') {
              const { hostname, sessionId, isRendering, files } = parsedMessage.data;
              if (connectedClients[sessionId]) {
                  connectedClients[sessionId].isRendering = isRendering;
                  connectedClients[sessionId].files = files || [];
                  connectedClients[sessionId].lastSeen = Date.now();
              }
              broadcastClients();
          }

      } catch (error) {
          console.error('Error processing WebSocket message:', error);
      }
  });

  ws.on('close', () => {
      // Remove disconnected client
      for (const sessionId in connectedClients) {
          if (connectedClients[sessionId].ws === ws) {
              console.log(`Render node disconnected: ${connectedClients[sessionId].hostname} (sessionId: ${sessionId})`);
              
              // Remove from session tracker
              delete sessionTracker[connectedClients[sessionId].hostname];

              // Remove from connected clients
              delete connectedClients[sessionId];

              broadcastClients();
              break;
          }
      }
  });
});




// Function to send the updated list of connected clients
function broadcastClients() {
  const activeClients = Object.values(connectedClients).map(client => ({
      hostname: client.hostname,
      sessionId: client.sessionId,
      files: client.files,
      isRendering: client.isRendering,
      lastSeen: client.lastSeen,
      isSynced: isSynced
  }));

  console.log("Broadcasting active clients:", activeClients); // Debugging line

  wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'clientsList', data: activeClients }));
      }
  });
}









// Routes
app.get('/', (req, res) => {
  if (req.session.isLoggedIn) {
    return res.redirect('/dashboard');
  }
  res.render('login');
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  console.log('Login attempt:', username, password);
  
  // Simple authentication (replace with proper auth)
  if (username === 'admin' && password === 'password') {
    req.session.isLoggedIn = true;
    req.session.username = username;
    console.log('Login successful, session:', req.session);
    return res.redirect('/dashboard');
  } else {
    console.log('Login failed');
    return res.render('login', { error: 'Invalid credentials' });
  }
});

app.get('/dashboard', (req, res) => {
  if (!req.session.isLoggedIn) {
    return res.redirect('/');
  }
  console.log('Rendering dashboard for:', req.session.username);
  res.render('dashboard', { username: req.session.username });
});

app.get('/clients', (req, res) => {
  if (!req.session.isLoggedIn) {
    return res.redirect('/');
  }
  
  res.render('clients', { clients, username: req.session.username });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = server;