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

// Helper to prepare file buffer from sourceUrl or fileContent
async function prepareFileBuffer(
  sourceUrl?: string,
  fileContent?: string,
  fileName?: string,
  fallbackFileName?: string,
): Promise<{ buffer: Buffer; fileName: string }> {
  let fileBuffer: Buffer;
  let finalFileName: string;

  if (sourceUrl) {
    // URL download mode
    const urlResponse = await fetch(sourceUrl);
    if (!urlResponse.ok) {
      throw new Error(
        `Failed to download file from URL: ${urlResponse.status} ${urlResponse.statusText}`,
      );
    }
    const arrayBuffer = await urlResponse.arrayBuffer();
    fileBuffer = Buffer.from(arrayBuffer);

    // Try to extract filename from URL if not provided
    finalFileName =
      fileName ||
      sourceUrl.split("/").pop()?.split("?")[0] ||
      fallbackFileName ||
      "downloaded-file";
  } else if (fileContent) {
    // Base64 content mode
    if (!fileName) {
      throw new Error(
        `fileName is required when using fileContent${fallbackFileName ? ` (for ${fallbackFileName})` : ""}`,
      );
    }
    fileBuffer = Buffer.from(fileContent, "base64");
    finalFileName = fileName;
  } else {
    throw new Error(
      "Use sourceUrl to download from a URL or fileContent with base64-encoded data.",
    );
  }

  return { buffer: fileBuffer, fileName: finalFileName };
}

// Helper to upload a single file to Pinata
async function uploadSingleFile(
  PINATA_JWT: string,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string | undefined,
  network: string,
  group_id?: string,
  keyvalues?: Record<string, unknown>,
): Promise<any> {
  const detectedMimeType = mimeType || getMimeType(fileName);

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(fileBuffer)], {
    type: detectedMimeType,
  });
  formData.append("file", blob, fileName);
  formData.append("network", network);

  if (group_id) {
    formData.append("group_id", group_id);
  }

  if (keyvalues) {
    formData.append("keyvalues", JSON.stringify(keyvalues));
  }

  const response = await fetch("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to upload file: ${response.status} ${response.statusText}\n${errorText}`,
    );
  }

  return await response.json();
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
        "Upload multiple files at once to Pinata IPFS as part of the same folder/batch. Each file can have a sourceUrl or base64 content. Alternatively, provide a sourceUrls array for a quick batch upload from URLs.",
      inputSchema: {
        type: "object" as const,
        properties: {
          sourceUrls: {
            type: "array",
            description:
              "Array of URLs to download and upload (shortcut for simple URL batch uploads)",
            items: {
              type: "string",
            },
          },
          files: {
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
          folderPrefix: {
            type: "string",
            description:
              "Optional folder prefix to add to all filenames (e.g., 'my-folder/' will create 'my-folder/file1.jpg')",
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

        case "createGroup": {
          const { name } = args as any;
          const url = "https://api.pinata.cloud/v3/files/groups";

          const response = await fetch(url, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({ name }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
              `Failed to create group: ${response.status} ${response.statusText}\n${errorText}`,
            );
          }

          const data = await response.json();
          return {
            content: [
              {
                type: "text",
                text: `✅ Group created successfully!\n\n${JSON.stringify(data, null, 2)}`,
              },
            ],
          };
        }

        case "uploadFile": {
          const {
            sourceUrl,
            fileContent,
            fileName,
            mimeType,
            network = "public",
            group_id,
            keyvalues,
          } = args as any;

          const { buffer, fileName: finalFileName } = await prepareFileBuffer(
            sourceUrl,
            fileContent,
            fileName,
          );

          const data = await uploadSingleFile(
            PINATA_JWT!,
            buffer,
            finalFileName,
            mimeType,
            network,
            group_id,
            keyvalues,
          );

          return {
            content: [
              {
                type: "text",
                text: `✅ File uploaded successfully!\n\n${JSON.stringify(data, null, 2)}`,
              },
            ],
          };
        }

        case "uploadFiles": {
          const {
            sourceUrls,
            files,
            folderPrefix,
            network = "public",
            group_id,
            keyvalues,
          } = args as any;

          // Convert sourceUrls array to files array format if provided
          let filesToUpload: any[];
          if (sourceUrls && Array.isArray(sourceUrls)) {
            if (files && files.length > 0) {
              throw new Error(
                "Cannot provide both sourceUrls and files parameters. Use one or the other.",
              );
            }
            filesToUpload = sourceUrls.map((url: string) => ({
              sourceUrl: url,
            }));
          } else if (files && Array.isArray(files)) {
            filesToUpload = files;
          } else {
            throw new Error(
              "Either sourceUrls array or files array is required",
            );
          }

          if (filesToUpload.length === 0) {
            throw new Error("At least one file is required for upload");
          }

          const results: any[] = [];
          const errors: any[] = [];

          // Upload each file
          for (let i = 0; i < filesToUpload.length; i++) {
            const file = filesToUpload[i];
            try {
              const { buffer, fileName: finalFileName } =
                await prepareFileBuffer(
                  file.sourceUrl,
                  file.fileContent,
                  file.fileName,
                  `file-${i + 1}`,
                );

              // Add folder prefix if provided
              const uploadFileName = folderPrefix
                ? `${folderPrefix.endsWith("/") ? folderPrefix : `${folderPrefix}/`}${finalFileName}`
                : finalFileName;

              const data = await uploadSingleFile(
                PINATA_JWT!,
                buffer,
                uploadFileName,
                file.mimeType,
                network,
                group_id,
                keyvalues,
              );

              results.push({
                index: i,
                fileName: uploadFileName,
                success: true,
                data,
              });
            } catch (error) {
              errors.push({
                index: i,
                fileName: file.fileName || file.sourceUrl || `file-${i + 1}`,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          const summary = {
            total: filesToUpload.length,
            successful: results.length,
            failed: errors.length,
            results,
            errors: errors.length > 0 ? errors : undefined,
          };

          return {
            content: [
              {
                type: "text",
                text: `✅ Batch upload complete!\n\nSuccessful: ${summary.successful}/${summary.total}\nFailed: ${summary.failed}/${summary.total}\n\n${JSON.stringify(summary, null, 2)}`,
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
