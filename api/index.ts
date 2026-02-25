/**
 * Vercel API Route for MCP Server
 * Direct request/response handling without streaming transport
 */
import "dotenv/config";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { setupPinataTools } from "./setupTools.js";

// Get environment variables
const PINATA_JWT = process.env.PINATA_JWT;

// Map to store servers by session ID
const servers: { [sessionId: string]: Server } = {};

// Auth checker
const API_KEYS = new Set(
  process.env.MCP_API_KEYS?.split(",").map((key) => key.trim()) || [],
);

function checkAuth(
  apiKey: string | undefined,
  res: VercelResponse,
  clientInfo?: string,
): boolean {
  if (API_KEYS.size === 0) {
    return true; // No auth required if not configured
  }

  if (!apiKey || !API_KEYS.has(apiKey)) {
    console.error(
      `Unauthorized access attempt${clientInfo ? ` from ${clientInfo}` : ""}`,
    );
    res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or missing API key",
    });
    return false;
  }

  return true;
}

function createMCPServer(): Server {
  const server = new Server(
    {
      name: "mcp-pinata",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // Setup all Pinata tools
  setupPinataTools(server, PINATA_JWT);

  return server;
}

// Export the handler for Vercel
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Handle all GET requests as health checks
    if (req.method === "GET") {
      res.status(200).json({ status: "ok", server: "mcp-pinata" });
      return;
    }

    // From here on, only POST requests
    // Check if server is initialized
    if (!PINATA_JWT) {
      res.status(500).json({
        error: "Server not initialized",
        message: "PINATA_JWT environment variable is required",
      });
      return;
    }

    // Check authentication
    const apiKey = req.headers["x-api-key"] as string;
    const clientInfo = (req.headers["x-forwarded-for"] ||
      req.socket?.remoteAddress) as string;
    if (!checkAuth(apiKey, res, clientInfo)) {
      return;
    }

    // Check if request has a body
    if (!req.body || Object.keys(req.body).length === 0) {
      console.error("POST request with empty body");
      res.status(400).json({
        error: "Bad Request",
        message: "Request body is required for MCP protocol",
      });
      return;
    }

    // Handle MCP request with session management
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const { method, params, id: requestId } = req.body;

    console.log("MCP request received:", {
      sessionId,
      method,
      requestId,
      toolName: params?.name,
    });

    // Get or create server for this session
    let server: Server;
    if (sessionId && servers[sessionId]) {
      server = servers[sessionId];
      console.log(`Reusing existing session: ${sessionId}`);
    } else {
      server = createMCPServer();
      if (sessionId) {
        servers[sessionId] = server;
        console.log(`Created new session: ${sessionId}`);
      }
    }

    // Handle the MCP request directly
    try {
      let result;

      switch (method) {
        case "initialize":
          result = {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: "mcp-pinata",
              version: "1.0.0",
            },
          };
          break;

        case "notifications/initialized":
          // Client signals initialization is complete - no response needed
          console.log("Client initialization complete");
          res.status(200).end();
          return;

        case "tools/list":
          // Get tools from the request handlers
          const handlers = (server as any)._requestHandlers || new Map();
          const listToolsHandler = handlers.get("tools/list");
          if (listToolsHandler) {
            const toolsResult = await listToolsHandler({
              method: "tools/list",
              params: {},
            });
            result = toolsResult;
          } else {
            result = { tools: [] };
          }
          break;

        case "tools/call":
          // Call tool handler
          const callHandlers = (server as any)._requestHandlers || new Map();
          const callToolHandler = callHandlers.get("tools/call");
          if (callToolHandler) {
            result = await callToolHandler({
              method: "tools/call",
              params,
            });
          } else {
            throw new Error("Tool call handler not found");
          }
          break;

        default:
          res.status(400).json({
            jsonrpc: "2.0",
            error: {
              code: -32601,
              message: `Method not found: ${method}`,
            },
            id: requestId,
          });
          return;
      }

      // Send successful response
      res.status(200).json({
        jsonrpc: "2.0",
        result,
        id: requestId,
      });
    } catch (error) {
      console.error("Error handling request:", {
        method,
        sessionId,
        error: error instanceof Error ? error.message : error,
      });

      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : "Internal error",
        },
        id: requestId,
      });
    }
  } catch (error) {
    console.error("Handler error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
