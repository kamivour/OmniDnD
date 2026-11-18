/** The parts of a Supabase auth error the app reads. */
export interface AuthErrorLike {
  message: string;
  code?: string | undefined;
  status?: number | undefined;
}

/**
 * Plain-language text for account server errors. Supabase codes come first; unknown errors keep
 * the server's own message so nothing is hidden.
 */
export function authErrorText(error: AuthErrorLike): string {
  switch (error.code) {
    case 'over_email_send_rate_limit':
      return 'The account server has sent too many emails in the last hour. Try again in about an hour.';
    case 'over_request_rate_limit':
      return 'Too many attempts in a short time. Wait a few minutes, then try again.';
    case 'user_already_exists':
    case 'email_exists':
      return 'An account with this email already exists. Sign in instead, or use Forgot password.';
    case 'invalid_credentials':
      return 'Email or password is not right.';
    case 'email_not_confirmed':
      return 'This account was never confirmed. Open the confirmation email, or ask the app owner to confirm it.';
    case 'email_address_invalid':
      return 'That email address is not accepted. Check it for typos.';
    case 'email_address_not_authorized':
      return 'The account server cannot send email to this address yet. Ask the app owner to set up email.';
    case 'weak_password':
      return `Choose a stronger password. ${error.message}`;
    case 'signup_disabled':
    case 'email_provider_disabled':
      return 'New accounts are turned off right now. Ask the app owner.';
  }
  if (error.status === 429)
    return 'Too many attempts in a short time. Wait a few minutes, then try again.';
  return error.message;
}
