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

wss.on('connection', (ws) => {
    console.log('Render node connected');

    // Listen for messages from the render node
    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message);

            if (parsedMessage.type === 'registerNode') {
                const { hostname, files } = parsedMessage.data;
                
                // Store connected client data
                connectedClients[hostname] = {
                    hostname,
                    files: files || [],
                    isRendering: false,
                    lastSeen: Date.now(),
                    ws // Store WebSocket connection for tracking
                };

                console.log(`Node registered: ${hostname}`);

                // Broadcast updated clients list
                broadcastClients();
            }

            if (parsedMessage.type === 'renderingState') {
                const { isRendering } = parsedMessage;
                if (connectedClients[parsedMessage.hostname]) {
                    connectedClients[parsedMessage.hostname].isRendering = isRendering;
                }
                broadcastClients();
            }

            if (parsedMessage.type === 'nodeStatus') {
                const { hostname, isRendering, files } = parsedMessage.data;
                if (connectedClients[hostname]) {
                    connectedClients[hostname].isRendering = isRendering;
                    connectedClients[hostname].files = files || [];
                    connectedClients[hostname].lastSeen = Date.now();
                }
                broadcastClients();
            }

        } catch (error) {
            console.error('Error processing WebSocket message:', error);
        }
    });

    ws.on('close', () => {
        // Remove disconnected client
        for (const hostname in connectedClients) {
            if (connectedClients[hostname].ws === ws) {
                console.log(`Render node disconnected: ${hostname}`);
                delete connectedClients[hostname];
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
      files: client.files,
      isRendering: client.isRendering,
      lastSeen: client.lastSeen
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