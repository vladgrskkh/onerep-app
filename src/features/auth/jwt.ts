export function decodeJwtPayload(token: string): { user_id?: string } | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) {
      return null;
    }
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(globalThis.atob(padded)) as { user_id?: string };
  } catch {
    return null;
  }
}
