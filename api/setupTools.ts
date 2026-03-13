import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  handleTestAuthentication,
  handleSearchFiles,
  handleGetFileById,
  handleUpdateFile,
  handleDeleteFile,
  handleCreateGroup,
  handleUploadFile,
  handleUploadFiles,
  errorResponse,
} from "./toolHandlers.js";

export function setupPinataTools(
  server: Server,
  PINATA_JWT: string | undefined,
) {
  const tools = [
    {
      name: "testAuthentication",
      description: "Verify that your Pinata JWT is valid and working",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
    {
      name: "searchFiles",
      description:
        "Search for files in your Pinata account by name, CID, or MIME type. Returns a list of files matching the given criteria.",
      inputSchema: {
        type: "object" as const,
        properties: {
          network: {
            type: "string",
            enum: ["public", "private"],
            description: "Whether to search in public or private IPFS",
            default: "public",
          },
          name: { type: "string", description: "Filter by filename" },
          cid: { type: "string", description: "Filter by content ID (CID)" },
          mimeType: { type: "string", description: "Filter by MIME type" },
          limit: {
            type: "number",
            description: "Maximum number of results to return",
          },
          pageToken: { type: "string", description: "Token for pagination" },
        },
      },
    },
    {
      name: "getFileById",
      description:
        "Retrieve detailed information about a specific file stored on Pinata by its ID",
      inputSchema: {
        type: "object" as const,
        properties: {
          network: {
            type: "string",
            enum: ["public", "private"],
            default: "public",
            description: "Whether the file is in public or private IPFS",
          },
          id: {
            type: "string",
            description: "The unique ID of the file to retrieve",
          },
        },
        required: ["id"],
      },
    },
    {
      name: "updateFile",
      description:
        "Update metadata for an existing file on Pinata including name and key-value pairs",
      inputSchema: {
        type: "object" as const,
        properties: {
          network: {
            type: "string",
            enum: ["public", "private"],
            default: "public",
            description: "Whether the file is in public or private storage",
          },
          id: {
            type: "string",
            description: "The unique ID of the file to update",
          },
          name: { type: "string", description: "New name for the file" },
          keyvalues: {
            type: "object",
            description: "Metadata key-value pairs to update",
          },
        },
        required: ["id"],
      },
    },
    {
      name: "deleteFile",
      description: "Delete a file from your Pinata account by its ID",
      inputSchema: {
        type: "object" as const,
        properties: {
          network: {
            type: "string",
            enum: ["public", "private"],
            default: "public",
            description: "Whether the file is in public or private IPFS",
          },
          id: {
            type: "string",
            description: "The unique ID of the file to delete",
          },
        },
        required: ["id"],
      },
    },
    {
      name: "createGroup",
      description: "Create a new group for organizing files on Pinata",
      inputSchema: {
        type: "object" as const,
        properties: {
          name: {
            type: "string",
            description: "The name of the group to create",
          },
        },
        required: ["name"],
      },
    },
    {
      name: "uploadFile",
      description:
        "Upload a file to Pinata IPFS. Provide either a sourceUrl (to copy from another URL), a file:// URI, or base64-encoded content.",
      inputSchema: {
        type: "object" as const,
        properties: {
          sourceUrl: {
            type: "string",
            description:
              "URL to download the file from (e.g., https://example.com/image.jpg)",
          },
          fileContent: {
            type: "string",
            description:
              "Base64-encoded file content (use this if not providing resourceUri or sourceUrl)",
          },
          fileName: {
            type: "string",
            description:
              "Name for the uploaded file (auto-detected from path/URL if using resourceUri or sourceUrl)",
          },
          mimeType: {
            type: "string",
            description:
              "MIME type of the file (auto-detected if not provided)",
          },
          network: {
            type: "string",
            enum: ["public", "private"],
            default: "public",
            description: "Whether to upload to public or private IPFS",
          },
          group_id: {
            type: "string",
            description: "ID of a group to add the file to",
          },
          keyvalues: {
            type: "object",
            description: "Metadata key-value pairs for the file",
          },
        },
      },
    },
    {
      name: "uploadFiles",
      description:
        "Upload multiple files at once to Pinata IPFS. Each file can have a sourceUrl (to download from a URL) or base64 fileContent.",
      inputSchema: {
        type: "object" as const,
        properties: {
          fileContents: {
            type: "array",
            description: "Array of files to upload with detailed options",
            items: {
              type: "object",
              properties: {
                sourceUrl: {
                  type: "string",
                  description: "URL to download the file from",
                },
                fileContent: {
                  type: "string",
                  description: "Base64-encoded file content",
                },
                fileName: {
                  type: "string",
                  description:
                    "Name for the file (auto-detected from URL if not provided)",
                },
                mimeType: {
                  type: "string",
                  description: "MIME type (auto-detected if not provided)",
                },
              },
            },
          },
          network: {
            type: "string",
            enum: ["public", "private"],
            default: "public",
            description: "Whether to upload to public or private IPFS",
          },
          group_id: {
            type: "string",
            description: "ID of a group to add all files to",
          },
          keyvalues: {
            type: "object",
            description: "Metadata key-value pairs to apply to all files",
          },
        },
        required: ["fileContents"],
      },
    },
  ];

  // Register tools list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "testAuthentication":
          return await handleTestAuthentication(args, PINATA_JWT);
        case "searchFiles":
          return await handleSearchFiles(args, PINATA_JWT);
        case "getFileById":
          return await handleGetFileById(args, PINATA_JWT);
        case "updateFile":
          return await handleUpdateFile(args, PINATA_JWT);
        case "deleteFile":
          return await handleDeleteFile(args, PINATA_JWT);
        case "createGroup":
          return await handleCreateGroup(args, PINATA_JWT);
        case "uploadFile":
          return await handleUploadFile(args, PINATA_JWT);
        case "uploadFiles":
          return await handleUploadFiles(args, PINATA_JWT);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      console.error(`Error executing tool ${name}:`, error);
      return errorResponse(error);
    }
  });
}
