# SAM3 Project - Quick Start Guide

## What is SAM3?

SAM3 (Segment Anything Model 3) is Meta's foundation model for promptable segmentation in images and videos. It can detect, segment, and track objects using text or visual prompts like points, boxes, and masks.

## Setup Status

✓ **Environment**: Python 3.10+
✓ **GPU**: NVIDIA GeForce RTX 3090 (CUDA 12.1)
✓ **PyTorch**: 2.5.1+cu121 (match your CUDA version!)
✓ **SAM3**: v0.1.0 installed
✓ **Hugging Face**: Authenticated

> **Important**: Ensure your PyTorch CUDA version matches your system CUDA toolkit.
> Install with: `pip install torch==2.5.1+cu121 --index-url https://download.pytorch.org/whl/cu121`

## Getting Model Access

Before running SAM3, you need to request access:

1. Visit: https://huggingface.co/facebook/sam3
2. Click the **"Request Access"** button
3. Wait for approval (usually within minutes to hours)
4. Once approved, run the verification script to confirm:
   ```bash
   python scripts/verify_setup.py
   ```

## Project Structure

```
sam3/
├── examples/
│   └── basic_example.py   # Simple image segmentation script
├── scripts/
│   └── verify_setup.py    # Verify installation and model access
├── test_image.jpg         # Sample image (truck)
├── sam3/                  # SAM3 source code
└── docs/                  # Documentation
```

## Usage Examples

### 1. Verify Setup
```bash
python scripts/verify_setup.py
```

### 2. Basic Image Segmentation
```bash
# Segment a truck in the test image
python examples/basic_example.py test_image.jpg "truck"

# Segment other objects
python examples/basic_example.py test_image.jpg "wheel"
python examples/basic_example.py your_image.jpg "person"
```

### 3. Python API Usage

```python
from PIL import Image
from sam3.model_builder import build_sam3_image_model
from sam3.model.sam3_image_processor import Sam3Processor

# Load model
model = build_sam3_image_model()
processor = Sam3Processor(model)

# Process image
image = Image.open("test_image.jpg")
state = processor.set_image(image)

# Run segmentation with text prompt
output = processor.set_text_prompt(state=state, prompt="truck")
masks = output["masks"]
boxes = output["boxes"]
scores = output["scores"]

print(f"Found {len(masks)} objects")
```

## Scripts Provided

### `basic_example.py`
A complete example demonstrating:
- Loading and processing images
- Text-prompted segmentation
- Visualization of results
- Error handling and diagnostics

**Features:**
- Automatic GPU detection
- Clear error messages
- Saves visualization to `segmentation_result.png`
- Supports custom images and prompts

### `verify_setup.py`
Comprehensive setup verification:
- Checks Python version and dependencies
- Verifies CUDA/GPU availability
- Tests Hugging Face authentication
- Validates model access permissions

## Next Steps

### Once Model Access is Granted:

1. **Test the basic example:**
   ```bash
   python examples/basic_example.py test_image.jpg "truck"
   ```

2. **Try different prompts:**
   - "person" - detect people
   - "car" - detect cars
   - "tree" - detect trees
   - Any object description!

3. **Explore official examples:**
   ```bash
   cd examples/
   jupyter notebook sam3_agent.ipynb
   ```

4. **Video segmentation:**
   ```python
   from sam3.model_builder import build_sam3_video_predictor

   predictor = build_sam3_video_predictor()
   response = predictor.handle_request({
       "type": "start_session",
       "resource_path": "video.mp4"
   })
   ```

## System Requirements

- **Python**: 3.10+ (tested with 3.10.14)
- **PyTorch**: 2.5.1+ (must match CUDA version - e.g., `torch==2.5.1+cu121` for CUDA 12.1)
- **CUDA**: 12.1+ (check with `nvcc --version`)
- **GPU**: NVIDIA GPU with 8GB+ VRAM (RTX 3090 recommended)
- **RAM**: 16GB+ recommended
- **Node.js**: 18+ (for web UI)

## Troubleshooting

### CUDA/PyTorch Version Mismatch
```
ImportError: undefined symbol: __nvJitLinkComplete_12_4
```
**Cause**: PyTorch was compiled against a different CUDA version than installed.
**Solution**: Reinstall PyTorch matching your CUDA version:
```bash
# Check your CUDA version
nvcc --version  # e.g., "release 12.1"

# Install matching PyTorch
pip install torch==2.5.1+cu121 torchvision==0.20.1+cu121 \
    --index-url https://download.pytorch.org/whl/cu121
```

### Model Access Error (403)
```
Cannot access gated repo for url https://huggingface.co/facebook/sam3...
```
**Solution**: Request access at https://huggingface.co/facebook/sam3

### Authentication Error (401)
```
Not authenticated to Hugging Face
```
**Solution**:
```bash
huggingface-cli login
```

### Out of Memory Error
**Solution**:
- Reduce image size
- Use CPU mode (slower): Set `CUDA_VISIBLE_DEVICES=""`
- Close other GPU applications

### Dependency Conflicts
**Solution**: Run verification to check:
```bash
python scripts/verify_setup.py
```

## Useful Links

- **SAM3 Repository**: https://github.com/facebookresearch/sam3
- **Model Hub**: https://huggingface.co/facebook/sam3
- **Documentation**: See README.md in repository
- **Training Guide**: See README_TRAIN.md

## Tips

1. **First run is slow**: Model checkpoints (~3GB) are downloaded on first use
2. **Use descriptive prompts**: More specific = better results
3. **Try multiple prompts**: Experiment with different descriptions
4. **GPU recommended**: CPU inference is very slow
5. **Check examples**: Official notebooks have advanced usage patterns

---

**Status**: Setup complete! Request model access to start using SAM3.
