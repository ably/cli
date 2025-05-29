export function log(message: string): void {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

export function logError(message: string): void {
    console.error(`[${new Date().toISOString()}] ERROR: ${message}`);
}

/**
 * Secure logging function that accepts structured data and automatically redacts sensitive information
 */
export function logSecure(message: string, data?: Record<string, any>): void {
    const timestamp = new Date().toISOString();
    
    if (data) {
        // Create a sanitized copy of the data for logging
        const sanitizedData = { ...data };
        
        // Remove or redact sensitive fields
        for (const key of Object.keys(sanitizedData)) {
            const lowerKey = key.toLowerCase();
            if (lowerKey.includes('token') || lowerKey.includes('key') || lowerKey.includes('secret') || lowerKey.includes('password') || lowerKey.includes('credential')) {
                sanitizedData[key] = '[REDACTED]';
            }
            // Truncate long hash values to prevent log bloat
            if (lowerKey.includes('hash') && typeof sanitizedData[key] === 'string' && sanitizedData[key].length > 16) {
                sanitizedData[key] = `${sanitizedData[key].slice(0, 8)}...`;
            }
        }
        
        console.log(`[${timestamp}] ${message}`, sanitizedData);
    } else {
        console.log(`[${timestamp}] ${message}`);
    }
} 