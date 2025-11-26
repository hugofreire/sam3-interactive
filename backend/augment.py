#!/usr/bin/env python3
"""
Data Augmentation Script for YOLO Training

Uses albumentations library for bbox-aware image augmentation.
Generates synthetic training data by applying transformations to source images.

Usage:
    python augment.py preview --image /path/to/image.jpg --bboxes '[...]' --labels '[...]' --augmentations rotate,flip,brightness
    python augment.py generate --image /path/to/image.jpg --bboxes '[...]' --labels '[...]' --output /path/to/output.jpg --augmentations rotate,flip
"""

import argparse
import json
import sys
import os
import random
from pathlib import Path
from typing import List, Dict, Tuple, Optional
import base64
from io import BytesIO

try:
    import albumentations as A
    import cv2
    import numpy as np
    from PIL import Image
except ImportError as e:
    print(json.dumps({"success": False, "error": f"Missing dependency: {e}. Install with: pip install albumentations opencv-python-headless"}))
    sys.exit(1)


def log_json(data: dict):
    """Output JSON to stdout for Node.js to parse"""
    print(json.dumps(data), flush=True)


def get_augmentation_pipeline(augmentations: List[str], intensity: float = 1.0) -> A.Compose:
    """
    Build augmentation pipeline based on requested augmentations.

    Args:
        augmentations: List of augmentation names
        intensity: Multiplier for augmentation strength (0.5-1.5)

    Returns:
        Albumentations Compose pipeline with bbox support
    """
    transforms = []

    for aug in augmentations:
        aug_lower = aug.lower()

        if aug_lower == 'flip_h' or aug_lower == 'horizontal_flip':
            transforms.append(A.HorizontalFlip(p=1.0))

        elif aug_lower == 'flip_v' or aug_lower == 'vertical_flip':
            transforms.append(A.VerticalFlip(p=1.0))

        elif aug_lower.startswith('rotate'):
            # Parse rotation angle from name like "rotate_30" or use default
            try:
                angle = int(aug_lower.split('_')[1]) if '_' in aug_lower else 30
            except (ValueError, IndexError):
                angle = 30
            transforms.append(A.Rotate(limit=(angle, angle), p=1.0, border_mode=cv2.BORDER_REFLECT_101))

        elif aug_lower == 'brightness':
            limit = 0.2 * intensity
            transforms.append(A.RandomBrightnessContrast(
                brightness_limit=(-limit, limit),
                contrast_limit=0,
                p=1.0
            ))

        elif aug_lower == 'contrast':
            limit = 0.2 * intensity
            transforms.append(A.RandomBrightnessContrast(
                brightness_limit=0,
                contrast_limit=(-limit, limit),
                p=1.0
            ))

        elif aug_lower == 'brightness_contrast':
            limit = 0.2 * intensity
            transforms.append(A.RandomBrightnessContrast(
                brightness_limit=(-limit, limit),
                contrast_limit=(-limit, limit),
                p=1.0
            ))

        elif aug_lower == 'hue_saturation' or aug_lower == 'color':
            transforms.append(A.HueSaturationValue(
                hue_shift_limit=int(15 * intensity),
                sat_shift_limit=int(25 * intensity),
                val_shift_limit=int(15 * intensity),
                p=1.0
            ))

        elif aug_lower == 'blur':
            transforms.append(A.GaussianBlur(blur_limit=(3, 5), p=1.0))

        elif aug_lower == 'noise':
            transforms.append(A.GaussNoise(var_limit=(10, 30), p=1.0))

        elif aug_lower.startswith('scale'):
            # Parse scale factor from name like "scale_90" (meaning 90% = 0.9x)
            try:
                scale_pct = int(aug_lower.split('_')[1])
                scale = scale_pct / 100.0
            except (ValueError, IndexError):
                scale = 0.9
            transforms.append(A.RandomScale(scale_limit=(scale - 1, scale - 1), p=1.0))

    # Compose with bbox support
    return A.Compose(
        transforms,
        bbox_params=A.BboxParams(
            format='pascal_voc',  # [x_min, y_min, x_max, y_max]
            label_fields=['class_labels'],
            min_visibility=0.3,  # Drop bboxes that are <30% visible after transform
            min_area=100  # Drop very small bboxes
        )
    )


def generate_random_augmentation_combo(enabled_augmentations: List[str]) -> List[str]:
    """
    Generate a random combination of augmentations for variety.

    Args:
        enabled_augmentations: List of enabled augmentation types

    Returns:
        Random subset of augmentations to apply
    """
    # Separate geometric and color augmentations
    geometric = ['flip_h', 'rotate_15', 'rotate_30', 'rotate_-15', 'rotate_-30']
    color = ['brightness', 'contrast', 'hue_saturation']
    other = ['blur']

    selected = []

    # Pick 0-2 geometric transforms
    geo_choices = [g for g in geometric if any(g.startswith(e.split('_')[0]) for e in enabled_augmentations)]
    if geo_choices:
        selected.extend(random.sample(geo_choices, min(len(geo_choices), random.randint(1, 2))))

    # Pick 1-2 color transforms
    color_choices = [c for c in color if c in enabled_augmentations or
                     any(e.startswith(c.split('_')[0]) for e in enabled_augmentations)]
    if color_choices:
        selected.extend(random.sample(color_choices, min(len(color_choices), random.randint(1, 2))))

    # Sometimes add blur
    if 'blur' in enabled_augmentations and random.random() < 0.3:
        selected.append('blur')

    return selected if selected else enabled_augmentations[:2]


def convert_bbox_format(bbox: List[float], img_width: int, img_height: int,
                        from_format: str = 'xywh') -> List[float]:
    """
    Convert bbox between formats.

    Args:
        bbox: Bounding box coordinates
        img_width: Image width
        img_height: Image height
        from_format: 'xywh' (x, y, width, height) or 'xyxy' (x1, y1, x2, y2)

    Returns:
        Bbox in pascal_voc format [x_min, y_min, x_max, y_max]
    """
    if from_format == 'xywh':
        x, y, w, h = bbox
        return [x, y, x + w, y + h]
    elif from_format == 'xyxy':
        return bbox
    else:
        raise ValueError(f"Unknown bbox format: {from_format}")


def bbox_to_xywh(bbox: List[float]) -> List[float]:
    """Convert pascal_voc [x1, y1, x2, y2] to [x, y, w, h]"""
    x1, y1, x2, y2 = bbox
    return [x1, y1, x2 - x1, y2 - y1]


def augment_image(
    image_path: str,
    bboxes: List[List[float]],
    labels: List[str],
    augmentations: List[str],
    output_path: Optional[str] = None,
    bbox_format: str = 'xyxy',  # Changed default: bboxes from database are Pascal VOC [x_min, y_min, x_max, y_max]
    intensity: float = 1.0
) -> Dict:
    """
    Apply augmentations to an image and its bounding boxes.

    Args:
        image_path: Path to source image
        bboxes: List of bboxes in specified format
        labels: List of class labels corresponding to bboxes
        augmentations: List of augmentation names to apply
        output_path: Optional path to save augmented image
        bbox_format: 'xywh' or 'xyxy'
        intensity: Augmentation intensity multiplier

    Returns:
        Dict with augmented image info, bboxes, and optionally base64 preview
    """
    # Load image
    image = cv2.imread(image_path)
    if image is None:
        return {"success": False, "error": f"Failed to load image: {image_path}"}

    image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    img_height, img_width = image.shape[:2]

    # Convert bboxes to pascal_voc format for albumentations
    pascal_bboxes = []
    valid_labels = []
    for bbox, label in zip(bboxes, labels):
        try:
            pascal_bbox = convert_bbox_format(bbox, img_width, img_height, bbox_format)
            # Ensure bbox is within image bounds
            x1, y1, x2, y2 = pascal_bbox
            x1 = max(0, min(x1, img_width))
            y1 = max(0, min(y1, img_height))
            x2 = max(0, min(x2, img_width))
            y2 = max(0, min(y2, img_height))
            if x2 > x1 and y2 > y1:
                pascal_bboxes.append([x1, y1, x2, y2])
                valid_labels.append(label)
        except Exception as e:
            continue

    if not pascal_bboxes:
        return {"success": False, "error": "No valid bounding boxes"}

    # Build and apply augmentation pipeline
    pipeline = get_augmentation_pipeline(augmentations, intensity)

    try:
        augmented = pipeline(
            image=image,
            bboxes=pascal_bboxes,
            class_labels=valid_labels
        )
    except Exception as e:
        return {"success": False, "error": f"Augmentation failed: {str(e)}"}

    aug_image = augmented['image']
    aug_bboxes = augmented['bboxes']
    aug_labels = augmented['class_labels']

    # Keep bboxes in Pascal VOC format [x_min, y_min, x_max, y_max] to match database format
    result_bboxes = [list(bbox) for bbox in aug_bboxes]

    result = {
        "success": True,
        "width": aug_image.shape[1],
        "height": aug_image.shape[0],
        "bboxes": result_bboxes,
        "labels": aug_labels,
        "augmentations_applied": augmentations,
        "original_bbox_count": len(bboxes),
        "result_bbox_count": len(result_bboxes)
    }

    # Save image if output path provided
    if output_path:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        aug_bgr = cv2.cvtColor(aug_image, cv2.COLOR_RGB2BGR)
        cv2.imwrite(output_path, aug_bgr)
        result["output_path"] = output_path

    # Generate base64 preview (resized for efficiency)
    preview_size = 400
    scale = min(preview_size / aug_image.shape[1], preview_size / aug_image.shape[0])
    if scale < 1:
        new_size = (int(aug_image.shape[1] * scale), int(aug_image.shape[0] * scale))
        preview_img = cv2.resize(aug_image, new_size)
    else:
        preview_img = aug_image

    # Draw bboxes on preview
    for bbox, label in zip(result_bboxes, aug_labels):
        x, y, w, h = bbox
        # Scale bbox for preview
        px, py, pw, ph = int(x * scale), int(y * scale), int(w * scale), int(h * scale)
        cv2.rectangle(preview_img, (px, py), (px + pw, py + ph), (0, 255, 0), 2)
        cv2.putText(preview_img, label, (px, py - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)

    # Encode to base64
    pil_img = Image.fromarray(preview_img)
    buffer = BytesIO()
    pil_img.save(buffer, format='JPEG', quality=85)
    preview_b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
    result["preview_base64"] = preview_b64

    return result


def batch_augment(
    images_data: List[Dict],
    augmentations: List[str],
    variations_per_image: int,
    output_dir: str
) -> Dict:
    """
    Generate multiple augmented variations for a batch of images.

    Args:
        images_data: List of {image_path, bboxes, labels}
        augmentations: Enabled augmentation types
        variations_per_image: Number of variations to generate per image
        output_dir: Directory to save augmented images

    Returns:
        Dict with results for each generated image
    """
    os.makedirs(output_dir, exist_ok=True)

    results = []
    total_bboxes = 0

    for img_data in images_data:
        image_path = img_data['image_path']
        bboxes = img_data['bboxes']
        labels = img_data['labels']
        base_name = Path(image_path).stem

        for i in range(variations_per_image):
            # Generate random augmentation combo for variety
            aug_combo = generate_random_augmentation_combo(augmentations)
            aug_name = '_'.join(sorted(aug_combo))

            output_filename = f"{base_name}_aug_{i+1}_{aug_name}.jpg"
            output_path = os.path.join(output_dir, output_filename)

            result = augment_image(
                image_path=image_path,
                bboxes=bboxes,
                labels=labels,
                augmentations=aug_combo,
                output_path=output_path,
                bbox_format='xywh'
            )

            if result['success']:
                result['source_image'] = image_path
                result['variation_index'] = i + 1
                results.append(result)
                total_bboxes += result['result_bbox_count']

    return {
        "success": True,
        "images_generated": len(results),
        "total_bboxes": total_bboxes,
        "results": results
    }


def main():
    parser = argparse.ArgumentParser(description="Data Augmentation for YOLO Training")
    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # Preview command - augment single image and return base64 preview
    preview_parser = subparsers.add_parser("preview", help="Preview augmentation on single image")
    preview_parser.add_argument("--image", required=True, help="Path to image")
    preview_parser.add_argument("--bboxes", required=True, help="JSON array of bboxes [[x,y,w,h], ...]")
    preview_parser.add_argument("--labels", required=True, help="JSON array of labels")
    preview_parser.add_argument("--augmentations", required=True, help="Comma-separated augmentation names")
    preview_parser.add_argument("--intensity", type=float, default=1.0, help="Intensity multiplier")

    # Generate command - generate and save augmented image
    gen_parser = subparsers.add_parser("generate", help="Generate and save augmented image")
    gen_parser.add_argument("--image", required=True, help="Path to image")
    gen_parser.add_argument("--bboxes", required=True, help="JSON array of bboxes")
    gen_parser.add_argument("--labels", required=True, help="JSON array of labels")
    gen_parser.add_argument("--output", required=True, help="Output image path")
    gen_parser.add_argument("--augmentations", required=True, help="Comma-separated augmentation names")
    gen_parser.add_argument("--intensity", type=float, default=1.0, help="Intensity multiplier")

    # Batch command - generate multiple variations
    batch_parser = subparsers.add_parser("batch", help="Batch generate augmentations")
    batch_parser.add_argument("--data", required=True, help="JSON file with images data")
    batch_parser.add_argument("--output-dir", required=True, help="Output directory")
    batch_parser.add_argument("--augmentations", required=True, help="Comma-separated augmentation names")
    batch_parser.add_argument("--variations", type=int, default=3, help="Variations per image")

    args = parser.parse_args()

    if args.command == "preview":
        try:
            bboxes = json.loads(args.bboxes)
            labels = json.loads(args.labels)
            augmentations = args.augmentations.split(',')
        except json.JSONDecodeError as e:
            log_json({"success": False, "error": f"Invalid JSON: {e}"})
            sys.exit(1)

        result = augment_image(
            image_path=args.image,
            bboxes=bboxes,
            labels=labels,
            augmentations=augmentations,
            intensity=args.intensity
        )
        log_json(result)

    elif args.command == "generate":
        try:
            bboxes = json.loads(args.bboxes)
            labels = json.loads(args.labels)
            augmentations = args.augmentations.split(',')
        except json.JSONDecodeError as e:
            log_json({"success": False, "error": f"Invalid JSON: {e}"})
            sys.exit(1)

        result = augment_image(
            image_path=args.image,
            bboxes=bboxes,
            labels=labels,
            augmentations=augmentations,
            output_path=args.output,
            intensity=args.intensity
        )
        log_json(result)

    elif args.command == "batch":
        try:
            with open(args.data, 'r') as f:
                images_data = json.load(f)
            augmentations = args.augmentations.split(',')
        except Exception as e:
            log_json({"success": False, "error": f"Failed to load data: {e}"})
            sys.exit(1)

        result = batch_augment(
            images_data=images_data,
            augmentations=augmentations,
            variations_per_image=args.variations,
            output_dir=args.output_dir
        )
        log_json(result)

    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
