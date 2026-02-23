import { UIProvider } from '@ton/blueprint';

export function envOrDefault(name: string, fallback: string): string {
    const raw = process.env[name];
    return raw && raw.trim().length > 0 ? raw.trim() : fallback;
}

function envPositiveInt(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw || raw.trim().length === 0) {
        return fallback;
    }

    const value = Number(raw.trim());
    if (!Number.isFinite(value) || value <= 0) {
        return fallback;
    }
    return Math.floor(value);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
        normalized.includes('status code 500') ||
        normalized.includes('status code 429') ||
        normalized.includes('lite_server_notready') ||
        normalized.includes('rate limit') ||
        normalized.includes('out of sync') ||
        normalized.includes('timeout')
    );
}

export async function sendWithRetry(ui: UIProvider, actionName: string, action: () => Promise<void>): Promise<void> {
    const maxAttempts = envPositiveInt('MVP_SEND_RETRIES', 3);
    const delayMs = envPositiveInt('MVP_SEND_RETRY_DELAY_MS', 2500);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            if (maxAttempts > 1) {
                ui.write(`${actionName}: attempt ${attempt}/${maxAttempts}...`);
            }
            await action();
            return;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const canRetry = attempt < maxAttempts && isRetryableError(message);
            if (!canRetry) {
                throw error;
            }
            ui.write(`${actionName}: transient RPC error (${message}). Retrying in ${delayMs}ms...`);
            await sleep(delayMs);
        }
    }
}
