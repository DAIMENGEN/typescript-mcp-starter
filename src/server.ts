import { z } from "zod";
import express from "express";
import {randomUUID} from "node:crypto";
import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {isInitializeRequest} from "@modelcontextprotocol/sdk/types.js"
import {SSEServerTransport} from "@modelcontextprotocol/sdk/server/sse.js";
import {StreamableHTTPServerTransport} from "@modelcontextprotocol/sdk/server/streamableHttp.js";

class ShuttleBus {
    route: string;
    departure: string;
    destination: string;
    time: string; // 使用 string 存储 "HH:mm" 格式时间，便于传参和显示

    constructor(route: string, departure: string, destination: string, time: string) {
        this.route = route;
        this.departure = departure;
        this.destination = destination;
        this.time = time;
    }

    toString(): string {
        return `路线 ${this.route}：从 ${this.departure} 出发，前往 ${this.destination}，发车时间：${this.time}`;
    }

    toLocalTime(): Date {
        const [hour, minute] = this.time.split(':').map(Number);
        const now = new Date();
        now.setHours(hour, minute, 0, 0);
        return now;
    }
}

class ShuttleBusService {
    private busList: ShuttleBus[] = [];

    constructor() {
        // 模拟班车数据
        this.busList.push(new ShuttleBus("A1", "大门口", "5号楼", "08:00"));
        this.busList.push(new ShuttleBus("A2", "1号楼", "食堂", "08:30"));
        this.busList.push(new ShuttleBus("B1", "5号楼", "大门口", "17:45"));
        this.busList.push(new ShuttleBus("C3", "3号楼", "停车场", "12:15"));
        this.busList.push(new ShuttleBus("D1", "大门口", "2号楼", "09:10"));
    }

    getShuttleBusInfo(): string {
        return this.busList.map(bus => bus.toString()).join('\n');
    }

    getShuttleBusInfoByTime(time: string): string {
        try {
            const filtered = this.busList.filter(bus => {
                return bus.time === time;
            });

            if (filtered.length === 0) {
                return 'No shuttle bus information was found for the specified time period.';
            }

            return filtered.map(bus => bus.toString()).join('\n');
        } catch (error) {
            return 'The time format is incorrect. Please use the format HH:mm-HH:mm, for example 08:00-12:00.';
        }
    }
}

const shuttleBusService = new ShuttleBusService();

const server = new McpServer({
    name: "mcp-server",
    version: "1.0.0"
});

server.registerTool("getShuttleBusInfo",
    {
        title: "Shuttle Bus Schedule Tool",
        description: "Provides all current shuttle bus schedules.",
    },
    async ({name}) => ({
        content: [
            {
                type: "text",
                text: shuttleBusService.getShuttleBusInfo()
            }
        ]
    })
);

server.registerTool(
    "getShuttleBusInfoByTime",
    {
        title: "Time-based Shuttle Bus Query Tool",
        description: "Retrieves shuttle bus schedules within a specified time (format: HH:mm).",
        inputSchema: { time: z.string() },
    },
    async ({ time }) => ({
        content: [
            {
                type: "text",
                text: shuttleBusService.getShuttleBusInfoByTime(time),
            },
        ],
    })
);

const app = express();

app.use(express.json());

const transports = {
    streamable: {} as Record<string, StreamableHTTPServerTransport>,
    sse: {} as Record<string, SSEServerTransport>
};

// Reusable handler for GET and DELETE requests
const handleSessionRequest = async (req: express.Request, res: express.Response) => {
    console.log(`[${req.method} /mcp] Method called, received message:`, req.body);
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports.streamable[sessionId]) {
        res.status(400).send("Invalid or missing session ID");
        return;
    }
    const transport = transports.streamable[sessionId];
    await transport.handleRequest(req, res);
};

// Handle GET requests for server-to-client notifications via SSE
app.get("/mcp", handleSessionRequest);

// Handle DELETE requests for session termination
app.delete("/mcp", handleSessionRequest);

// Modern Streamable HTTP endpoint
app.post("/mcp", async (req, res) => {
    // Check for existing session ID
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    console.log(`[${req.method} /mcp] Session ID: ${sessionId} | Received message:`, req.body);
    let transport: StreamableHTTPServerTransport;
    if (sessionId && transports.streamable[sessionId]) {
        // Reuse existing transport
        transport = transports.streamable[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
        // New initialization request
        transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sessionId) => {
                // Store the transport by session ID
                transports.streamable[sessionId] = transport;
            }
        });
        // Clean up transport when StreamableHTTPServerTransport closed
        transport.onclose = () => {
            if (transport.sessionId) {
                delete transports.streamable[transport.sessionId];
                console.log(`[${req.method} /mcp] Streamable HTTP connection closed. Removed transport for sessionId: ${transport.sessionId}`);
            }
        };
        // Connect to the MCP server
        await server.connect(transport);
        console.log(`[${req.method} /mcp] Streamable HTTP connection established.`);
    } else {
        // Invalid request
        console.log(`[${req.method} /mcp] Invalid request.`);
        res.status(400).json({
            jsonrpc: "2.0",
            error: {
                code: -32000,
                message: "Bad Request: No valid session ID provided",
            },
            id: null,
        });
        return;
    }
    // Handle the request
    await transport.handleRequest(req, res, req.body);
});

// Legacy SSE endpoint for older clients
app.get("/sse", async (req, res) => {
    console.log("[GET /sse] Method called, received message:", req.body);
    const transport = new SSEServerTransport("/messages", res);
    transports.sse[transport.sessionId] = transport;
    res.on("close", () => {
        delete transports.sse[transport.sessionId];
        console.log(`[GET /sse] Connection closed. Removed transport for sessionId: ${transport.sessionId}`);
    });
    // Connect to the MCP server
    await server.connect(transport);
    console.log(`[GET /sse] SSE connection established. sessionId: ${transport.sessionId}`);
});

// Legacy message endpoint for older clients
app.post("/messages", async (req, res) => {
    console.log("[POST /messages] Method called, received message:", req.body);
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
    console.log(`MCP SSE server listening on http://localhost:${PORT}`);
});