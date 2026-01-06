# UpRock Verify MCP Server

MCP (Model Context Protocol) server for UpRock Verify - verify website reachability and performance across 6 continents.

## Quick Install (Recommended)

Install automatically for your preferred client:

```bash
# Claude Desktop
npx -y install-mcp uprock-verify-mcp --client claude -y

# VS Code
npx -y install-mcp uprock-verify-mcp --client vscode -y

# Cursor
npx -y install-mcp uprock-verify-mcp --client cursor -y

# Windsurf
npx -y install-mcp uprock-verify-mcp --client windsurf -y
```

## Manual Installation

```bash
npm install -g uprock-verify-mcp
```

## Configuration

### API Key Setup (One-Time)

Add your UpRock Verify API key to your shell profile (`~/.zshrc`, `~/.bashrc`, etc.):

```bash
echo 'export UPROCK_API_KEY="your-api-key"' >> ~/.zshrc
source ~/.zshrc
```

The MCP server **automatically reads** your API key from shell profiles - no manual configuration needed in each IDE!

**Supported locations** (checked in order):
1. Environment variable `UPROCK_API_KEY`
2. Shell profiles: `~/.zshrc`, `~/.bashrc`, `~/.bash_profile`, `~/.profile`, `~/.zshenv`
3. Config file: `~/.uprock-verify/config.json`

## IDE & Chat Integration

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "uprock-verify": {
      "command": "npx",
      "args": ["-y", "uprock-verify-mcp"]
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "uprock-verify-mcp": {
      "command": "npx",
      "args": ["-y", "uprock-verify-mcp"]
    }
  }
}
```

### Cursor

Add to Cursor's MCP settings (Settings → MCP):

```json
{
  "mcpServers": {
    "uprock-verify": {
      "command": "npx",
      "args": ["-y", "uprock-verify-mcp"]
    }
  }
}
```

### Other MCP-Compatible Tools

For any MCP-compatible AI assistant, use:

```json
{
  "command": "npx",
  "args": ["-y", "uprock-verify-mcp"]
}
```

> **Note:** No `env` section needed - the server automatically reads your API key from shell profiles.

## Available Tools

| Tool | Description |
|------|-------------|
| `verify_url` | Verify a URL across all 6 continents (NA, EU, AS, AF, OC, SA) |
| `quick_verify` | Quick verification from a single region |
| `batch_verify` | Verify multiple URLs at once (max 10) |
| `get_job_status` | Check status of a verification job |
| `get_job_details` | Get detailed results of a completed job |
| `get_account_status` | Get account status and remaining scans |
| `list_recent_scans` | List recent verification scans |
| `get_latest_job` | Get the most recent verification results |
| `get_history` | Get scan history with advanced filters |

## Usage Examples

Once configured, ask your AI assistant:

- "Verify https://example.com across all continents"
- "Quick check https://my-site.com from Europe"
- "What's my UpRock account status?"
- "Show me my recent scans"
- "Batch verify these URLs: url1.com, url2.com, url3.com"

## Get an API Key

Visit [UpRock](https://uprock.com) to get your API key.

## License

MIT
