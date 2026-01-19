#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "Pinata",
  version: "0.2.0",
});

const PINATA_JWT = process.env.PINATA_JWT;
const GATEWAY_URL = process.env.GATEWAY_URL;

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

// ============================================================================
// Authentication
// ============================================================================

server.tool(
  "testAuthentication",
  "Verify that your Pinata JWT is valid and working",
  {},
  async () => {
    try {
      const response = await fetch(
        "https://api.pinata.cloud/data/testAuthentication",
        {
          method: "GET",
          headers: getHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Authentication failed: ${response.status} ${response.statusText}`
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
    } catch (error) {
      return errorResponse(error);
    }
  }
);

// ============================================================================
// File Operations
// ============================================================================

server.tool(
  "searchFiles",
  "Search for files in your Pinata account by name, CID, or MIME type. Returns a list of files matching the given criteria.",
  {
    network: z
      .enum(["public", "private"])
      .default("public")
      .describe("Whether to search in public or private IPFS"),
    name: z.string().optional().describe("Filter by filename"),
    cid: z.string().optional().describe("Filter by content ID (CID)"),
    mimeType: z.string().optional().describe("Filter by MIME type"),
    limit: z
      .number()
      .optional()
      .describe("Maximum number of results to return"),
    pageToken: z.string().optional().describe("Token for pagination"),
  },
  async ({ network, name, cid, mimeType, limit, pageToken }) => {
    try {
      const params = new URLSearchParams();
      if (name) params.append("name", name);
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
          `Failed to search files: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return successResponse(data);
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "getFileById",
  "Retrieve detailed information about a specific file stored on Pinata by its ID",
  {
    network: z
      .enum(["public", "private"])
      .default("public")
      .describe("Whether the file is in public or private IPFS"),
    id: z.string().describe("The unique ID of the file to retrieve"),
  },
  async ({ network, id }) => {
    try {
      const url = `https://api.pinata.cloud/v3/files/${network}/${id}`;

      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to get file: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return successResponse(data);
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "updateFile",
  "Update metadata for an existing file on Pinata including name and key-value pairs",
  {
    network: z
      .enum(["public", "private"])
      .default("public")
      .describe("Whether the file is in public or private storage"),
    id: z.string().describe("The unique ID of the file to update"),
    name: z.string().optional().describe("New name for the file"),
    keyvalues: z
      .record(z.any())
      .optional()
      .describe("Metadata key-value pairs to update"),
  },
  async ({ network, id, name, keyvalues }) => {
    try {
      const url = `https://api.pinata.cloud/v3/files/${network}/${id}`;

      const payload: { name?: string; keyvalues?: Record<string, unknown> } =
        {};
      if (name) payload.name = name;
      if (keyvalues) payload.keyvalues = keyvalues;

      const response = await fetch(url, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to update file: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return successResponse(data);
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "deleteFile",
  "Delete a file from your Pinata account by its ID",
  {
    network: z
      .enum(["public", "private"])
      .default("public")
      .describe("Whether the file is in public or private IPFS"),
    id: z.string().describe("The unique ID of the file to delete"),
  },
  async ({ network, id }) => {
    try {
      const url = `https://api.pinata.cloud/v3/files/${network}/${id}`;

      const response = await fetch(url, {
        method: "DELETE",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to delete file: ${response.status} ${response.statusText}`
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
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "uploadFile",
  "Upload a file to Pinata IPFS from base64-encoded content",
  {
    fileContent: z
      .string()
      .describe("Base64-encoded file content to upload"),
    fileName: z.string().describe("Name for the uploaded file"),
    mimeType: z
      .string()
      .optional()
      .describe("MIME type of the file (auto-detected if not provided)"),
    network: z
      .enum(["public", "private"])
      .default("public")
      .describe("Whether to upload to public or private IPFS"),
    group_id: z
      .string()
      .optional()
      .describe("ID of a group to add the file to"),
    keyvalues: z
      .record(z.string())
      .optional()
      .describe("Metadata key-value pairs for the file"),
  },
  async ({ fileContent, fileName, mimeType, network, group_id, keyvalues }) => {
    try {
      const fileBuffer = Buffer.from(fileContent, "base64");
      const detectedMimeType = mimeType || getMimeType(fileName);

      const formData = new FormData();
      const blob = new Blob([fileBuffer], { type: detectedMimeType });
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
          `Failed to upload file: ${response.status} ${response.statusText}\n${errorText}`
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
    } catch (error) {
      return errorResponse(error);
    }
  }
);

// ============================================================================
// Private Download Links
// ============================================================================

server.tool(
  "createPrivateDownloadLink",
  "Generate a temporary download link for accessing a private IPFS file from Pinata",
  {
    cid: z.string().describe("The content ID (CID) of the private file"),
    expires: z
      .number()
      .default(600)
      .describe("Expiration time in seconds (default: 600 = 10 minutes)"),
  },
  async ({ cid, expires }) => {
    try {
      if (!GATEWAY_URL) {
        throw new Error("GATEWAY_URL environment variable is not set");
      }

      const apiUrl = `https://api.pinata.cloud/v3/files/private/download_link`;
      const url = `https://${GATEWAY_URL}/files/${cid}`;
      const date = Math.floor(new Date().getTime() / 1000);

      const payload = {
        url,
        expires,
        date,
        method: "GET",
      };

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to create download link: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      const expirationTime = new Date((date + expires) * 1000).toLocaleString();

      return {
        content: [
          {
            type: "text",
            text: `✅ Private download link created!\n\nURL: ${data.data}\n\nExpires: ${expirationTime} (${expires} seconds from creation)`,
          },
        ],
      };
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "createLink",
  "Create a direct access link for a file stored on Pinata IPFS. For public files returns a gateway URL, for private files generates a temporary download link.",
  {
    cid: z.string().describe("The CID of the file to create a link for"),
    network: z
      .enum(["public", "private"])
      .default("public")
      .describe("Whether the file is on public or private IPFS"),
    expires: z
      .number()
      .default(600)
      .describe(
        "Expiration time in seconds for private download links (default: 600)"
      ),
  },
  async ({ cid, network, expires = 600 }) => {
    try {
      if (!GATEWAY_URL) {
        throw new Error("GATEWAY_URL environment variable is not set");
      }

      if (network === "public") {
        const fileUrl = `https://${GATEWAY_URL}/ipfs/${cid}`;
        return {
          content: [
            {
              type: "text",
              text: `✅ Public IPFS link:\n${fileUrl}`,
            },
          ],
        };
      } else {
        const filePath = `https://${GATEWAY_URL}/files/${cid}`;
        const apiUrl = `https://api.pinata.cloud/v3/files/private/download_link`;
        const date = Math.floor(new Date().getTime() / 1000);

        const payload = {
          url: filePath,
          expires,
          date,
          method: "GET",
        };

        const linkResponse = await fetch(apiUrl, {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify(payload),
        });

        if (!linkResponse.ok) {
          const errorText = await linkResponse.text();
          throw new Error(
            `Failed to create download link: ${linkResponse.status} ${linkResponse.statusText}. Response: ${errorText}`
          );
        }

        const linkData = await linkResponse.json();
        const expirationTime = new Date(
          (date + expires) * 1000
        ).toLocaleString();

        return {
          content: [
            {
              type: "text",
              text: `✅ Private IPFS temporary link:\n${linkData.data}\n\nExpires: ${expirationTime} (${expires} seconds from creation)`,
            },
          ],
        };
      }
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "fetchFromGateway",
  "Fetch content from Public or Private IPFS via Pinata gateway and return it",
  {
    cid: z.string().describe("The CID of the file to fetch"),
    network: z
      .enum(["public", "private"])
      .default("public")
      .describe("Whether the file is on public or private IPFS"),
  },
  async ({ cid, network }) => {
    try {
      if (!GATEWAY_URL) {
        throw new Error("GATEWAY_URL environment variable is not set");
      }

      let fileUrl: string;

      if (network === "public") {
        fileUrl = `https://${GATEWAY_URL}/ipfs/${cid}`;
      } else {
        const filePath = `https://${GATEWAY_URL}/files/${cid}`;
        const apiUrl = `https://api.pinata.cloud/v3/files/private/download_link`;
        const date = Math.floor(new Date().getTime() / 1000);
        const expires = 600;

        const payload = {
          url: filePath,
          expires,
          date,
          method: "GET",
        };

        const linkResponse = await fetch(apiUrl, {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify(payload),
        });

        if (!linkResponse.ok) {
          const errorText = await linkResponse.text();
          throw new Error(
            `Failed to create download link: ${linkResponse.status} ${linkResponse.statusText}. Response: ${errorText}`
          );
        }

        const linkData = await linkResponse.json();
        fileUrl = linkData.data;
      }

      const response = await fetch(fileUrl);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch file: ${response.status} ${response.statusText}`
        );
      }

      const contentType =
        response.headers.get("content-type") || "application/octet-stream";
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      let resultText = `✅ Fetched ${buffer.length} bytes from ${network} IPFS (CID: ${cid})\nContent-Type: ${contentType}\n\n`;

      // Return text content directly, binary as base64
      if (
        contentType.startsWith("text/") ||
        contentType.includes("json") ||
        contentType.includes("javascript") ||
        contentType.includes("xml")
      ) {
        if (buffer.length < 100000) {
          resultText += `Content:\n${buffer.toString("utf-8")}`;
        } else {
          resultText += `Content too large to display (${buffer.length} bytes). Use a smaller file or save to disk.`;
        }
      } else if (buffer.length < 50000) {
        resultText += `Base64 Content:\n${buffer.toString("base64")}`;
      } else {
        resultText += `Binary content too large to display (${buffer.length} bytes).`;
      }

      return {
        content: [{ type: "text", text: resultText }],
      };
    } catch (error) {
      return errorResponse(error);
    }
  }
);

// ============================================================================
// Group Operations
// ============================================================================

server.tool(
  "listGroups",
  "List groups in your Pinata account with optional filtering by name",
  {
    network: z
      .enum(["public", "private"])
      .default("public")
      .describe("Whether to list groups in public or private IPFS"),
    name: z.string().optional().describe("Filter groups by name"),
    limit: z
      .number()
      .optional()
      .describe("Maximum number of results to return"),
    pageToken: z.string().optional().describe("Token for pagination"),
  },
  async ({ network, name, limit, pageToken }) => {
    try {
      const params = new URLSearchParams();
      if (name) params.append("name", name);
      if (limit) params.append("limit", limit.toString());
      if (pageToken) params.append("pageToken", pageToken);

      const url = `https://api.pinata.cloud/v3/groups/${network}?${params.toString()}`;

      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to list groups: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return successResponse(data);
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "createGroup",
  "Create a new group in your Pinata account to organize files",
  {
    network: z
      .enum(["public", "private"])
      .default("public")
      .describe("Whether to create the group in public or private IPFS"),
    name: z.string().describe("Name for the new group"),
  },
  async ({ network, name }) => {
    try {
      const url = `https://api.pinata.cloud/v3/groups/${network}`;

      const response = await fetch(url, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to create group: ${response.status} ${response.statusText}`
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
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "getGroup",
  "Retrieve detailed information about a specific group by its ID",
  {
    network: z
      .enum(["public", "private"])
      .default("public")
      .describe("Whether the group is in public or private IPFS"),
    id: z.string().describe("The unique ID of the group to retrieve"),
  },
  async ({ network, id }) => {
    try {
      const url = `https://api.pinata.cloud/v3/groups/${network}/${id}`;

      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to get group: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return successResponse(data);
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "updateGroup",
  "Update metadata for an existing group on Pinata",
  {
    network: z
      .enum(["public", "private"])
      .default("public")
      .describe("Whether the group is in public or private IPFS"),
    id: z.string().describe("The unique ID of the group to update"),
    name: z.string().optional().describe("New name for the group"),
  },
  async ({ network, id, name }) => {
    try {
      const url = `https://api.pinata.cloud/v3/groups/${network}/${id}`;

      const payload: { name?: string } = {};
      if (name) payload.name = name;

      const response = await fetch(url, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to update group: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return successResponse(data);
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "deleteGroup",
  "Delete a group from your Pinata account by its ID",
  {
    network: z
      .enum(["public", "private"])
      .default("public")
      .describe("Whether the group is in public or private IPFS"),
    id: z.string().describe("The unique ID of the group to delete"),
  },
  async ({ network, id }) => {
    try {
      const url = `https://api.pinata.cloud/v3/groups/${network}/${id}`;

      const response = await fetch(url, {
        method: "DELETE",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to delete group: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text: `✅ Group deleted successfully\n\n${JSON.stringify(data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "addFileToGroup",
  "Add an existing file to a group in your Pinata account",
  {
    network: z
      .enum(["public", "private"])
      .default("public")
      .describe("Whether the group and file are in public or private IPFS"),
    groupId: z.string().describe("The ID of the group to add the file to"),
    fileId: z.string().describe("The ID of the file to add to the group"),
  },
  async ({ network, groupId, fileId }) => {
    try {
      const url = `https://api.pinata.cloud/v3/groups/${network}/${groupId}/ids/${fileId}`;

      const response = await fetch(url, {
        method: "PUT",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to add file to group: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text: `✅ File added to group successfully\n\n${JSON.stringify(data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "removeFileFromGroup",
  "Remove a file from a group in your Pinata account",
  {
    network: z
      .enum(["public", "private"])
      .default("public")
      .describe("Whether the group and file are in public or private IPFS"),
    groupId: z
      .string()
      .describe("The ID of the group to remove the file from"),
    fileId: z.string().describe("The ID of the file to remove from the group"),
  },
  async ({ network, groupId, fileId }) => {
    try {
      const url = `https://api.pinata.cloud/v3/groups/${network}/${groupId}/ids/${fileId}`;

      const response = await fetch(url, {
        method: "DELETE",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to remove file from group: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text: `✅ File removed from group successfully\n\n${JSON.stringify(data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return errorResponse(error);
    }
  }
);

// ============================================================================
// x402 Payment Instructions
// ============================================================================

const PaymentRequirementSchema = z.object({
  asset: z
    .string()
    .describe("The token contract address (e.g., USDC on Base)"),
  pay_to: z.string().describe("The wallet address to receive payments"),
  network: z
    .enum(["base", "base-sepolia", "eip155:8453", "eip155:84532"])
    .describe("The blockchain network"),
  amount: z
    .string()
    .describe("The amount required for access (in smallest unit, e.g., wei)"),
  description: z.string().optional().describe("Optional description"),
});

server.tool(
  "createPaymentInstruction",
  "Create a new x402 payment instruction for content monetization. This allows you to gate content behind a paywall.",
  {
    name: z.string().describe("Name for the payment instruction"),
    payment_requirements: z
      .array(PaymentRequirementSchema)
      .describe("Array of payment requirements"),
    description: z
      .string()
      .optional()
      .describe("Description of the payment instruction"),
  },
  async ({ name, payment_requirements, description }) => {
    try {
      const url = "https://api.pinata.cloud/v3/x402/payment_instructions";

      const payload: {
        name: string;
        payment_requirements: typeof payment_requirements;
        description?: string;
      } = {
        name,
        payment_requirements,
      };

      if (description) payload.description = description;

      const response = await fetch(url, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to create payment instruction: ${response.status} ${response.statusText}\n${errorText}`
        );
      }

      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text: `✅ Payment instruction created successfully!\n\n${JSON.stringify(data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "listPaymentInstructions",
  "List and filter x402 payment instructions for content monetization",
  {
    limit: z
      .number()
      .optional()
      .describe("Limit the number of results returned"),
    pageToken: z.string().optional().describe("Token for pagination"),
    cid: z.string().optional().describe("Filter by associated CID"),
    name: z.string().optional().describe("Filter by name"),
    id: z.string().optional().describe("Filter by specific payment instruction ID"),
  },
  async ({ limit, pageToken, cid, name, id }) => {
    try {
      const params = new URLSearchParams();
      if (limit) params.append("limit", limit.toString());
      if (pageToken) params.append("pageToken", pageToken);
      if (cid) params.append("cid", cid);
      if (name) params.append("name", name);
      if (id) params.append("id", id);

      const url = `https://api.pinata.cloud/v3/x402/payment_instructions?${params.toString()}`;

      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to list payment instructions: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return successResponse(data);
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "getPaymentInstruction",
  "Retrieve a specific x402 payment instruction by ID",
  {
    id: z
      .string()
      .describe("The unique identifier of the payment instruction"),
  },
  async ({ id }) => {
    try {
      const url = `https://api.pinata.cloud/v3/x402/payment_instructions/${id}`;

      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to get payment instruction: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return successResponse(data);
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "updatePaymentInstruction",
  "Update an existing x402 payment instruction",
  {
    id: z
      .string()
      .describe("The unique identifier of the payment instruction to update"),
    name: z.string().optional().describe("Updated name"),
    payment_requirements: z
      .array(PaymentRequirementSchema)
      .optional()
      .describe("Updated payment requirements"),
    description: z.string().optional().describe("Updated description"),
  },
  async ({ id, name, payment_requirements, description }) => {
    try {
      const url = `https://api.pinata.cloud/v3/x402/payment_instructions/${id}`;

      const payload: {
        name?: string;
        payment_requirements?: typeof payment_requirements;
        description?: string;
      } = {};

      if (name) payload.name = name;
      if (payment_requirements)
        payload.payment_requirements = payment_requirements;
      if (description) payload.description = description;

      const response = await fetch(url, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to update payment instruction: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return successResponse(data);
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "deletePaymentInstruction",
  "Delete an x402 payment instruction",
  {
    id: z
      .string()
      .describe("The unique identifier of the payment instruction to delete"),
  },
  async ({ id }) => {
    try {
      const url = `https://api.pinata.cloud/v3/x402/payment_instructions/${id}`;

      const response = await fetch(url, {
        method: "DELETE",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to delete payment instruction: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text: `✅ Payment instruction deleted successfully\n\n${JSON.stringify(data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return errorResponse(error);
    }
  }
);

// ============================================================================
// CID Signatures
// ============================================================================

server.tool(
  "signCid",
  "Create an EIP-712 cryptographic signature for a CID to verify content authenticity",
  {
    cid: z.string().describe("The CID to sign"),
  },
  async ({ cid }) => {
    try {
      const url = "https://api.pinata.cloud/v3/ipfs/signature";

      const response = await fetch(url, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ cid }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to sign CID: ${response.status} ${response.statusText}\n${errorText}`
        );
      }

      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text: `✅ CID signed successfully!\n\n${JSON.stringify(data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "listSignatures",
  "List signatures for files in your Pinata account",
  {
    limit: z
      .number()
      .optional()
      .describe("Maximum number of results to return"),
    pageToken: z.string().optional().describe("Token for pagination"),
  },
  async ({ limit, pageToken }) => {
    try {
      const params = new URLSearchParams();
      if (limit) params.append("limit", limit.toString());
      if (pageToken) params.append("pageToken", pageToken);

      const url = `https://api.pinata.cloud/v3/ipfs/signature?${params.toString()}`;

      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to list signatures: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return successResponse(data);
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "getSignature",
  "Get signature details for a specific CID",
  {
    cid: z.string().describe("The CID to get the signature for"),
  },
  async ({ cid }) => {
    try {
      const url = `https://api.pinata.cloud/v3/ipfs/signature/${cid}`;

      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to get signature: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return successResponse(data);
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "deleteSignature",
  "Remove a signature from a CID",
  {
    cid: z.string().describe("The CID to remove the signature from"),
  },
  async ({ cid }) => {
    try {
      const url = `https://api.pinata.cloud/v3/ipfs/signature/${cid}`;

      const response = await fetch(url, {
        method: "DELETE",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to delete signature: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text: `✅ Signature deleted successfully\n\n${JSON.stringify(data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return errorResponse(error);
    }
  }
);

// ============================================================================
// Helper Functions
// ============================================================================

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

// ============================================================================
// Server Startup
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Pinata MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
