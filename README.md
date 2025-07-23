## TypeScript MCP Starter Project

This is a **Model Context Protocol (MCP)** sample project built with **TypeScript**, featuring both client and server components. It demonstrates how to build intelligent tool calling systems using the MCP protocol.

### Project Structure

```
src/
├── client.ts    # Client implementation with SSE and Streamable HTTP support
└── server.ts    # Server implementation with tool registration and transport protocol support
```


### Core Features

#### Server ([server.ts](file://D:\AI\mcp\typescript-mcp-starter\src\server.ts))

- **MCP Server Implementation**: Built on top of the Express framework.
- **Transport Protocol Support**:
  - **SSE (Server-Sent Events)**: For legacy clients via `/sse` and `/messages`.
  - **Streamable HTTP**: Modern transport via `/mcp`, supporting session-based communication.
- **Tool Registration**:
  - Provides a sample `greeting` tool:
    - Accepts [name](file://C:\Users\menge\Desktop\workspace\typescript-mcp-starter\node_modules\ollama\dist\shared\ollama.d792a03f.d.ts#L194-L194) as input (via `z.string()` validation).
    - Returns a personalized greeting message.
- **Session Management**:
  - Uses `sessionId` to track and manage client sessions.
  - Supports session initialization and cleanup.

#### Client ([client.ts](file://D:\AI\mcp\typescript-mcp-starter\src\client.ts))

- **Ollama Integration**:
  - Uses `ollama` to run local AI models (e.g., `qwen3:8b`).
- **Tool Discovery**:
  - Automatically fetches and registers tools provided by the server via `listTools()`.
- **Transport Flexibility**:
  - Supports both SSE and Streamable HTTP protocols:
    - [connect_sse](file://D:\AI\mcp\typescript-mcp-starter\src\client.ts#L59-L64)
    - [connect_streamable](file://D:\AI\mcp\typescript-mcp-starter\src\client.ts#L66-L71)
- **Interactive CLI**:
  - Accepts user input via command line.
  - Processes queries using AI and executes tool calls when needed.
  - Displays results or error messages.

### Workflow

1. **Start the Server**:
  - Server listens on:
    - `http://localhost:3000/sse` (SSE endpoint)
    - `http://localhost:3000/mcp` (Streamable HTTP endpoint)
2. **Client Connection**:
  - Client connects via SSE or Streamable HTTP.
  - Retrieves and registers available tools from the server.
3. **User Input**:
  - User types a query in the CLI.
4. **AI Processing**:
  - Query is sent to the AI model via Ollama.
  - If a tool call is needed, it's parsed and executed.
5. **Tool Execution**:
  - Tool call is sent to the server.
  - Result is returned to the client and displayed.

### Technical Features

- **MCP Protocol Support**: Uses `@modelcontextprotocol/sdk` for bidirectional communication.
- **Local AI Inference**: Integrates with Ollama for running models locally.
- **Dynamic Tool Discovery**: Tools are registered and used dynamically based on server responses.
- **TypeScript Type Safety**: Ensures robust and maintainable code.
- **Multiple Transport Options**: Supports both SSE and Streamable HTTP for flexibility.

### Use Cases

This project serves as a foundational template for building AI assistant applications based on the MCP protocol. It can be extended with:

- Additional tools and services.
- Integration with different AI backends.
- Custom transport protocols or security enhancements.
- Enterprise-grade deployment and monitoring.

---

### Example Code Snippets

#### Registering a Tool on the Server

```ts
server.registerTool("greeting",
    {
        title: "Personalized Greeting Assistant Tool",
        description: "Generates a warm and friendly greeting message based on the user's name.",
        inputSchema: { name: z.string() }
    },
    async ({ name }) => ({
        content: [{ type: "text", text: `Hello, ${name}! I'm Mengen.dai, your AI assistant. How can I assist you today? 😊` }]
    })
);
```


#### Processing Queries and Calling Tools on the Client

```ts
async processQuery(query: string) {
    const messages: Message[] = [
        {
            role: "user",
            content: query,
        },
    ];
    const response = await this.ollama.chat({
        model: "qwen3:8b",
        messages,
        tools: this.tools,
        stream: true,
    });
    for await (const chunk of response) {
        const content = chunk.message.content;
        if (content !== undefined) {
            if (content === "\n") {
                process.stdout.write("\n");
            } else {
                process.stdout.write(content);
            }
        }
        if (chunk.message.tool_calls && chunk.message.tool_calls.length > 0) {
            console.log("Tool calls:", chunk.message.tool_calls);
            for (const toolCall of chunk.message.tool_calls) {
                const toolName = toolCall.function.name;
                const toolArgs = toolCall.function.arguments;
                console.log(`Calling tool: ${toolName} with args:`, toolArgs);
                try {
                    const result = await this.client.callTool({
                        name: toolName,
                        arguments: toolArgs,
                    });
                    console.log(`Tool ${toolName} result:`, result);
                } catch (error) {
                    console.error(`Error calling tool ${toolName}:`, error);
                }
            }
        }
    }
}
```