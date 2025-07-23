## TypeScript MCP Starter Project

This is a Model Context Protocol (MCP) sample project built with TypeScript that includes both client and server components, demonstrating how to build intelligent tool calling systems using the MCP protocol.

### Project Structure

```
src/
├── client.ts    # Client implementation
└── server.ts    # Server implementation
```


### Core Features

#### Server (server.ts)

- MCP server built on Express
- Implements Server-Sent Events (SSE) transport protocol support
- Provides a sample tool `greeting`:
    - Takes user's name as parameter
    - Returns a personalized greeting message
- Supports two transport methods: SSE and Streamable HTTP (partially implemented)

#### Client (client.ts)

- Integrates Ollama to enable AI conversation capabilities
- Connects to the MCP server via SSE protocol
- Automatically discovers and registers tools provided by the server
- Supports tool calling workflow:
    - Sends user queries to AI
    - Parses tool call requests from AI responses
    - Executes appropriate tool calls
    - Retrieves and processes tool execution results

### Workflow

1. Start the server listening on `http://localhost:3000/sse`
2. Client connects to the server and retrieves the list of available tools
3. User inputs a query
4. Client processes the query through Ollama and calls server tools when needed
5. Tool execution results are returned to the client for processing

### Technical Features

- Uses `@modelcontextprotocol/sdk` to implement MCP protocol communication
- Integrates Ollama for local AI model invocation
- Supports dynamic tool discovery and calling
- Employs TypeScript for type safety

### Use Cases

This project serves as a foundational template for building AI assistant applications based on the MCP protocol. It can be extended with more tools and services to meet various business requirements.