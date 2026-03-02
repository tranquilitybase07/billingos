import {
  maskApiKey,
  maskEmail,
  sanitizeErrorMessage,
  generateRequestId,
  sanitizeError,
  sanitizeRequest,
} from './security.utils';

describe('Security Utils', () => {
  describe('maskApiKey', () => {
    it('should mask valid API keys', () => {
      const key = 'sk_test_abcdefghijklmnopqrstuvwxyz';
      const masked = maskApiKey(key);
      expect(masked).toBe('sk_test...wxyz');
    });

    it('should handle null/undefined keys', () => {
      expect(maskApiKey(null)).toBe('no-key-provided');
      expect(maskApiKey(undefined)).toBe('no-key-provided');
      expect(maskApiKey('')).toBe('no-key-provided');
    });

    it('should not mask short keys', () => {
      expect(maskApiKey('short')).toBe('invalid-key-format');
      expect(maskApiKey('sk_test_abc')).toBe('invalid-key-format');
    });

    it('should mask different key types', () => {
      expect(maskApiKey('pk_test_1234567890abcdef')).toBe('pk_test...cdef');
      expect(maskApiKey('sk_live_1234567890abcdef')).toBe('sk_live...cdef');
    });
  });

  describe('maskEmail', () => {
    it('should mask valid emails', () => {
      expect(maskEmail('john.doe@example.com')).toBe('jo***@example.com');
      expect(maskEmail('a@test.com')).toBe('***@test.com');
    });

    it('should handle invalid emails', () => {
      expect(maskEmail(null)).toBe('no-email');
      expect(maskEmail('')).toBe('no-email');
      expect(maskEmail('not-an-email')).toBe('invalid-email');
    });
  });

  describe('sanitizeErrorMessage', () => {
    it('should remove API keys from error messages', () => {
      const sanitized = sanitizeErrorMessage(
        'Invalid key: sk_test_abcdefghijklmnopqrstuvwxyz',
      );
      expect(sanitized).not.toContain('sk_test_abcdefghijklmnopqrstuvwxyz');
      expect(sanitized).toContain('sk_test...wxyz');
    });

    it('should remove passwords from error messages', () => {
      const sanitized = sanitizeErrorMessage(
        'Login failed for user with password: MySecret123!',
      );
      expect(sanitized).not.toContain('MySecret123');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should remove emails from error messages', () => {
      const sanitized = sanitizeErrorMessage(
        'User john.doe@example.com not found',
      );
      expect(sanitized).not.toContain('john.doe@example.com');
      expect(sanitized).toContain('jo***@example.com');
    });

    it('should handle empty/null messages', () => {
      expect(sanitizeErrorMessage('')).toBe('Unknown error');
      expect(sanitizeErrorMessage(null as any)).toBe('Unknown error');
    });
  });

  describe('sanitizeError', () => {
    it('should remove connection strings', () => {
      const error = new Error(
        'Connection failed: postgres://user:pass@localhost:5432/db',
      );
      const sanitized = sanitizeError(error);
      expect(sanitized).toContain('[CONNECTION_STRING_REDACTED]');
      expect(sanitized).not.toContain('postgres://');
    });

    it('should remove IP addresses', () => {
      const error = new Error('Connection refused at 192.168.1.1');
      const sanitized = sanitizeError(error);
      expect(sanitized).toContain('[IP_REDACTED]');
      expect(sanitized).not.toContain('192.168.1.1');
    });
  });

  describe('sanitizeRequest', () => {
    it('should redact sensitive fields', () => {
      const data = {
        name: 'John',
        password: 'secret123',
        api_key: 'sk_test_abc',
        authorization: 'Bearer xyz',
      };
      const sanitized = sanitizeRequest(data);
      expect(sanitized.name).toBe('John');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.api_key).toBe('[REDACTED]');
      expect(sanitized.authorization).toBe('[REDACTED]');
    });

    it('should not modify the original object', () => {
      const data = { password: 'secret' };
      sanitizeRequest(data);
      expect(data.password).toBe('secret');
    });
  });

  describe('generateRequestId', () => {
    it('should generate unique request IDs', () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();

      expect(id1).toMatch(/^req_[a-z0-9]+_[a-z0-9]+$/);
      expect(id2).toMatch(/^req_[a-z0-9]+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    it('should include timestamp component', () => {
      const id = generateRequestId();
      const parts = id.split('_');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe('req');
    });
  });
});
