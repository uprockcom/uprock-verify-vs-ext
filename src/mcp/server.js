/**
 * MCP Server for UpRock Verify Extension
 *
 * Exposes verification tools via Model Context Protocol
 * so AI assistants can verify URLs on behalf of users.
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

class McpServer {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.server = null;
  }

  /**
   * Get tool definitions
   */
  getTools() {
    return [
      {
        name: 'verify_url',
        description: 'Verify a website URL across all 6 continents (NA, EU, AS, AF, OC, SA). Returns reachability scores, response times, and performance metrics from each region.',
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
              description: 'Continent to test from (NA=North America, EU=Europe, AS=Asia, AF=Africa, OC=Oceania, SA=South America)',
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
              description: 'Array of URLs to verify',
              minItems: 1,
              maxItems: 10
            }
          },
          required: ['urls']
        }
      },
      {
        name: 'get_job_status',
        description: 'Check the status of a verification job by its ID. Use this to get results of a previously started verification.',
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
        description: 'Get the current account status including remaining scans, plan details, and usage information.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'list_recent_scans',
        description: 'List recent verification scans with their results.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of scans to return (default: 10)',
              default: 10,
              minimum: 1,
              maximum: 50
            }
          }
        }
      }
    ];
  }

  /**
   * Handle tool calls
   */
  async handleToolCall(name, args) {
    try {
      // Check if API key is configured
      const hasKey = await this.apiClient.hasApiKey();
      if (!hasKey) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'API key not configured',
              message: 'Please configure your UpRock Verify API key in VS Code first. Run "UpRock Verify: Set API Key" from the command palette.'
            }, null, 2)
          }],
          isError: true
        };
      }

      let result;

      switch (name) {
        case 'verify_url':
          result = await this.apiClient.verify(args.url);
          break;

        case 'quick_verify':
          result = await this.apiClient.verifyDev(args.url, args.continent || 'NA');
          break;

        case 'batch_verify':
          result = await this.apiClient.batchVerify(args.urls);
          break;

        case 'get_job_status':
          result = await this.apiClient.getJobStatus(args.jobId);
          break;

        case 'get_account_status':
          result = await this.apiClient.getAccountStatus();
          break;

        case 'list_recent_scans':
          result = await this.apiClient.listScans(args.limit || 10, 0);
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
   * Initialize and start the MCP server
   */
  async start() {
    this.server = new Server(
      {
        name: 'uprock-verify',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Handle list tools request
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getTools()
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return this.handleToolCall(name, args || {});
    });

    // Connect via stdio transport
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.log('UpRock Verify MCP server started');
  }

  /**
   * Stop the MCP server
   */
  async stop() {
    if (this.server) {
      await this.server.close();
      this.server = null;
      console.log('UpRock Verify MCP server stopped');
    }
  }
}

module.exports = McpServer;
