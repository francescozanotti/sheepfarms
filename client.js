const WebSocket = require('ws');
const os = require('os');
const { exec } = require('child_process');
const fs = require('fs');

// Directory to read
const directoryPath = 'C:/renderfarm/sequence1-10/';

// Define the husk command
const huskCommand = `"E:/Programmi3D/Houdini 20.5.278/bin/husk.exe" --output "F:/assets/scripts/myrenderfarm/sequence1-10/$F3.exr" --verbose 1 --frame 1 --frame-count 1 --renderer Karma "F:/assets/scripts/myrenderfarm/rop1.usd"`;

// Get the hostname of the machine
const hostname = os.hostname();

// Track rendering state
let isRendering = false;

let ws;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const getReconnectDelay = () => Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);

// Generate a unique session ID when this script starts
const sessionId = Date.now();


// Get list of files in the render directory
function getRenderedFiles() {
    return new Promise((resolve, reject) => {
        fs.readdir(directoryPath, (err, files) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(files);
        });
    });
}


// Send node status update to server
async function sendNodeStatus() {
    if (ws.readyState === WebSocket.OPEN) {
        try {
            const files = await getRenderedFiles();
            
            ws.send(JSON.stringify({
                type: 'nodeStatus',
                data: {
                    hostname: hostname,
                    isRendering: isRendering,
                    files: files
                }
            }));
            
            console.log('Sent node status update to server');
        } catch (error) {
            console.error('Error getting files:', error);
        }
    }
}


// Execute the render command
function executeRender() {
    return new Promise((resolve, reject) => {
        exec(`cmd.exe /c echo startrender! && ${huskCommand}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error: ${error.message}`);
                reject(error);
                return;
            }
            if (stderr) {
                console.error(`Stderr: ${stderr}`);
            }
            
            resolve(stdout);
        });
    });
}


function connect() {
    ws = new WebSocket('wss://sheepfarms.onrender.com');

    ws.on('open', async () => {
        console.log(`${hostname} - Connected to server with sessionId: ${sessionId}`);

        // Read existing files
        const files = await getRenderedFiles();

        // Register this node with the server, including the sessionId
        ws.send(JSON.stringify({
            type: 'registerNode',
            data: {
                hostname: hostname,
                sessionId: sessionId,  // Send unique session ID
                files: files
            }
        }));
    });

    ws.on('message', async (message) => {
        console.log('Received:', message.toString());

        try {
            const data = JSON.parse(message);

            if (data.type === 'multipleInstancesWarning') {
                console.warn(`⚠️ WARNING: Another client.js instance is already running on ${hostname} (sessionId: ${data.otherSessionId})`);
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });
}


// Start the connection
connect();

// Send regular status updates
setInterval(async () => {
    await sendNodeStatus();
}, 30000); // Every 30 seconds