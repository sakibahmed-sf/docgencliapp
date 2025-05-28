import * as pk from "js-pkce";
const port = 3000;

const PKCE = pk.default.default;

const BaseUri = `https://localhost:${port}`;

const appSettings = {
  Authority: {
    Uri: "https://auth.sharefiletest.io",
    TokenUriSuffix: "/connect/token",
    AuthorizeUriSuffix: "/connect/authorize",
    ClientId: "ShareFileWordAddInClient",
    Scope: "wordaddinbff:api.full",
  },

  BaseUri: BaseUri,
};

const values = {
  client_id: `${appSettings.Authority.ClientId}`,
  redirect_uri: `${appSettings.BaseUri}/login.html`,
  authorization_endpoint: `${appSettings.Authority.Uri}${appSettings.Authority.AuthorizeUriSuffix}`,
  token_endpoint: `${appSettings.Authority.Uri}${appSettings.Authority.TokenUriSuffix}`,
  requested_scopes: `${appSettings.Authority.Scope}`,
};

function handleRedirect() {
  const pkce = new PKCE({
    client_id: `${appSettings.Authority.ClientId}`,
    redirect_uri: `${appSettings.BaseUri}/login.html`,
    authorization_endpoint: `${appSettings.Authority.Uri}${appSettings.Authority.AuthorizeUriSuffix}`,
    token_endpoint: `${appSettings.Authority.Uri}${appSettings.Authority.TokenUriSuffix}`,
    requested_scopes: `${appSettings.Authority.Scope}`,
  });

  const url = window.location.href;

  if (url.includes("code")) {
    pkce.exchangeForAccessToken(url).then((resp) => {
      const token = resp.access_token;

      console.log("token", token);
      fetch("/callback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      })
        .then((response) => response.json())
        .then((data) => {
          console.log("Success:", data);
          document.getElementById("message").innerText =
            "Login successful! You can close this window now.";
          window.close();
        })
        .catch((error) => {
          console.error("Error:", error);
        });
    });
  } else {
    window.location.href = pkce.authorizeUrl();
  }
}

handleRedirect();
