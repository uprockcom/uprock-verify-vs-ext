/**
 * Verification Commands for UpRock Verify Extension
 */

const vscode = require('vscode');
const { STATE_DISPLAY } = require('../constants');

/**
 * Register verification commands
 */
function registerVerifyCommands(context, apiClient, resultsPanel) {
  // Full global verification
  const verifyCommand = vscode.commands.registerCommand('uprock.verify', async () => {
    const url = await vscode.window.showInputBox({
      prompt: 'Enter URL to verify',
      placeHolder: 'https://example.com',
      validateInput: (value) => {
        if (!value) return 'URL is required';
        try {
          new URL(value.startsWith('http') ? value : `https://${value}`);
          return null;
        } catch {
          return 'Invalid URL format';
        }
      }
    });

    if (!url) return;

    await runVerification(apiClient, resultsPanel, url, false);
  });

  // Quick dev verification (single region)
  const verifyDevCommand = vscode.commands.registerCommand('uprock.verifyDev', async () => {
    const url = await vscode.window.showInputBox({
      prompt: 'Enter URL for quick verification (NA only)',
      placeHolder: 'https://example.com',
      validateInput: (value) => {
        if (!value) return 'URL is required';
        try {
          new URL(value.startsWith('http') ? value : `https://${value}`);
          return null;
        } catch {
          return 'Invalid URL format';
        }
      }
    });

    if (!url) return;

    await runVerification(apiClient, resultsPanel, url, true);
  });

  // Verify URL from current selection or cursor position
  const verifyCurrentCommand = vscode.commands.registerCommand('uprock.verifyCurrentFile', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor');
      return;
    }

    let url = '';

    // Check if there's a selection
    const selection = editor.selection;
    if (!selection.isEmpty) {
      url = editor.document.getText(selection).trim();
    } else {
      // Try to extract URL from current line
      const line = editor.document.lineAt(selection.active.line).text;
      const urlMatch = line.match(/https?:\/\/[^\s"'<>]+/);
      if (urlMatch) {
        url = urlMatch[0];
      }
    }

    if (!url) {
      // Fall back to input box
      url = await vscode.window.showInputBox({
        prompt: 'No URL found in selection. Enter URL to verify:',
        placeHolder: 'https://example.com'
      });
    }

    if (!url) return;

    // Validate URL
    try {
      new URL(url.startsWith('http') ? url : `https://${url}`);
    } catch {
      vscode.window.showErrorMessage('Invalid URL format');
      return;
    }

    // Ask verification type
    const verifyType = await vscode.window.showQuickPick(
      [
        { label: '$(globe) Global Verification', description: 'Verify from all 6 continents', value: 'global' },
        { label: '$(zap) Quick Dev Check', description: 'Quick check from North America only', value: 'dev' }
      ],
      { placeHolder: 'Select verification type' }
    );

    if (!verifyType) return;

    await runVerification(apiClient, resultsPanel, url, verifyType.value === 'dev');
  });

  context.subscriptions.push(verifyCommand, verifyDevCommand, verifyCurrentCommand);
}

/**
 * Run verification with progress
 */
async function runVerification(apiClient, resultsPanel, url, isDev) {
  const config = vscode.workspace.getConfiguration('uprockVerify');
  const showNotifications = config.get('showNotifications') !== false;

  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: isDev ? 'Quick Verification' : 'Global Verification',
    cancellable: false
  }, async (progress) => {
    try {
      progress.report({ message: `Verifying ${url}...` });

      let result;
      if (isDev) {
        result = await apiClient.verifyDev(url);
      } else {
        result = await apiClient.verify(url);
      }

      if (!result.success) {
        throw new Error(result.error || 'Verification failed');
      }

      // Show results panel
      resultsPanel.show(result, isDev);

      // Show notification summary
      if (showNotifications) {
        const state = isDev ? result.scores?.state : result.summary?.overallState;
        const stateInfo = STATE_DISPLAY[state] || STATE_DISPLAY.degraded;

        if (isDev) {
          vscode.window.showInformationMessage(
            `${stateInfo.emoji} ${url}: ${stateInfo.label} (R: ${result.scores?.reachability}%, U: ${result.scores?.usability}%)`
          );
        } else {
          vscode.window.showInformationMessage(
            `${stateInfo.emoji} ${url}: ${stateInfo.label} (${result.summary?.completed}/${result.summary?.totalContinents} regions OK)`
          );
        }
      }

    } catch (error) {
      vscode.window.showErrorMessage(`Verification failed: ${error.message}`);
    }
  });
}

module.exports = { registerVerifyCommands };
