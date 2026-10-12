## Codebase Memory (codebase-memory-mcp)

When this MCP server is available, **prefer graph tools over grep for structural code questions**.

- **"Who calls X?"** → `trace_path(function_name="X", direction="inbound")`
- **"What does X call?"** → `trace_path(function_name="X", direction="outbound")`
- **Find functions by pattern** → `search_graph(label="Function", name_pattern=".*Pattern.*")`
- **Dead code** → `search_graph(label="Function", max_degree=0)`
- **Impact of changes** → `detect_changes()`
- **Read source** → `get_code_snippet(qualified_name="...")`
- **Architecture overview** → `get_architecture`
- **Complex patterns** → `query_graph` with Cypher

Use grep for text search (string literals, error messages, config values) — the graph doesn't index text content.   