// Load environment variables
require('dotenv').config();

// Import dependencies
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const plivo = require('plivo');
const fs = require('fs');
const path = require('path');

// Initialize Express application
const app = express();

// Configure middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Check if environment exists to create logs directory
let logsDir;
try {
  logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
  }
} catch (error) {
  console.log('Unable to create logs directory, will log to console only:', error);
}

// Function to safely log to file or console
function safeLog(data, logType = 'general') {
  const logEntry = typeof data === 'string' ? data : JSON.stringify(data);
  console.log(`[${new Date().toISOString()}] [${logType}]`, logEntry);
  
  try {
    if (logsDir) {
      fs.appendFileSync(
        path.join(logsDir, `${logType}.log`),
        `[${new Date().toISOString()}] ${logEntry}\n`
      );
    }
  } catch (error) {
    console.log('Error writing to log file:', error);
  }
}

// Function to register an outbound call with Retell
async function registerOutboundCall(fromNumber, toNumber) {
  try {
    const response = await axios.post(
      'https://api.retellai.com/v1/call/register-phone-call',
      {
        agent_id: process.env.RETELL_AGENT_ID,
        from_number: fromNumber,
        to_number: toNumber,
        direction: "outbound",
        metadata: {
          source: "plivo_integration"
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error registering call with Retell:', error.response?.data || error.message);
    throw error;
  }
}

// Initialize Plivo client with your credentials
const plivoClient = new plivo.Client(
  process.env.PLIVO_AUTH_ID,
  process.env.PLIVO_AUTH_TOKEN
);

// Serve a simple HTML form for testing
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>AI Outbound Caller</title>
      <style>
        body { 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          max-width: 600px; 
          margin: 0 auto; 
          padding: 20px;
          color: #333;
        }
        .container {
          background: #f9f9f9;
          border-radius: 8px;
          padding: 20px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { 
          color: #2a5298; 
          margin-top: 0;
        }
        .form-group { 
          margin-bottom: 15px; 
        }
        label { 
          display: block; 
          margin-bottom: 5px; 
          font-weight: 500;
        }
        input[type="text"] { 
          width: 100%; 
          padding: 10px; 
          border: 1px solid #ddd; 
          border-radius: 4px; 
          box-sizing: border-box; 
        }
        button { 
          padding: 10px 15px; 
          background: #2a5298; 
          color: white; 
          border: none; 
          border-radius: 4px;
          cursor: pointer; 
        }
        button:hover {
          background: #1a3a70;
        }
        .response { 
          margin-top: 20px; 
          padding: 15px; 
          border: 1px solid #ddd; 
          border-radius: 4px;
          display: none; 
        }
        .status {
          padding: 10px;
          margin-top: 15px;
          border-radius: 4px;
          display: none;
        }
        .status.success {
          background: #e7f7e7;
          border: 1px solid #c3e6c3;
          color: #2c7c2c;
        }
        .status.error {
          background: #f8e7e7;
          border: 1px solid #e6c3c3;
          color: #7c2c2c;
        }
        .loader {
          display: none;
          border: 3px solid #f3f3f3;
          border-radius: 50%;
          border-top: 3px solid #2a5298;
          width: 20px;
          height: 20px;
          margin-left: 10px;
          animation: spin 2s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .flex {
          display: flex;
          align-items: center;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Make AI Outbound Call</h1>
        <form id="callForm">
          <div class="form-group">
            <label for="to_number">Recipient Number (with country code):</label>
            <input type="text" id="to_number" name="to_number" placeholder="+1XXXXXXXXXX" required>
          </div>
          <div class="form-group">
            <label for="from_number">Your Plivo Number (with country code):</label>
            <input type="text" id="from_number" name="from_number" value="+91 22 3104 3772" readonly>
          </div>
          <div class="flex">
            <button type="submit">Make Call</button>
            <div class="loader" id="loader"></div>
          </div>
        </form>
        <div id="statusMessage" class="status"></div>
        <div id="response" class="response"></div>
      </div>

      <script>
        document.getElementById('callForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          
          // Show loader
          const loader = document.getElementById('loader');
          loader.style.display = 'block';
          
          // Hide previous response and status
          document.getElementById('response').style.display = 'none';
          document.getElementById('statusMessage').style.display = 'none';
          
          const toNumber = document.getElementById('to_number').value;
          const fromNumber = document.getElementById('from_number').value.replace(/\\s/g, ''); // Remove spaces
          
          try {
            const response = await fetch('/make-outbound-call', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ to_number: toNumber, from_number: fromNumber })
            });
            
            const result = await response.json();
            
            // Hide loader
            loader.style.display = 'none';
            
            // Show response
            const responseDiv = document.getElementById('response');
            responseDiv.style.display = 'block';
            responseDiv.innerHTML = '<pre>' + JSON.stringify(result, null, 2) + '</pre>';
            
            // Show status message
            const statusDiv = document.getElementById('statusMessage');
            statusDiv.style.display = 'block';
            
            if (result.success) {
              statusDiv.className = 'status success';
              statusDiv.innerText = 'Call initiated successfully!';
            } else {
              statusDiv.className = 'status error';
              statusDiv.innerText = 'Error: ' + result.error;
            }
          } catch (error) {
            // Hide loader
            loader.style.display = 'none';
            
            // Show error message
            const statusDiv = document.getElementById('statusMessage');
            statusDiv.style.display = 'block';
            statusDiv.className = 'status error';
            statusDiv.innerText = 'An error occurred while making the request.';
            
            console.error('Error:', error);
          }
        });
      </script>
    </body>
    </html>
  `);
});

// Endpoint to initiate an outbound call
app.post('/make-outbound-call', async (req, res) => {
  try {
    const { to_number, from_number } = req.body;
    
    // Validate phone numbers
    if (!to_number || !from_number) {
      return res.status(400).json({
        success: false,
        error: 'Both to_number and from_number are required'
      });
    }
    
    // Remove any spaces in phone numbers
    const cleanToNumber = to_number.replace(/\s/g, '');
    const cleanFromNumber = from_number.replace(/\s/g, '');
    
    safeLog(`Initiating call from ${cleanFromNumber} to ${cleanToNumber}`, 'calls');

    // Step 1: Register the outbound call with Retell AI
    const phoneCallResponse = await registerOutboundCall(cleanFromNumber, cleanToNumber);

    safeLog('Retell call registered: ' + JSON.stringify(phoneCallResponse), 'calls');

    // Step 2: Set up the webhook URLs for Plivo
    const serverUrl = process.env.SERVER_URL || `https://${req.headers.host}`;
    const answerUrl = `${serverUrl}/answer?call_id=${phoneCallResponse.call_id}`;
    const hangupUrl = `${serverUrl}/hangup`;
    
    safeLog(`Using server URL: ${serverUrl}`, 'calls');
    safeLog(`Using answer URL: ${answerUrl}`, 'calls');
    
    // Step 3: Create the outbound call using Plivo
    const response = await plivoClient.calls.create(
      cleanFromNumber,         // Caller ID (your Plivo number)
      cleanToNumber,           // Recipient's number
      answerUrl,               // URL that Plivo will call when the call is answered
      {
        answerMethod: 'POST',                 // HTTP method for answer_url
        hangupUrl: hangupUrl,                 // URL to notify when call ends
        hangupMethod: 'POST',                 // HTTP method for hangup_url
        ringTimeout: 30                       // Ring timeout in seconds
      }
    );

    safeLog('Plivo call initiated: ' + JSON.stringify(response), 'calls');

    // Log the call details
    const callLog = {
      timestamp: new Date().toISOString(),
      plivo_call_uuid: response.requestUuid,
      retell_call_id: phoneCallResponse.call_id,
      from: cleanFromNumber,
      to: cleanToNumber
    };
    
    safeLog(callLog, 'calls');

    // Return successful response with call details
    res.json({ 
      success: true, 
      call_uuid: response.requestUuid,
      retell_call_id: phoneCallResponse.call_id 
    });

  } catch (error) {
    safeLog(`Error initiating call: ${error.message}`, 'errors');
    if (error.stack) {
      safeLog(error.stack, 'errors');
    }
    
    // Handle different types of errors
    let errorMessage = error.message;
    
    // Retell API specific errors
    if (error.response && error.response.data) {
      errorMessage = `Retell API Error: ${error.response.data.message || error.message}`;
    }
    
    // Plivo API specific errors
    if (error.apiId && error.error) {
      errorMessage = `Plivo API Error: ${error.error}`;
    }
    
    res.status(500).json({ 
      success: false, 
      error: errorMessage
    });
  }
});

// Answer webhook - called when the call is answered
app.post('/answer', (req, res) => {
  try {
    const call_id = req.query.call_id;
    safeLog(`Call answered. Call ID: ${call_id}`, 'webhooks');
    safeLog(`Request body from Plivo: ${JSON.stringify(req.body)}`, 'webhooks');
    
    // Create a Plivo XML response
    const plivoResponse = plivo.Response();
    
    // Check if we have a valid call_id
    if (!call_id) {
      safeLog('No call_id provided in answer webhook', 'errors');
      plivoResponse.addSpeak('Error: No call identifier found.');
      res.set('Content-Type', 'text/xml');
      return res.send(plivoResponse.toXML());
    }
    
    // Add a brief welcome message (optional)
    plivoResponse.addSpeak('Connecting you now.');
    
    // Set up the dial to connect to Retell's SIP endpoint
    const serverUrl = process.env.SERVER_URL || `https://${req.headers.host}`;
    const dial = plivoResponse.addDial({
      callerId: req.body.From,    // Use the original caller ID
      timeLimit: 3600,            // 1 hour max call duration (adjust as needed)
      action: `${serverUrl}/dial-status`,  // Webhook for dial status updates
      method: 'POST'
    });
    
    // The critical part: Add SIP endpoint with the Retell call_id
    dial.addSipEndpoint(`sip:${call_id}@sip.usw2.vocode.retellai.com`);
    
    // Convert to XML and send response to Plivo
    const xmlResponse = plivoResponse.toXML();
    safeLog(`Responding with XML: ${xmlResponse}`, 'webhooks');
    
    res.set('Content-Type', 'text/xml');
    res.send(xmlResponse);
  } catch (error) {
    safeLog(`Error in answer webhook: ${error.message}`, 'errors');
    if (error.stack) {
      safeLog(error.stack, 'errors');
    }
    
    // Create a basic error response
    const errorResponse = plivo.Response();
    errorResponse.addSpeak('An error occurred. Please try again later.');
    
    res.set('Content-Type', 'text/xml');
    res.send(errorResponse.toXML());
  }
});

// Dial status webhook - handles dial status events
app.post('/dial-status', (req, res) => {
  safeLog(`Dial status update: ${JSON.stringify(req.body)}`, 'webhooks');
  
  // Create a simple response
  const response = plivo.Response();
  
  // Check if the dial failed
  if (req.body.DialStatus !== 'completed') {
    response.addSpeak('The call could not be completed. Goodbye.');
    response.addHangup();
  } else {
    // Call completed normally
    response.addHangup();
  }
  
  res.set('Content-Type', 'text/xml');
  res.send(response.toXML());
});

// Hangup webhook - called when the call ends
app.post('/hangup', (req, res) => {
  safeLog(`Call hung up: ${JSON.stringify(req.body)}`, 'webhooks');
  
  // Log call details 
  const callUUID = req.body.CallUUID;
  const billDuration = req.body.BillDuration;
  const hangupCause = req.body.HangupCause;
  
  safeLog(`Call ${callUUID} ended. Duration: ${billDuration}s, Reason: ${hangupCause}`, 'calls');
  
  // Send an empty response
  res.status(200).send('');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: {
      node: process.version,
      host: req.headers.host
    }
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  safeLog(`Server running on port ${PORT}`, 'server');
  safeLog(`Health check: http://localhost:${PORT}/health`, 'server');
  safeLog(`Web interface: http://localhost:${PORT}/`, 'server');
});

