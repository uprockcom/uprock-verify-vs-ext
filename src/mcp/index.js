#!/usr/bin/env node
/**
 * MCP Server Entry Point for UpRock Verify
 *
 * This script starts the MCP server as a standalone process.
 * It can be used by AI assistants like Claude Desktop to connect
 * to the UpRock Verify API.
 *
 * Usage:
 *   node src/mcp/index.js
 *
 * Environment variables:
 *   UPROCK_API_KEY - Your UpRock Verify API key
 *   UPROCK_API_URL - API base URL (optional)
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const API_BASE_URL = process.env.UPROCK_API_URL || 'https://768q7f2qhge7.share.zrok.io';
const EXTENSION_VERSION = '1.0.0';

/**
 * Parse shell profile file to extract UPROCK_API_KEY
 */
function parseShellProfile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    // Match: export UPROCK_API_KEY="value" or export UPROCK_API_KEY='value' or export UPROCK_API_KEY=value
    const patterns = [
      /export\s+UPROCK_API_KEY\s*=\s*"([^"]+)"/,
      /export\s+UPROCK_API_KEY\s*=\s*'([^']+)'/,
      /export\s+UPROCK_API_KEY\s*=\s*([^\s\n]+)/
    ];
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
  } catch (e) {
    // File unreadable
  }
  return null;
}

/**
 * Get API key from environment variable, shell profiles, or config file
 */
function getApiKey() {
  // First check environment variable
  if (process.env.UPROCK_API_KEY) {
    return process.env.UPROCK_API_KEY;
  }

  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (homeDir) {
    // Check shell profile files (for GUI apps that don't inherit shell env)
    const shellProfiles = [
      path.join(homeDir, '.zshrc'),
      path.join(homeDir, '.bashrc'),
      path.join(homeDir, '.bash_profile'),
      path.join(homeDir, '.profile'),
      path.join(homeDir, '.zshenv')
    ];

    for (const profile of shellProfiles) {
      const apiKey = parseShellProfile(profile);
      if (apiKey) {
        return apiKey;
      }
    }

    // Then check secure config file
    const configFile = path.join(homeDir, '.uprock-verify', 'config.json');
    if (fs.existsSync(configFile)) {
      try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        return config.apiKey;
      } catch (e) {
        // Config file invalid or unreadable
      }
    }
  }

  return null;
}

const API_KEY = getApiKey();

/**
 * Standalone API client for MCP server
 */
class StandaloneApiClient {
  constructor() {
    this.baseUrl = API_BASE_URL;
    this.apiKey = API_KEY;
  }

  async request(method, endpoint, data = null) {
    if (!this.apiKey) {
      throw new Error('API key not configured. Please set your API key in the UpRock Verify extension.');
    }

    try {
      const requestConfig = {
        method,
        url: `${this.baseUrl}${endpoint}`,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'x-extension-version': EXTENSION_VERSION,
          'x-mcp-client': 'true',
          'User-Agent': `UpRockVerify-MCP/${EXTENSION_VERSION}`
        },
        timeout: 180000
      };

      // Only add data for non-GET requests to avoid sending "null" body
      if (data && method !== 'GET') {
        requestConfig.data = data;
      }

      const response = await axios(requestConfig);
      return response.data;
    } catch (error) {
      if (error.response) {
        const errorMsg = error.response.data?.error || error.response.statusText;
        throw new Error(`API Error (${error.response.status}): ${errorMsg}`);
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('Request timed out');
      } else {
        throw new Error(`Network Error: ${error.message}`);
      }
    }
  }

  hasApiKey() {
    return !!this.apiKey;
  }

  async verify(url) {
    return this.request('POST', '/extension/verify', { url });
  }

  async verifyDev(url, continent = 'NA') {
    return this.request('POST', '/extension/verify', { url, continent, mode: 'dev' });
  }

  async batchVerify(urls) {
    return this.request('POST', '/extension/verify', { urls, mode: 'batch' });
  }

  async getJobStatus(jobId) {
    return this.request('GET', `/extension/job/${jobId}`);
  }

  async getJobDetails(jobId) {
    return this.request('GET', `/extension/job/${jobId}/details`);
  }

  async getAccountStatus() {
    return this.request('GET', '/extension/status');
  }

  async listScans(limit = 10, offset = 0) {
    return this.request('GET', `/extension/scans?limit=${limit}&offset=${offset}`);
  }

  async getLatestJob() {
    return this.request('GET', '/extension/latest');
  }

  async getHistory(options = {}) {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page);
    if (options.limit) params.append('limit', options.limit);
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

/**
 * Tool definitions
 */
const TOOLS = [
  {
    name: 'verify_url',
    description: 'Verify a website URL across all 6 continents (NA, EU, AS, AF, OC, SA). Returns reachability scores, response times, and performance metrics from each region. The verification runs asynchronously - use get_job_status to check results.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to verify (e.g., https://example.com)'
        }
      },
      required: ['url']
    }
  },
  {
    name: 'quick_verify',
    description: 'Quick verification of a URL from a single region. Faster than full verification but only tests one continent.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to verify'
        },
        continent: {
          type: 'string',
          enum: ['NA', 'EU', 'AS', 'AF', 'OC', 'SA'],
          description: 'Continent to test from: NA=North America, EU=Europe, AS=Asia, AF=Africa, OC=Oceania, SA=South America',
          default: 'NA'
        }
      },
      required: ['url']
    }
  },
  {
    name: 'batch_verify',
    description: 'Verify multiple URLs at once. Each URL is tested across all continents.',
    inputSchema: {
      type: 'object',
      properties: {
        urls: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of URLs to verify (max 10)',
          minItems: 1,
          maxItems: 10
        }
      },
      required: ['urls']
    }
  },
  {
    name: 'get_job_status',
    description: 'Check the status and progress of a verification job. Returns status (pending/processing/completed), progress percentage, and partial results.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: {
          type: 'string',
          description: 'The job ID returned from a verify request'
        }
      },
      required: ['jobId']
    }
  },
  {
    name: 'get_job_details',
    description: 'Get detailed results of a completed verification job including full metrics, response times, and performance data from all continents.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: {
          type: 'string',
          description: 'The job ID returned from a verify request'
        }
      },
      required: ['jobId']
    }
  },
  {
    name: 'get_account_status',
    description: 'Get your UpRock Verify account status including remaining scans and plan details.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'list_recent_scans',
    description: 'List your recent verification scans with their results.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of scans to return (1-50, default: 10)',
          default: 10
        }
      }
    }
  },
  {
    name: 'get_latest_job',
    description: 'Get the results of your most recent verification job.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_history',
    description: 'Get scan history with advanced filters. Filter by status, continent, URL pattern, date range, and more.',
    inputSchema: {
      type: 'object',
      properties: {
        page: {
          type: 'number',
          description: 'Page number (default: 1)',
          default: 1
        },
        limit: {
          type: 'number',
          description: 'Results per page (1-50, default: 10)',
          default: 10
        },
        status: {
          type: 'string',
          enum: ['pending', 'processing', 'completed', 'failed'],
          description: 'Filter by scan status'
        },
        continent: {
          type: 'string',
          enum: ['NA', 'EU', 'AS', 'AF', 'OC', 'SA'],
          description: 'Filter by continent (NA=North America, EU=Europe, AS=Asia, AF=Africa, OC=Oceania, SA=South America)'
        },
        url: {
          type: 'string',
          description: 'Filter by URL (partial match)'
        },
        from: {
          type: 'string',
          description: 'Filter from date (YYYY-MM-DD format)'
        },
        to: {
          type: 'string',
          description: 'Filter to date (YYYY-MM-DD format)'
        }
      }
    }
  }
];

/**
 * Handle tool calls
 */
async function handleToolCall(apiClient, name, args) {
  try {
    if (!apiClient.hasApiKey()) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'API key not configured',
            message: 'Please set your API key in the UpRock Verify VS Code extension first, or set the UPROCK_API_KEY environment variable.'
          }, null, 2)
        }],
        isError: true
      };
    }

    let result;

    switch (name) {
      case 'verify_url':
        result = await apiClient.verify(args.url);
        break;

      case 'quick_verify':
        result = await apiClient.verifyDev(args.url, args.continent || 'NA');
        break;

      case 'batch_verify':
        result = await apiClient.batchVerify(args.urls);
        break;

      case 'get_job_status':
        result = await apiClient.getJobStatus(args.jobId);
        break;

      case 'get_job_details':
        result = await apiClient.getJobDetails(args.jobId);
        break;

      case 'get_account_status':
        result = await apiClient.getAccountStatus();
        break;

      case 'list_recent_scans':
        result = await apiClient.listScans(args.limit || 10, 0);
        break;

      case 'get_latest_job':
        result = await apiClient.getLatestJob();
        break;

      case 'get_history':
        result = await apiClient.getHistory({
          page: args.page,
          limit: args.limit,
          status: args.status,
          continent: args.continent,
          url: args.url,
          from: args.from,
          to: args.to
        });
        break;

      default:
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ error: `Unknown tool: ${name}` }, null, 2)
          }],
          isError: true
        };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }]
    };

  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: error.message,
          tool: name,
          args: args
        }, null, 2)
      }],
      isError: true
    };
  }
}

/**
 * Main entry point
 */
async function main() {
  const apiClient = new StandaloneApiClient();

  const server = new Server(
    {
      name: 'uprock-verify',
      version: EXTENSION_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return handleToolCall(apiClient, name, args || {});
  });

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout is used for MCP communication)
  console.error('UpRock Verify MCP server started');
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
