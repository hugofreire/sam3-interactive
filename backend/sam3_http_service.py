#!/usr/bin/env python3
"""
SAM3 HTTP Service - Standalone FastAPI service for remote SAM3 inference.

This allows decoupling SAM3 from the Express backend, enabling:
- Raspberry Pi to use remote GPU server for inference
- Multiple clients to share a single SAM3 instance
- Independent scaling of inference and backend

Usage:
    CUDA_VISIBLE_DEVICES=1 python -m uvicorn sam3_http_service:app --host 0.0.0.0 --port 8000
"""

import os
import sys
import uuid
import tempfile
import logging
from pathlib import Path
from typing import Optional
from contextlib import asynccontextmanager

import torch
from fastapi import FastAPI, UploadFile, File, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Add parent directory to path to import sam3
sys.path.insert(0, str(Path(__file__).parent.parent))

# Import SAM3Service class (reuse existing logic)
from sam3_service import SAM3Service

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(levelname)s] %(message)s'
)
logger = logging.getLogger(__name__)

# Global SAM3 service instance
sam3: Optional[SAM3Service] = None


# --- Pydantic Models ---

class ClickPredictRequest(BaseModel):
    points: list[list[float]]
    labels: list[int]
    multimask_output: bool = True
    use_previous_logits: bool = False


class TextPredictRequest(BaseModel):
    prompt: str


class CropRequest(BaseModel):
    mask_index: int
    background_mode: str = "transparent"
    padding: int = 10


class HealthResponse(BaseModel):
    status: str
    sam3_ready: bool
    device: str
    gpu_name: Optional[str] = None
    sessions_active: int


class SessionResponse(BaseModel):
    success: bool
    session_id: str
    width: int
    height: int
    message: Optional[str] = None


class PredictResponse(BaseModel):
    success: bool
    masks: Optional[list[str]] = None
    scores: Optional[list[float]] = None
    bboxes: Optional[list[list[float]]] = None
    num_masks: Optional[int] = None
    num_instances: Optional[int] = None
    message: Optional[str] = None
    error: Optional[str] = None


class CropResponse(BaseModel):
    success: bool
    crop_base64: Optional[str] = None
    bbox: Optional[list[int]] = None
    crop_width: Optional[int] = None
    crop_height: Optional[int] = None
    mask_area: Optional[int] = None
    message: Optional[str] = None
    error: Optional[str] = None


class DeleteResponse(BaseModel):
    success: bool
    message: Optional[str] = None
    error: Optional[str] = None


# --- Lifespan Context Manager ---

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize SAM3 on startup, cleanup on shutdown."""
    global sam3
    logger.info("Starting SAM3 HTTP Service...")

    try:
        sam3 = SAM3Service()
        logger.info("SAM3 model loaded successfully!")
    except Exception as e:
        logger.error(f"Failed to load SAM3 model: {e}")
        raise

    yield  # Server is running

    # Cleanup
    logger.info("Shutting down SAM3 HTTP Service...")
    if sam3:
        sam3.sessions.clear()


# --- FastAPI App ---

app = FastAPI(
    title="SAM3 HTTP Service",
    description="Remote SAM3 segmentation service for GPU offloading",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware for cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Endpoints ---

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint - returns SAM3 status and GPU info."""
    gpu_name = None
    if torch.cuda.is_available():
        try:
            gpu_name = torch.cuda.get_device_name(0)
        except Exception:
            pass

    return HealthResponse(
        status="ok",
        sam3_ready=sam3 is not None and sam3.model is not None,
        device=sam3.device if sam3 else "unknown",
        gpu_name=gpu_name,
        sessions_active=len(sam3.sessions) if sam3 else 0
    )


@app.post("/sessions", response_model=SessionResponse)
async def create_session(
    image: UploadFile = File(...),
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    """
    Create a new session by uploading an image.

    Optionally pass X-Session-ID header to use a specific session ID.
    """
    if not sam3:
        raise HTTPException(status_code=503, detail="SAM3 service not ready")

    # Generate or use provided session ID
    session_id = x_session_id or str(uuid.uuid4())

    # Save uploaded file temporarily
    suffix = Path(image.filename).suffix if image.filename else ".jpg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await image.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Load image into SAM3
        result = sam3.load_image(tmp_path, session_id)

        if not result.get('success'):
            raise HTTPException(status_code=400, detail=result.get('error', 'Failed to load image'))

        return SessionResponse(
            success=True,
            session_id=session_id,
            width=result['width'],
            height=result['height'],
            message=result.get('message')
        )

    finally:
        # Clean up temp file
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


@app.get("/sessions/{session_id}")
async def get_session(session_id: str):
    """Get session info (dimensions, status)."""
    if not sam3:
        raise HTTPException(status_code=503, detail="SAM3 service not ready")

    if session_id not in sam3.sessions:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    session = sam3.sessions[session_id]
    return {
        "success": True,
        "session_id": session_id,
        "width": session['width'],
        "height": session['height'],
        "has_previous_logits": session.get('logits') is not None
    }


@app.delete("/sessions/{session_id}", response_model=DeleteResponse)
async def delete_session(session_id: str):
    """Delete a session and free memory."""
    if not sam3:
        raise HTTPException(status_code=503, detail="SAM3 service not ready")

    result = sam3.clear_session(session_id)

    if not result.get('success'):
        raise HTTPException(status_code=404, detail=result.get('error'))

    return DeleteResponse(
        success=True,
        message=result.get('message')
    )


@app.post("/sessions/{session_id}/predict/click", response_model=PredictResponse)
async def predict_click(session_id: str, request: ClickPredictRequest):
    """
    Click-based segmentation.

    - points: List of [x, y] coordinates
    - labels: List of labels (1=foreground, 0=background)
    - multimask_output: Return 3 candidate masks (default: true)
    - use_previous_logits: Use previous mask for refinement
    """
    if not sam3:
        raise HTTPException(status_code=503, detail="SAM3 service not ready")

    if session_id not in sam3.sessions:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    result = sam3.predict_click(
        session_id,
        request.points,
        request.labels,
        request.multimask_output,
        request.use_previous_logits
    )

    if not result.get('success'):
        return PredictResponse(
            success=False,
            error=result.get('error')
        )

    return PredictResponse(
        success=True,
        masks=result.get('masks'),
        scores=result.get('scores'),
        num_masks=result.get('num_masks'),
        message=result.get('message')
    )


@app.post("/sessions/{session_id}/predict/text", response_model=PredictResponse)
async def predict_text(session_id: str, request: TextPredictRequest):
    """
    Text-based segmentation.

    - prompt: Text description (e.g., "car", "person")
    """
    if not sam3:
        raise HTTPException(status_code=503, detail="SAM3 service not ready")

    if session_id not in sam3.sessions:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    result = sam3.predict_text(session_id, request.prompt)

    if not result.get('success'):
        return PredictResponse(
            success=False,
            error=result.get('error')
        )

    return PredictResponse(
        success=True,
        masks=result.get('masks'),
        scores=result.get('scores'),
        bboxes=result.get('boxes'),
        num_instances=result.get('num_instances'),
        message=result.get('message')
    )


@app.post("/sessions/{session_id}/crop", response_model=CropResponse)
async def create_crop(session_id: str, request: CropRequest):
    """
    Extract a crop from the last prediction.

    - mask_index: Index of mask to use (0, 1, or 2)
    - background_mode: 'transparent', 'white', 'black', or 'original'
    - padding: Pixels to add around bounding box

    Returns the crop as base64-encoded PNG.
    """
    if not sam3:
        raise HTTPException(status_code=503, detail="SAM3 service not ready")

    if session_id not in sam3.sessions:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    # Create temp file for crop
    with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
        tmp_path = tmp.name

    try:
        result = sam3.crop_from_mask(
            session_id,
            request.mask_index,
            tmp_path,
            request.background_mode,
            request.padding
        )

        if not result.get('success'):
            return CropResponse(
                success=False,
                error=result.get('error')
            )

        # Read crop and encode as base64
        import base64
        with open(tmp_path, 'rb') as f:
            crop_b64 = base64.b64encode(f.read()).decode('utf-8')

        return CropResponse(
            success=True,
            crop_base64=crop_b64,
            bbox=result.get('bbox'),
            crop_width=result.get('crop_width'),
            crop_height=result.get('crop_height'),
            mask_area=result.get('mask_area'),
            message=result.get('message')
        )

    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


# --- Main ---

if __name__ == "__main__":
    import uvicorn

    host = os.getenv("SAM3_HTTP_HOST", "0.0.0.0")
    port = int(os.getenv("SAM3_HTTP_PORT", "8000"))

    logger.info(f"Starting SAM3 HTTP Service on {host}:{port}")
    uvicorn.run(app, host=host, port=port)
