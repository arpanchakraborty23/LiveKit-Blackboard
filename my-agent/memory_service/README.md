# Memory Service (Graphiti + Neo4j)

Temporal memory microservice for the voice assistant. Provides entity extraction, temporal knowledge graph search, node forgetting, and memory profile distillation.

## API Endpoints

- `GET /health`: Health check (unauthenticated).
- `POST /episodes`: `{ group_id, name, body, reference_time }` -> Adds an episode and extracts entities/relationships.
- `POST /search`: `{ group_id, query, limit }` -> Temporal semantic search.
- `GET /nodes`: `?group_id=&q=` -> Lists nodes and edges for the graph explorer.
- `DELETE /nodes/{uuid}`: `?group_id=` -> Forgets a node and marks connected edges invalid.
- `POST /profile/rebuild`: `{ group_id }` -> Distills active facts into a denormalized profile.

## Running

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```
