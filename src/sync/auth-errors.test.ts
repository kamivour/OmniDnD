import { describe, expect, it } from 'vitest';
import { authErrorText } from './auth-errors';

describe('authErrorText', () => {
  it('explains the email rate limit that blocked signups', () => {
    expect(
      authErrorText({
        message: 'email rate limit exceeded',
        code: 'over_email_send_rate_limit',
        status: 429,
      }),
    ).toMatch(/too many emails in the last hour/);
  });

  it('treats any other 429 as a short wait', () => {
    expect(authErrorText({ message: 'Too Many Requests', status: 429 })).toMatch(
      /Wait a few minutes/,
    );
    expect(authErrorText({ message: 'x', code: 'over_request_rate_limit' })).toMatch(
      /Wait a few minutes/,
    );
  });

  it('maps common signup and sign-in mistakes', () => {
    expect(
      authErrorText({ message: 'User already registered', code: 'user_already_exists' }),
    ).toMatch(/already exists/);
    expect(
      authErrorText({ message: 'Invalid login credentials', code: 'invalid_credentials' }),
    ).toBe('Email or password is not right.');
    expect(
      authErrorText({
        message: 'Password should be at least 6 characters.',
        code: 'weak_password',
      }),
    ).toBe('Choose a stronger password. Password should be at least 6 characters.');
  });

  it('keeps unknown server messages', () => {
    expect(
      authErrorText({ message: 'Something new', code: 'unexpected_failure', status: 500 }),
    ).toBe('Something new');
  });
});
