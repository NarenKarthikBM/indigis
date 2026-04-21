from collections import defaultdict, deque

from .nodes.registry import NODE_REGISTRY


class WorkflowError(Exception):
    def __init__(self, message, failed_node_id=None):
        super().__init__(message)
        self.failed_node_id = failed_node_id


def validate_graph(nodes, edges):
    node_ids = {n["id"] for n in nodes}

    for node in nodes:
        if node["type"] not in NODE_REGISTRY:
            raise WorkflowError(f"Unknown node type: '{node['type']}'", node["id"])

    for edge in edges:
        if edge["source"] not in node_ids:
            raise WorkflowError(f"Edge references unknown source node: {edge['source']}")
        if edge["target"] not in node_ids:
            raise WorkflowError(f"Edge references unknown target node: {edge['target']}")


def topological_sort(nodes, edges):
    """Kahn's algorithm - raises WorkflowError if a cycle is detected."""
    in_degree = {n["id"]: 0 for n in nodes}
    adjacency = defaultdict(list)

    for edge in edges:
        adjacency[edge["source"]].append(edge["target"])
        in_degree[edge["target"]] += 1

    queue = deque([nid for nid, deg in in_degree.items() if deg == 0])
    sorted_ids = []

    while queue:
        nid = queue.popleft()
        sorted_ids.append(nid)
        for neighbor in adjacency[nid]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    if len(sorted_ids) != len(nodes):
        raise WorkflowError("Workflow graph contains a cycle - cannot execute.")

    return sorted_ids


def execute_graph(nodes, edges):
    """
    Validate, topologically sort, and execute the workflow graph.

    Returns the NodeResult from the last executed node (typically preview_output).
    """
    validate_graph(nodes, edges)
    sorted_ids = topological_sort(nodes, edges)

    node_map = {n["id"]: n for n in nodes}

    # input_edges[target_id][targetHandle] = (source_id, sourceHandle)
    input_edges = defaultdict(dict)
    for edge in edges:
        input_edges[edge["target"]][edge["targetHandle"]] = (
            edge["source"],
            edge["sourceHandle"],
        )

    results = {}  # node_id -> NodeResult

    for node_id in sorted_ids:
        node = node_map[node_id]
        node_func = NODE_REGISTRY[node["type"]]

        # Gather inputs from upstream results keyed by targetHandle
        inputs = {}
        for handle, (src_id, _src_handle) in input_edges[node_id].items():
            upstream = results.get(src_id)
            if upstream is None:
                raise WorkflowError(
                    f"Upstream node '{src_id}' produced no result.", node_id
                )
            inputs[handle] = upstream

        try:
            result = node_func(inputs, node.get("config", {}))
        except WorkflowError:
            raise
        except Exception as exc:
            raise WorkflowError(str(exc), node_id) from exc

        if result is not None:
            results[node_id] = result

    # Return the last result in topological order
    for node_id in reversed(sorted_ids):
        if node_id in results:
            return results[node_id]

    return None
