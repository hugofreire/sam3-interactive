#!/bin/bash
#
# Convert YOLO ONNX model to Hailo HEF format
# Requires: Docker, x86 Linux machine
#
# Usage:
#   ./convert_to_hef.sh <onnx_model> <calibration_images_dir> [output_dir]
#
# Example:
#   ./convert_to_hef.sh models/coffee-beans-yolo11n/best.onnx calibration_images/ models/coffee-beans-yolo11n/
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Arguments
ONNX_MODEL="${1:-}"
CALIB_DIR="${2:-}"
OUTPUT_DIR="${3:-.}"

# Model config
NUM_CLASSES=2  # green, roasted
HW_ARCH="hailo8l"  # Hailo-8L for RPi AI Kit

usage() {
    echo "Usage: $0 <onnx_model> <calibration_images_dir> [output_dir]"
    echo ""
    echo "Arguments:"
    echo "  onnx_model              Path to ONNX model file"
    echo "  calibration_images_dir  Directory with ~100 calibration images"
    echo "  output_dir              Output directory (default: current dir)"
    echo ""
    echo "Example:"
    echo "  $0 models/coffee-beans-yolo11n/best.onnx calib_images/ models/coffee-beans-yolo11n/"
    exit 1
}

# Check arguments
if [ -z "$ONNX_MODEL" ] || [ -z "$CALIB_DIR" ]; then
    usage
fi

if [ ! -f "$ONNX_MODEL" ]; then
    echo -e "${RED}Error: ONNX model not found: $ONNX_MODEL${NC}"
    exit 1
fi

if [ ! -d "$CALIB_DIR" ]; then
    echo -e "${RED}Error: Calibration directory not found: $CALIB_DIR${NC}"
    exit 1
fi

# Count calibration images
CALIB_COUNT=$(find "$CALIB_DIR" -type f \( -name "*.jpg" -o -name "*.jpeg" -o -name "*.png" \) | wc -l)
if [ "$CALIB_COUNT" -lt 10 ]; then
    echo -e "${YELLOW}Warning: Only $CALIB_COUNT calibration images found. Recommend 50-100 for best quantization.${NC}"
fi

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is required but not installed.${NC}"
    echo "Install Docker: https://docs.docker.com/engine/install/"
    exit 1
fi

# Get absolute paths
ONNX_MODEL_ABS=$(realpath "$ONNX_MODEL")
CALIB_DIR_ABS=$(realpath "$CALIB_DIR")
OUTPUT_DIR_ABS=$(realpath "$OUTPUT_DIR")
ONNX_FILENAME=$(basename "$ONNX_MODEL")
MODEL_NAME="${ONNX_FILENAME%.*}"

echo -e "${GREEN}=== Hailo HEF Conversion ===${NC}"
echo "ONNX Model: $ONNX_MODEL_ABS"
echo "Calibration Dir: $CALIB_DIR_ABS ($CALIB_COUNT images)"
echo "Output Dir: $OUTPUT_DIR_ABS"
echo "Hardware: $HW_ARCH"
echo "Classes: $NUM_CLASSES"
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR_ABS"

# Create workspace directory for Docker
WORKSPACE=$(mktemp -d)
trap "rm -rf $WORKSPACE" EXIT

# Copy files to workspace
cp "$ONNX_MODEL_ABS" "$WORKSPACE/"
cp -r "$CALIB_DIR_ABS" "$WORKSPACE/calib_images"

echo -e "${YELLOW}Pulling Hailo Dataflow Compiler Docker image...${NC}"
docker pull hailo-ai/dataflow-compiler:latest 2>/dev/null || {
    echo -e "${RED}Error: Could not pull Hailo Docker image.${NC}"
    echo "You may need to:"
    echo "  1. Log in to Hailo Developer Zone: https://hailo.ai/developer-zone/"
    echo "  2. Request access to the Dataflow Compiler"
    echo "  3. Use the Hailo Model Zoo instead: https://github.com/hailo-ai/hailo_model_zoo"
    exit 1
}

echo -e "${YELLOW}Starting HEF conversion (this may take 10-30 minutes)...${NC}"

# Run conversion
docker run --rm \
    -v "$WORKSPACE:/workspace" \
    hailo-ai/dataflow-compiler:latest \
    bash -c "
        cd /workspace && \
        hailomz compile yolo11n \
            --ckpt=$ONNX_FILENAME \
            --hw-arch=$HW_ARCH \
            --calib-path=calib_images \
            --classes=$NUM_CLASSES \
            --performance
    "

# Check if HEF was created
HEF_FILE="$WORKSPACE/${MODEL_NAME}.hef"
if [ -f "$HEF_FILE" ]; then
    cp "$HEF_FILE" "$OUTPUT_DIR_ABS/model.hef"
    HEF_SIZE=$(du -h "$OUTPUT_DIR_ABS/model.hef" | cut -f1)
    echo ""
    echo -e "${GREEN}=== Conversion Complete ===${NC}"
    echo "HEF file: $OUTPUT_DIR_ABS/model.hef ($HEF_SIZE)"
    echo ""
    echo "To use on Raspberry Pi 5 with Hailo AI Kit:"
    echo "  python scripts/rpi5_inference.py --image photo.jpg --backend hailo"
else
    echo -e "${RED}Error: HEF file was not created.${NC}"
    echo "Check the Docker output above for errors."
    exit 1
fi
