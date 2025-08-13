# DocGen CLI App

A secure, enterprise-ready command-line and browser-based authentication tool for interacting with DocGen APIs using the Model Context Protocol (MCP). This application provides a complete authentication flow and interactive API querying system.

## ✨ Features

- **🔐 OAuth2 PKCE Authentication**: Secure browser-based login with ShareFile/DocGen
- **🛡️ Enhanced Security**: Input validation, path sanitization, and HTTPS enforcement
- **🌐 HTTPS Express Server**: Serves login pages and handles OAuth2 callbacks with security headers
- **🔧 MCP Server & Client**: Model Context Protocol implementation for DocGen API interaction
- **💬 Interactive CLI**: Natural language querying with Ollama integration
- **📊 Comprehensive Logging**: Structured logging with rotation and multiple levels
- **⚙️ Configuration Management**: Environment-based configuration with validation
- **🚀 Production Ready**: Error handling, graceful shutdowns, and monitoring

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Browser       │    │   HTTPS Server  │    │   MCP Server    │
│   (OAuth2)      │────│   (Express.js)  │────│   (DocGen API)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                       │
                                │                       │
                       ┌─────────────────┐    ┌─────────────────┐
                       │   File System   │    │   MCP Client    │
                       │   (Token Store) │    │   (Ollama CLI)  │
                       └─────────────────┘    └─────────────────┘
```

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+
- **npm** or **yarn**
- **SSL Certificates** in `certs/` directory
- **Ollama** server running (optional, for natural language queries)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd docgencliapp

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit configuration as needed
nano .env
```

### SSL Certificate Setup

Place your SSL certificates in the `certs/` directory:

```
certs/
├── cert.pem    # SSL certificate
└── key.pem     # Private key
```

For development, you can generate self-signed certificates:

```bash
mkdir -p certs
openssl req -x509 -newkey rsa:4096 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes
```

## 🏃‍♂️ Usage

### Quick Start

```bash
# Build and start the complete application
npm start
```

This command will:

1. Build the TypeScript source code
2. Start the HTTPS authentication server
3. Open your browser to the login page
4. Launch the MCP client after authentication

### Individual Components

```bash
# Build only
npm run build

# Start MCP server only
npm run build:start:mcp_server

# Start MCP client only
npm run start:mcp_client

# Start HTTPS server only
npm run start:server
```

### CLI Commands

```bash
# Start the complete application flow (recommended)
docgen start

# Start authentication server only
docgen auth

# Start interactive chat interface only
docgen chat

# Start MCP server only  
docgen server

# Show help
docgen --help
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
