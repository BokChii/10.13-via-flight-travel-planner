// scripts/auth0-config.js
// Auth0 설정 정보
// TODO: Auth0 대시보드에서 실제 값으로 교체하세요

export const auth0Config = {
  domain: 'viaflight.us.auth0.com',
  clientId: 'VYx0LkWehNwCPwtDPStdQNYflFluTsdY',
  authorizationParams: {
    redirect_uri: window.location.origin,
    audience: undefined, // API 사용 시 설정
    scope: 'openid profile email'
  },
  // connection은 loginWithRedirect에서만 지정
  useRefreshTokens: true,
  cacheLocation: 'localstorage'
};

