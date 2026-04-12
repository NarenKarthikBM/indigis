import client from "./client";
import type { WorkflowGraph, WorkflowResult, SavedWorkflow, SaveAsLayerRequest } from "../types/workflow.types";

export async function executeWorkflow(graph: WorkflowGraph & { workflow_id?: number }): Promise<WorkflowResult> {
  const res = await client.post("/workflows/execute/", graph);
  return res.data as WorkflowResult;
}

export async function listWorkflows(): Promise<SavedWorkflow[]> {
  const res = await client.get("/workflows/");
  return res.data;
}

export async function getWorkflow(id: number): Promise<SavedWorkflow> {
  const res = await client.get(`/workflows/${id}/`);
  return res.data;
}

export async function createWorkflow(data: { name: string; description?: string; graph_data: object }): Promise<SavedWorkflow> {
  const res = await client.post("/workflows/", data);
  return res.data;
}

export async function updateWorkflow(id: number, data: Partial<{ name: string; description: string; graph_data: object }>): Promise<SavedWorkflow> {
  const res = await client.put(`/workflows/${id}/`, data);
  return res.data;
}

export async function deleteWorkflow(id: number): Promise<void> {
  await client.delete(`/workflows/${id}/`);
}

export async function saveAsLayer(workflowId: number, data: SaveAsLayerRequest): Promise<any> {
  const res = await client.post(`/workflows/${workflowId}/save-as-layer/`, data);
  return res.data;
}
