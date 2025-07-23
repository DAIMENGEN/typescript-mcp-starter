import readline from "readline";
import { Ollama, Tool, Message } from "ollama";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

class MCPClient {
    private client: Client;
    private ollama: Ollama;
    private transport: SSEClientTransport | null = null;
    private tools: Tool[] = [];

    constructor() {
        this.ollama = new Ollama({ host: 'http://10.150.112.120:11434' });
        this.client = new Client({ name: "mcp-client-cli", version: "1.0.0" });
    }

    properties( input: Record<string, any>): {
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

    async connect() {
        this.transport = new SSEClientTransport(new URL("http://localhost:3000/sse"));
        await this.client.connect(this.transport);
        console.log("Connected using SSE transport");
        const toolsResult = await this.client.listTools();
        this.tools = toolsResult.tools.map((tool) => {
            console.log("Tool found:", tool.inputSchema);
            return {
                type: "function",
                function: {
                    type: tool.inputSchema.type,
                    name: tool.name,
                    description: tool.description,
                    parameters: {
                        required: tool.inputSchema.required || [],
                        properties: this.properties(tool.inputSchema.properties || {}),
                    },
                }
            };
        });
        console.log("Connected to server with tools:", this.tools.map(tool => tool.function.name));
    }

    async processQuery(query: string) {
        const messages: Message[] = [
            {
                role: "user",
                content: query,
            },
        ];
        const response = await this.ollama.chat({
            model: "qwen3:32b",
            messages,
            tools: this.tools,
        });
        // console.log("Ollama response:", response.message.tool_calls);
        const toolCalls = response.message.tool_calls;
        if (toolCalls && toolCalls.length > 0) {
            for (const toolCall of toolCalls) {
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
        } else {
            console.log("No tool calls found in response.");
            console.log("Response message:", response.message.content);
        }
    }
}

const main = async () => {
    const mcpClient = new MCPClient();

    try {
        console.log("Connecting to MCPClient...");
        await mcpClient.connect();
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
            console.log("Execution completed. Goodbye!");
            process.exit(0);
        });
    } catch (error) {
        console.error("An error occurred during setup:", error);
        process.exit(1);
    }
};
main()
    .then(() => console.log("Main function resolved. Ready for input."))
    .catch((error) => console.error("Unexpected error in main():", error));

