import readline from "readline";
import { Ollama, Tool, Message } from "ollama";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

class MCPClient {
    private readonly tools: Tool[];
    private readonly client: Client;
    private readonly ollama: Ollama;
    private transport_sse: SSEClientTransport | null = null;
    private transport_streamable: StreamableHTTPClientTransport | null = null;

    constructor() {
        this.tools = [];
        this.ollama = new Ollama({ host: "http://localhost:11434" });
        this.client = new Client({ name: "mcp-client-cli", version: "1.0.0" });
    }

    #properties( input: Record<string, any>): {
        [key: string]: {
            type?: string | string[];
            items?: any;
            description?: string;
            enum?: any[];
        };
    } {
        const output: Record<string, any> = {};
        for (const key in input) {
            const prop = input[key];
            output[key] = {
                type: prop.type,
                items: prop.items,
                description: prop.description,
                enum: prop.enum,
            };
        }
        return output;
    }

    async #terminate() {
        if (this.transport_streamable) {
            await this.transport_streamable.terminateSession();
        }
    }

    async #loadTools() {
        const toolsResult = await this.client.listTools();
        this.tools.push(...toolsResult.tools.map((tool) => {
            console.log("Tool found:", tool.inputSchema);
            return {
                type: "function",
                function: {
                    type: tool.inputSchema.type,
                    name: tool.name,
                    description: tool.description,
                    parameters: {
                        required: tool.inputSchema.required || [],
                        properties: this.#properties(tool.inputSchema.properties || {}),
                    },
                }
            };
        }));
        console.log("Connected to server with tools:", this.tools.map(tool => tool.function.name));
    }

    async connect_sse() {
        this.transport_sse = new SSEClientTransport(new URL("http://localhost:3000/sse"));
        await this.client.connect(this.transport_sse);
        console.log(`[SSEClientTransport] Connected successfully at [${new Date().toISOString()}]`);
        this.transport_sse.onclose = () => {
            console.log(`[SSEClientTransport] Connection closed at [${new Date().toISOString()}]`);
        };
        await this.#loadTools();
    }

    async connect_streamable() {
        this.transport_streamable = new StreamableHTTPClientTransport(new URL("http://localhost:3000/mcp"));
        await this.client.connect(this.transport_streamable);
        console.log(`[StreamableHTTPClientTransport] Connected successfully at [${new Date().toISOString()}]`);
        this.transport_streamable.onclose = () => {
            console.log(`[StreamableHTTPClientTransport] Connection closed at [${new Date().toISOString()}]`);
        };
        await this.#loadTools();
    }

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

    async disconnect() {
        this.tools.length = 0;
        this.ollama.abort();
        await this.#terminate();
        await this.client.close();
    }
}

const main = async () => {
    const mcpClient = new MCPClient();
    try {
        console.log("Connecting to MCPClient...");
        await mcpClient.connect_streamable();
        console.log("Connection established.");
        console.log('Type your queries below. Type "exit" or "quit" to stop.');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: "> ",
        });
        rl.prompt();
        rl.on("line", async (line) => {
            const input = line.trim();
            if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
                console.log("Exiting...");
                rl.close();
                return;
            }
            try {
                console.log(`Processing query: "${input}"...`);
                await mcpClient.processQuery(input);
                console.log("Query processed successfully.\n");
            } catch (error) {
                console.error("Error processing query:", error, "\n");
            }
            rl.prompt();
        });

        rl.on("close", () => {
            mcpClient.disconnect().then(() => {
                console.log("Execution completed. Goodbye!");
                process.exit(0);
            });
        });
    } catch (error) {
        mcpClient.disconnect().then(() => {
            console.error("An error occurred during setup:", error);
            process.exit(1);
        });
    }
};
main()
    .then(() => console.log("Main function resolved. Ready for input."))
    .catch((error) => console.error("Unexpected error in main():", error));

