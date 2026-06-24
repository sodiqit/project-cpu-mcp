import { RESPONSE_BODY_SNIPPET_LENGTH } from './constants.js';

/**
 * Reads the body once and parses it as JSON. On a non-JSON body — a down server / proxy error page
 * (`<html>...`), or an empty body — throws a clear, agent-readable error instead of letting a bare
 * `SyntaxError: Unexpected token '<'` surface from `response.json()`.
 */
export async function parseJsonBody<T>(response: Response): Promise<T> {
    const text = await response.text();
    try {
        return JSON.parse(text) as T;
    } catch {
        const contentType = response.headers.get('content-type') ?? 'unknown';
        const snippet = text.trim().replace(/\s+/g, ' ').slice(0, RESPONSE_BODY_SNIPPET_LENGTH);
        throw new Error(
            `The game API returned a non-JSON response (HTTP ${response.status}, content-type "${contentType}"). ` +
                `The server is likely down or unreachable — retry shortly. Body started: ${snippet}`,
        );
    }
}
