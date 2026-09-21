import { hashPassword, comparePassword, isHashedPassword } from '../src/utils/password';

describe('Security & Authentication Validation', () => {
  test('Rejects passwords shorter than 8 characters', async () => {
    await expect(hashPassword('short')).rejects.toThrow('Password must be at least 8 characters long');
  });

  test('Hashes valid password and verifies hash structure', async () => {
    const raw = 'SuperSecret2026!';
    const hash = await hashPassword(raw);

    expect(isHashedPassword(hash)).toBe(true);
    expect(isHashedPassword('plainTextPassword')).toBe(false);

    const matches = await comparePassword(raw, hash);
    expect(matches).toBe(true);

    const wrongMatches = await comparePassword('WrongPassword!', hash);
    expect(wrongMatches).toBe(false);
  });
});
