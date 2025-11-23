# MCP Servers Configuration

This project includes configuration for Model Context Protocol (MCP) servers that extend Claude's capabilities with access to external tools and data.

## Configured Servers

### Cloudflare Bindings MCP Server

The Cloudflare Bindings MCP server provides direct integration with your Cloudflare account and Workers bindings, enabling Claude Code to:

- **Access Cloudflare Services**: Query and interact with your Cloudflare account resources
- **Manage Workers**: Deploy and manage Cloudflare Workers directly from Claude
- **Query D1 Databases**: Execute SQL queries on your D1 database bindings
- **Access KV Storage**: Read and write to Cloudflare KV namespaces
- **Interact with Vectorize**: Query and manage your vector indices

#### Setup Instructions

1. **Initial Configuration** (Already Done)
   - The server is configured in `.claude/settings.json`
   - Uses the remote MCP server at `https://bindings.mcp.cloudflare.com/mcp`

2. **Authentication**
   - When you first use Claude Code with this project, a browser window will automatically open
   - Complete the OAuth authentication flow with your Cloudflare account
   - Grant the necessary permissions for accessing your account resources

3. **Using the Server**
   - Once authenticated, Claude can automatically detect and use your Cloudflare bindings
   - You can ask Claude to query your D1 database, access KV storage, or interact with other Cloudflare services
   - Example: "Query my D1 database for all documents" or "List all conversations from the messages table"

#### Example Use Cases for This Project

- **Debugging**: Ask Claude to query the database to understand schema and data
- **Migrations**: Run database migrations and verify schema changes
- **Data Analysis**: Analyze conversation patterns or document metadata
- **Development**: Deploy changes to Workers directly from the IDE
- **Vector Search**: Test vector index queries and embeddings

## Configuration Files

- **`.claude/settings.json`** - Shared project configuration (tracked in git)
  - Contains MCP server definitions
  - Should be committed to version control

- **`.claude/settings.local.json`** - Personal preferences (not tracked in git)
  - Use for user-specific settings
  - Automatically gitignored

## Managing MCP Servers

```bash
# List all available MCP servers
claude mcp list

# Get details about a specific server
claude mcp get cloudflare

# Reload MCP configuration
# (Usually done automatically when Claude Code restarts)
```

## Security Notes

- OAuth tokens are stored securely by Claude Code
- Authentication is scoped to only necessary permissions
- Sensitive data is never logged or shared beyond your local Claude Code instance
- Always review what data an MCP server can access before granting permissions

## Further Reading

- [Cloudflare MCP Server Repository](https://github.com/cloudflare/mcp-server-cloudflare)
- [Model Context Protocol Documentation](https://modelcontextprotocol.io/)
- [Claude Code MCP Guide](https://code.claude.com/docs)
