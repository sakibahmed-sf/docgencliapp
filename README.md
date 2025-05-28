# DocGen CLI App

A command-line and browser-based authentication tool for interacting with DocGen APIs using the Model Context Protocol (MCP). This app provides a secure login flow via PKCE, then enables interactive querying of DocGen resources using a local MCP server and client.

## Features

- **OAuth2 PKCE Login**: Secure browser-based authentication with ShareFile/DocGen.
- **HTTPS Express Server**: Serves the login page and handles OAuth2 callbacks.
- **MCP Server & Client**: Communicates with DocGen APIs using the Model Context Protocol.
- **Interactive CLI**: Query DocGen templates and data sources after authentication.
- **Logging**: All server logs are written to `logs/server.log`.

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- SSL certificates in `certs/cert.pem` and `certs/key.pem`

### Installation

```sh
npm install
```

### Build and Start MCP Server

```sh
npm run build:start:mcp_server
```

### Start the MCP Client

```sh
npm start
```

### Alternately, you can also Start the Docgen Cli App

```sh
npm link

docgen start
```

### After starting the MCP Client

1. Login into the ShareFile subdomain
2. After successful login, you can enter the query (for Example 'Get all the document templates')
