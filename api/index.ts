/**
 * Vercel API Route for MCP Server
 * Uses the standard SSEServerTransport with in-memory session storage
 */
import "dotenv/config";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { setupPinataTools } from "./setupTools.js";

// Get environment variables
const PINATA_JWT = process.env.PINATA_JWT;

// Transport storage type
type TransportStorage = {
  [sessionId: string]: SSEServerTransport;
};

// Map to store transports AND servers by session ID
// In serverless mode, each session needs its own server instance
const transports: TransportStorage = {};
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
    const method = req.body?.method;

    console.log("MCP request received:", {
      sessionId,
      method,
      hasBody: !!req.body,
    });

    let transport: SSEServerTransport;
    let server: Server;

    if (sessionId && transports[sessionId]) {
      // Reuse existing transport and server for this session
      console.log(`Reusing existing session: ${sessionId}`);
      transport = transports[sessionId];
      server = servers[sessionId];
    } else if (method === "initialize") {
      // Initialize request - create new transport and server
      console.log(
        `Creating new session${sessionId ? ` with ID: ${sessionId}` : ""}`,
      );

      server = createMCPServer();
      transport = new SSEServerTransport("/message", res);

      // Store transport and server
      if (sessionId) {
        transports[sessionId] = transport;
        servers[sessionId] = server;
      }

      // Connect transport to server
      await server.connect(transport);

      // Set up cleanup on close
      transport.onclose = () => {
        console.log("Transport closing:", { sessionId });
        if (sessionId) {
          delete transports[sessionId];
          delete servers[sessionId];
        }
      };
    } else if (sessionId && !transports[sessionId]) {
      // Session ID provided but not found
      console.error("Session not found:", { sessionId });
      res.status(404).json({
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message:
            "Session not found. Please send an initialize request with the same mcp-session-id header.",
        },
        id: req.body?.id || null,
      });
      return;
    } else {
      // No session ID and not an initialization request
      console.error("Bad request: No session ID for non-initialize request");
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message:
            "Bad Request: Session ID required or send initialize request",
        },
        id: req.body?.id || null,
      });
      return;
    }

    // Handle the request with the transport
    console.log(`Handling request with transport, method: ${method}`);

    try {
      await transport.handlePostMessage(req.body, res);
      console.log(`Request completed successfully, method: ${method}`);
    } catch (error) {
      console.error("Error in transport.handlePostMessage:", {
        method,
        sessionId,
        error: error instanceof Error ? error.message : error,
      });

      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal error processing request",
          },
          id: req.body?.id || null,
        });
      }
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
