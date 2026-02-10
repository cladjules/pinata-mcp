import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Helper for consistent error responses
const errorResponse = (error: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: `Error: ${error instanceof Error ? error.message : String(error)}`,
    },
  ],
  isError: true,
});

// Helper for consistent success responses
const successResponse = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

//Get MIME type from file extension
function getMimeType(filePath: string): string {
  const extension = filePath.split(".").pop()?.toLowerCase() || "";
  const mimeTypes: Record<string, string> = {
    txt: "text/plain",
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
    json: "application/json",
    xml: "application/xml",
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    webm: "video/webm",
    zip: "application/zip",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };

  return mimeTypes[extension] || "application/octet-stream";
}

export function setupPinataTools(
  server: Server,
  PINATA_JWT: string | undefined,
) {
  // Base headers for all requests
  const getHeaders = () => {
    if (!PINATA_JWT) {
      throw new Error("PINATA_JWT environment variable is not set");
    }
    return {
      Authorization: `Bearer ${PINATA_JWT}`,
      "Content-Type": "application/json",
    };
  };

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
      name: "uploadFile",
      description:
        "Upload a file to Pinata IPFS. Provide either a file:// URI or base64-encoded content.",
      inputSchema: {
        type: "object" as const,
        properties: {
          resourceUri: {
            type: "string",
            description:
              "The file:// URI of the file to upload (e.g., file:///path/to/file.jpg)",
          },
          fileContent: {
            type: "string",
            description:
              "Base64-encoded file content (use this if not providing resourceUri)",
          },
          fileName: {
            type: "string",
            description:
              "Name for the uploaded file (auto-detected from path if using resourceUri)",
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
        case "testAuthentication": {
          const response = await fetch(
            "https://api.pinata.cloud/data/testAuthentication",
            {
              method: "GET",
              headers: getHeaders(),
            },
          );

          if (!response.ok) {
            throw new Error(
              `Authentication failed: ${response.status} ${response.statusText}`,
            );
          }

          const data = await response.json();
          return {
            content: [
              {
                type: "text",
                text: `✅ Authentication successful!\n\n${JSON.stringify(data, null, 2)}`,
              },
            ],
          };
        }

        case "searchFiles": {
          const {
            network = "public",
            name: fileName,
            cid,
            mimeType,
            limit,
            pageToken,
          } = args as any;
          const params = new URLSearchParams();
          if (fileName) params.append("name", fileName);
          if (cid) params.append("cid", cid);
          if (mimeType) params.append("mimeType", mimeType);
          if (limit) params.append("limit", limit.toString());
          if (pageToken) params.append("pageToken", pageToken);

          const url = `https://api.pinata.cloud/v3/files/${network}?${params.toString()}`;

          const response = await fetch(url, {
            method: "GET",
            headers: getHeaders(),
          });

          if (!response.ok) {
            throw new Error(
              `Failed to search files: ${response.status} ${response.statusText}`,
            );
          }

          const data = await response.json();
          return successResponse(data);
        }

        case "getFileById": {
          const { network = "public", id } = args as any;
          const url = `https://api.pinata.cloud/v3/files/${network}/${id}`;

          const response = await fetch(url, {
            method: "GET",
            headers: getHeaders(),
          });

          if (!response.ok) {
            throw new Error(
              `Failed to get file: ${response.status} ${response.statusText}`,
            );
          }

          const data = await response.json();
          return successResponse(data);
        }

        case "updateFile": {
          const {
            network = "public",
            id,
            name: fileName,
            keyvalues,
          } = args as any;
          const url = `https://api.pinata.cloud/v3/files/${network}/${id}`;

          const payload: {
            name?: string;
            keyvalues?: Record<string, unknown>;
          } = {};
          if (fileName) payload.name = fileName;
          if (keyvalues) payload.keyvalues = keyvalues;

          const response = await fetch(url, {
            method: "PUT",
            headers: getHeaders(),
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            throw new Error(
              `Failed to update file: ${response.status} ${response.statusText}`,
            );
          }

          const data = await response.json();
          return successResponse(data);
        }

        case "deleteFile": {
          const { network = "public", id } = args as any;
          const url = `https://api.pinata.cloud/v3/files/${network}/${id}`;

          const response = await fetch(url, {
            method: "DELETE",
            headers: getHeaders(),
          });

          if (!response.ok) {
            throw new Error(
              `Failed to delete file: ${response.status} ${response.statusText}`,
            );
          }

          const data = await response.json();
          return {
            content: [
              {
                type: "text",
                text: `✅ File deleted successfully\n\n${JSON.stringify(data, null, 2)}`,
              },
            ],
          };
        }

        case "uploadFile": {
          const {
            resourceUri,
            fileContent,
            fileName,
            mimeType,
            network = "public",
            group_id,
            keyvalues,
          } = args as any;

          let fileBuffer: Buffer;
          let finalFileName: string;

          if (fileContent) {
            // Base64 content mode
            if (!fileName) {
              throw new Error("fileName is required when using fileContent");
            }
            fileBuffer = Buffer.from(fileContent, "base64");
            finalFileName = fileName;
          } else {
            throw new Error(
              "resourceUri not supported in serverless mode. Use fileContent with base64-encoded data.",
            );
          }

          const detectedMimeType = mimeType || getMimeType(finalFileName);

          const formData = new FormData();
          const blob = new Blob([new Uint8Array(fileBuffer)], {
            type: detectedMimeType,
          });
          formData.append("file", blob, finalFileName);
          formData.append("network", network);

          if (group_id) {
            formData.append("group_id", group_id);
          }

          if (keyvalues) {
            formData.append("keyvalues", JSON.stringify(keyvalues));
          }

          const response = await fetch(
            "https://uploads.pinata.cloud/v3/files",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${PINATA_JWT}`,
              },
              body: formData,
            },
          );

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
              `Failed to upload file: ${response.status} ${response.statusText}\n${errorText}`,
            );
          }

          const data = await response.json();
          return {
            content: [
              {
                type: "text",
                text: `✅ File uploaded successfully!\n\n${JSON.stringify(data, null, 2)}`,
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return errorResponse(error);
    }
  });
}
