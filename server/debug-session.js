import WebSocket from 'ws';

console.log('Testing session creation...');

const ws = new WebSocket('ws://localhost:8080');

ws.on('open', () => {
  console.log('✓ WebSocket connected');
  
  // Test anonymous session with dummy API key
  console.log('Sending anonymous auth request with dummy API key...');
  ws.send(JSON.stringify({
    type: 'auth',
    apiKey: 'dummy.anonymous:key_for_anonymous_session',
    sessionId: `debug-anonymous-${Date.now()}`
  }));
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log('Received message:', JSON.stringify(message, null, 2));
    
    if (message.type === 'auth_response') {
      console.log('Auth response received:', message.success ? 'SUCCESS' : 'FAILED');
      if (message.message) {
        console.log('Message:', message.message);
      }
      
      // Close after receiving response
      setTimeout(() => {
        ws.close();
      }, 1000);
    }
  } catch (error) {
    console.log('Parse error:', error.message);
  }
});

ws.on('error', (error) => {
  console.log('✗ WebSocket error:', error.message);
});

ws.on('close', (code) => {
  console.log('Connection closed with code:', code);
  process.exit(0);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.log('Timeout - closing connection');
  ws.close();
  process.exit(1);
}, 10_000); 