import client from "./client";

export async function fetchStates() {
  const res = await client.get("/boundaries/states/");
  console.log("Fetched states:", res.data);
  return res.data;
}

export async function fetchDistricts(stateCode?: string) {
  const params = stateCode ? { state: stateCode } : {};
  const res = await client.get("/boundaries/districts/", { params });
  return res.data;
}

export async function searchRegions(q: string) {
  const res = await client.get("/boundaries/search/", { params: { q } });
  return res.data as { states: unknown[]; districts: unknown[] };
}
