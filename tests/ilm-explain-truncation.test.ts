import { describe, expect, test, beforeEach } from "bun:test";
import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMockClient, createMockServer } from "./utils/test-helpers.js";
import { registerExplainLifecycleTool } from "../src/tools/ilm/explain_lifecycle.js";

describe("ILM Explain Lifecycle Truncation Handling", () => {
  let mockServer: McpServer;
  let mockClient: Client;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    // Add ILM namespace to mock client
    (mockClient as any).ilm = {
      explainLifecycle: async () => ({ indices: {} })
    };
    registerExplainLifecycleTool(mockServer, mockClient);
  });

  test("should automatically limit to 50 indices when >100 indices without explicit limit", async () => {
    // Create mock response with 150 indices
    const mockIndices: Record<string, any> = {};
    for (let i = 0; i < 150; i++) {
      mockIndices[`index-${i}`] = {
        managed: true,
        policy: "test-policy",
        phase: i < 10 ? "hot" : i < 50 ? "warm" : "cold",
        age: `${i}d`,
        ...(i < 5 ? { failed_step: "rollover", step_info: { type: "error", reason: "Test error" } } : {})
      };
    }

    mockClient.ilm.explainLifecycle = async () => ({
      indices: mockIndices
    });

    const tool = (mockServer as any).getTool("elasticsearch_ilm_explain_lifecycle");
    const result = await tool.handler({
      // No limit specified - should auto-limit
    });

    expect(result.content).toBeDefined();
    expect(result.content.length).toBe(2);
    
    const warningText = result.content[0].text;
    const dataText = result.content[1].text;
    
    // Should show warning about truncation
    expect(warningText).toContain("Showing 50 of 150 indices");
    expect(warningText).toContain("errors shown first");
    
    // Parse the JSON response
    const data = JSON.parse(dataText);
    expect(Object.keys(data.indices)).toHaveLength(50);
    
    // Verify error indices are shown first
    const indexNames = Object.keys(data.indices);
    // First 5 indices should be the ones with errors (index-0 through index-4)
    expect(indexNames.slice(0, 5)).toEqual(
      expect.arrayContaining(["index-0", "index-1", "index-2", "index-3", "index-4"])
    );
  });

  test("should respect explicit limit parameter", async () => {
    // Create mock response with 100 indices
    const mockIndices: Record<string, any> = {};
    for (let i = 0; i < 100; i++) {
      mockIndices[`logs-${i}`] = {
        managed: true,
        policy: "logs-policy",
        phase: "warm",
        age: `${i}d`
      };
    }

    mockClient.ilm.explainLifecycle = async () => ({
      indices: mockIndices
    });

    const tool = (mockServer as any).getTool("elasticsearch_ilm_explain_lifecycle");
    const result = await tool.handler({
      limit: 25
    });

    const dataText = result.content[1].text;
    const data = JSON.parse(dataText);
    
    // Should respect the explicit limit
    expect(Object.keys(data.indices)).toHaveLength(25);
    
    const warningText = result.content[0].text;
    expect(warningText).toContain("Showing 25 of 100 indices");
  });

  test("should not truncate when indices count is below limit", async () => {
    // Create mock response with 30 indices
    const mockIndices: Record<string, any> = {};
    for (let i = 0; i < 30; i++) {
      mockIndices[`small-${i}`] = {
        managed: true,
        policy: "small-policy",
        phase: "hot",
        age: `${i}h`
      };
    }

    mockClient.ilm.explainLifecycle = async () => ({
      indices: mockIndices
    });

    const tool = (mockServer as any).getTool("elasticsearch_ilm_explain_lifecycle");
    const result = await tool.handler({
      // No limit, but only 30 indices (below auto-limit threshold)
    });

    const infoText = result.content[0].text;
    const dataText = result.content[1].text;
    
    // Should not show truncation warning
    expect(infoText).toContain("Found 30 indices");
    expect(infoText).not.toContain("Showing");
    
    const data = JSON.parse(dataText);
    // All 30 indices should be included
    expect(Object.keys(data.indices)).toHaveLength(30);
  });

  test("should provide helpful error message for response size errors", async () => {
    mockClient.ilm.explainLifecycle = async () => {
      throw new Error("result exceeds maximum length of 1048576");
    };

    const tool = (mockServer as any).getTool("elasticsearch_ilm_explain_lifecycle");
    const result = await tool.handler({});

    expect(result.content).toBeDefined();
    expect(result.content.length).toBe(1);
    
    const errorText = result.content[0].text;
    
    // Should provide specific guidance for size errors
    expect(errorText).toContain("Response too large!");
    expect(errorText).toContain("Solution:");
    expect(errorText).toContain("{onlyManaged: true, limit: 50}");
    expect(errorText).toContain("{index: \"logs-*\", limit: 100}");
    expect(errorText).toContain("{onlyErrors: true, limit: 50}");
  });

  test("should use compact format when includeDetails is false", async () => {
    const mockIndices: Record<string, any> = {
      "test-index-1": {
        managed: true,
        policy: "test-policy",
        phase: "hot",
        age: "5d",
        action: "rollover",
        step: "check-rollover-ready",
        // Extra fields that should be excluded in compact mode
        phase_time_millis: 1234567890,
        action_time_millis: 1234567890,
        step_time_millis: 1234567890,
        phase_execution: {
          policy: "test-policy",
          phase_definition: { min_age: "0ms" },
          version: 1,
          modified_date_in_millis: 1234567890
        }
      },
      "test-index-2": {
        managed: true,
        policy: "test-policy",
        phase: "warm",
        age: "10d",
        failed_step: "shrink",
        step_info: {
          type: "error",
          reason: "Shrink failed"
        }
      }
    };

    mockClient.ilm.explainLifecycle = async () => ({
      indices: mockIndices
    });

    const tool = (mockServer as any).getTool("elasticsearch_ilm_explain_lifecycle");
    const result = await tool.handler({
      includeDetails: false
    });

    const dataText = result.content[1].text;
    const data = JSON.parse(dataText);
    
    // Compact format should only have essential fields
    expect(data.indices["test-index-1"]).toEqual({
      managed: true,
      policy: "test-policy",
      phase: "hot",
      age: "5d"
    });
    
    // Error info should still be included in compact mode
    expect(data.indices["test-index-2"]).toEqual({
      managed: true,
      policy: "test-policy",
      phase: "warm",
      age: "10d",
      failed_step: "shrink",
      error: "Shrink failed"
    });
    
    // Should not have verbose fields
    expect(data.indices["test-index-1"].phase_time_millis).toBeUndefined();
    expect(data.indices["test-index-1"].phase_execution).toBeUndefined();
  });

  test("should prioritize indices with errors when truncating", async () => {
    const mockIndices: Record<string, any> = {};
    
    // Create 10 indices with errors
    for (let i = 0; i < 10; i++) {
      mockIndices[`error-index-${i}`] = {
        managed: true,
        policy: "error-policy",
        phase: "warm",
        age: `${i}d`,
        failed_step: "rollover",
        step_info: { type: "error", reason: `Error ${i}` }
      };
    }
    
    // Create 90 normal indices
    for (let i = 0; i < 90; i++) {
      mockIndices[`normal-index-${i}`] = {
        managed: true,
        policy: "normal-policy",
        phase: "hot",
        age: `${i}h`
      };
    }

    mockClient.ilm.explainLifecycle = async () => ({
      indices: mockIndices
    });

    const tool = (mockServer as any).getTool("elasticsearch_ilm_explain_lifecycle");
    const result = await tool.handler({
      limit: 15
    });

    const dataText = result.content[1].text;
    const data = JSON.parse(dataText);
    
    const indexNames = Object.keys(data.indices);
    expect(indexNames).toHaveLength(15);
    
    // All 10 error indices should be included
    const errorIndices = indexNames.filter(name => name.startsWith("error-index-"));
    expect(errorIndices).toHaveLength(10);
    
    // Only 5 normal indices should be included
    const normalIndices = indexNames.filter(name => name.startsWith("normal-index-"));
    expect(normalIndices).toHaveLength(5);
  });
});