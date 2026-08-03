const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export const createGoogleClient = ({
  config,
  scopes,
  readToken,
  writeToken,
  fetchImpl = fetch,
  now = () => Date.now()
}) => {
  const isConfigured = () => Boolean(config.clientId && config.clientSecret);

  const createAuthUrl = () => {
    const url = new URL(AUTH_URL);
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", config.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("scope", scopes.join(" "));
    return url.toString();
  };

  const requestToken = async (body) => {
    const response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    const data = await response.json();
    return { ok: response.ok, status: response.status, data };
  };

  const exchangeAuthorizationCode = async (code) => {
    const result = await requestToken(new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code"
    }));
    if (!result.ok) {
      return result;
    }

    const token = {
      ...result.data,
      expires_at: now() + result.data.expires_in * 1000
    };
    writeToken(token);
    return { ...result, data: token };
  };

  const refreshAccessToken = async (token) => {
    if (!token?.refresh_token) {
      return token;
    }
    if (token.expires_at && now() < token.expires_at - 60_000) {
      return token;
    }

    const result = await requestToken(new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token"
    }));
    if (!result.ok) {
      throw new Error(
        result.data.error_description || result.data.error || "Google token refresh failed"
      );
    }

    const nextToken = {
      ...token,
      ...result.data,
      expires_at: now() + result.data.expires_in * 1000
    };
    writeToken(nextToken);
    return nextToken;
  };

  const fetchJson = async (url) => {
    const token = await refreshAccessToken(readToken());
    if (!token?.access_token) {
      return {
        status: 401,
        data: { connected: false, message: "Google is not connected yet." }
      };
    }

    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token.access_token}` }
    });
    return { status: response.status, data: await response.json() };
  };

  return {
    createAuthUrl,
    exchangeAuthorizationCode,
    fetchJson,
    isConfigured,
    refreshAccessToken
  };
};
