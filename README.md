# UpRock Verify - VS Code & Windsurf Extension

Verify website deployments directly from your IDE. Check reachability and performance across 6 continents with real user devices.

**Compatible with:** VS Code, Windsurf (Codeium), Cursor, and other VS Code-based editors.

## Features

- **Global Verification**: Test your site from North America, Europe, Asia, Africa, Oceania, and South America
- **Quick Dev Check**: Fast single-region verification for development
- **Batch Verification**: Verify up to 10 URLs at once (manual entry or from file)
- **Core Web Vitals**: Get LCP, CLS, TTFB, FCP, and more
- **Screenshots**: Visual confirmation of your site's appearance
- **Reachability & Usability Scores**: Comprehensive scoring based on real-world metrics
- **Sidebar Panel**: Interactive sidebar view for easy access to verification tools
- **Status Bar Integration**: Quick status indicator showing API key state and click-to-verify
- **AI Assistant Support**: MCP server for Claude Desktop, Windsurf, Cursor, and VS Code AI integrations

## Getting Started

### VS Code
1. Install the extension from the VS Code Marketplace
2. Get your API key from [UpRock Verify](https://uprockverify.com)
3. Connect your API key using one of these methods:
   - Run `UpRock Verify: Set API Key` from the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
   - Click the **Connect** button in the UpRock Verify sidebar panel
4. Start verifying!

### Windsurf / Cursor
1. Download the `.vsix` file from releases
2. Open Extensions panel
3. Click `...` menu → "Install from VSIX..."
4. Select the downloaded `.vsix` file
5. Connect your API key using one of these methods:
   - Run `UpRock Verify: Set API Key` from the Command Palette
   - Click the **Connect** button in the UpRock Verify sidebar panel
6. Start verifying!

## Commands

| Command | Description | Shortcut |
|---------|-------------|----------|
| `UpRock Verify: Verify URL (Global)` | Full verification across all 6 continents | `Cmd+Shift+V` |
| `UpRock Verify: Quick Dev Check` | Fast single-region check | `Cmd+Shift+D` |
| `UpRock Verify: Verify URL from Selection` | Verify URL under cursor or selection | Right-click menu |
| `UpRock Verify: Batch Verify URLs` | Verify multiple URLs | - |
| `UpRock Verify: Batch Verify from File` | Verify URLs from a text file | - |
| `UpRock Verify: Account Status` | View account info and usage | Click status bar |
| `UpRock Verify: Recent Scans` | View verification history | - |
| `UpRock Verify: Scan History (with Filters)` | Advanced history with filters | - |
| `UpRock Verify: Set API Key` | Configure your API key | - |
| `UpRock Verify: Clear API Key` | Remove stored API key | - |
| `UpRock Verify: Open Settings` | Open extension settings | - |

## Scoring System

### States

| State | Criteria |
|-------|----------|
| 🟢 Perfect | Reachability = 100% AND Usability >= 91% |
| 🟡 Good | Reachability = 100% AND Usability 76-90% |
| 🟠 Degraded | Reachability < 100% OR Usability <= 75% |
| 🔴 Down | Reachability < 60% |

### Web Vitals Thresholds

| Metric | Good | Poor |
|--------|------|------|
| LCP | ≤ 2.5s | > 4s |
| CLS | ≤ 0.1 | > 0.25 |
| TTFB | ≤ 800ms | > 1.8s |
| FCP | ≤ 1.8s | > 3s |

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `uprockVerify.apiBaseUrl` | API server URL | `https://768q7f2qhge7.share.zrok.io` |
| `uprockVerify.defaultRegion` | Default region for quick checks | `NA` |
| `uprockVerify.timeout` | Request timeout (ms) | `180000` |
| `uprockVerify.showNotifications` | Show result notifications | `true` |

## AI Assistant Integration (MCP)

This extension includes a Model Context Protocol (MCP) server that enables AI assistants to verify URLs directly. The MCP server is automatically configured for supported tools.

### Supported AI Tools

- **Claude Desktop** - Auto-configured at `~/Library/Application Support/Claude/claude_desktop_config.json`
- **VS Code** (with MCP support) - Auto-configured at user-level settings
- **Windsurf IDE** - Auto-configured at `~/.codeium/windsurf/mcp_config.json`
- **Cursor IDE** - Auto-configured at `~/.cursor/mcp.json`

### MCP Setup

1. Set your API key via one of these methods:
   - Run `UpRock Verify: Set API Key` from the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
   - Click the **Connect** button in the UpRock Verify sidebar panel
2. The extension automatically configures MCP for detected AI tools
3. Restart your AI assistant to enable the integration
4. Ask your AI assistant to verify URLs using natural language

### MCP Tools Available

| Tool | Description |
|------|-------------|
| `verify_url` | Verify a single URL globally or in a specific region |
| `batch_verify` | Verify multiple URLs at once |
| `get_scan_history` | Retrieve recent verification results |
| `get_account_status` | Check API key status and usage |

### How to Verify MCP is Enabled

To confirm MCP integration is working, check the configuration file for your AI tool:

| AI Tool | Config File Location |
|---------|---------------------|
| **Claude Desktop (macOS)** | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **Claude Desktop (Windows)** | `%APPDATA%\Claude\claude_desktop_config.json` |
| **Windsurf IDE** | `~/.codeium/windsurf/mcp_config.json` |
| **Cursor IDE** | `~/.cursor/mcp.json` |

Open the config file and look for `"uprock-verify"` in the `mcpServers` section. Example of a valid configuration:

```json
{
  "mcpServers": {
    "uprock-verify": {
      "command": "node",
      "args": ["/path/to/extension/dist/mcp/index.js"],
      "env": {
        "UPROCK_API_KEY": "your-api-key"
      }
    }
  }
}
```

After confirming the configuration exists, restart your AI assistant to enable the integration.

### Standalone MCP Server (Without VS Code Extension)

You can use the MCP server standalone without installing the VS Code extension. This is useful for:
- Users who don't use VS Code-based editors
- Submitting to MCP marketplaces
- Custom integrations

#### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/uprock/uprock-verify-vscode.git
   cd uprock-verify-vscode
   npm install
   ```

2. Get your API key from [UpRock Verify](https://uprockverify.com)

#### Configure Your AI Tool

Add to your MCP configuration file:

**Claude Desktop (macOS)** - `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "uprock-verify": {
      "command": "node",
      "args": ["/absolute/path/to/uprock-verify-vscode/src/mcp/index.js"],
      "env": {
        "UPROCK_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

**Claude Desktop (Windows)** - `%APPDATA%\Claude\claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "uprock-verify": {
      "command": "node",
      "args": ["C:\\path\\to\\uprock-verify-vscode\\src\\mcp\\index.js"],
      "env": {
        "UPROCK_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

**Windsurf** - `~/.codeium/windsurf/mcp_config.json`:
```json
{
  "mcpServers": {
    "uprock-verify": {
      "command": "node",
      "args": ["/absolute/path/to/uprock-verify-vscode/src/mcp/index.js"],
      "env": {
        "UPROCK_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

**Cursor** - `~/.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "uprock-verify": {
      "command": "node",
      "args": ["/absolute/path/to/uprock-verify-vscode/src/mcp/index.js"],
      "env": {
        "UPROCK_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

3. Restart your AI assistant
4. Ask your AI to verify URLs using natural language!

#### All MCP Tools

| Tool | Description |
|------|-------------|
| `verify_url` | Verify a URL across all 6 continents |
| `quick_verify` | Fast single-region verification |
| `batch_verify` | Verify multiple URLs at once (max 10) |
| `get_job_status` | Check verification job progress |
| `get_job_details` | Get detailed results of a completed job |
| `get_account_status` | Check API key and account info |
| `list_recent_scans` | View recent verification history |
| `get_latest_job` | Get most recent verification result |
| `get_history` | Advanced history with filters (status, continent, URL, date range) |

## API Reference

### History API

Get scan history with advanced filtering options.

**Endpoint:** `GET /api/v1/history`

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Results per page (default: 10, max: 50) |
| `team_id` | string | Filter by team ID |
| `status` | string | Filter by status: `pending`, `processing`, `completed`, `failed` |
| `continent` | string | Filter by continent: `NA`, `EU`, `AS`, `AF`, `OC`, `SA` |
| `url` | string | Filter by URL (partial match) |
| `from` | string | Filter from date (YYYY-MM-DD) |
| `to` | string | Filter to date (YYYY-MM-DD) |

**Examples:**

```bash
# Get first page (default 10 results)
curl "https://api.uprockverify.com/api/v1/history" \
  -H "x-api-key: your-api-key"

# Get page 2 with 20 results per page
curl "https://api.uprockverify.com/api/v1/history?page=2&limit=20" \
  -H "x-api-key: your-api-key"

# Filter by status
curl "https://api.uprockverify.com/api/v1/history?status=completed" \
  -H "x-api-key: your-api-key"

# Filter by continent
curl "https://api.uprockverify.com/api/v1/history?continent=EU" \
  -H "x-api-key: your-api-key"

# Filter by URL (partial match)
curl "https://api.uprockverify.com/api/v1/history?url=google.com" \
  -H "x-api-key: your-api-key"

# Filter by date range
curl "https://api.uprockverify.com/api/v1/history?from=2024-01-01&to=2024-12-31" \
  -H "x-api-key: your-api-key"

# Combined filters
curl "https://api.uprockverify.com/api/v1/history?status=completed&continent=NA&limit=25" \
  -H "x-api-key: your-api-key"
```

## Requirements

- VS Code 1.74.0 or higher
- UpRock Verify API key

## Support

- [Documentation](https://docs.uprockverify.com)
- [Report Issues](https://github.com/uprock/uprock-verify-vscode/issues)
- [Discord Community](https://discord.gg/uprock)

## License

MIT License - see LICENSE file for details.
