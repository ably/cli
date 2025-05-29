export function log(message: string): void {
    console.log(`[TerminalServer ${new Date().toISOString()}] ${message}`);
}

export function logError(message: unknown): void {
    console.error(`[TerminalServerError ${new Date().toISOString()}] ${message instanceof Error ? message.message : String(message)}`);
    if (message instanceof Error && message.stack) {
        console.error(message.stack);
    }
} 