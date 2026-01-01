/**
 * Sidebar Provider for UpRock Verify Extension
 * Creates a chat-like UI similar to Claude Code
 */

const vscode = require('vscode');

class SidebarProvider {
  constructor(context, apiClient) {
    this.context = context;
    this.apiClient = apiClient;
    this._view = null;
  }

  resolveWebviewView(webviewView, _context, _token) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    webviewView.webview.html = this._getHtmlContent(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'verify':
          await this._handleVerify(message.url, false);
          break;
        case 'verifyDev':
          await this._handleVerify(message.url, true);
          break;
        case 'setApiKey':
          await this._handleSetApiKey(message.apiKey);
          break;
        case 'getStatus':
          await this._handleGetStatus();
          break;
        case 'getHistory':
          await this._handleGetHistory(message.page);
          break;
        case 'checkApiKey':
          await this._checkApiKey();
          break;
        case 'checkJob':
          await this._handleCheckJob(message.jobId);
          break;
        case 'openSlack':
          vscode.env.openExternal(vscode.Uri.parse('https://slack.com'));
          break;
        case 'openSettings':
          vscode.commands.executeCommand('workbench.action.openSettings', 'uprockVerify');
          break;
        case 'openExternal':
          vscode.env.openExternal(vscode.Uri.parse(message.url));
          break;
      }
    });

    // Check API key on load - no delay needed, webview handles initial state
    this._checkApiKey();
  }

  async _checkApiKey() {
    const hasKey = await this.apiClient.hasApiKey();

    if (hasKey) {
      // Validate stored key with server
      try {
        const result = await this.apiClient.validateAuth();
        if (result.valid) {
          this._postMessage({
            type: 'apiKeyStatus',
            hasKey: true,
            user: result.user
          });
        } else {
          // Key is invalid, clear it
          await this.apiClient.clearApiKey();
          this._postMessage({ type: 'apiKeyStatus', hasKey: false });
        }
      } catch (error) {
        // Network error - still show as connected (key exists locally)
        this._postMessage({ type: 'apiKeyStatus', hasKey: true });
      }
    } else {
      this._postMessage({ type: 'apiKeyStatus', hasKey: false });
    }
  }

  async _handleSetApiKey(apiKey) {
    try {
      // Validate the API key first before storing
      const result = await this.apiClient.validateApiKey(apiKey);

      if (result.valid) {
        // Only store the key if validation succeeded
        await this.apiClient.setApiKey(apiKey);
        this._postMessage({
          type: 'apiKeySet',
          success: true,
          user: result.user
        });
        const userName = result.user?.name || result.user?.email || 'User';

        // Show success message with MCP refresh option
        const refreshMcp = await vscode.window.showInformationMessage(
          `Welcome, ${userName}! MCP server configured.`,
          'Refresh MCP',
          'OK'
        );

        if (refreshMcp === 'Refresh MCP') {
          // Try to refresh MCP servers via command (works in Windsurf/VS Code)
          try {
            await vscode.commands.executeCommand('mcp.refreshServers');
          } catch (e) {
            // Command may not exist in all IDEs, show manual instructions
            vscode.window.showInformationMessage(
              'Please restart your IDE or manually refresh MCP servers to use AI verification.'
            );
          }
        }
      } else {
        throw new Error(result.error || 'Invalid API key');
      }
    } catch (error) {
      this._postMessage({
        type: 'apiKeySet',
        success: false,
        error: error.message
      });
    }
  }

  async _handleVerify(url, isDev) {
    if (!url) {
      this._postMessage({ type: 'error', message: 'Please enter a URL' });
      return;
    }

    // Normalize URL
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }

    // Validate
    try {
      new URL(normalizedUrl);
    } catch {
      this._postMessage({ type: 'error', message: 'Invalid URL format' });
      return;
    }

    this._postMessage({
      type: 'verificationStarted',
      url: normalizedUrl,
      isDev
    });

    try {
      let result;
      if (isDev) {
        result = await this.apiClient.verifyDev(normalizedUrl);
      } else {
        result = await this.apiClient.verify(normalizedUrl);
      }

      if (result.success) {
        this._postMessage({
          type: 'verificationSubmitted',
          url: result.url || normalizedUrl,
          jobId: result.jobId,
          scansRemaining: result.scansRemaining,
          message: result.message
        });
      } else {
        throw new Error(result.error || 'Verification failed');
      }
    } catch (error) {
      this._postMessage({
        type: 'verificationError',
        error: error.message
      });
    }
  }

  async _handleGetStatus() {
    try {
      const result = await this.apiClient.getAccountStatus();
      if (result.success) {
        this._postMessage({ type: 'accountStatus', data: result.data });
      }
    } catch (error) {
      this._postMessage({ type: 'error', message: error.message });
    }
  }

  async _handleGetHistory(page = 1) {
    try {
      // Try the new history endpoint first, fall back to scans endpoint
      let result;
      try {
        result = await this.apiClient.getHistory({ limit: 10, page });
      } catch (historyError) {
        // Fall back to old scans endpoint if history endpoint fails
        result = await this.apiClient.listScans(10, (page - 1) * 10);
      }

      if (result.success) {
        // Pass both data array and pagination info
        this._postMessage({
          type: 'history',
          data: result.data,
          pagination: result.pagination
        });
      } else {
        throw new Error(result.error || 'Failed to get history');
      }
    } catch (error) {
      this._postMessage({ type: 'error', message: 'History: ' + error.message });
    }
  }

  async _handleCheckJob(jobId) {
    this._postMessage({ type: 'jobChecking', jobId });
    try {
      const result = await this.apiClient.getJobStatus(jobId);
      // Handle both direct response and wrapped response (e.g., { success: true, data: {...} })
      const jobData = result.data || result;
      this._postMessage({ type: 'jobStatus', data: jobData });
    } catch (error) {
      this._postMessage({ type: 'jobError', jobId, error: error.message });
    }
  }

  _postMessage(message) {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
  }

  _getHtmlContent(_webview) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UpRock Verify</title>
  <style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-foreground);background:var(--vscode-sideBar-background);padding:0;height:100vh;display:flex;flex-direction:column}.header{padding:12px 16px;border-bottom:1px solid var(--vscode-panel-border);display:flex;align-items:center;gap:8px}.header-icon{font-size:20px}.header-title{font-weight:600;font-size:14px}.header-status{margin-left:auto;font-size:11px;padding:2px 8px;border-radius:10px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}.header-status.connected{background:#22c55e20;color:#22c55e}.header-status.disconnected{background:#ef444420;color:#ef4444}.content{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:16px}.setup-card{background:var(--vscode-input-background);border-radius:8px;padding:16px;text-align:center}.setup-card h3{margin-bottom:8px;font-size:14px}.setup-card p{font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:12px}.input-group{display:flex;flex-direction:column;gap:8px}.input-wrapper{position:relative;display:flex;gap:8px}input{flex:1;padding:8px 12px;border:1px solid var(--vscode-input-border);background:var(--vscode-input-background);color:var(--vscode-input-foreground);border-radius:6px;font-size:13px;outline:none}input:focus{border-color:var(--vscode-focusBorder)}input::placeholder{color:var(--vscode-input-placeholderForeground)}button{padding:8px 16px;border:none;border-radius:6px;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px}button:hover{opacity:0.9}button:disabled{opacity:0.5;cursor:not-allowed}.btn-primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}.btn-secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}.btn-full{width:100%;margin-top:8px}.btn-link{background:none;color:var(--vscode-textLink-foreground);font-size:12px;margin-top:12px;padding:4px}.btn-link:hover{text-decoration:underline}.tab-nav{display:flex;gap:4px;margin-bottom:12px;border-bottom:1px solid var(--vscode-panel-border);padding-bottom:8px}.tab-btn{flex:1;padding:8px 12px;background:transparent;color:var(--vscode-descriptionForeground);border:none;border-radius:6px 6px 0 0;font-size:12px;cursor:pointer;transition:all 0.2s}.tab-btn:hover{background:var(--vscode-input-background)}.tab-btn.active{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}.tab-content{flex:1;display:flex;flex-direction:column;gap:12px}.instructions{display:flex;flex-direction:column;gap:12px}.instruction-step{display:flex;gap:12px;padding:12px;background:var(--vscode-input-background);border-radius:8px}.step-number{width:24px;height:24px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:12px;flex-shrink:0}.step-content h4{font-size:13px;margin-bottom:4px}.step-content p{font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:4px}.step-content code{display:inline-block;background:var(--vscode-editor-background);padding:4px 8px;border-radius:4px;font-family:var(--vscode-editor-font-family);font-size:12px;color:var(--vscode-textPreformat-foreground)}.slack-commands{background:var(--vscode-input-background);border-radius:8px;padding:12px}.slack-commands h4{font-size:12px;margin-bottom:8px}.command-list{display:flex;flex-direction:column;gap:6px}.command-item{font-size:11px;display:flex;gap:8px;align-items:center}.command-item code{background:var(--vscode-editor-background);padding:2px 6px;border-radius:3px;font-family:var(--vscode-editor-font-family);font-size:11px}.verify-section{display:flex;flex-direction:column;gap:8px}.verify-buttons{display:flex;gap:8px}.verify-buttons button{flex:1}.messages{flex:1;display:flex;flex-direction:column;gap:12px;min-height:200px}.message{padding:12px;border-radius:8px;font-size:13px}.message.user{background:var(--vscode-input-background);border:1px solid var(--vscode-input-border)}.message.assistant{background:var(--vscode-editor-inactiveSelectionBackground)}.message.error{background:#ef444420;border:1px solid #ef4444;color:#ef4444}.message.loading{display:flex;align-items:center;gap:8px}.spinner{width:16px;height:16px;border:2px solid var(--vscode-foreground);border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.result-card{background:var(--vscode-editor-inactiveSelectionBackground);border-radius:8px;overflow:hidden}.result-header{padding:12px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--vscode-panel-border)}.result-state{font-size:20px}.result-title{flex:1}.result-title .url{font-size:12px;color:var(--vscode-descriptionForeground);word-break:break-all}.result-title .label{font-weight:600;font-size:14px}.result-body{padding:12px}.scores-row{display:flex;gap:12px;margin-bottom:12px}.score-box{flex:1;text-align:center;padding:8px;background:var(--vscode-input-background);border-radius:6px}.score-value{font-size:24px;font-weight:700}.score-label{font-size:11px;color:var(--vscode-descriptionForeground)}.score-good{color:#22c55e}.score-warning{color:#eab308}.score-bad{color:#ef4444}.continents-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:12px}.continent-item{display:flex;align-items:center;gap:6px;padding:6px 8px;background:var(--vscode-input-background);border-radius:4px;font-size:12px}.continent-item.failed{opacity:0.6}.vitals-section{margin-top:12px}.vitals-title{font-size:12px;font-weight:600;margin-bottom:8px;color:var(--vscode-descriptionForeground)}.vitals-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.vital-item{padding:8px;background:var(--vscode-input-background);border-radius:4px;border-left:3px solid}.vital-item.good{border-color:#22c55e}.vital-item.warning{border-color:#eab308}.vital-item.poor{border-color:#ef4444}.vital-label{font-size:10px;color:var(--vscode-descriptionForeground)}.vital-value{font-size:14px;font-weight:600}.history-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.history-title{display:flex;align-items:center;gap:8px;font-weight:600;font-size:14px}.history-count{font-size:11px;font-weight:normal;color:var(--vscode-descriptionForeground);background:var(--vscode-badge-background);padding:2px 8px;border-radius:10px}.history-list{flex:1;display:flex;flex-direction:column;gap:10px;overflow-y:auto}.history-item{padding:12px;background:var(--vscode-input-background);border-radius:8px;border-left:3px solid #22c55e;cursor:pointer;transition:all 0.2s}.history-item:hover{background:var(--vscode-editor-inactiveSelectionBackground)}.history-item.failed{border-left-color:#ef4444}.history-item.timeout{border-left-color:#eab308}.history-item-header{display:flex;align-items:center;gap:8px;margin-bottom:8px}.history-item-status{font-size:16px}.history-item-url{flex:1;font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.history-item-time{font-size:10px;color:var(--vscode-descriptionForeground)}.history-item-details{display:flex;flex-wrap:wrap;gap:8px;font-size:11px;color:var(--vscode-descriptionForeground)}.history-item-detail{display:flex;align-items:center;gap:4px}.history-item-scores{display:flex;gap:12px;margin-top:8px;padding-top:8px;border-top:1px solid var(--vscode-panel-border)}.history-item-score{font-size:11px}.history-item-score.good{color:#22c55e}.history-item-score.warning{color:#eab308}.history-item-score.bad{color:#ef4444}.history-item-actions{display:flex;gap:6px;margin-top:8px}.history-pagination{display:flex;justify-content:center;align-items:center;gap:12px;padding:12px 0;border-top:1px solid var(--vscode-panel-border)}.page-info{font-size:12px;color:var(--vscode-descriptionForeground)}.quick-actions{display:flex;gap:8px;padding:12px 16px;border-top:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background);flex-shrink:0}.quick-actions button{flex:1;font-size:11px;padding:6px 8px}.empty-state{text-align:center;padding:32px 16px;color:var(--vscode-descriptionForeground)}.empty-state-icon{font-size:48px;margin-bottom:12px}.empty-state h3{font-size:14px;margin-bottom:8px;color:var(--vscode-foreground)}.empty-state p{font-size:12px}.detail-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--vscode-panel-border)}.detail-row:last-of-type{border-bottom:none}.detail-label{font-size:12px;color:var(--vscode-descriptionForeground)}.detail-value{font-size:12px;font-weight:500}.info-text{font-size:11px;color:var(--vscode-descriptionForeground);margin-top:12px;padding:8px;background:var(--vscode-input-background);border-radius:4px;text-align:center}.job-buttons{display:flex;gap:8px;margin-top:12px}.btn-sm{padding:6px 12px;font-size:11px}.hidden{display:none!important}.toast-container{position:fixed;top:12px;left:12px;right:12px;z-index:1000;display:flex;flex-direction:column;gap:8px;pointer-events:none}.toast{padding:10px 14px;border-radius:6px;font-size:12px;display:flex;align-items:center;gap:8px;animation:slideIn 0.3s ease;pointer-events:auto;box-shadow:0 2px 8px rgba(0,0,0,0.2)}.toast.success{background:#22c55e;color:white}.toast.error{background:#ef4444;color:white}.toast.info{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}.toast.warning{background:#eab308;color:black}.toast-icon{font-size:14px}.toast-message{flex:1}.toast-close{background:none;border:none;color:inherit;cursor:pointer;padding:2px;opacity:0.7;font-size:16px}.toast-close:hover{opacity:1}@keyframes slideIn{from{transform:translateY(-20px);opacity:0}to{transform:translateY(0);opacity:1}}@keyframes slideOut{from{transform:translateY(0);opacity:1}to{transform:translateY(-20px);opacity:0}}.toast.hiding{animation:slideOut 0.3s ease forwards}.overlay-loader{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:999;flex-direction:column;gap:12px}.overlay-loader .spinner-large{width:32px;height:32px;border:3px solid var(--vscode-foreground);border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite}.overlay-loader .loader-text{color:var(--vscode-foreground);font-size:12px}.history-loading{display:flex;align-items:center;justify-content:center;padding:32px;gap:8px;color:var(--vscode-descriptionForeground)}.screenshots-section{margin-top:12px}.screenshots-title{font-size:12px;font-weight:600;margin-bottom:8px;color:var(--vscode-descriptionForeground)}.screenshots-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.screenshot-item{position:relative;border-radius:6px;overflow:hidden;background:var(--vscode-input-background);cursor:pointer;transition:transform 0.2s}.screenshot-item:hover{transform:scale(1.02)}.screenshot-item img{width:100%;height:80px;object-fit:cover;display:block}.screenshot-item-overlay{position:absolute;bottom:0;left:0;right:0;padding:4px 6px;background:linear-gradient(transparent,rgba(0,0,0,0.8));color:white;font-size:10px;display:flex;align-items:center;gap:4px}.screenshot-item-status{font-size:12px}.continent-card{padding:10px;background:var(--vscode-input-background);border-radius:6px;border-left:3px solid #22c55e}.continent-card.warning{border-left-color:#eab308}.continent-card.failed{border-left-color:#ef4444}.continent-card-header{display:flex;align-items:center;gap:8px;margin-bottom:6px}.continent-card-flag{font-size:16px}.continent-card-name{font-weight:500;font-size:12px;flex:1}.continent-card-status{font-size:14px}.continent-card-scores{display:flex;gap:12px;font-size:11px;color:var(--vscode-descriptionForeground)}.continent-card-screenshot{margin-top:8px;border-radius:4px;overflow:hidden;cursor:pointer}.continent-card-screenshot img{width:100%;height:60px;object-fit:cover;display:block}
  </style>
</head>
<body>
  <!-- Toast Container -->
  <div class="toast-container" id="toastContainer"></div>

  <!-- Overlay Loader -->
  <div class="overlay-loader hidden" id="overlayLoader">
    <div class="spinner-large"></div>
    <div class="loader-text" id="loaderText">Loading...</div>
  </div>

  <div class="header">
    <span class="header-icon">🚀</span>
    <span class="header-title">UpRock Verify</span>
    <span class="header-status disconnected" id="connectionStatus">Not Connected</span>
  </div>

  <!-- Instructions View (shown first) -->
  <div class="content" id="instructionsView">
    <div class="setup-card">
      <h3>🚀 Welcome to UpRock Verify</h3>
      <p>Verify website deployments across 6 continents</p>
    </div>

    <div class="instructions">
      <div class="instruction-step">
        <div class="step-number">1</div>
        <div class="step-content">
          <h4>Get Your API Key</h4>
          <p>In your Slack workspace, run:</p>
          <code>/uprock apikey</code>
        </div>
      </div>

      <div class="instruction-step">
        <div class="step-number">2</div>
        <div class="step-content">
          <h4>Copy the Key</h4>
          <p>You'll receive a key like:</p>
          <code>rv_abc123...</code>
        </div>
      </div>

      <div class="instruction-step">
        <div class="step-number">3</div>
        <div class="step-content">
          <h4>Connect Below</h4>
          <p>Paste your API key to start verifying</p>
        </div>
      </div>
    </div>

    <div class="slack-commands">
      <h4>📋 Slack Commands</h4>
      <div class="command-list">
        <div class="command-item"><code>/uprock apikey</code> Get your API key</div>
        <div class="command-item"><code>/uprock scans</code> Check scan usage</div>
        <div class="command-item"><code>/uprock status</code> View account info</div>
        <div class="command-item"><code>/uprock help</code> List all commands</div>
      </div>
    </div>

    <div class="slack-commands" style="margin-top:12px">
      <h4>🤖 AI Assistant Integration (MCP)</h4>
      <div class="command-list">
        <div class="command-item">Works with <strong>Windsurf Cascade</strong>, <strong>Cursor</strong>, <strong>Claude Desktop</strong></div>
        <div class="command-item">Ask AI: <code>"verify google.com"</code></div>
        <div class="command-item">Auto-configured on connect</div>
      </div>
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--vscode-panel-border)">
        <div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:6px">✅ Verify MCP is running:</div>
        <div class="command-list">
          <div class="command-item"><strong>Windsurf:</strong> Click 🔨 in Cascade → check "uprock-verify"</div>
          <div class="command-item"><strong>Cursor:</strong> Settings → MCP → check "uprock-verify"</div>
          <div class="command-item"><strong>Terminal test:</strong></div>
        </div>
        <code style="display:block;margin-top:6px;font-size:10px;word-break:break-all">node ~/.vscode/extensions/uprock.uprock-verify-*/src/mcp/index.js</code>
        <div style="font-size:10px;color:var(--vscode-descriptionForeground);margin-top:4px">Should print: "UpRock Verify MCP server started"</div>
      </div>
    </div>

    <button class="btn-primary btn-full" onclick="showConnectView()">Got it, Let's Connect →</button>
    <div style="text-align:center;margin-top:12px">
      <p style="font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:6px">Don't have Slack?</p>
      <button class="btn-link" onclick="showEmailSetup()" style="margin:0">📧 Sign up with Email instead</button>
    </div>
  </div>

  <!-- API Key Setup (shown after instructions) -->
  <div class="content hidden" id="setupView">
    <div class="setup-card">
      <h3>🔑 Connect Your Account</h3>
      <p>Enter your UpRock Verify API key</p>
      <div class="input-group">
        <input type="password" id="apiKeyInput" placeholder="rv_..." />
        <button class="btn-primary" onclick="saveApiKey()">Connect</button>
      </div>
      <button class="btn-link" onclick="showInstructions()">← Back to instructions</button>
    </div>
    <div style="text-align:center;margin-top:16px;padding-top:16px;border-top:1px solid var(--vscode-panel-border)">
      <p style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:8px">Don't have Slack?</p>
      <button class="btn-secondary btn-full" onclick="showEmailSetup()">📧 Sign up with Email</button>
    </div>
  </div>

  <!-- Email Setup View (for users without Slack) -->
  <div class="content hidden" id="emailSetupView">
    <div class="setup-card">
      <h3>📧 Sign up with Email</h3>
      <p>Enter your email to get started</p>
      <div class="input-group" id="emailInputGroup">
        <input type="email" id="emailInput" placeholder="you@example.com" />
        <button class="btn-primary" onclick="submitEmail()">Send OTP</button>
      </div>
      <div id="otpInputGroup" class="hidden" style="margin-top:12px">
        <p style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:8px">Enter the 6-digit code sent to your email</p>
        <div class="input-group">
          <input type="text" id="otpInput" placeholder="000000" maxlength="6" style="text-align:center;letter-spacing:4px;font-size:18px" />
          <button class="btn-primary" onclick="verifyOtp()">Verify</button>
        </div>
        <button class="btn-link" onclick="resendOtp()" style="margin-top:8px">Resend code</button>
      </div>
      <div id="emailStatus" class="hidden" style="margin-top:12px;padding:12px;border-radius:6px;font-size:12px"></div>
      <button class="btn-link" onclick="showConnectView()">← Back to API key</button>
    </div>
    <div class="slack-commands" style="margin-top:16px">
      <h4>📋 How it works</h4>
      <div class="command-list">
        <div class="command-item">1. Enter your email address</div>
        <div class="command-item">2. Check your inbox for 6-digit OTP code</div>
        <div class="command-item">3. Enter the code to verify your email</div>
        <div class="command-item">4. Start verifying websites!</div>
      </div>
    </div>
    <div style="margin-top:12px;padding:10px;background:var(--vscode-input-background);border-radius:6px;font-size:11px;color:var(--vscode-descriptionForeground)">
      <strong>Note:</strong> Email signup is coming soon. For now, please use Slack to get your API key.
    </div>
  </div>

  <!-- Main View (shown when connected) -->
  <div class="content hidden" id="mainView">
    <!-- Tab Navigation -->
    <div class="tab-nav">
      <button class="tab-btn active" onclick="switchTab('verify')" id="tabVerify">🚀 Verify</button>
      <button class="tab-btn" onclick="switchTab('history')" id="tabHistory">📜 History</button>
    </div>

    <!-- Verify Tab -->
    <div class="tab-content" id="verifyTab">
      <!-- Verify Section -->
      <div class="verify-section">
        <div class="input-wrapper">
          <input type="text" id="urlInput" placeholder="Enter URL to verify..." />
        </div>
        <div class="verify-buttons">
          <button class="btn-primary" onclick="verify(false)">
            🌍 Global Check
          </button>
          <button class="btn-secondary" onclick="verify(true)">
            ⚡ Quick Check
          </button>
        </div>
      </div>

      <!-- Messages -->
      <div class="messages" id="messages">
        <div class="empty-state">
          <div class="empty-state-icon">🚀</div>
          <h3>Ready to verify</h3>
          <p>Enter a URL above and click verify to check your site's status across the globe</p>
        </div>
      </div>
    </div>

    <!-- History Tab -->
    <div class="tab-content hidden" id="historyTab">
      <div class="history-header">
        <div class="history-title">
          <span>📜 Scan History</span>
          <span class="history-count" id="historyCount">0 scans</span>
        </div>
        <button class="btn-sm btn-secondary" onclick="refreshHistory()">🔄 Refresh</button>
      </div>
      <div class="history-list" id="historyList">
        <div class="empty-state">
          <div class="empty-state-icon">📜</div>
          <h3>No scans yet</h3>
          <p>Your verification history will appear here</p>
        </div>
      </div>
      <div class="history-pagination hidden" id="historyPagination">
        <button class="btn-sm btn-secondary" onclick="loadHistoryPage('prev')" id="prevPageBtn" disabled>← Prev</button>
        <span class="page-info" id="pageInfo">Page 1</span>
        <button class="btn-sm btn-secondary" onclick="loadHistoryPage('next')" id="nextPageBtn">Next →</button>
      </div>
    </div>
  </div>

  <!-- Quick Actions (fixed at bottom) -->
  <div class="quick-actions hidden" id="quickActions">
    <button class="btn-secondary" onclick="openSettings()">⚙️ Settings</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let isConnected = false;
    let currentHistoryPage = 1;
    let historyPagination = null;

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;

      switch (message.type) {
        case 'apiKeyStatus':
          handleApiKeyStatus(message);
          break;
        case 'apiKeySet':
          handleApiKeySet(message);
          break;
        case 'verificationStarted':
          handleVerificationStarted(message);
          break;
        case 'verificationSubmitted':
          handleVerificationSubmitted(message);
          break;
        case 'verificationComplete':
          handleVerificationComplete(message);
          break;
        case 'verificationError':
          handleVerificationError(message);
          break;
        case 'accountStatus':
          handleAccountStatus(message.data);
          break;
        case 'history':
          handleHistory(message.data, message.pagination);
          break;
        case 'jobChecking':
          handleJobChecking(message.jobId);
          break;
        case 'jobStatus':
          handleJobStatus(message.data);
          break;
        case 'jobError':
          handleJobError(message.jobId, message.error);
          break;
        case 'error':
          showToast(message.message, 'error');
          break;
      }
    });

    // Tab switching
    function switchTab(tab) {
      document.getElementById('tabVerify').classList.toggle('active', tab === 'verify');
      document.getElementById('tabHistory').classList.toggle('active', tab === 'history');
      document.getElementById('verifyTab').classList.toggle('hidden', tab !== 'verify');
      document.getElementById('historyTab').classList.toggle('hidden', tab !== 'history');

      if (tab === 'history') {
        refreshHistory();
      }
    }

    function refreshHistory() {
      currentHistoryPage = 1;
      showHistoryLoading();
      vscode.postMessage({ command: 'getHistory', page: 1 });
    }

    function loadHistoryPage(direction) {
      if (direction === 'next' && historyPagination?.hasNext) {
        currentHistoryPage++;
      } else if (direction === 'prev' && historyPagination?.hasPrev) {
        currentHistoryPage--;
      }
      vscode.postMessage({ command: 'getHistory', page: currentHistoryPage });
    }

    function handleApiKeyStatus(message) {
      const hasKey = message.hasKey !== undefined ? message.hasKey : message;
      isConnected = hasKey;
      document.getElementById('instructionsView').classList.toggle('hidden', hasKey);
      document.getElementById('setupView').classList.add('hidden');
      document.getElementById('mainView').classList.toggle('hidden', !hasKey);
      document.getElementById('quickActions').classList.toggle('hidden', !hasKey);

      const status = document.getElementById('connectionStatus');
      if (hasKey && message.user) {
        const name = message.user.name || message.user.email || 'Connected';
        status.textContent = name;
      } else {
        status.textContent = hasKey ? 'Connected' : 'Not Connected';
      }
      status.className = 'header-status ' + (hasKey ? 'connected' : 'disconnected');
    }

    function showConnectView() {
      document.getElementById('instructionsView').classList.add('hidden');
      document.getElementById('emailSetupView').classList.add('hidden');
      document.getElementById('setupView').classList.remove('hidden');
      document.getElementById('apiKeyInput').focus();
    }

    function showInstructions() {
      document.getElementById('setupView').classList.add('hidden');
      document.getElementById('emailSetupView').classList.add('hidden');
      document.getElementById('instructionsView').classList.remove('hidden');
    }

    function showEmailSetup() {
      document.getElementById('setupView').classList.add('hidden');
      document.getElementById('instructionsView').classList.add('hidden');
      document.getElementById('emailSetupView').classList.remove('hidden');
      resetEmailForm();
      document.getElementById('emailInput').focus();
    }

    let pendingEmail = '';

    function submitEmail() {
      const email = document.getElementById('emailInput').value.trim();
      if (!email) {
        showEmailStatus('Please enter your email address', 'error');
        return;
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        showEmailStatus('Please enter a valid email address', 'error');
        return;
      }

      pendingEmail = email;

      // Show coming soon message (API not implemented yet)
      showEmailStatus('Email signup is coming soon! For now, please use Slack to get your API key.', 'info');

      // When API is ready, uncomment this to show OTP input:
      // vscode.postMessage({ command: 'sendOtp', email });
      // showOtpInput();
    }

    function showOtpInput() {
      document.getElementById('emailInputGroup').classList.add('hidden');
      document.getElementById('otpInputGroup').classList.remove('hidden');
      document.getElementById('otpInput').focus();
      showEmailStatus('OTP sent! Check your email for the 6-digit code.', 'success');
    }

    function verifyOtp() {
      const otp = document.getElementById('otpInput').value.trim();
      if (!otp) {
        showEmailStatus('Please enter the OTP code', 'error');
        return;
      }

      if (otp.length !== 6 || !/^\d+$/.test(otp)) {
        showEmailStatus('Please enter a valid 6-digit code', 'error');
        return;
      }

      // Show coming soon message (API not implemented yet)
      showEmailStatus('Email signup is coming soon! For now, please use Slack to get your API key.', 'info');

      // When API is ready, uncomment this:
      // vscode.postMessage({ command: 'verifyOtp', email: pendingEmail, otp });
    }

    function resendOtp() {
      if (!pendingEmail) {
        resetEmailForm();
        return;
      }

      // Show coming soon message (API not implemented yet)
      showEmailStatus('Email signup is coming soon! For now, please use Slack to get your API key.', 'info');

      // When API is ready, uncomment this:
      // vscode.postMessage({ command: 'sendOtp', email: pendingEmail });
      // showEmailStatus('OTP resent! Check your email.', 'success');
    }

    function resetEmailForm() {
      document.getElementById('emailInputGroup').classList.remove('hidden');
      document.getElementById('otpInputGroup').classList.add('hidden');
      document.getElementById('emailInput').value = '';
      document.getElementById('otpInput').value = '';
      document.getElementById('emailStatus').classList.add('hidden');
      pendingEmail = '';
    }

    function showEmailStatus(message, type) {
      const statusEl = document.getElementById('emailStatus');
      statusEl.classList.remove('hidden');
      statusEl.textContent = message;
      statusEl.style.background = type === 'error' ? '#ef444420' : type === 'success' ? '#22c55e20' : '#3b82f620';
      statusEl.style.color = type === 'error' ? '#ef4444' : type === 'success' ? '#22c55e' : '#3b82f6';
    }

    function handleApiKeySet(message) {
      hideLoader();
      if (message.success) {
        showToast('Connected successfully!', 'success');
        handleApiKeyStatus(message);
      } else {
        showToast(message.error || 'Failed to connect', 'error');
        addSetupError(message.error);
      }
    }

    function addSetupError(error) {
      const input = document.getElementById('apiKeyInput');
      input.style.borderColor = '#ef4444';
      setTimeout(() => input.style.borderColor = '', 2000);
    }

    function saveApiKey() {
      const apiKey = document.getElementById('apiKeyInput').value.trim();
      if (!apiKey) {
        showToast('Please enter your API key', 'warning');
        return;
      }

      showLoader('Connecting...');
      vscode.postMessage({ command: 'setApiKey', apiKey });
    }

    function verify(isDev) {
      const url = document.getElementById('urlInput').value.trim();
      if (!url) {
        showToast('Please enter a URL to verify', 'warning');
        document.getElementById('urlInput').focus();
        return;
      }

      showToast('Starting verification...', 'info', 2000);
      vscode.postMessage({
        command: isDev ? 'verifyDev' : 'verify',
        url
      });
    }

    function handleVerificationStarted(message) {
      clearEmptyState();
      addMessage('user', '🔍 Verifying: ' + message.url + (message.isDev ? ' (Quick Check)' : ' (Global)'));
      addLoadingMessage();
    }

    function handleVerificationSubmitted(message) {
      removeLoadingMessage();
      showToast('Verification submitted! Checking status...', 'success', 3000);
      const scansText = message.scansRemaining === 'Unlimited'
        ? 'Unlimited scans'
        : message.scansRemaining + ' scans remaining';

      const html = \`
        <div class="result-card" id="job-\${message.jobId}">
          <div class="result-header">
            <span class="result-state">✅</span>
            <div class="result-title">
              <div class="label">Verification Started</div>
              <div class="url">\${escapeHtml(message.url)}</div>
            </div>
          </div>
          <div class="result-body">
            <div class="detail-row">
              <span class="detail-label">Job ID:</span>
              <span class="detail-value">\${message.jobId}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Status:</span>
              <span class="detail-value" id="status-\${message.jobId}">Processing...</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Scans:</span>
              <span class="detail-value">\${scansText}</span>
            </div>
            <div class="job-buttons">
              <button class="btn-secondary btn-sm" onclick="checkJob('\${message.jobId}')">🔄 Check Results</button>
            </div>
          </div>
        </div>
      \`;
      addMessage('assistant', html);
    }

    function checkJob(jobId) {
      vscode.postMessage({ command: 'checkJob', jobId });
    }

    function openSlack() {
      vscode.postMessage({ command: 'openSlack' });
    }

    function handleJobChecking(jobId) {
      const statusEl = document.getElementById('status-' + jobId);
      if (statusEl) {
        statusEl.textContent = 'Checking...';
      }
    }

    function handleJobStatus(data) {
      const statusEl = document.getElementById('status-' + data.jobId);
      if (statusEl) {
        const total = data.totalJobs || data.summary?.totalContinents || 6;
        const completed = data.completedJobs || data.summary?.completedContinents || 0;
        const progressText = data.status === 'completed'
          ? 'Completed ✓'
          : \`Processing (\${completed}/\${total} regions)\`;
        statusEl.textContent = progressText;
      }

      // Only show results once when job is fully completed
      if (data.status === 'completed' && data.results && data.results.length > 0) {
        // Check if results already shown for this job
        const existingResult = document.getElementById('result-' + data.jobId);
        if (!existingResult) {
          showJobResults(data);
        }
      }
    }

    function handleJobError(jobId, error) {
      const statusEl = document.getElementById('status-' + jobId);
      if (statusEl) {
        statusEl.textContent = 'Error: ' + error;
        statusEl.style.color = '#ef4444';
      }
    }

    function showJobResults(data) {
      const results = data.results;
      // Consider a result completed if it has scores, httpStatus, or status === 'completed'
      const completedResults = results.filter(r => r.status === 'completed' || r.scores || r.httpStatus);

      if (completedResults.length === 0) return;

      // Use summary from API if available, otherwise calculate
      const summary = data.summary || {};
      const avgReachability = summary.avgReachability ?? Math.round(completedResults.reduce((sum, r) => sum + (r.scores?.reachability || 0), 0) / completedResults.length);
      const avgUsability = summary.avgUsability ?? Math.round(completedResults.reduce((sum, r) => sum + (r.scores?.usability || 0), 0) / completedResults.length);
      const avgResponseTime = Math.round(completedResults.reduce((sum, r) => sum + (r.responseTime || 0), 0) / completedResults.length);
      const overallState = summary.overallState || 'good';

      const stateInfo = getStateInfo(overallState);
      const continentMap = { NA: '🇺🇸', EU: '🇪🇺', AS: '🇯🇵', AF: '🇿🇦', OC: '🇦🇺', SA: '🇧🇷' };

      // Report links section
      const linksHtml = (data.reportUrl || data.galleryUrl) ? \`
        <div style="display:flex;gap:8px;margin-top:12px">
          \${data.reportUrl ? \`<a href="\${data.reportUrl}" style="flex:1;padding:6px;text-align:center;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border-radius:4px;text-decoration:none;font-size:11px">📄 Full Report</a>\` : ''}
          \${data.galleryUrl ? \`<a href="\${data.galleryUrl}" style="flex:1;padding:6px;text-align:center;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border-radius:4px;text-decoration:none;font-size:11px">🖼️ Gallery</a>\` : ''}
        </div>
      \` : '';

      // Build continent cards with screenshots
      const continentCardsHtml = results.map(r => {
        const flag = continentMap[r.continent] || '🌍';
        const name = r.continentName || r.continent;
        const state = r.scores?.state || r.state || r.status;
        const reachability = r.scores?.reachability;
        const usability = r.scores?.usability;
        const hasScores = reachability !== undefined && usability !== undefined;
        const hasResponse = r.responseTime != null && r.responseTime > 0;
        const screenshot = r.screenshotUrl || r.screenshot;

        // Determine status based on actual data
        let statusIcon, cardClass;
        if (r.status === 'completed' && hasScores) {
          if (state === 'perfect' || (reachability >= 100 && usability >= 91)) {
            statusIcon = '🟢';
            cardClass = '';
          } else if (state === 'good' || (reachability >= 100 && usability >= 76)) {
            statusIcon = '🟡';
            cardClass = 'warning';
          } else if (state === 'degraded') {
            statusIcon = '🟠';
            cardClass = 'warning';
          } else {
            statusIcon = '🔴';
            cardClass = 'failed';
          }
        } else if (r.status === 'failed' || r.error) {
          statusIcon = '❌';
          cardClass = 'failed';
        } else if (r.status === 'timeout') {
          statusIcon = '⏱️';
          cardClass = 'failed';
        } else {
          statusIcon = '⏳';
          cardClass = 'failed';
        }

        return \`
          <div class="continent-card \${cardClass}">
            <div class="continent-card-header">
              <span class="continent-card-flag">\${flag}</span>
              <span class="continent-card-name">\${name}</span>
              <span class="continent-card-status">\${statusIcon}</span>
            </div>
            \${hasScores ? \`
              <div class="continent-card-scores">
                <span>R: \${reachability}%</span>
                <span>U: \${usability}%</span>
                \${hasResponse ? \`<span>\${r.responseTime}ms</span>\` : ''}
              </div>
            \` : (r.error ? \`<div style="font-size:11px;color:#ef4444">\${r.error}</div>\` : '')}
            \${screenshot ? \`
              <div class="continent-card-screenshot" onclick="openExternal('\${screenshot}')">
                <img src="\${screenshot}" alt="\${name} screenshot" loading="lazy" />
              </div>
            \` : ''}
          </div>
        \`;
      }).join('');

      const html = \`
        <div class="result-card" id="result-\${data.jobId}">
          <div class="result-header">
            <span class="result-state">\${stateInfo.emoji}</span>
            <div class="result-title">
              <div class="label">\${stateInfo.label} - \${summary.completedContinents || completedResults.length}/\${summary.totalContinents || 6} regions</div>
              <div class="url">\${escapeHtml(data.normalizedUrl || data.url)}</div>
            </div>
          </div>
          <div class="result-body">
            <div class="scores-row">
              <div class="score-box">
                <div class="score-value \${avgReachability >= 90 ? 'score-good' : avgReachability >= 70 ? 'score-warning' : 'score-bad'}">\${avgReachability}%</div>
                <div class="score-label">Reachability</div>
              </div>
              <div class="score-box">
                <div class="score-value \${avgUsability >= 90 ? 'score-good' : avgUsability >= 70 ? 'score-warning' : 'score-bad'}">\${avgUsability}%</div>
                <div class="score-label">Usability</div>
              </div>
              <div class="score-box">
                <div class="score-value">\${avgResponseTime}ms</div>
                <div class="score-label">Avg Response</div>
              </div>
            </div>
            <div class="continents-grid">
              \${continentCardsHtml}
            </div>
            \${linksHtml}
          </div>
        </div>
      \`;
      addMessage('assistant', html);
    }

    function handleVerificationComplete(message) {
      removeLoadingMessage();

      if (message.isDev) {
        addDevResult(message.result);
      } else {
        addGlobalResult(message.result);
      }
    }

    function handleVerificationError(message) {
      removeLoadingMessage();
      showToast(message.error || 'Verification failed', 'error');
      addMessage('error', '❌ ' + message.error);
    }

    function addMessage(type, content) {
      const messages = document.getElementById('messages');
      const msg = document.createElement('div');
      msg.className = 'message ' + type;
      msg.innerHTML = content;
      messages.appendChild(msg);
      messages.scrollTop = messages.scrollHeight;
    }

    function addLoadingMessage() {
      const messages = document.getElementById('messages');
      const msg = document.createElement('div');
      msg.className = 'message loading';
      msg.id = 'loadingMessage';
      msg.innerHTML = '<div class="spinner"></div> Verifying across regions...';
      messages.appendChild(msg);
      messages.scrollTop = messages.scrollHeight;
    }

    function removeLoadingMessage() {
      const loading = document.getElementById('loadingMessage');
      if (loading) loading.remove();
    }

    function clearEmptyState() {
      const empty = document.querySelector('.empty-state');
      if (empty) empty.remove();
    }

    function addDevResult(result) {
      const state = result.scores?.state || 'unknown';
      const stateInfo = getStateInfo(state);

      const html = \`
        <div class="result-card">
          <div class="result-header">
            <span class="result-state">\${stateInfo.emoji}</span>
            <div class="result-title">
              <div class="label">\${stateInfo.label}</div>
              <div class="url">\${escapeHtml(result.url)}</div>
            </div>
          </div>
          <div class="result-body">
            <div class="scores-row">
              <div class="score-box">
                <div class="score-value \${getScoreClass(result.scores?.reachability)}">\${result.scores?.reachability || 0}%</div>
                <div class="score-label">Reachability</div>
              </div>
              <div class="score-box">
                <div class="score-value \${getScoreClass(result.scores?.usability)}">\${result.scores?.usability || 0}%</div>
                <div class="score-label">Usability</div>
              </div>
            </div>
            \${getWebVitalsHtml(result.webVitals)}
          </div>
        </div>
      \`;

      addMessage('assistant', html);
    }

    function addGlobalResult(result) {
      const state = result.summary?.overallState || 'unknown';
      const stateInfo = getStateInfo(state);

      const continentsHtml = result.continents.map(c => {
        // Handle different statuses properly
        let cState, statusText;
        if (c.status === 'completed') {
          cState = c.scores?.state || 'good';
          statusText = '';
        } else if (c.status === 'pending' || c.status === 'processing') {
          cState = 'pending';
          statusText = c.status === 'processing' ? '⏳' : '⏸️';
        } else if (c.status === 'failed' || c.status === 'timeout') {
          cState = 'down';
          statusText = c.error ? '❌' : '⏱️';
        } else {
          cState = 'unknown';
          statusText = '';
        }
        const cInfo = getStateInfo(cState);
        const continent = getContinentInfo(c.continent);
        const displayEmoji = statusText || cInfo.emoji;
        return \`
          <div class="continent-item \${c.status !== 'completed' ? 'failed' : ''}">
            <span>\${continent.flag}</span>
            <span>\${continent.label}</span>
            <span style="margin-left:auto">\${displayEmoji}</span>
          </div>
        \`;
      }).join('');

      const html = \`
        <div class="result-card">
          <div class="result-header">
            <span class="result-state">\${stateInfo.emoji}</span>
            <div class="result-title">
              <div class="label">\${stateInfo.label} - \${result.summary?.completed}/\${result.summary?.totalContinents} regions OK</div>
              <div class="url">\${escapeHtml(result.url)}</div>
            </div>
          </div>
          <div class="result-body">
            <div class="scores-row">
              <div class="score-box">
                <div class="score-value \${getScoreClass(result.summary?.avgReachability)}">\${result.summary?.avgReachability || 0}%</div>
                <div class="score-label">Avg Reachability</div>
              </div>
              <div class="score-box">
                <div class="score-value \${getScoreClass(result.summary?.avgUsability)}">\${result.summary?.avgUsability || 0}%</div>
                <div class="score-label">Avg Usability</div>
              </div>
            </div>
            <div class="continents-grid">
              \${continentsHtml}
            </div>
          </div>
        </div>
      \`;

      addMessage('assistant', html);
    }

    function handleAccountStatus(data) {
      clearEmptyState();
      const html = \`
        <div class="result-card">
          <div class="result-header">
            <span class="result-state">👤</span>
            <div class="result-title">
              <div class="label">\${data.user.userName}</div>
              <div class="url">\${data.user.teamName}</div>
            </div>
          </div>
          <div class="result-body">
            <div class="scores-row">
              <div class="score-box">
                <div class="score-value">\${data.billing.scansUsed}/\${data.billing.scansLimit}</div>
                <div class="score-label">Scans Used</div>
              </div>
              <div class="score-box">
                <div class="score-value" style="font-size:16px">\${data.billing.plan.toUpperCase()}</div>
                <div class="score-label">Plan</div>
              </div>
            </div>
          </div>
        </div>
      \`;
      addMessage('assistant', html);
    }

    function handleHistory(data, pagination) {
      // Store pagination for navigation
      historyPagination = pagination;

      // Handle both old format (data.scans) and new format (data as array)
      const scans = Array.isArray(data) ? data : (data.scans || data);
      const historyList = document.getElementById('historyList');
      const historyCount = document.getElementById('historyCount');
      const paginationEl = document.getElementById('historyPagination');

      // Update count
      const totalCount = pagination?.total || scans.length;
      historyCount.textContent = totalCount + ' scans';

      if (!scans || scans.length === 0) {
        historyList.innerHTML = \`
          <div class="empty-state">
            <div class="empty-state-icon">📜</div>
            <h3>No scans yet</h3>
            <p>Your verification history will appear here</p>
          </div>
        \`;
        paginationEl.classList.add('hidden');
        return;
      }

      const continentFlags = { NA: '🇺🇸', EU: '🇪🇺', AS: '🇯🇵', AF: '🇿🇦', OC: '🇦🇺', SA: '🇧🇷' };

      const scansHtml = scans.map(scan => {
        const state = scan.scores?.state || scan.status || 'unknown';
        const stateInfo = getStateInfo(state);
        const timeAgo = scan.createdAt ? formatTimeAgo(scan.createdAt) : '';
        const fullDate = scan.createdAt ? new Date(scan.createdAt).toLocaleString() : '';
        const flag = continentFlags[scan.continent] || '🌍';
        const reachability = scan.scores?.reachability;
        const usability = scan.scores?.usability;
        const responseTime = scan.responseTime;
        const httpStatus = scan.httpStatus;

        // Determine item class based on status
        let itemClass = 'history-item';
        if (state === 'failed' || state === 'down') itemClass += ' failed';
        else if (state === 'timeout') itemClass += ' timeout';

        // Score classes
        const rClass = reachability >= 90 ? 'good' : reachability >= 70 ? 'warning' : 'bad';
        const uClass = usability >= 90 ? 'good' : usability >= 70 ? 'warning' : 'bad';

        return \`
          <div class="\${itemClass}" onclick="viewScanDetails('\${scan.jobId}')" title="\${fullDate}">
            <div class="history-item-header">
              <span class="history-item-status">\${stateInfo.emoji}</span>
              <span class="history-item-url">\${escapeHtml(scan.url)}</span>
              <span class="history-item-time">\${timeAgo}</span>
            </div>
            <div class="history-item-details">
              <span class="history-item-detail">\${flag} \${scan.continentName || scan.continent || 'Global'}</span>
              \${httpStatus ? \`<span class="history-item-detail">HTTP \${httpStatus}</span>\` : ''}
              \${responseTime ? \`<span class="history-item-detail">⏱️ \${responseTime}ms</span>\` : ''}
            </div>
            \${reachability !== undefined || usability !== undefined ? \`
              <div class="history-item-scores">
                \${reachability !== undefined ? \`<span class="history-item-score \${rClass}">Reachability: \${reachability}%</span>\` : ''}
                \${usability !== undefined ? \`<span class="history-item-score \${uClass}">Usability: \${usability}%</span>\` : ''}
              </div>
            \` : ''}
            <div class="history-item-actions">
              \${scan.reportUrl ? \`<button class="btn-sm btn-secondary" style="font-size:10px" onclick="event.stopPropagation();openExternal('\${scan.reportUrl}')">📄 View Report</button>\` : ''}
              \${scan.screenshotUrl ? \`<button class="btn-sm btn-secondary" style="font-size:10px" onclick="event.stopPropagation();openExternal('\${scan.screenshotUrl}')">🖼️ Screenshot</button>\` : ''}
            </div>
          </div>
        \`;
      }).join('');

      historyList.innerHTML = scansHtml;

      // Update pagination
      if (pagination && pagination.totalPages > 1) {
        paginationEl.classList.remove('hidden');
        document.getElementById('pageInfo').textContent = \`Page \${pagination.page} of \${pagination.totalPages}\`;
        document.getElementById('prevPageBtn').disabled = !pagination.hasPrev;
        document.getElementById('nextPageBtn').disabled = !pagination.hasNext;
      } else {
        paginationEl.classList.add('hidden');
      }
    }

    function viewScanDetails(jobId) {
      if (jobId) {
        vscode.postMessage({ command: 'checkJob', jobId });
        switchTab('verify');
      }
    }

    function formatTimeAgo(dateStr) {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return diffMins + 'm ago';
      if (diffHours < 24) return diffHours + 'h ago';
      if (diffDays < 7) return diffDays + 'd ago';
      return date.toLocaleDateString();
    }

    function openSettings() {
      vscode.postMessage({ command: 'openSettings' });
    }

    function openExternal(url) {
      vscode.postMessage({ command: 'openExternal', url });
    }

    function getStateInfo(state) {
      const states = {
        perfect: { label: 'Perfect', emoji: '🟢' },
        good: { label: 'Good', emoji: '🟡' },
        degraded: { label: 'Degraded', emoji: '🟠' },
        down: { label: 'Down', emoji: '🔴' },
        pending: { label: 'Pending', emoji: '⏳' },
        processing: { label: 'Processing', emoji: '⏳' },
        completed: { label: 'Completed', emoji: '🟢' },
        failed: { label: 'Failed', emoji: '❌' },
        timeout: { label: 'Timeout', emoji: '⏱️' },
        unknown: { label: 'Unknown', emoji: '⚪' }
      };
      return states[state] || states.unknown;
    }

    function getContinentInfo(code) {
      const continents = {
        NA: { label: 'N. America', flag: '🇺🇸' },
        EU: { label: 'Europe', flag: '🇪🇺' },
        AS: { label: 'Asia', flag: '🇯🇵' },
        AF: { label: 'Africa', flag: '🇿🇦' },
        OC: { label: 'Oceania', flag: '🇦🇺' },
        SA: { label: 'S. America', flag: '🇧🇷' }
      };
      return continents[code] || { label: code, flag: '🌍' };
    }

    function getScoreClass(score) {
      if (score >= 90) return 'score-good';
      if (score >= 70) return 'score-warning';
      return 'score-bad';
    }

    function getWebVitalsHtml(vitals) {
      if (!vitals) return '';

      const items = [];
      if (vitals.lcp) items.push({ label: 'LCP', value: Math.round(vitals.lcp) + 'ms', rating: vitals.lcp <= 2500 ? 'good' : vitals.lcp <= 4000 ? 'warning' : 'poor' });
      if (vitals.fcp) items.push({ label: 'FCP', value: Math.round(vitals.fcp) + 'ms', rating: vitals.fcp <= 1800 ? 'good' : vitals.fcp <= 3000 ? 'warning' : 'poor' });
      if (vitals.ttfb) items.push({ label: 'TTFB', value: Math.round(vitals.ttfb) + 'ms', rating: vitals.ttfb <= 800 ? 'good' : vitals.ttfb <= 1800 ? 'warning' : 'poor' });
      if (vitals.cls !== null && vitals.cls !== undefined) items.push({ label: 'CLS', value: vitals.cls.toFixed(3), rating: vitals.cls <= 0.1 ? 'good' : vitals.cls <= 0.25 ? 'warning' : 'poor' });

      if (items.length === 0) return '';

      return \`
        <div class="vitals-section">
          <div class="vitals-title">Core Web Vitals</div>
          <div class="vitals-grid">
            \${items.map(item => \`
              <div class="vital-item \${item.rating}">
                <div class="vital-label">\${item.label}</div>
                <div class="vital-value">\${item.value}</div>
              </div>
            \`).join('')}
          </div>
        </div>
      \`;
    }

    function escapeHtml(text) {
      if (!text) return '';
      return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Toast notification functions
    function showToast(message, type = 'info', duration = 3000) {
      const container = document.getElementById('toastContainer');
      const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
      };

      const toast = document.createElement('div');
      toast.className = 'toast ' + type;
      toast.innerHTML = \`
        <span class="toast-icon">\${icons[type] || icons.info}</span>
        <span class="toast-message">\${escapeHtml(message)}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
      \`;

      container.appendChild(toast);

      // Auto-remove after duration
      if (duration > 0) {
        setTimeout(() => {
          toast.classList.add('hiding');
          setTimeout(() => toast.remove(), 300);
        }, duration);
      }

      return toast;
    }

    // Loader functions
    function showLoader(text = 'Loading...') {
      const loader = document.getElementById('overlayLoader');
      const loaderText = document.getElementById('loaderText');
      loaderText.textContent = text;
      loader.classList.remove('hidden');
    }

    function hideLoader() {
      const loader = document.getElementById('overlayLoader');
      loader.classList.add('hidden');
    }

    // Show loading in history list
    function showHistoryLoading() {
      const historyList = document.getElementById('historyList');
      historyList.innerHTML = \`
        <div class="history-loading">
          <div class="spinner"></div>
          <span>Loading history...</span>
        </div>
      \`;
    }

    // Enter key to verify
    document.getElementById('urlInput')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') verify(false);
    });

    document.getElementById('apiKeyInput')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') saveApiKey();
    });
  </script>
</body>
</html>`;
  }
}

module.exports = SidebarProvider;
