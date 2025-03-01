const fs = require('fs');
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
  saveUninitialized: true,
  cookie: { secure: false } // Set to true in production with HTTPS
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
                  ws // Store WebSocket connection
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

          if (parsedMessage.type === 'syncRequest') {
            console.log("🔄 Sync requested by user. Broadcasting to all clients...");

            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'syncFolder' }));
                }
            });
          }

          if (parsedMessage.type === 'syncStatus') {
            const { hostname, isSynced } = parsedMessage.data;
        
            if (connectedClients[hostname]) {
                connectedClients[hostname].isSynced = isSynced;
            }
        
            console.log(`🔄 Sync status updated: ${hostname} - Synced: ${isSynced}`);
        
            broadcastClients(); // Ensure UI updates
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




// Hardcoded machine descriptions and Houdini versions
const machineDetails = {
  "POPPI": { description: "Main Client", houdiniVersions: ["E:/Programmi3D/Houdini 20.5.278/", "E:/Programmi3D/Houdini 19.5.368/"] },
  "DESKTOP-367E3PH": { description: "Work Laptop Andrea", houdiniVersions: ["C:/Program Files/Houdini 18.5.351/"] },
  "WorkLaptopAlex": { description: "Work Laptop Alex", houdiniVersions: ["none"] },
};

// Fallback for unknown machines
function getMachineDetails(hostname) {
  return machineDetails[hostname] || { description: "Unknown Device", houdiniVersions: [] };
}

// Function to send the updated list of connected clients
function broadcastClients() {
  const activeClients = Object.values(connectedClients).map(client => {
      const machineInfo = getMachineDetails(client.hostname);
      
      return {
          hostname: client.hostname,
          sessionId: client.sessionId,
          files: client.files,
          isRendering: client.isRendering,
          lastSeen: client.lastSeen,
          isSynced: client.isSynced,
          description: machineInfo.description, // ✅ New field
          houdiniVersions: machineInfo.houdiniVersions, // ✅ New field
      };
  });

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
    console.log('Login successful, redirecting to dashboard');
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