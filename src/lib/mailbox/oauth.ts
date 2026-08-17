import { type NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { createServerSupabase } from '@/lib/supabase/server';
import type { MailboxProvider } from '@/lib/supabase/types';
import {
  getGoogleOAuthConfig,
  getMicrosoftOAuthConfig,
  getRedirectUri,
} from './config';
import { MailboxError } from './errors';

const GMAIL_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.send',
].join(' ');
const OUTLOOK_SCOPES = 'offline_access Mail.Send User.Read';

type OAuthTokens = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

export async function handleMailboxOAuth(
  request: NextRequest,
  provider: MailboxProvider,
): Promise<Response> {
  try {
    const code = request.nextUrl.searchParams.get('code');
    const oauthError = request.nextUrl.searchParams.get('error');

    if (code || oauthError) {
      return handleCallback(request, provider, code, oauthError);
    }
    return startOAuth(request, provider);
  } catch (error) {
    console.error(`[mailbox:${provider}] OAuth failed`, error);
    const code = error instanceof MailboxError && error.code === 'configuration'
      ? 'provider_not_configured'
      : 'unexpected';
    return settingsRedirect(request, code);
  }
}

async function startOAuth(request: NextRequest, provider: MailboxProvider): Promise<Response> {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.url));

  const state = crypto.randomUUID();
  const redirectUri = getRedirectUri(provider, request.nextUrl.origin);
  let authUrl: URL;

  if (provider === 'gmail') {
    const config = getGoogleOAuthConfig();
    authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', config.clientId);
    authUrl.searchParams.set('scope', GMAIL_SCOPES);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('include_granted_scopes', 'true');
  } else {
    const config = getMicrosoftOAuthConfig();
    authUrl = new URL(
      `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize`,
    );
    authUrl.searchParams.set('client_id', config.clientId);
    authUrl.searchParams.set('scope', OUTLOOK_SCOPES);
  }

  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(stateCookieName(provider), state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 10 * 60,
    path: `/api/mailbox/connect/${provider}`,
  });
  return response;
}

async function handleCallback(
  request: NextRequest,
  provider: MailboxProvider,
  code: string | null,
  oauthError: string | null,
): Promise<Response> {
  if (oauthError || !code) return settingsRedirect(request, 'access_denied', provider);

  const expectedState = request.cookies.get(stateCookieName(provider))?.value;
  const returnedState = request.nextUrl.searchParams.get('state');
  if (!expectedState || expectedState !== returnedState) {
    return settingsRedirect(request, 'invalid_state', provider);
  }

  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.url));

  const redirectUri = getRedirectUri(provider, request.nextUrl.origin);
  const tokenResponse = await exchangeCode(provider, code, redirectUri);
  if (!tokenResponse.ok) {
    console.error(`[mailbox:${provider}] token exchange failed`, tokenResponse.status);
    return settingsRedirect(request, 'token_exchange_failed', provider);
  }

  const tokens = (await tokenResponse.json()) as OAuthTokens;
  if (!tokens.access_token || !tokens.refresh_token || !tokens.expires_in) {
    return settingsRedirect(request, 'no_refresh_token', provider);
  }

  const emailAddress = await fetchMailboxAddress(provider, tokens.access_token);
  if (!emailAddress) return settingsRedirect(request, 'profile_failed', provider);

  const now = new Date().toISOString();
  const { error } = await createAdminSupabase()
    .from('mailbox_connections')
    .upsert(
      {
        user_id: user.id,
        provider,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        email_address: emailAddress,
        token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        status: 'connected',
        connected_at: now,
        updated_at: now,
      },
      { onConflict: 'user_id' },
    );

  if (error) {
    console.error(`[mailbox:${provider}] connection save failed`, error.message);
    return settingsRedirect(request, 'db_error', provider);
  }

  return settingsRedirect(request, null, provider, true);
}

async function exchangeCode(
  provider: MailboxProvider,
  code: string,
  redirectUri: string,
): Promise<Response> {
  if (provider === 'gmail') {
    const config = getGoogleOAuthConfig();
    return fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });
  }

  const config = getMicrosoftOAuthConfig();
  return fetch(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      scope: OUTLOOK_SCOPES,
    }).toString(),
  });
}

async function fetchMailboxAddress(
  provider: MailboxProvider,
  accessToken: string,
): Promise<string | null> {
  const url = provider === 'gmail'
    ? 'https://openidconnect.googleapis.com/v1/userinfo'
    : 'https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName';
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    console.error(`[mailbox:${provider}] profile request failed`, response.status);
    return null;
  }

  if (provider === 'gmail') {
    const profile = (await response.json()) as { email?: string };
    return profile.email?.trim() || null;
  }

  const profile = (await response.json()) as { mail?: string; userPrincipalName?: string };
  return profile.mail?.trim() || profile.userPrincipalName?.trim() || null;
}

async function getAuthenticatedUser() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

function settingsRedirect(
  request: NextRequest,
  error: string | null,
  provider?: MailboxProvider,
  connected = false,
): NextResponse {
  const url = new URL('/instellingen', request.url);
  if (error) url.searchParams.set('mailbox_error', error);
  if (connected) url.searchParams.set('mailbox', 'connected');
  const response = NextResponse.redirect(url);
  if (provider) clearStateCookie(response, provider);
  return response;
}

function stateCookieName(provider: MailboxProvider): string {
  return `oauth_state_${provider}`;
}

function clearStateCookie(response: NextResponse, provider: MailboxProvider): void {
  response.cookies.set(stateCookieName(provider), '', {
    maxAge: 0,
    path: `/api/mailbox/connect/${provider}`,
  });
}
