# Environment Setup (Backend + Frontend)

- Copy `config/.env.example` to `config/.env` and adjust paths/devices. Backends load from `config/.env` first, then `./backend/.env`/CWD.
- Copy `frontend/.env.example` to `frontend/.env` for UI-specific overrides.

## Common knobs
- `PORT`: backend HTTP port.
- `DATA_ROOT`, `UPLOADS_DIR`, `EXPORTS_DIR`: where SQLite DBs, uploads, and exports live (use absolute paths on remote hosts/NFS).
- `SAM3_PYTHON`, `SAM3_CUDA_VISIBLE_DEVICES`, `SAM3_DEVICE`: pick interpreter and GPU/CPU for the SAM3 service (set `SAM3_DEVICE=cpu` and clear CUDA for Raspberry Pi).
- `TRAIN_DEVICE`, `TRAIN_CUDA_VISIBLE_DEVICES`, `TRAIN_WORKERS`, `TRAIN_MODEL`: training defaults; set to `cpu`/low workers for Pi, GPU index for servers.
- `VITE_API_URL`, `VITE_PROXY_TARGET`, `VITE_PORT`: frontend dev server + API target (set `VITE_API_URL` to the backend host without `/api`).
- `LLM_API_KEY`, `LLM_BASE_URL`: only needed if you use the optional LLM agent.

## Profiles
- **Raspberry Pi (inference only)**: `SAM3_DEVICE=cpu`, leave CUDA vars empty, `TRAIN_DEVICE=cpu`, `TRAIN_WORKERS=0`, shrink batch/img size if you run validation. Point `VITE_API_URL` to the remote server backend if labeling against it.
- **Training server (GPU)**: set `SAM3_CUDA_VISIBLE_DEVICES`/`TRAIN_CUDA_VISIBLE_DEVICES` to GPU ids, keep `DATA_ROOT` on fast storage, and expose `VITE_API_URL` so Pi/frontends can reach it.

## Start commands
- Backend: `cd backend && npm start`
- Frontend: `cd frontend && npm run dev`
