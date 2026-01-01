/**
 * Status Commands for UpRock Verify Extension
 */

const vscode = require('vscode');

/**
 * Register status commands
 */
function registerStatusCommands(context, apiClient, resultsPanel) {
  // Show account status
  const statusCommand = vscode.commands.registerCommand('uprock.status', async () => {
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Fetching Account Status',
      cancellable: false
    }, async () => {
      try {
        const result = await apiClient.getAccountStatus();

        if (!result.success) {
          throw new Error(result.error || 'Failed to get account status');
        }

        const { user, billing } = result.data;

        // Create status message
        const statusItems = [
          `👤 User: ${user.userName} (${user.teamName})`,
          `📦 Plan: ${billing.plan.toUpperCase()}`,
          `📊 Scans: ${billing.scansUsed}/${billing.scansLimit} this month`,
          `✅ Status: ${billing.subscriptionStatus}`
        ];

        // Show quick pick with status info
        const action = await vscode.window.showQuickPick(
          [
            { label: statusItems[0], description: '' },
            { label: statusItems[1], description: '' },
            { label: statusItems[2], description: '' },
            { label: statusItems[3], description: '' },
            { label: '$(refresh) Refresh', value: 'refresh' },
            { label: '$(history) View Recent Scans', value: 'scans' },
            { label: '$(gear) Open Settings', value: 'settings' }
          ],
          { placeHolder: 'Account Status' }
        );

        if (action?.value === 'refresh') {
          vscode.commands.executeCommand('uprock.status');
        } else if (action?.value === 'scans') {
          vscode.commands.executeCommand('uprock.list');
        } else if (action?.value === 'settings') {
          vscode.commands.executeCommand('uprock.openSettings');
        }

      } catch (error) {
        vscode.window.showErrorMessage(`Failed to get status: ${error.message}`);
      }
    });
  });

  // List recent scans
  const listCommand = vscode.commands.registerCommand('uprock.list', async () => {
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Fetching Recent Scans',
      cancellable: false
    }, async () => {
      try {
        const result = await apiClient.listScans(20, 0);

        if (!result.success) {
          throw new Error(result.error || 'Failed to list scans');
        }

        const { scans, pagination } = result.data;

        if (scans.length === 0) {
          vscode.window.showInformationMessage('No recent scans found. Run a verification to get started!');
          return;
        }

        // Format scans for quick pick
        const items = scans.map(scan => {
          const state = scan.scores?.state || 'unknown';
          const stateInfo = STATE_DISPLAY[state] || { emoji: '⚪', label: 'Unknown' };
          const date = new Date(scan.createdAt).toLocaleString();

          return {
            label: `${stateInfo.emoji} ${scan.url}`,
            description: `${stateInfo.label} | R: ${scan.scores?.reachability || '-'}% U: ${scan.scores?.usability || '-'}%`,
            detail: `${date} | ${scan.continent || 'Global'} | ${scan.status}`,
            scan
          };
        });

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: `Recent Scans (${pagination.total} total)`,
          matchOnDescription: true,
          matchOnDetail: true
        });

        if (selected) {
          // Show scan details
          await showScanDetails(apiClient, resultsPanel, selected.scan);
        }

      } catch (error) {
        vscode.window.showErrorMessage(`Failed to list scans: ${error.message}`);
      }
    });
  });

  // Set API key
  const setApiKeyCommand = vscode.commands.registerCommand('uprock.setApiKey', async () => {
    const apiKey = await vscode.window.showInputBox({
      prompt: 'Enter your UpRock Verify API key',
      placeHolder: 'Enter API key...',
      password: true
    });

    if (!apiKey) return;

    await apiClient.setApiKey(apiKey);
    vscode.window.showInformationMessage('API key saved!');
  });

  // Open settings
  const openSettingsCommand = vscode.commands.registerCommand('uprock.openSettings', () => {
    vscode.commands.executeCommand('workbench.action.openSettings', 'uprockVerify');
  });

  // Clear API key
  const clearApiKeyCommand = vscode.commands.registerCommand('uprock.clearApiKey', async () => {
    const confirm = await vscode.window.showWarningMessage(
      'Are you sure you want to remove your API key?',
      'Yes, Remove',
      'Cancel'
    );

    if (confirm === 'Yes, Remove') {
      await apiClient.clearApiKey();
      vscode.window.showInformationMessage('API key removed.');
    }
  });

  // Advanced history with filters
  const historyCommand = vscode.commands.registerCommand('uprock.history', async () => {
    // Show filter options
    const filterOption = await vscode.window.showQuickPick(
      [
        { label: '$(list-ordered) All History', description: 'Show all scans', value: 'all' },
        { label: '$(check) Completed Only', description: 'Filter by completed status', value: 'completed' },
        { label: '$(error) Failed Only', description: 'Filter by failed status', value: 'failed' },
        { label: '$(globe) Filter by Region', description: 'Filter by continent', value: 'continent' },
        { label: '$(search) Search by URL', description: 'Filter by URL pattern', value: 'url' },
        { label: '$(calendar) Date Range', description: 'Filter by date range', value: 'date' }
      ],
      { placeHolder: 'Select filter option' }
    );

    if (!filterOption) return;

    const options = { limit: 25 };

    if (filterOption.value === 'completed') {
      options.status = 'completed';
    } else if (filterOption.value === 'failed') {
      options.status = 'failed';
    } else if (filterOption.value === 'continent') {
      const continent = await vscode.window.showQuickPick(
        [
          { label: 'North America', value: 'NA' },
          { label: 'Europe', value: 'EU' },
          { label: 'Asia', value: 'AS' },
          { label: 'Africa', value: 'AF' },
          { label: 'Oceania', value: 'OC' },
          { label: 'South America', value: 'SA' }
        ],
        { placeHolder: 'Select continent' }
      );
      if (!continent) return;
      options.continent = continent.value;
    } else if (filterOption.value === 'url') {
      const urlPattern = await vscode.window.showInputBox({
        prompt: 'Enter URL pattern to search',
        placeHolder: 'example.com'
      });
      if (!urlPattern) return;
      options.url = urlPattern;
    } else if (filterOption.value === 'date') {
      const fromDate = await vscode.window.showInputBox({
        prompt: 'From date (YYYY-MM-DD)',
        placeHolder: '2024-01-01'
      });
      if (fromDate) options.from = fromDate;

      const toDate = await vscode.window.showInputBox({
        prompt: 'To date (YYYY-MM-DD)',
        placeHolder: '2024-12-31'
      });
      if (toDate) options.to = toDate;
    }

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Fetching History',
      cancellable: false
    }, async () => {
      try {
        const result = await apiClient.getHistory(options);

        if (!result.success) {
          throw new Error(result.error || 'Failed to get history');
        }

        const { scans, pagination } = result.data;

        if (!scans || scans.length === 0) {
          vscode.window.showInformationMessage('No scans found matching your criteria.');
          return;
        }

        // Format scans for quick pick
        const items = scans.map(scan => {
          const state = scan.scores?.state || 'unknown';
          const stateInfo = STATE_DISPLAY[state] || { emoji: '⚪', label: 'Unknown' };
          const date = new Date(scan.createdAt).toLocaleString();

          return {
            label: `${stateInfo.emoji} ${scan.url}`,
            description: `${stateInfo.label} | R: ${scan.scores?.reachability || '-'}% U: ${scan.scores?.usability || '-'}%`,
            detail: `${date} | ${scan.continent || 'Global'} | ${scan.status}`,
            scan
          };
        });

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: `History (${pagination?.total || scans.length} results)`,
          matchOnDescription: true,
          matchOnDetail: true
        });

        if (selected) {
          await showScanDetails(apiClient, resultsPanel, selected.scan);
        }

      } catch (error) {
        vscode.window.showErrorMessage(`Failed to get history: ${error.message}`);
      }
    });
  });

  context.subscriptions.push(
    statusCommand,
    listCommand,
    setApiKeyCommand,
    openSettingsCommand,
    clearApiKeyCommand,
    historyCommand
  );
}

/**
 * Show scan details in results panel
 */
async function showScanDetails(apiClient, resultsPanel, scan) {
  try {
    const result = await apiClient.getJobStatus(scan.jobId);

    if (result.success) {
      resultsPanel.showJobDetails(result.data);
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to load scan details: ${error.message}`);
  }
}

module.exports = { registerStatusCommands };
