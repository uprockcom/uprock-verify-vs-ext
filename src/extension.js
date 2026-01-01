/**
 * UpRock Verify VS Code Extension
 *
 * Verify website deployments directly from your IDE.
 */

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const ApiClient = require('./api/client');
const ResultsPanel = require('./views/resultsPanel');
const SidebarProvider = require('./views/sidebarProvider');
const { registerVerifyCommands } = require('./commands/verify');
const { registerBatchCommands } = require('./commands/batch');
const { registerStatusCommands } = require('./commands/status');

let statusBarItem;

/**
 * Activate the extension
 */
async function activate(context) {
  try {
    console.log('UpRock Verify extension is now active');

    // Initialize API client
    const apiClient = new ApiClient(context);
    await apiClient.init();

    // Initialize results panel
    const resultsPanel = new ResultsPanel(context);

    // Initialize sidebar provider
    const sidebarProvider = new SidebarProvider(context, apiClient);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider('uprockVerify.sidebar', sidebarProvider)
    );

    // Register all commands
    registerVerifyCommands(context, apiClient, resultsPanel);
    registerBatchCommands(context, apiClient, resultsPanel);
    registerStatusCommands(context, apiClient, resultsPanel);

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    statusBarItem.command = 'uprock.status';
    statusBarItem.text = '$(rocket) UpRock';
    statusBarItem.tooltip = 'UpRock Verify - Click for status';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Update status bar based on API key
    updateStatusBar(apiClient);

    // Watch for configuration changes
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration('uprockVerify')) {
          await apiClient.init();
          updateStatusBar(apiClient);
        }
      })
    );

    // Watch for secrets changes
    context.subscriptions.push(
      context.secrets.onDidChange(async (e) => {
        if (e.key === 'uprockVerify.apiKey') {
          await apiClient.init();
          updateStatusBar(apiClient);
          // Update MCP config when API key changes
          await setupMcpConfig(context);
        }
      })
    );

    // Setup MCP configuration automatically
    await setupMcpConfig(context);

  } catch (error) {
    console.error('UpRock Verify activation failed:', error);
    vscode.window.showErrorMessage(`UpRock Verify failed to activate: ${error.message}`);
  }
}

/**
 * Update status bar based on API key status
 */
async function updateStatusBar(apiClient) {
  const hasKey = await apiClient.hasApiKey();

  if (hasKey) {
    statusBarItem.text = '$(rocket) UpRock';
    statusBarItem.tooltip = 'UpRock Verify - Ready';
    statusBarItem.backgroundColor = undefined;
  } else {
    statusBarItem.text = '$(rocket) UpRock $(warning)';
    statusBarItem.tooltip = 'UpRock Verify - API key not configured';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }
}

/**
 * Deactivate the extension
 */
function deactivate() {
  if (statusBarItem) {
    statusBarItem.dispose();
  }
}

/**
 * Setup MCP configuration automatically
 * Creates/updates mcp.json in the workspace and user's home directory
 * Also writes API key to a secure config file for MCP server to read
 */
async function setupMcpConfig(context) {
  try {
    const extensionPath = context.extensionPath;
    const mcpServerPath = path.join(extensionPath, 'src', 'mcp', 'index.js');

    // Get API key from secure storage
    const apiKey = await context.secrets.get('uprockVerify.apiKey');

    // Write API key to a secure config file that MCP server can read
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (homeDir && apiKey) {
      const configDir = path.join(homeDir, '.uprock-verify');
      const configFile = path.join(configDir, 'config.json');

      // Create directory if it doesn't exist
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
      }

      // Write config with restricted permissions
      fs.writeFileSync(configFile, JSON.stringify({ apiKey }, null, 2), { mode: 0o600 });
      console.log('MCP config credentials written to:', configFile);
    }

    const mcpConfig = {
      mcpServers: {
        'uprock-verify': {
          command: 'node',
          args: [mcpServerPath]
        }
      }
    };

    // 1. Setup in workspace .vscode folder (if workspace is open)
    // VSCode/GitHub Copilot uses "servers" format with "type": "stdio"
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
      const vscodeDir = path.join(workspaceRoot, '.vscode');
      const mcpConfigPath = path.join(vscodeDir, 'mcp.json');

      // Create .vscode directory if it doesn't exist
      if (!fs.existsSync(vscodeDir)) {
        fs.mkdirSync(vscodeDir, { recursive: true });
      }

      // Read existing config or create new one
      let existingConfig = { servers: {} };
      if (fs.existsSync(mcpConfigPath)) {
        try {
          existingConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));
        } catch (e) {
          // Invalid JSON, start fresh
        }
      }

      // VSCode uses "servers" not "mcpServers"
      existingConfig.servers = existingConfig.servers || {};
      existingConfig.servers['uprock-verify'] = {
        type: 'stdio',
        command: 'node',
        args: [mcpServerPath]
      };

      // Write the config
      fs.writeFileSync(mcpConfigPath, JSON.stringify(existingConfig, null, 2));
      console.log('MCP config written to workspace:', mcpConfigPath);
    }

    // 2. Setup in user's home directory for Claude Desktop
    if (homeDir) {
      // Claude Desktop config location
      const claudeConfigDir = path.join(homeDir, '.config', 'claude');
      const claudeConfigPath = path.join(claudeConfigDir, 'claude_desktop_config.json');

      // Create directory if it doesn't exist
      if (!fs.existsSync(claudeConfigDir)) {
        fs.mkdirSync(claudeConfigDir, { recursive: true });
      }

      // Read existing Claude config or create new one
      let claudeConfig = { mcpServers: {} };
      if (fs.existsSync(claudeConfigPath)) {
        try {
          claudeConfig = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf8'));
        } catch (e) {
          // Invalid JSON, start fresh
        }
      }

      // Merge our config
      claudeConfig.mcpServers = claudeConfig.mcpServers || {};
      claudeConfig.mcpServers['uprock-verify'] = mcpConfig.mcpServers['uprock-verify'];

      // Write the config
      fs.writeFileSync(claudeConfigPath, JSON.stringify(claudeConfig, null, 2));
      console.log('MCP config written to Claude Desktop:', claudeConfigPath);

      // 3. Setup for Windsurf IDE
      const windsurfConfigDir = path.join(homeDir, '.codeium', 'windsurf');
      const windsurfConfigPath = path.join(windsurfConfigDir, 'mcp_config.json');

      // Create directory if it doesn't exist
      if (!fs.existsSync(windsurfConfigDir)) {
        fs.mkdirSync(windsurfConfigDir, { recursive: true });
      }

      // Read existing Windsurf config or create new one
      let windsurfConfig = { mcpServers: {} };
      if (fs.existsSync(windsurfConfigPath)) {
        try {
          windsurfConfig = JSON.parse(fs.readFileSync(windsurfConfigPath, 'utf8'));
        } catch (e) {
          // Invalid JSON, start fresh
        }
      }

      // Merge our config
      windsurfConfig.mcpServers = windsurfConfig.mcpServers || {};
      windsurfConfig.mcpServers['uprock-verify'] = mcpConfig.mcpServers['uprock-verify'];

      // Write the config
      fs.writeFileSync(windsurfConfigPath, JSON.stringify(windsurfConfig, null, 2));
      console.log('MCP config written to Windsurf:', windsurfConfigPath);

      // 4. Setup for Cursor IDE
      const cursorConfigDir = path.join(homeDir, '.cursor');
      const cursorConfigPath = path.join(cursorConfigDir, 'mcp.json');

      // Create directory if it doesn't exist
      if (!fs.existsSync(cursorConfigDir)) {
        fs.mkdirSync(cursorConfigDir, { recursive: true });
      }

      // Read existing Cursor config or create new one
      let cursorConfig = { mcpServers: {} };
      if (fs.existsSync(cursorConfigPath)) {
        try {
          cursorConfig = JSON.parse(fs.readFileSync(cursorConfigPath, 'utf8'));
        } catch (e) {
          // Invalid JSON, start fresh
        }
      }

      // Merge our config
      cursorConfig.mcpServers = cursorConfig.mcpServers || {};
      cursorConfig.mcpServers['uprock-verify'] = mcpConfig.mcpServers['uprock-verify'];

      // Write the config
      fs.writeFileSync(cursorConfigPath, JSON.stringify(cursorConfig, null, 2));
      console.log('MCP config written to Cursor:', cursorConfigPath);

      // 5. Setup for VSCode (user-level MCP config)
      const vscodeUserDir = path.join(homeDir, '.vscode');
      const vscodeMcpPath = path.join(vscodeUserDir, 'mcp.json');

      // Create directory if it doesn't exist
      if (!fs.existsSync(vscodeUserDir)) {
        fs.mkdirSync(vscodeUserDir, { recursive: true });
      }

      // Read existing VSCode MCP config or create new one
      let vscodeMcpConfig = { servers: {} };
      if (fs.existsSync(vscodeMcpPath)) {
        try {
          vscodeMcpConfig = JSON.parse(fs.readFileSync(vscodeMcpPath, 'utf8'));
        } catch (e) {
          // Invalid JSON, start fresh
        }
      }

      // VSCode uses "servers" not "mcpServers"
      vscodeMcpConfig.servers = vscodeMcpConfig.servers || {};
      vscodeMcpConfig.servers['uprock-verify'] = {
        type: 'stdio',
        command: 'node',
        args: [mcpServerPath]
      };

      // Write the config
      fs.writeFileSync(vscodeMcpPath, JSON.stringify(vscodeMcpConfig, null, 2));
      console.log('MCP config written to VSCode:', vscodeMcpPath);
    }

  } catch (error) {
    console.error('Failed to setup MCP config:', error);
    // Don't throw - MCP setup failure shouldn't break the extension
  }
}

module.exports = {
  activate,
  deactivate
};
