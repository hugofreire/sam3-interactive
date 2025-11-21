# SAM3 Dataset Labeling - Implementation Scratchpad

**Project**: SAM3 Dataset Labeling System
**Started**: 2025-11-21
**Current Phase**: Phase 1 - Core Crop & Label Functionality

---

## 🎯 Implementation Status

### ✅ Completed
- [x] Created comprehensive implementation plan (DATASET_LABELING_PLAN.md)
- [x] Git commit before implementation
- [x] Services running (backend + frontend)
- [x] **Step 1: Database Setup** ✅ ALL TESTS PASSED!

### 🔄 In Progress
- [ ] **Step 1: Integrate Database into Server** (Current)

### ⏳ Pending
- [ ] Step 2: Backend API - Project Management
- [ ] Step 3: Python Service - Crop Extraction
- [ ] Step 4: Backend API - Crop Management
- [ ] Step 5: Frontend - Project Manager
- [ ] Step 6: Frontend - Crop & Label
- [ ] Step 7: Keyboard Shortcuts
- [ ] Step 8: Export - ZIP Generation
- [ ] Step 9: Testing & Polish

---

## 📝 Important Notes

### Architecture Decisions Confirmed
1. **Storage**: Backend filesystem + SQLite (one DB per project)
2. **Background Modes**: transparent, white, black, original (configurable)
3. **Export**: ZIP download first, Roboflow API later
4. **Persistence**: Full project management with save/load/switch

### Directory Structure
```
backend/
├── datasets/                  # Root for all project datasets
│   └── {project_id}/
│       ├── crops/            # Cropped images (PNG)
│       └── metadata.db       # SQLite database (per-project)
├── uploads/                  # Temporary SAM3 session images
├── database.js               # NEW: DB connection & query helpers
├── migrations/               # NEW: SQL schema files
│   └── 001_initial.sql
├── routes/                   # NEW: Organized API routes
│   ├── projects.js
│   ├── crops.js
│   └── export.js
├── sam3_service.py           # MODIFY: Add crop_from_mask
└── server.js                 # MODIFY: Add DB init & new routes
```

### Database Schema (SQLite per project)
- **projects**: Project metadata (stored in main app, or per-project?)
- **crops**: Crop metadata with labels, bbox, source info
- **labels**: Unique labels with counts
- **export_history**: Track exports

### Key Technical Points
- Use `sqlite3` npm package
- Each project gets its own SQLite DB file
- Database path: `backend/datasets/{project_id}/metadata.db`
- Auto-create directories when project created
- Use UUIDs for project IDs and crop IDs

---

## 🔧 Step 1: Database Setup - Detailed Plan

### Task 1.1: Create `backend/database.js`
**Purpose**: Centralized database connection and query helpers

**Key Functions**:
- `initProjectDatabase(projectId)` - Create/open project DB
- `runMigrations(db)` - Run SQL migrations
- `getProjectDB(projectId)` - Get existing DB connection
- `closeProjectDB(projectId)` - Close DB connection
- Query helpers: `run()`, `get()`, `all()`

**Important**:
- Use promises for async operations
- Handle connection pooling (cache open connections)
- Auto-create directories if they don't exist
- Error handling for all DB operations

### Task 1.2: Create `backend/migrations/001_initial.sql`
**Purpose**: Initial database schema

**Tables**:
1. `projects` - Maybe not needed per-project? (Think about this)
2. `crops` - Main table for labeled crops
3. `labels` - Unique labels with counts
4. `export_history` - Track export operations

**Indexes**:
- crops.project_id (if we keep projects table)
- crops.label (for filtering)
- crops.created_at (for sorting)

### Task 1.3: Modify `server.js`
**Changes**:
- Import database.js
- Add startup initialization
- Test DB on server start

### Task 1.4: Test Database
**Tests**:
- Create project → verify directory & DB created
- Insert crop → verify data persisted
- Query crops → verify retrieval
- Close and reopen → verify persistence

---

## 💡 Decisions Made During Implementation

### Decision 1: Project Metadata Storage
**Question**: Where to store project-level metadata?
**Options**:
- A) Central SQLite DB in `backend/datasets/main.db`
- B) JSON file per project
- C) In each project's SQLite DB

**Decision**: **Option A** - Central database
**Reasoning**:
- Need to list all projects on startup
- JSON would require reading many files
- Central DB is cleaner for project management

**Implementation**:
- Main DB: `backend/datasets/projects.db` (global)
- Project DBs: `backend/datasets/{project_id}/metadata.db` (per-project)

### Decision 2: SQLite Connection Management
**Decision**: Cache open DB connections in memory
**Reasoning**:
- Opening/closing DB on each request is slow
- Keep connection pool in Map<projectId, db>
- Close connections on server shutdown

---

## 🐛 Issues & Solutions

### Issue 1: [Will track issues as they come up]
**Problem**:
**Solution**:
**Status**:

---

## 📊 Progress Tracking

### Step 1: Database Setup ✅ COMPLETED
- [x] Task 1.1: Create backend/database.js
- [x] Task 1.2: Create backend/migrations/001_initial.sql
- [x] Task 1.3: Create test_database.js
- [x] Task 1.4: Test database operations - **ALL 14 TESTS PASSED!**

**Started**: 2025-11-21 11:15
**Completed**: 2025-11-21 11:36
**Duration**: ~21 minutes

**Test Results Summary**:
✅ Main database initialization
✅ Project CRUD (Create, Read, Update, Delete)
✅ Crop CRUD operations
✅ Label count tracking (automatic triggers working!)
✅ Database persistence (close/reopen)
✅ Filtering and queries
✅ Connection pooling

**Files Created**:
- `backend/database.js` (580 lines) - Complete DB management
- `backend/migrations/001_initial.sql` (99 lines) - Schema with triggers
- `backend/test_database.js` (183 lines) - Comprehensive test suite
- `backend/datasets/projects.db` - Main database
- `backend/datasets/{project_id}/metadata.db` - Per-project databases
- `backend/datasets/{project_id}/crops/` - Crop storage directories

### Step 1b: Integrate into Server (In Progress)
- [ ] Add database initialization to server.js
- [ ] Add graceful shutdown (close DB connections)
- [ ] Test server startup with database

---

## 🔍 Code Snippets & References

### SQLite3 Node.js Usage
```javascript
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('path/to/db.sqlite');

// Promisified query
function runQuery(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}
```

### UUID Generation
```javascript
const { v4: uuidv4 } = require('uuid');
const projectId = uuidv4(); // e.g., "550e8400-e29b-41d4-a716-446655440000"
```

---

## 📚 API Endpoints to Implement (Later Steps)

### Project Management
- POST /api/projects - Create project
- GET /api/projects - List all projects
- GET /api/projects/:id - Get project details
- PUT /api/projects/:id - Update project
- DELETE /api/projects/:id - Delete project

### Crop Management
- POST /api/projects/:id/crops - Create crop from mask
- GET /api/projects/:id/crops - List crops in project
- GET /api/crops/:id - Get crop image
- PUT /api/crops/:id - Update crop label
- DELETE /api/crops/:id - Delete crop

### Export
- POST /api/projects/:id/export/zip - Export as ZIP

---

## 🎨 Frontend Components to Build (Later Steps)

1. **ProjectManager.tsx** - Project list & switcher
2. **CropAndLabel.tsx** - Main labeling interface
3. **DatasetGrid.tsx** - View all labeled crops (future)
4. **ExportDialog.tsx** - Export configuration (future)

---

## 🧪 Testing Checklist

### Database Tests ✅ ALL PASSED
- [x] Create project → directory created
- [x] Create project → DB file created
- [x] Create project → tables created
- [x] Insert crop → data persisted
- [x] Query crops → correct results
- [x] Update label → changes saved
- [x] Delete crop → removed from DB
- [x] Close & reopen → data still there
- [x] Label count triggers working correctly
- [x] Project stats updated automatically

### API Tests (Later)
- [ ] POST /api/projects → project created
- [ ] GET /api/projects → list returned
- [ ] POST /api/projects/:id/crops → crop saved
- [ ] GET /api/crops/:id → image served

---

## 🚀 Next Steps After Step 1
1. Install sqlite3 npm package
2. Install archiver npm package (for ZIP export later)
3. Test database with simple Node script
4. Move to Step 2: Backend API implementation

---

---

## 🎉 Major Milestones

### Milestone 1: Database Layer Complete! (2025-11-21 11:36)
**Achievement**: Full-featured SQLite database system with automatic label counting

**What Works**:
- ✅ Dual database system (main + per-project)
- ✅ Connection pooling for performance
- ✅ Automatic directory creation
- ✅ SQL triggers for label count automation
- ✅ Complete CRUD for projects and crops
- ✅ Data persistence verified
- ✅ 14/14 tests passing

**Key Features Implemented**:
1. **Main Database** (`projects.db`): Global project list
2. **Project Databases** (`{project_id}/metadata.db`): Per-project data
3. **Automatic Triggers**: Label counts update automatically on insert/update/delete
4. **Connection Pooling**: Fast access, cached connections
5. **Promisified API**: All async/await, no callback hell
6. **Comprehensive CRUD**: Full create, read, update, delete for all entities

**Performance**:
- All 14 tests completed in < 1 second
- Database opens/closes cleanly
- No memory leaks detected

---

**Last Updated**: 2025-11-21 11:36
**Next Task**: Integrate database into server.js
