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

### API Key

Set your UpRock Verify API key using one of these methods:

1. **Environment variable** (recommended):
   ```bash
   export UPROCK_API_KEY=your-api-key
   ```

2. **Config file**: Create `~/.uprock-verify/config.json`:
   ```json
   {
     "apiKey": "your-api-key"
   }
   ```

## IDE & Chat Integration

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "uprock-verify": {
      "command": "npx",
      "args": ["uprock-verify-mcp"],
      "env": {
        "UPROCK_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "uprock-verify": {
      "command": "npx",
      "args": ["uprock-verify-mcp"],
      "env": {
        "UPROCK_API_KEY": "your-api-key"
      }
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
      "args": ["uprock-verify-mcp"],
      "env": {
        "UPROCK_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Other MCP-Compatible Tools

For any MCP-compatible AI assistant, use:

```json
{
  "command": "npx",
  "args": ["uprock-verify-mcp"],
  "env": {
    "UPROCK_API_KEY": "your-api-key"
  }
}
```

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
