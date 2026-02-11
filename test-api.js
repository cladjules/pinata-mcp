#!/usr/bin/env node
import "dotenv/config";

const API_URL = process.env.API_URL;
const MCP_API_KEY = process.env.MCP_API_KEYS?.split(",")[0];

async function testAuthentication() {
  console.log("Testing Pinata MCP API...\n");
  console.log(`API URL: ${API_URL}`);
  console.log(`Using API Key: ${MCP_API_KEY ? "✓" : "✗"}\n`);

  try {
    // Step 1: Initialize session
    console.log("1. Initializing MCP session...");
    const initResponse = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": MCP_API_KEY || "",
        "mcp-session-id": "test-session-123",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "test-client",
            version: "1.0.0",
          },
        },
      }),
    });

    if (!initResponse.ok) {
      const errorText = await initResponse.text();
      throw new Error(
        `Initialize failed: ${initResponse.status} ${initResponse.statusText}\n${errorText}`,
      );
    }

    const initData = await initResponse.json();
    console.log("✓ Session initialized:", JSON.stringify(initData, null, 2));
    console.log();

    // Step 2: List available tools
    console.log("2. Listing available tools...");
    const toolsResponse = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": MCP_API_KEY || "",
        "mcp-session-id": "test-session-123",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      }),
    });

    if (!toolsResponse.ok) {
      const errorText = await toolsResponse.text();
      throw new Error(
        `List tools failed: ${toolsResponse.status} ${toolsResponse.statusText}\n${errorText}`,
      );
    }

    const toolsData = await toolsResponse.json();
    console.log("✓ Available tools:");
    toolsData.result?.tools?.forEach((tool) => {
      console.log(`  - ${tool.name}: ${tool.description}`);
    });
    console.log();

    // Step 3: Call testAuthentication tool
    console.log("3. Testing Pinata authentication...");
    const authResponse = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": MCP_API_KEY || "",
        "mcp-session-id": "test-session-123",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "testAuthentication",
          arguments: {},
        },
      }),
    });

    if (!authResponse.ok) {
      const errorText = await authResponse.text();
      throw new Error(
        `Auth test failed: ${authResponse.status} ${authResponse.statusText}\n${errorText}`,
      );
    }

    const authData = await authResponse.json();
    console.log("✓ Authentication result:");
    console.log(JSON.stringify(authData, null, 2));
    console.log();

    // Step 4: Upload a simple JSON file
    console.log("4. Uploading a simple JSON file...");
    const testFile = {
      message: "Hello from Pinata MCP!",
      timestamp: new Date().toISOString(),
      test: true,
    };
    const fileContent = Buffer.from(JSON.stringify(testFile, null, 2)).toString(
      "base64",
    );

    const uploadResponse = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": MCP_API_KEY || "",
        "mcp-session-id": "test-session-123",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "uploadFile",
          arguments: {
            fileContent: fileContent,
            fileName: "test-file.json",
            mimeType: "application/json",
            network: "public",
          },
        },
      }),
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(
        `Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}\n${errorText}`,
      );
    }

    const uploadData = await uploadResponse.json();
    console.log("✓ Upload result:");
    console.log(JSON.stringify(uploadData, null, 2));
    console.log();

    // Step 5: Upload a file from URL
    console.log("5. Uploading a file from URL...");
    const urlUploadResponse = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": MCP_API_KEY || "",
        "mcp-session-id": "test-session-123",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: {
          name: "uploadFile",
          arguments: {
            sourceUrl: "https://picsum.photos/200/300",
            fileName: "random-image.jpg",
            mimeType: "image/jpeg",
            network: "public",
          },
        },
      }),
    });

    if (!urlUploadResponse.ok) {
      const errorText = await urlUploadResponse.text();
      throw new Error(
        `URL upload failed: ${urlUploadResponse.status} ${urlUploadResponse.statusText}\n${errorText}`,
      );
    }

    const urlUploadData = await urlUploadResponse.json();
    console.log("✓ URL upload result:");
    console.log(JSON.stringify(urlUploadData, null, 2));
    console.log();

    // Step 6: Upload multiple files from URLs
    console.log("6. Uploading multiple files from URLs...");
    const multiUploadResponse = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": MCP_API_KEY || "",
        "mcp-session-id": "test-session-123",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: {
          name: "uploadFiles",
          arguments: {
            fileContents: [
              {
                sourceUrl: "https://picsum.photos/200/300",
                fileName: "image-1-portrait.jpg",
              },
              {
                sourceUrl: "https://picsum.photos/300/200",
                fileName: "image-2-landscape.jpg",
              },
              {
                sourceUrl: "https://picsum.photos/250/250",
                fileName: "image-3-square.jpg",
              },
            ],
            network: "public",
          },
        },
      }),
    });

    if (!multiUploadResponse.ok) {
      const errorText = await multiUploadResponse.text();
      throw new Error(
        `Multi upload failed: ${multiUploadResponse.status} ${multiUploadResponse.statusText}\n${errorText}`,
      );
    }

    const multiUploadData = await multiUploadResponse.json();
    console.log("✓ Multiple file upload result:");
    console.log(JSON.stringify(multiUploadData, null, 2));
    console.log();

    // Step 7: Upload multiple files using fileContents array
    console.log("7. Uploading multiple files using fileContents array...");
    const file1 = {
      name: "file-1.json",
      content: { id: 1, message: "First file" },
    };
    const file2 = {
      name: "file-2.json",
      content: { id: 2, message: "Second file" },
    };
    const file3 = {
      name: "file-3.json",
      content: { id: 3, message: "Third file" },
    };

    const fileContentsUploadResponse = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": MCP_API_KEY || "",
        "mcp-session-id": "test-session-123",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: {
          name: "uploadFiles",
          arguments: {
            fileContents: [
              {
                fileContent: Buffer.from(
                  JSON.stringify(file1.content, null, 2),
                ).toString("base64"),
                fileName: file1.name,
                mimeType: "application/json",
              },
              {
                fileContent: Buffer.from(
                  JSON.stringify(file2.content, null, 2),
                ).toString("base64"),
                fileName: file2.name,
                mimeType: "application/json",
              },
              {
                fileContent: Buffer.from(
                  JSON.stringify(file3.content, null, 2),
                ).toString("base64"),
                fileName: file3.name,
                mimeType: "application/json",
              },
            ],
            network: "public",
          },
        },
      }),
    });

    if (!fileContentsUploadResponse.ok) {
      const errorText = await fileContentsUploadResponse.text();
      throw new Error(
        `FileContents upload failed: ${fileContentsUploadResponse.status} ${fileContentsUploadResponse.statusText}\n${errorText}`,
      );
    }

    const fileContentsUploadData = await fileContentsUploadResponse.json();
    console.log("✓ FileContents upload result:");
    console.log(JSON.stringify(fileContentsUploadData, null, 2));
    console.log();

    console.log("✅ All tests passed!");
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    process.exit(1);
  }
}

testAuthentication();
