import { authService } from '../../lib/api/auth-service';
import { CredentialsForm } from './credentials-form';

export const SignInPage = () => (
  <CredentialsForm mode="sign-in" submit={(credentials) => authService.signIn(credentials)} />
);

export const SignUpPage = () => (
  <CredentialsForm mode="sign-up" submit={(credentials) => authService.signUp(credentials)} />
);
