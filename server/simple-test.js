import WebSocket from 'ws';

console.log('Testing simple session creation...');

async function testSession(sessionType, credentials) {
  return new Promise((resolve) => {
    console.log(`\n--- Testing ${sessionType} session ---`);
    const ws = new WebSocket('ws://localhost:8080');
    let result = { type: sessionType, success: false, error: null };
    
    const timeout = setTimeout(() => {
      ws.terminate();
      result.error = 'timeout';
      resolve(result);
    }, 10000);

    ws.on('open', () => {
      console.log(`${sessionType}: WebSocket connected`);
      ws.send(JSON.stringify({
        type: 'auth',
        ...credentials,
        sessionId: `test-${sessionType}-${Date.now()}`
      }));
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log(`${sessionType}: Received:`, message);
        
        if (message.type === 'auth_response') {
          clearTimeout(timeout);
          result.success = message.success !== false;
          result.message = message.message;
          ws.close();
          resolve(result);
        }

        if (message.type === 'hello') {
          clearTimeout(timeout);
          result.success = true;
          result.sessionId = message.sessionId;
          ws.close();
          resolve(result);
        }
      } catch (error) {
        console.log(`${sessionType}: Parse error:`, error.message);
        clearTimeout(timeout);
        result.error = 'parse_error';
        ws.close();
        resolve(result);
      }
    });

    ws.on('error', (error) => {
      console.log(`${sessionType}: WebSocket error:`, error.message);
      clearTimeout(timeout);
      result.error = error.message;
      resolve(result);
    });

    ws.on('close', (code) => {
      console.log(`${sessionType}: Connection closed with code:`, code);
      clearTimeout(timeout);
      if (!result.success && !result.error) {
        result.error = `closed_${code}`;
      }
      resolve(result);
    });
  });
}

async function runTests() {
  // Test anonymous session (with dummy API key)
  const anonymousResult = await testSession('anonymous', {
    apiKey: 'dummy.anonymous:key_for_testing'
  });
  
  // Test authenticated session (with access token)
  const authenticatedResult = await testSession('authenticated', {
    apiKey: 'test.dummy:key_for_testing',
    accessToken: 'dummy_access_token_for_testing'
  });
  
  console.log('\n=== RESULTS ===');
  console.log('Anonymous session:', anonymousResult);
  console.log('Authenticated session:', authenticatedResult);
  
  process.exit(0);
}

runTests().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
}); 