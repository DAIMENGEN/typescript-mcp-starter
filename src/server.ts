import { z } from "zod";
import express from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const server = new McpServer({
    name: "mcp-server",
    version: "1.0.0"
});

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

const app = express();

app.use(express.json());

const transports = {
    streamable: {} as Record<string, StreamableHTTPServerTransport>,
    sse: {} as Record<string, SSEServerTransport>
};

// Modern Streamable HTTP endpoint
app.all("/mcp", async (req, res) => {
    // Handle Streamable HTTP transport for modern clients
    // Implementation as shown in the "With Session Management" example
    // ...
});

app.get("/sse", async (req, res) => {
    const transport = new SSEServerTransport("/messages", res);
    transports.sse[transport.sessionId] = transport;
    res.on("close", () => {
        delete transports.sse[transport.sessionId];
    });
    await server.connect(transport);
});

app.post("/messages", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports.sse[sessionId];
    if (transport) {
        await transport.handlePostMessage(req, res, req.body);
    } else {
        res.status(400).send("No transport found for sessionId");
    }
});

const PORT = 3000;

app.listen(PORT, () => {
    console.log(`MCP SSE server listening on http://localhost:${PORT}/sse`);
});