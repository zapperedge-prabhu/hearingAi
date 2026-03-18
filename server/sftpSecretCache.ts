import * as crypto from 'crypto';

interface CachedSecret {
  value: string;
  expiresAt: number;
  downloaded: boolean;
  organizationId: number;
  sftpLocalUserId: number;
}

type CacheError = 'TOKEN_NOT_FOUND' | 'TOKEN_EXPIRED' | 'TOKEN_ALREADY_USED';

interface ConsumeSuccess {
  value: string;
}

interface ConsumeError {
  error: CacheError;
}

class SftpSecretCache {
  private cache = new Map<string, CachedSecret>();
  private readonly DEFAULT_TTL_MS = 120_000; // 120 seconds

  store(
    token: string,
    value: string,
    organizationId: number,
    sftpLocalUserId: number,
    ttlMs: number = this.DEFAULT_TTL_MS
  ): void {
    const expiresAt = Date.now() + ttlMs;
    this.cache.set(token, {
      value,
      expiresAt,
      downloaded: false,
      organizationId,
      sftpLocalUserId,
    });
    
    setTimeout(() => {
      this.cache.delete(token);
    }, ttlMs + 1000);
  }

  consume(token: string): ConsumeSuccess | ConsumeError {
    const entry = this.cache.get(token);
    
    if (!entry) {
      return { error: 'TOKEN_NOT_FOUND' };
    }
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(token);
      return { error: 'TOKEN_EXPIRED' };
    }
    
    if (entry.downloaded) {
      return { error: 'TOKEN_ALREADY_USED' };
    }
    
    entry.downloaded = true;
    this.cache.delete(token);
    return { value: entry.value };
  }

  getMetadata(token: string): { organizationId: number; sftpLocalUserId: number } | null {
    const entry = this.cache.get(token);
    if (!entry || Date.now() > entry.expiresAt || entry.downloaded) {
      return null;
    }
    return {
      organizationId: entry.organizationId,
      sftpLocalUserId: entry.sftpLocalUserId,
    };
  }

  generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  getRemainingTtl(token: string): number {
    const entry = this.cache.get(token);
    if (!entry) return 0;
    const remaining = entry.expiresAt - Date.now();
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }

  invalidate(token: string): void {
    this.cache.delete(token);
  }

  invalidateForLocalUser(sftpLocalUserId: number): void {
    const tokensToDelete: string[] = [];
    this.cache.forEach((entry, token) => {
      if (entry.sftpLocalUserId === sftpLocalUserId) {
        tokensToDelete.push(token);
      }
    });
    tokensToDelete.forEach(token => this.cache.delete(token));
  }
}

export const sftpSecretCache = new SftpSecretCache();
