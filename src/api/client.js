/**
 * API Client for UpRock Verify Extension
 */

const vscode = require('vscode');
const axios = require('axios');

// Extension version from package.json
const EXTENSION_VERSION = '1.0.1';

class ApiClient {
  constructor(context) {
    this.context = context;
    this.baseUrl = null;
    this.apiKey = null;
    this.machineId = vscode.env.machineId;
    this.sessionId = vscode.env.sessionId;
  }

  /**
   * Initialize the client with configuration
   */
  async init() {
    const config = vscode.workspace.getConfiguration('uprockVerify');
    this.baseUrl = config.get('apiBaseUrl') || 'https://api.uprockverify.com';
    this.apiKey = await this.context.secrets.get('uprockVerify.apiKey');
  }

  /**
   * Get the API key from secure storage
   */
  async getApiKey() {
    if (!this.apiKey) {
      this.apiKey = await this.context.secrets.get('uprockVerify.apiKey');
    }
    return this.apiKey;
  }

  /**
   * Set the API key in secure storage
   */
  async setApiKey(apiKey) {
    await this.context.secrets.store('uprockVerify.apiKey', apiKey);
    this.apiKey = apiKey;
  }

  /**
   * Clear the API key from secure storage
   */
  async clearApiKey() {
    await this.context.secrets.delete('uprockVerify.apiKey');
    this.apiKey = null;
  }

  /**
   * Check if API key is configured
   */
  async hasApiKey() {
    const key = await this.getApiKey();
    return !!key;
  }

  /**
   * Make an authenticated API request
   */
  async request(method, endpoint, data = null) {
    const apiKey = await this.getApiKey();

    if (!apiKey) {
      throw new Error('API key not configured. Run "UpRock Verify: Set API Key" to configure.');
    }

    const vsConfig = vscode.workspace.getConfiguration('uprockVerify');
    const requestTimeout = vsConfig.get('timeout') || 180000;

    try {
      const axiosConfig = {
        method,
        url: `${this.baseUrl}${endpoint}`,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'x-extension-version': EXTENSION_VERSION,
          'x-machine-id': this.machineId,
          'x-session-id': this.sessionId,
          'x-vscode-version': vscode.version,
          'x-app-name': vscode.env.appName,
          'User-Agent': `UpRockVerify/${EXTENSION_VERSION} (VSCode/${vscode.version})`
        },
        timeout: requestTimeout,
        transformResponse: [(data) => {
          if (!data || data === 'null') return null;
          try {
            return JSON.parse(data);
          } catch {
            return data;
          }
        }]
      };

      // Only include data for non-GET requests
      if (data && method !== 'GET') {
        axiosConfig.data = data;
      }

      const response = await axios(axiosConfig);

      return response.data;
    } catch (error) {
      if (error.response) {
        let errorMsg = error.response.statusText;
        const respData = error.response.data;
        if (respData && typeof respData === 'object' && respData.error) {
          errorMsg = respData.error;
        }
        throw new Error(`API Error (${error.response.status}): ${errorMsg}`);
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('Request timed out. The verification is taking longer than expected.');
      } else {
        throw new Error(`Network Error: ${error.message}`);
      }
    }
  }

  // ============================================
  // Authentication
  // ============================================

  /**
   * Validate an API key (sends key in body, not header)
   */
  async validateApiKey(apiKey) {
    const config = vscode.workspace.getConfiguration('uprockVerify');
    const timeout = config.get('timeout') || 180000;

    try {
      const response = await axios({
        method: 'POST',
        url: `${this.baseUrl}/extension/validate`,
        data: { apiKey },
        headers: {
          'Content-Type': 'application/json',
          'x-extension-version': EXTENSION_VERSION,
          'x-machine-id': this.machineId,
          'x-session-id': this.sessionId,
          'x-vscode-version': vscode.version,
          'x-app-name': vscode.env.appName,
          'User-Agent': `UpRockVerify/${EXTENSION_VERSION} (VSCode/${vscode.version})`
        },
        timeout,
        transformResponse: [(data) => {
          if (!data || data === 'null') return null;
          try {
            return JSON.parse(data);
          } catch {
            return data;
          }
        }]
      });
      return response.data;
    } catch (error) {
      if (error.response) {
        let errorMsg = error.response.statusText;
        const respData = error.response.data;
        if (respData && typeof respData === 'object' && respData.error) {
          errorMsg = respData.error;
        }
        throw new Error(`API Error (${error.response.status}): ${errorMsg}`);
      } else {
        throw new Error(`Network Error: ${error.message}`);
      }
    }
  }

  /**
   * Validate the current stored API key
   */
  async validateAuth() {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('API key not configured');
    }
    return this.validateApiKey(apiKey);
  }

  // ============================================
  // Verification
  // ============================================

  /**
   * Start a verification
   */
  async verify(url) {
    return this.request('POST', '/extension/verify', { url });
  }

  /**
   * Start a quick dev verification (single region)
   */
  async verifyDev(url, continent = 'NA') {
    return this.request('POST', '/extension/verify', { url, continent, mode: 'dev' });
  }

  /**
   * Batch verify multiple URLs
   */
  async batchVerify(urls) {
    return this.request('POST', '/extension/verify', { urls, mode: 'batch' });
  }

  // ============================================
  // Status & Results
  // ============================================

  /**
   * Get user status
   */
  async getAccountStatus() {
    return this.request('GET', '/extension/status');
  }

  /**
   * Get job progress (real-time status)
   */
  async getJobProgress(jobId) {
    return this.request('GET', `/extension/job/${jobId}`);
  }

  /**
   * Get detailed job results
   */
  async getJobDetails(jobId) {
    return this.request('GET', `/extension/job/${jobId}/details`);
  }

  /**
   * Get job status - returns full job data including results when completed
   * The /extension/job/:jobId endpoint now returns rich data with summary, bestResult, etc.
   */
  async getJobStatus(jobId) {
    return this.getJobProgress(jobId);
  }

  /**
   * List recent scans
   */
  async listScans(limit = 10, offset = 0) {
    return this.request('GET', `/extension/scans?limit=${limit}&offset=${offset}`);
  }

  /**
   * Get scan history with advanced filters
   * @param {Object} options - Filter options
   * @param {number} options.page - Page number (default: 1)
   * @param {number} options.limit - Results per page (default: 10, max: 50)
   * @param {string} options.team_id - Filter by team ID
   * @param {string} options.status - Filter by status (pending, processing, completed, failed)
   * @param {string} options.continent - Filter by continent (NA, EU, AS, AF, OC, SA)
   * @param {string} options.url - Filter by URL (partial match)
   * @param {string} options.from - Filter from date (YYYY-MM-DD)
   * @param {string} options.to - Filter to date (YYYY-MM-DD)
   */
  async getHistory(options = {}) {
    const params = new URLSearchParams();

    if (options.page) params.append('page', options.page);
    if (options.limit) params.append('limit', options.limit);
    if (options.team_id) params.append('team_id', options.team_id);
    if (options.status) params.append('status', options.status);
    if (options.continent) params.append('continent', options.continent);
    if (options.url) params.append('url', options.url);
    if (options.from) params.append('from', options.from);
    if (options.to) params.append('to', options.to);

    const queryString = params.toString();
    const endpoint = queryString ? `/extension/history?${queryString}` : '/extension/history';

    return this.request('GET', endpoint);
  }
}

module.exports = ApiClient;
