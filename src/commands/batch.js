/**
 * Batch Commands for UpRock Verify Extension
 */

const vscode = require('vscode');

/**
 * Register batch commands
 */
function registerBatchCommands(context, apiClient, resultsPanel) {
  // Batch verify multiple URLs
  const batchCommand = vscode.commands.registerCommand('uprock.batch', async () => {
    // Get URLs from user
    const urlsInput = await vscode.window.showInputBox({
      prompt: 'Enter URLs to verify (comma-separated, max 10)',
      placeHolder: 'https://example1.com, https://example2.com',
      validateInput: (value) => {
        if (!value) return 'At least one URL is required';
        const urls = value.split(',').map(u => u.trim()).filter(Boolean);
        if (urls.length > 10) return 'Maximum 10 URLs allowed';
        for (const url of urls) {
          try {
            new URL(url.startsWith('http') ? url : `https://${url}`);
          } catch {
            return `Invalid URL: ${url}`;
          }
        }
        return null;
      }
    });

    if (!urlsInput) return;

    const urls = urlsInput.split(',').map(u => {
      const trimmed = u.trim();
      return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
    }).filter(Boolean);

    await runBatchVerification(apiClient, resultsPanel, urls);
  });

  // Batch verify URLs from file
  const batchFromFileCommand = vscode.commands.registerCommand('uprock.batchFromFile', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor. Open a file with URLs (one per line).');
      return;
    }

    const text = editor.document.getText();
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // Extract URLs from lines
    const urls = [];
    for (const line of lines) {
      // Try to match URL in line
      const urlMatch = line.match(/https?:\/\/[^\s"'<>]+/);
      if (urlMatch) {
        urls.push(urlMatch[0]);
      } else if (line.match(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}/)) {
        // Looks like a domain
        urls.push(`https://${line}`);
      }
    }

    if (urls.length === 0) {
      vscode.window.showErrorMessage('No valid URLs found in the current file.');
      return;
    }

    if (urls.length > 10) {
      const proceed = await vscode.window.showWarningMessage(
        `Found ${urls.length} URLs. Only the first 10 will be verified.`,
        'Continue',
        'Cancel'
      );
      if (proceed !== 'Continue') return;
    }

    const urlsToVerify = urls.slice(0, 10);

    // Show URLs and confirm
    const confirm = await vscode.window.showQuickPick(
      [
        { label: '$(check) Verify These URLs', value: 'verify' },
        { label: '$(close) Cancel', value: 'cancel' }
      ],
      {
        placeHolder: `Found ${urlsToVerify.length} URLs: ${urlsToVerify.slice(0, 3).join(', ')}${urlsToVerify.length > 3 ? '...' : ''}`
      }
    );

    if (!confirm || confirm.value === 'cancel') return;

    await runBatchVerification(apiClient, resultsPanel, urlsToVerify);
  });

  context.subscriptions.push(batchCommand, batchFromFileCommand);
}

/**
 * Run batch verification with progress
 */
async function runBatchVerification(apiClient, resultsPanel, urls) {
  const config = vscode.workspace.getConfiguration('uprockVerify');
  const showNotifications = config.get('showNotifications') !== false;

  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Batch Verification',
    cancellable: false
  }, async (progress) => {
    try {
      progress.report({ message: `Verifying ${urls.length} URLs...` });

      const result = await apiClient.batchVerify(urls);

      if (!result.success) {
        throw new Error(result.error || 'Batch verification failed');
      }

      // Show results panel
      resultsPanel.showBatch(result);

      // Show notification summary
      if (showNotifications) {
        const { completed, failed, total } = result.summary;
        vscode.window.showInformationMessage(
          `Batch verification complete: ${completed}/${total} successful, ${failed} failed`
        );
      }

    } catch (error) {
      vscode.window.showErrorMessage(`Batch verification failed: ${error.message}`);
    }
  });
}

module.exports = { registerBatchCommands };
