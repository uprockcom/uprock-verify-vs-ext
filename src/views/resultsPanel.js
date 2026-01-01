/**
 * Results Panel Webview for UpRock Verify Extension
 */

const vscode = require('vscode');
const { STATE_DISPLAY, CONTINENT_DISPLAY, WEB_VITALS_THRESHOLDS } = require('../constants');

class ResultsPanel {
  constructor(context) {
    this.context = context;
    this.panel = null;
  }

  /**
   * Show verification results
   */
  show(result, isDev = false) {
    this.createPanel();

    if (isDev) {
      this.panel.webview.html = this.getDevResultHtml(result);
    } else {
      this.panel.webview.html = this.getGlobalResultHtml(result);
    }
  }

  /**
   * Show batch results
   */
  showBatch(result) {
    this.createPanel();
    this.panel.webview.html = this.getBatchResultHtml(result);
  }

  /**
   * Show job details
   */
  showJobDetails(data) {
    this.createPanel();
    this.panel.webview.html = this.getJobDetailsHtml(data);
  }

  /**
   * Create or reveal the panel
   */
  createPanel() {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'uprockVerifyResults',
      'UpRock Verify Results',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    this.panel.onDidDispose(() => {
      this.panel = null;
    });
  }

  /**
   * Get HTML for dev verification result
   */
  getDevResultHtml(result) {
    const state = result.scores?.state || 'unknown';
    const stateInfo = STATE_DISPLAY[state] || STATE_DISPLAY.degraded;

    return this.getBaseHtml(`
      <div class="header">
        <h1>${stateInfo.emoji} Quick Verification Result</h1>
        <p class="url">${this.escapeHtml(result.url)}</p>
      </div>

      <div class="state-badge" style="background-color: ${stateInfo.color}20; border-color: ${stateInfo.color}">
        <span class="state-emoji">${stateInfo.emoji}</span>
        <span class="state-label">${stateInfo.label}</span>
        <span class="state-desc">${stateInfo.description}</span>
      </div>

      <div class="scores-grid">
        <div class="score-card">
          <div class="score-value">${result.scores?.reachability || 0}%</div>
          <div class="score-label">Reachability</div>
          <div class="score-bar">
            <div class="score-fill" style="width: ${result.scores?.reachability || 0}%; background: ${this.getScoreColor(result.scores?.reachability)}"></div>
          </div>
        </div>
        <div class="score-card">
          <div class="score-value">${result.scores?.usability || 0}%</div>
          <div class="score-label">Usability</div>
          <div class="score-bar">
            <div class="score-fill" style="width: ${result.scores?.usability || 0}%; background: ${this.getScoreColor(result.scores?.usability)}"></div>
          </div>
        </div>
      </div>

      <div class="section">
        <h2>Details</h2>
        <div class="details-grid">
          <div class="detail-item">
            <span class="detail-label">Region</span>
            <span class="detail-value">${CONTINENT_DISPLAY[result.continent]?.label || result.continent}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">HTTP Status</span>
            <span class="detail-value">${result.httpStatus || '-'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Response Time</span>
            <span class="detail-value">${result.responseTime ? result.responseTime + 'ms' : '-'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Time Elapsed</span>
            <span class="detail-value">${result.elapsedSeconds}s</span>
          </div>
        </div>
      </div>

      ${this.getWebVitalsHtml(result.webVitals)}

      ${result.screenshotUrl ? `
        <div class="section">
          <h2>Screenshot</h2>
          <img src="${result.screenshotUrl}" alt="Screenshot" class="screenshot" />
        </div>
      ` : ''}
    `);
  }

  /**
   * Get HTML for global verification result
   */
  getGlobalResultHtml(result) {
    const state = result.summary?.overallState || 'unknown';
    const stateInfo = STATE_DISPLAY[state] || STATE_DISPLAY.degraded;

    const continentsHtml = result.continents.map(c => {
      const cState = c.scores?.state || (c.status === 'completed' ? 'unknown' : 'down');
      const cStateInfo = STATE_DISPLAY[cState] || STATE_DISPLAY.down;
      const continentInfo = CONTINENT_DISPLAY[c.continent] || { label: c.continent, flag: '🌍' };

      return `
        <div class="continent-card ${c.status !== 'completed' ? 'failed' : ''}">
          <div class="continent-header">
            <span class="continent-flag">${continentInfo.flag}</span>
            <span class="continent-name">${continentInfo.label}</span>
            <span class="continent-state">${cStateInfo.emoji}</span>
          </div>
          ${c.status === 'completed' ? `
            <div class="continent-scores">
              <span>R: ${c.scores?.reachability || 0}%</span>
              <span>U: ${c.scores?.usability || 0}%</span>
            </div>
            <div class="continent-details">
              <span>HTTP ${c.httpStatus || '-'}</span>
              <span>${c.responseTime ? c.responseTime + 'ms' : '-'}</span>
            </div>
          ` : `
            <div class="continent-error">${c.error || c.status}</div>
          `}
        </div>
      `;
    }).join('');

    return this.getBaseHtml(`
      <div class="header">
        <h1>${stateInfo.emoji} Global Verification Result</h1>
        <p class="url">${this.escapeHtml(result.url)}</p>
      </div>

      <div class="state-badge" style="background-color: ${stateInfo.color}20; border-color: ${stateInfo.color}">
        <span class="state-emoji">${stateInfo.emoji}</span>
        <span class="state-label">${stateInfo.label}</span>
        <span class="state-desc">${stateInfo.description}</span>
      </div>

      <div class="summary-grid">
        <div class="summary-item">
          <div class="summary-value">${result.summary?.completed || 0}/${result.summary?.totalContinents || 6}</div>
          <div class="summary-label">Regions OK</div>
        </div>
        <div class="summary-item">
          <div class="summary-value">${result.summary?.avgReachability || 0}%</div>
          <div class="summary-label">Avg Reachability</div>
        </div>
        <div class="summary-item">
          <div class="summary-value">${result.summary?.avgUsability || 0}%</div>
          <div class="summary-label">Avg Usability</div>
        </div>
        <div class="summary-item">
          <div class="summary-value">${result.elapsedSeconds}s</div>
          <div class="summary-label">Total Time</div>
        </div>
      </div>

      <div class="section">
        <h2>Results by Region</h2>
        <div class="continents-grid">
          ${continentsHtml}
        </div>
      </div>
    `);
  }

  /**
   * Get HTML for batch verification result
   */
  getBatchResultHtml(result) {
    const resultsHtml = result.results.map(r => {
      const state = r.scores?.state || (r.status === 'completed' ? 'unknown' : 'down');
      const stateInfo = STATE_DISPLAY[state] || STATE_DISPLAY.down;

      return `
        <div class="batch-item ${r.status !== 'completed' ? 'failed' : ''}">
          <div class="batch-state">${stateInfo.emoji}</div>
          <div class="batch-url">${this.escapeHtml(r.url)}</div>
          ${r.status === 'completed' ? `
            <div class="batch-scores">
              <span>R: ${r.scores?.reachability || 0}%</span>
              <span>U: ${r.scores?.usability || 0}%</span>
            </div>
          ` : `
            <div class="batch-error">${r.error || r.status}</div>
          `}
        </div>
      `;
    }).join('');

    return this.getBaseHtml(`
      <div class="header">
        <h1>📋 Batch Verification Results</h1>
        <p class="subtitle">${result.summary.total} URLs verified</p>
      </div>

      <div class="summary-grid">
        <div class="summary-item success">
          <div class="summary-value">${result.summary.completed}</div>
          <div class="summary-label">Successful</div>
        </div>
        <div class="summary-item error">
          <div class="summary-value">${result.summary.failed}</div>
          <div class="summary-label">Failed</div>
        </div>
        <div class="summary-item">
          <div class="summary-value">${result.elapsedSeconds}s</div>
          <div class="summary-label">Total Time</div>
        </div>
      </div>

      <div class="section">
        <h2>Results</h2>
        <div class="batch-list">
          ${resultsHtml}
        </div>
      </div>
    `);
  }

  /**
   * Get HTML for job details
   */
  getJobDetailsHtml(data) {
    const state = data.scores?.state || 'unknown';
    const stateInfo = STATE_DISPLAY[state] || STATE_DISPLAY.degraded;

    return this.getBaseHtml(`
      <div class="header">
        <h1>${stateInfo.emoji} Scan Details</h1>
        <p class="url">${this.escapeHtml(data.url || data.jobId)}</p>
      </div>

      <div class="state-badge" style="background-color: ${stateInfo.color}20; border-color: ${stateInfo.color}">
        <span class="state-emoji">${stateInfo.emoji}</span>
        <span class="state-label">${stateInfo.label}</span>
      </div>

      ${data.scores ? `
        <div class="scores-grid">
          <div class="score-card">
            <div class="score-value">${data.scores.reachability || 0}%</div>
            <div class="score-label">Reachability</div>
          </div>
          <div class="score-card">
            <div class="score-value">${data.scores.usability || 0}%</div>
            <div class="score-label">Usability</div>
          </div>
        </div>
      ` : ''}

      <div class="section">
        <h2>Details</h2>
        <div class="details-grid">
          <div class="detail-item">
            <span class="detail-label">Job ID</span>
            <span class="detail-value mono">${data.jobId}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Status</span>
            <span class="detail-value">${data.status}</span>
          </div>
          ${data.continent ? `
            <div class="detail-item">
              <span class="detail-label">Region</span>
              <span class="detail-value">${CONTINENT_DISPLAY[data.continent]?.label || data.continent}</span>
            </div>
          ` : ''}
          ${data.createdAt ? `
            <div class="detail-item">
              <span class="detail-label">Created</span>
              <span class="detail-value">${new Date(data.createdAt).toLocaleString()}</span>
            </div>
          ` : ''}
        </div>
      </div>

      ${data.webVitals ? this.getWebVitalsHtml(data.webVitals) : ''}

      ${data.screenshotUrl ? `
        <div class="section">
          <h2>Screenshot</h2>
          <img src="${data.screenshotUrl}" alt="Screenshot" class="screenshot" />
        </div>
      ` : ''}
    `);
  }

  /**
   * Get Web Vitals HTML section
   */
  getWebVitalsHtml(webVitals) {
    if (!webVitals) return '';

    const vitals = [
      { key: 'lcp', value: webVitals.lcp },
      { key: 'cls', value: webVitals.cls },
      { key: 'ttfb', value: webVitals.ttfb },
      { key: 'fcp', value: webVitals.fcp },
      { key: 'tti', value: webVitals.tti }
    ].filter(v => v.value !== null && v.value !== undefined);

    if (vitals.length === 0) return '';

    const vitalsHtml = vitals.map(v => {
      const threshold = WEB_VITALS_THRESHOLDS[v.key];
      const rating = this.getVitalRating(v.value, threshold);
      const displayValue = threshold.unit === 'ms'
        ? `${Math.round(v.value)}${threshold.unit}`
        : v.value.toFixed(3);

      return `
        <div class="vital-item ${rating}">
          <div class="vital-label">${threshold.label}</div>
          <div class="vital-value">${displayValue}</div>
          <div class="vital-rating">${rating.toUpperCase()}</div>
        </div>
      `;
    }).join('');

    return `
      <div class="section">
        <h2>Core Web Vitals</h2>
        <div class="vitals-grid">
          ${vitalsHtml}
        </div>
      </div>
    `;
  }

  /**
   * Get vital rating (good/needs-improvement/poor)
   */
  getVitalRating(value, threshold) {
    if (value <= threshold.good) return 'good';
    if (value <= threshold.poor) return 'needs-improvement';
    return 'poor';
  }

  /**
   * Get score color based on value
   */
  getScoreColor(score) {
    if (score >= 90) return '#22c55e';
    if (score >= 75) return '#eab308';
    if (score >= 50) return '#f97316';
    return '#ef4444';
  }

  /**
   * Escape HTML
   */
  escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Get base HTML template
   */
  getBaseHtml(content) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UpRock Verify Results</title>
  <style>
    :root {
      --vscode-font-family: var(--vscode-editor-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif);
      --green: #22c55e;
      --yellow: #eab308;
      --orange: #f97316;
      --red: #ef4444;
    }

    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      line-height: 1.5;
    }

    .header {
      margin-bottom: 24px;
    }

    h1 {
      font-size: 1.5em;
      margin: 0 0 8px 0;
      font-weight: 600;
    }

    h2 {
      font-size: 1.1em;
      margin: 0 0 12px 0;
      font-weight: 600;
      color: var(--vscode-foreground);
      opacity: 0.9;
    }

    .url, .subtitle {
      font-size: 0.9em;
      color: var(--vscode-descriptionForeground);
      word-break: break-all;
    }

    .state-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      border-radius: 8px;
      border: 2px solid;
      margin-bottom: 24px;
    }

    .state-emoji {
      font-size: 1.5em;
    }

    .state-label {
      font-weight: 600;
      font-size: 1.1em;
    }

    .state-desc {
      font-size: 0.85em;
      opacity: 0.8;
    }

    .scores-grid, .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .score-card, .summary-item {
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 8px;
      padding: 16px;
      text-align: center;
    }

    .score-value, .summary-value {
      font-size: 1.8em;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .score-label, .summary-label {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
    }

    .score-bar {
      height: 6px;
      background: var(--vscode-input-background);
      border-radius: 3px;
      margin-top: 8px;
      overflow: hidden;
    }

    .score-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.3s ease;
    }

    .summary-item.success .summary-value { color: var(--green); }
    .summary-item.error .summary-value { color: var(--red); }

    .section {
      margin-bottom: 24px;
    }

    .details-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
    }

    .detail-item {
      display: flex;
      justify-content: space-between;
      padding: 8px 12px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 4px;
    }

    .detail-label {
      color: var(--vscode-descriptionForeground);
    }

    .detail-value {
      font-weight: 500;
    }

    .detail-value.mono {
      font-family: var(--vscode-editor-font-family);
      font-size: 0.85em;
    }

    .continents-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
    }

    .continent-card {
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 8px;
      padding: 12px;
    }

    .continent-card.failed {
      opacity: 0.7;
      border: 1px solid var(--red);
    }

    .continent-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .continent-flag {
      font-size: 1.2em;
    }

    .continent-name {
      flex: 1;
      font-weight: 500;
    }

    .continent-scores {
      display: flex;
      gap: 12px;
      font-size: 0.9em;
      margin-bottom: 4px;
    }

    .continent-details {
      font-size: 0.8em;
      color: var(--vscode-descriptionForeground);
      display: flex;
      gap: 12px;
    }

    .continent-error {
      font-size: 0.85em;
      color: var(--red);
    }

    .vitals-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
    }

    .vital-item {
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 8px;
      padding: 12px;
      border-left: 4px solid;
    }

    .vital-item.good { border-color: var(--green); }
    .vital-item.needs-improvement { border-color: var(--yellow); }
    .vital-item.poor { border-color: var(--red); }

    .vital-label {
      font-size: 0.8em;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 4px;
    }

    .vital-value {
      font-size: 1.3em;
      font-weight: 600;
    }

    .vital-rating {
      font-size: 0.75em;
      font-weight: 600;
      margin-top: 4px;
    }

    .vital-item.good .vital-rating { color: var(--green); }
    .vital-item.needs-improvement .vital-rating { color: var(--yellow); }
    .vital-item.poor .vital-rating { color: var(--red); }

    .batch-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .batch-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 8px;
    }

    .batch-item.failed {
      border: 1px solid var(--red);
      opacity: 0.8;
    }

    .batch-state {
      font-size: 1.2em;
    }

    .batch-url {
      flex: 1;
      word-break: break-all;
      font-size: 0.9em;
    }

    .batch-scores {
      display: flex;
      gap: 12px;
      font-size: 0.9em;
    }

    .batch-error {
      color: var(--red);
      font-size: 0.85em;
    }

    .screenshot {
      max-width: 100%;
      border-radius: 8px;
      border: 1px solid var(--vscode-panel-border);
    }
  </style>
</head>
<body>
  ${content}
</body>
</html>`;
  }
}

module.exports = ResultsPanel;
