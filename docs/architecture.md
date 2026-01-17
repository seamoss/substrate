# Architecture

Technical design and implementation details for Substrate.

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI (substrate)                       │
│                        Node.js / npm                         │
└─────────────────┬───────────────────┬───────────────────────┘
                  │                   │
                  ▼                   ▼
         ┌───────────────┐   ┌───────────────────┐
         │  Local Cache  │   │     REST API      │
         │    SQLite     │   │     (Fastify)     │
         └───────────────┘   └────────┬──────────┘
                                      │
                                      ▼
                             ┌───────────────────┐
                             │     SurrealDB     │
                             │   (Dockerized)    │
                             └───────────────────┘
```

## Components

### CLI (`cli/`)

The command-line interface, distributed as an npm package.

**Technology:**
- Node.js 18+
- Commander.js for command parsing
- better-sqlite3 for local cache
- ora for spinners
- chalk for colors

**Key files:**
```
cli/
├── bin/substrate.js       # Entry point, audit logging
├── src/
│   ├── index.js          # Command registration
│   ├── commands/         # Command implementations
│   │   ├── init.js
│   │   ├── context.js
│   │   ├── brief.js
│   │   ├── link.js
│   │   ├── mount.js
│   │   ├── sync.js
│   │   ├── auth.js
│   │   └── ...
│   ├── mcp/
│   │   └── server.js     # MCP server implementation
│   ├── lib/
│   │   ├── api.js        # REST client
│   │   ├── config.js     # Configuration paths
│   │   ├── output.js     # Formatting utilities
│   │   └── sync.js       # Sync logic
│   └── db/
│       └── local.js      # SQLite cache
```

### REST API (`api/`)

Fastify-based REST API server.

**Technology:**
- Fastify 4.x
- SurrealDB client
- Docker deployment

**Key files:**
```
api/
├── Dockerfile
├── src/
│   ├── index.js          # Server setup, route registration
│   ├── routes/
│   │   ├── auth.js       # Authentication endpoints
│   │   ├── workspaces.js
│   │   ├── context.js
│   │   ├── mounts.js
│   │   └── sync.js
│   ├── middleware/
│   │   └── auth.js       # Auth middleware
│   ├── lib/
│   │   └── mail.js       # Email service (optional)
│   └── db/
│       ├── surreal.js    # Database connection
│       └── schema.js     # Schema definitions
```

### Database (SurrealDB)

Graph-native database for context storage.

**Why SurrealDB:**
- Native graph relationships
- Flexible schema
- SQL-like query language
- Built-in real-time features

**Schema:**
```sql
-- Users
DEFINE TABLE user SCHEMAFULL;
DEFINE FIELD email ON TABLE user TYPE option<string>;
DEFINE FIELD email_verified_at ON TABLE user TYPE option<datetime>;
DEFINE FIELD created_at ON TABLE user TYPE datetime;

-- API Keys
DEFINE TABLE api_key SCHEMAFULL;
DEFINE FIELD user ON TABLE api_key TYPE record<user>;
DEFINE FIELD key_hash ON TABLE api_key TYPE string;
DEFINE FIELD key_prefix ON TABLE api_key TYPE string;
DEFINE FIELD name ON TABLE api_key TYPE string;

-- Workspaces
DEFINE TABLE workspace SCHEMAFULL;
DEFINE FIELD name ON TABLE workspace TYPE string;
DEFINE FIELD description ON TABLE workspace TYPE string;
DEFINE FIELD project_id ON TABLE workspace TYPE string;
DEFINE FIELD owner ON TABLE workspace TYPE option<record<user>>;

-- Context Objects
DEFINE TABLE context SCHEMAFULL;
DEFINE FIELD workspace ON TABLE context TYPE record<workspace>;
DEFINE FIELD type ON TABLE context TYPE string;
DEFINE FIELD content ON TABLE context TYPE string;
DEFINE FIELD tags ON TABLE context TYPE array;
DEFINE FIELD scope ON TABLE context TYPE string;
DEFINE FIELD meta ON TABLE context TYPE object;

-- Graph Links
DEFINE TABLE links SCHEMAFULL;
DEFINE FIELD in ON TABLE links TYPE record<context>;
DEFINE FIELD out ON TABLE links TYPE record<context>;
DEFINE FIELD relation ON TABLE links TYPE string;

-- Mounts
DEFINE TABLE mount SCHEMAFULL;
DEFINE FIELD workspace ON TABLE mount TYPE record<workspace>;
DEFINE FIELD path ON TABLE mount TYPE string;
DEFINE FIELD scope ON TABLE mount TYPE string;
DEFINE FIELD tags ON TABLE mount TYPE array;
```

### Local Cache (SQLite)

Offline-first local storage.

**Purpose:**
- Offline operation
- Fast local queries
- Sync queue management

**Schema mirrors SurrealDB** with additional sync metadata:
- `synced_at` — Last sync timestamp
- `remote_id` — ID on remote server
- `pending_sync` — Items awaiting push

## Data Flow

### Adding Context

```
1. CLI: substrate add "..." --type constraint
   │
2. └─► Local SQLite: INSERT INTO context
   │
3. └─► API: POST /api/context/:workspace
   │
4.     └─► SurrealDB: CREATE context SET ...
   │
5.     └─► Response: { id, remote_id }
   │
6. └─► Local SQLite: UPDATE context SET remote_id, synced_at
```

### Getting Brief

```
1. CLI: substrate brief --compact
   │
2. └─► Local SQLite: SELECT * FROM context WHERE workspace_id = ?
   │                 JOIN links ON ...
   │
3. └─► Format and return
```

### Syncing

```
Push:
1. Local: SELECT * FROM context WHERE synced_at IS NULL
2. API: POST /api/sync/:workspace/batch
3. SurrealDB: Upsert each item
4. Local: UPDATE synced_at

Pull:
1. API: GET /api/sync/:workspace/changes?since=<timestamp>
2. SurrealDB: SELECT * WHERE updated_at > $since
3. Local: Upsert each item
```

## Authentication Flow

### Token Generation

```javascript
// Generate token
const randomBytes = crypto.randomUUID() + Date.now();
const token = 'sub_' + sha256(randomBytes).slice(0, 32);
const hash = sha256(token);

// Store hash only
db.query('CREATE api_key SET key_hash = $hash', { hash });

// Return token to user (once)
return { token };
```

### Request Authentication

```javascript
// Middleware
const token = request.headers.authorization?.replace('Bearer ', '');
const hash = sha256(token);
const key = await db.query('SELECT * FROM api_key WHERE key_hash = $hash');

if (!key) return 401;
request.auth = { user: key.user, type: 'api_key' };
```

## MCP Server

The MCP server implements the Model Context Protocol for native agent integration.

**Implementation:**
```javascript
import { Server } from '@modelcontextprotocol/sdk/server';

const server = new Server(
  { name: 'substrate', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler('tools/call', async (request) => {
  switch (request.params.name) {
    case 'substrate_brief':
      return getBrief(request.params.arguments);
    case 'substrate_add':
      return addContext(request.params.arguments);
    // ...
  }
});
```

## Configuration

### Global Config (`~/.substrate/`)

```
~/.substrate/
├── auth.json     # API key
├── config.json   # Global settings
└── log           # Audit log
```

### Project Config (`.substrate/`)

```
.substrate/
├── config.json   # Project ID
└── log           # Project audit log
```

### Config Resolution

1. Environment variables (`SUBSTRATE_API_URL`)
2. Global config (`~/.substrate/config.json`)
3. Project config (`.substrate/config.json`)
4. Defaults

## Offline Operation

Substrate is offline-first:

1. **All reads from local cache** — No network required
2. **Writes queue locally** — Synced when online
3. **Conflict resolution** — Last-write-wins by `updated_at`

```javascript
// Check network, fall back gracefully
try {
  const result = await api.addContext(...);
  db.prepare('UPDATE context SET remote_id = ?, synced_at = ?').run(...);
} catch (err) {
  // Offline - context saved locally, will sync later
}
```

## Graph Relationships

### Link Types

| Relation | Meaning |
|----------|---------|
| `relates_to` | General relationship |
| `depends_on` | A depends on B |
| `blocks` | A blocks B |
| `implements` | A implements B |
| `extends` | A extends B |
| `references` | A references B |

### Graph Traversal

```javascript
// Get related items (depth 1)
const links = db.prepare(`
  SELECT l.*, c.*
  FROM links l
  JOIN context c ON (l.from_id = c.id OR l.to_id = c.id)
  WHERE l.from_id = ? OR l.to_id = ?
`).all(itemId, itemId);

// Depth 2 - follow links from first-hop items
for (const link of firstHop) {
  const secondLinks = db.prepare(...).all(link.id);
  // ...
}
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/init` | Create account |
| POST | `/api/auth/keys` | Create API key |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/workspaces` | Create workspace |
| GET | `/api/workspaces/:id` | Get workspace |
| POST | `/api/context/:workspace` | Add context |
| GET | `/api/context/:workspace` | List context |
| GET | `/api/context/:workspace/brief` | Get brief |
| POST | `/api/context/:workspace/link` | Create link |
| POST | `/api/sync/:workspace/batch` | Push changes |
| GET | `/api/sync/:workspace/changes` | Pull changes |
| GET | `/health` | Health check |

## Performance Considerations

### Local Cache Benefits

- **Instant reads** — No network latency
- **Offline support** — Work without connectivity
- **Reduced API load** — Only sync changes

### Indexing

SQLite indexes:
```sql
CREATE INDEX idx_context_workspace ON context(workspace_id);
CREATE INDEX idx_context_type ON context(type);
CREATE INDEX idx_links_from ON links(from_id);
CREATE INDEX idx_links_to ON links(to_id);
```

### Brief Generation

Brief prioritizes:
1. Constraints (always included)
2. Decisions (always included)
3. Notes (limited by count)

Links are resolved in a single JOIN query.

## Security

### Token Security

- Tokens hashed with SHA256 before storage
- Original token never stored
- Tokens shown only once at creation

### Workspace Isolation

- Workspace tokens scoped to single workspace
- Owner verification for sensitive operations
- Read-only scope option

### Input Validation

- Type validation on context types
- UUID validation on IDs
- Scope validation on workspace tokens

## Future Considerations

### Planned Features

- Workspace inheritance (parent/child)
- Semantic search with embeddings
- Real-time sync (WebSocket)
- Team/organization accounts

### Scalability

Current design supports:
- Single-tenant deployment
- Moderate context volume (thousands of items)
- Small teams (< 50 users)

For larger scale:
- Horizontal API scaling
- SurrealDB clustering
- CDN for brief caching
