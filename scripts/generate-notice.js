#!/usr/bin/env bun

/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from "bun";
import { readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Execute license-checker command
const generateNotice = async () => {
  const proc = spawn(["bunx", "license-checker", "--json", "--production"], {
    stdout: "pipe",
  });
  const output = await new Response(proc.stdout).text();
  return JSON.parse(output);
};

async function createNoticeFile() {
  // Custom header for notice file
  let noticeContent = `Elasticsearch MCP Server
Copyright 2025 Elasticsearch B.V.

The Elasticsearch MCP Server contains the following third-party dependencies:

`;

  try {
    const licenses = await generateNotice();

    for (const [pkgNameVer, info] of Object.entries(licenses)) {
      const pkgName =
        pkgNameVer.split("@")[0] === ""
          ? "@" + pkgNameVer.split("@")[1]
          : pkgNameVer.split("@")[0];

      // Extract version from the pkgNameVer string
      let version;
      if (pkgNameVer.split("@")[0] === "") {
        // Handle scoped packages (@organization/package-name@1.0.0)
        const parts = pkgNameVer.split("@");
        if (parts.length >= 3) {
          version = parts[2];
        }
      } else {
        // Handle regular packages (package-name@1.0.0)
        const parts = pkgNameVer.split("@");
        if (parts.length >= 2) {
          version = parts[1];
        }
      }

      // Use extracted version if available, otherwise fall back to info.version
      const displayVersion = version || info.version || "";

      noticeContent += `\n-------------------------------------------------------------------\n`;
      noticeContent += `Package: ${pkgName}\n`;
      noticeContent += `Version: ${displayVersion}\n`;
      noticeContent += `License: ${info.licenses || "Unknown"}\n`;

      if (info.publisher) {
        noticeContent += `Author: ${info.publisher}\n`;
      }

      noticeContent += `\n`;

      // Include license text if available
      if (info.licenseFile && typeof info.licenseFile === "string") {
        try {
          const licenseText = await readFile(info.licenseFile, "utf-8");
          noticeContent += `${licenseText.trim()}\n`;
        } catch (err) {
          noticeContent += `License text not available.\n`;
        }
      } else {
        noticeContent += `License text not available.\n`;
      }
    }

    // Write the NOTICE.txt file in the repo root
    await writeFile(
      join(__dirname, "..", "NOTICE.txt"),
      noticeContent,
      "utf-8"
    );
    console.log("NOTICE.txt file has been generated successfully.");
  } catch (error) {
    console.error("Error generating NOTICE.txt:", error);
  }
}

createNoticeFile();
