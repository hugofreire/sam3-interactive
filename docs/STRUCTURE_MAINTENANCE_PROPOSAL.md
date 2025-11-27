# SAM3 Repo Structure & Config Hardening (80/20)

This captures a quick map of the repo, the highest-leverage structure tweaks, and where to externalize config/secrets so the project stays maintainable across a Raspberry Pi (inference) and a server (training).

## Current Layout (high level)
- `backend/`: Express bridge to `sam3_service.py`, SQLite datasets in `backend/datasets/`, exports in `backend/exports/`, uploads in `backend/uploads/`, training helpers in `backend/training.js`, routes in `backend/routes/`. (There’s also a duplicate legacy copy under `backend/backend/`.)
- `frontend/`: Vite/React UI (proxy points at `http://localhost:3001`), code in `frontend/src/`, built assets in `frontend/public/`. (Legacy duplicate under `frontend/frontend/`.)
- `sam3/`: Python library (models, training, eval, agents). `sam3/model_builder.py` builds the image model; `sam3/model/sam3_image_processor.py` does inference; `sam3/train` holds training entrypoints/utilities.
- `scripts/` + `examples/` + `docs/`: helper scripts, notebooks, and documentation.
- Data/caches: runtime DBs and crops in `backend/datasets/`, exports in `backend/exports/`, HF cache in `.cache/`, checkpoints like `yolo11n.pt` in the repo root.

## 80/20 Structure Tweaks
- **Consolidate app roots**: Treat backend and frontend as first-class apps (e.g., `apps/backend`, `apps/frontend`) or at least remove/retire the `backend/backend` and `frontend/frontend` duplicates to avoid drift.
- **Central data root**: Parameterize a single `DATA_ROOT` (e.g., `./data`) and hang `datasets/`, `uploads/`, `exports/`, and training `models/` off it. Wire this into `backend/database.js`, `backend/server.js`, and `backend/training.js` instead of hard-coded `path.join(__dirname, ...)`.
- **Config directory**: Add `config/.env.example` covering both Node and Python knobs (ports, GPU/CPU selection, model paths). Keep environment-specific overrides in `config/.env.pi` vs `config/.env.server` and load via `dotenv`.
- **Entrypoints**: Add thin wrappers (`scripts/run-backend.sh`, `scripts/run-frontend.sh`, `scripts/run-sam3-service.sh`) that read env and start the right process (CUDA for server, CPU for Pi). Document them in `README.md`.
- **Build artifacts segregation**: Keep exports, uploads, and model outputs under `data/` and ensure `.gitignore` covers them. Consider a `data/README.md` to remind about persistence/backups.
- **Docs touchpoints**: Add short `README.md` inside `backend/` and `frontend/` pointing to how to run in each profile (Pi vs server) and what env to set.

## Hard-Coded Config/Secrets to Externalize
- **Backend port & GPU**: `backend/server.js` uses `const PORT = 3001;` and spawns `sam3_service.py` with `CUDA_VISIBLE_DEVICES: '1'`. Make `PORT` and `SAM3_DEVICE`/`SAM3_CUDA_VISIBLE_DEVICES` env-driven.
- **Training defaults**: `backend/training.js` defaults `device = 1` and sets `CUDA_VISIBLE_DEVICES` when spawning `train_yolo.py`. Drive `TRAIN_DEVICE`, `TRAIN_WORKERS`, `TRAIN_MODEL` from env to swap between CPU Pi inference and GPU server training.
- **SAM3 service device**: `backend/sam3_service.py` forces `os.environ['CUDA_VISIBLE_DEVICES'] = '1'`. Gate this on `SAM3_DEVICE` (`cpu` on Pi) or `SAM3_CUDA_VISIBLE_DEVICES`.
- **Frontend API target**: `frontend/vite.config.ts` proxies `/api` to `http://localhost:3001`; `frontend/src/api/*` reads `import.meta.env.VITE_API_URL` but there’s no sample. Externalize `VITE_API_URL` and `VITE_PROXY_TARGET` to allow remote backend access.
- **LLM client**: `sam3/agent/client_llm.py` expects `api_key` and `server_url` when constructing `OpenAI(...)`. Provide `LLM_API_KEY`/`LLM_BASE_URL` envs in the wrapper that instantiates it; avoid hard-coded tokens in notebooks (`examples/sam3_agent.ipynb` currently sets `LLM_API_KEY = "DUMMY_API_KEY"`).
- **Distributed/multi-process addr**: `sam3/train/train.py` and `sam3/model/sam3_video_predictor.py` set `MASTER_ADDR`/`MASTER_PORT` to `localhost` and pick free ports. Make these overridable for multi-node training.

## Suggested `.env.example`
```
# Backend
PORT=3001
DATA_ROOT=./data
SAM3_CUDA_VISIBLE_DEVICES=1          # set '' or 0 for CPU-only Pi
SAM3_PYTHON=python3                  # path to python for sam3_service.py

# Training
TRAIN_DEVICE=1                       # GPU index or 'cpu'
TRAIN_WORKERS=4
TRAIN_MODEL=yolo11n

# Frontend
VITE_API_URL=http://localhost:3001/api
VITE_PROXY_TARGET=http://localhost:3001

# LLM (optional agent features)
LLM_API_KEY=
LLM_BASE_URL=https://api.openai.com/v1
```

## Profile Notes (Pi vs Server)
- **Raspberry Pi (inference only)**: set `SAM3_CUDA_VISIBLE_DEVICES=` (empty) or `SAM3_DEVICE=cpu`, lower workers (`TRAIN_WORKERS=0` if you run lightweight validation), and point `DATA_ROOT` to external storage if space is tight. Preload models/checkpoints into a writable path and cache HF models in `.cache` on disk.
- **Training server**: set `SAM3_CUDA_VISIBLE_DEVICES`/`TRAIN_DEVICE` to GPU IDs, keep `DATA_ROOT` on fast SSD/NVMe, and allow `VITE_API_URL` to point at the server’s hostname so the Pi UI can label against it.

## Quick Wins to Implement First
- Add `config/.env.example` (and optionally `.env.pi` / `.env.server`) with the variables above and wire `dotenv` into the backend start script.
- Make `PORT`, `UPLOADS_DIR`, `EXPORTS_DIR`, and `CUDA_VISIBLE_DEVICES` in `backend/server.js` configurable via env.
- Make `device`/`CUDA_VISIBLE_DEVICES` in `backend/training.js` and `backend/sam3_service.py` read env.
- Parameterize the Vite proxy/`VITE_API_URL` and add a `frontend/.env.example`.
- Archive or delete `backend/backend/` and `frontend/frontend/` to avoid confusion.
