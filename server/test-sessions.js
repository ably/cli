import WebSocket from 'ws';

console.log('Testing session creation with detailed logging...');

async function createSession(sessionType, credentials, index) {
  return new Promise((resolve) => {
    console.log(`\n[${index}] Creating ${sessionType} session...`);
    const ws = new WebSocket('ws://localhost:8080');
    let sessionCreated = false;
    let result = { type: sessionType, index, success: false, error: null };
    
    const timeout = setTimeout(() => {
      if (!sessionCreated) {
        console.log(`[${index}] Timeout waiting for session creation`);
        ws.terminate();
        result.error = 'timeout';
        resolve(result);
      }
    }, 15000);

    ws.on('open', () => {
      console.log(`[${index}] WebSocket connected, sending auth...`);
      ws.send(JSON.stringify({
        type: 'auth',
        ...credentials,
        sessionId: `test-${sessionType}-${index}-${Date.now()}`
      }));
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log(`[${index}] Received:`, message.type, message.payload || message.sessionId || '');
        
        if (message.type === 'hello') {
          clearTimeout(timeout);
          sessionCreated = true;
          result.success = true;
          result.sessionId = message.sessionId;
          
          // Keep connection open briefly to maintain session count
          setTimeout(() => {
            console.log(`[${index}] Closing session after success`);
            ws.close();
            resolve(result);
          }, 1000);
        }
      } catch (error) {
        console.log(`[${index}] Parse error:`, error.message);
        clearTimeout(timeout);
        result.error = 'parse_error';
        ws.close();
        resolve(result);
      }
    });

    ws.on('error', (error) => {
      console.log(`[${index}] WebSocket error:`, error.message);
      clearTimeout(timeout);
      result.error = error.message;
      resolve(result);
    });

    ws.on('close', (code) => {
      console.log(`[${index}] Connection closed with code:`, code);
      clearTimeout(timeout);
      if (!sessionCreated && !result.error) {
        result.error = `closed_${code}`;
      }
      resolve(result);
    });
  });
}

async function testSessionLimits() {
  console.log('Testing session limits...');
  
  // Test creating 5 anonymous sessions
  const anonymousPromises = [];
  for (let i = 0; i < 5; i++) {
    anonymousPromises.push(createSession('anonymous', {
      apiKey: 'dummy.anonymous:key_for_testing'
    }, i));
    
    // Small delay between session attempts
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  const anonymousResults = await Promise.all(anonymousPromises);
  
  console.log('\n=== ANONYMOUS SESSION RESULTS ===');
  anonymousResults.forEach(result => {
    console.log(`Session ${result.index}: ${result.success ? 'SUCCESS' : 'FAILED'} (${result.error || 'OK'})`);
  });
  
  const successfulAnonymous = anonymousResults.filter(r => r.success).length;
  console.log(`\nAnonymous sessions created: ${successfulAnonymous}/5`);
  
  // Wait a bit before testing authenticated sessions
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test creating 5 authenticated sessions
  const authenticatedPromises = [];
  for (let i = 0; i < 5; i++) {
    authenticatedPromises.push(createSession('authenticated', {
      apiKey: 'test.dummy:key_for_testing',
      accessToken: 'dummy_access_token_for_testing'
    }, i));
    
    // Small delay between session attempts
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  const authenticatedResults = await Promise.all(authenticatedPromises);
  
  console.log('\n=== AUTHENTICATED SESSION RESULTS ===');
  authenticatedResults.forEach(result => {
    console.log(`Session ${result.index}: ${result.success ? 'SUCCESS' : 'FAILED'} (${result.error || 'OK'})`);
  });
  
  const successfulAuthenticated = authenticatedResults.filter(r => r.success).length;
  console.log(`\nAuthenticated sessions created: ${successfulAuthenticated}/5`);
  
  console.log('\n=== SUMMARY ===');
  console.log(`Anonymous sessions: ${successfulAnonymous}/5`);
  console.log(`Authenticated sessions: ${successfulAuthenticated}/5`);
  
  process.exit(0);
}

testSessionLimits().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
}); 