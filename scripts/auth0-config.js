// scripts/auth0-config.js
// Auth0 설정 정보
// Auth0 대시보드에서 발급받은 도메인과 클라이언트 ID를 사용합니다

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

