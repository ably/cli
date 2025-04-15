import WebSocket from 'ws';

const WEBSOCKET_URL = 'ws://localhost:8080'; // Or use 127.0.0.1 if server is bound there

// Replace with your actual credentials or use dummy ones for testing
const DUMMY_API_KEY = process.env.ABLY_API_KEY || 'replace-with-real-or-dummy-key';
const DUMMY_ACCESS_TOKEN = process.env.ABLY_ACCESS_TOKEN || 'replace-with-real-or-dummy-token';

console.log(`Attempting to connect to ${WEBSOCKET_URL}...`);

const ws = new WebSocket(WEBSOCKET_URL);

ws.on('open', () => {
    console.log('Client: WebSocket Connected!');

    // Send authentication message
    const authMessage = JSON.stringify({
        accessToken: DUMMY_ACCESS_TOKEN,
        apiKey: DUMMY_API_KEY,
        type: 'auth'
    });
    console.log('Client: Sending auth:', authMessage);
    ws.send(authMessage);

    // No need for stty raw in exec mode, shell should be interactive

    // Send test commands
    setTimeout(() => {
        const testCommand1 = 'pwd\n'; 
        console.log(`Client: Sending command: ${testCommand1.trim()}`);
        ws.send(testCommand1);
    }, 2000);

    setTimeout(() => {
        const testCommand2 = 'echo "Hello via Exec - $(date)"\n';
        console.log(`Client: Sending command: ${testCommand2.trim()}`);
        ws.send(testCommand2);
    }, 4000);

    setTimeout(() => {
        const testCommand3 = 'ls -a /usr/src/app\n';
        console.log(`Client: Sending command: ${testCommand3.trim()}`);
        ws.send(testCommand3);
    }, 6000); 

    setTimeout(() => {
        const testCommand4 = 'exit\n'; // Try exiting the exec'd shell
        console.log(`Client: Sending command: ${testCommand4.trim()}`);
        ws.send(testCommand4);
    }, 8000);

    // Keep a reasonably long timeout for observation
    setTimeout(() => {
        console.log('Client: Closing connection after test timeout.');
        ws.close();
    }, 15_000); // 15 seconds
});

ws.on('message', (data) => {
    console.log('Client: Received <= Server:');
    const text = data.toString();
    const escapedText = text.replaceAll('\r', '\\r').replaceAll('\n', '\\n');
    console.log(escapedText);
    process.stdout.write(text); // Write normally too
});

ws.on('close', (code, reason) => {
     console.log(`\nClient: WebSocket Closed. Code: ${code}, Reason: ${reason.toString()}`);
});

ws.on('error', (error) => {
    console.error('Client: WebSocket Error:', error);
}); 