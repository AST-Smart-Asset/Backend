import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

/**
 * Validates whether a given string has a valid bcrypt or argon2 hash structure.
 */
export function isHashedPassword(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  // Matches bcrypt ($2a$, $2b$, $2y$) or argon2 ($argon2i$, $argon2d$, $argon2id$)
  const bcryptPattern = /^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$/;
  const argon2Pattern = /^\$argon2(id|i|d)\$v=[0-9]+\$m=[0-9]+,t=[0-9]+,p=[0-9]+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+={0,2}$/;

  return bcryptPattern.test(value) || argon2Pattern.test(value);
}

/**
 * Hash plain text password with strong salt rounds (12).
 */
export async function hashPassword(plainText: string): Promise<string> {
  if (!plainText || plainText.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }
  return bcrypt.hash(plainText, SALT_ROUNDS);
}

/**
 * Compare plain text password against hash.
 */
export async function comparePassword(plainText: string, hash: string): Promise<boolean> {
  if (!isHashedPassword(hash)) {
    throw new Error('Stored password representation is invalid or compromised');
  }
  return bcrypt.compare(plainText, hash);
}
