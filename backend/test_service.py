#!/usr/bin/env python3
"""Test the SAM3 service"""

import subprocess
import json
import time

def test_service():
    """Test the SAM3 service with sample commands"""

    print("Starting SAM3 service...")
    process = subprocess.Popen(
        ['python', 'backend/sam3_service.py'],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1
    )

    # Wait for ready signal
    ready_line = process.stdout.readline()
    ready_data = json.loads(ready_line)
    print(f"✓ Service ready: {ready_data}")

    # Test 1: Load image
    print("\n--- Test 1: Load Image ---")
    command = {
        'command': 'load_image',
        'session_id': 'test-session-1',
        'image_path': 'test_image.jpg'
    }
    process.stdin.write(json.dumps(command) + '\n')
    process.stdin.flush()

    response = json.loads(process.stdout.readline())
    print(f"Response: {json.dumps(response, indent=2)}")

    if response['success']:
        print(f"✓ Image loaded: {response['width']}x{response['height']}")
    else:
        print(f"✗ Failed: {response['error']}")
        process.terminate()
        return

    # Test 2: Click segmentation (single point)
    print("\n--- Test 2: Click Segmentation (Single Point) ---")
    command = {
        'command': 'predict_click',
        'session_id': 'test-session-1',
        'points': [[900, 600]],  # Center of truck
        'labels': [1],
        'multimask_output': True
    }
    process.stdin.write(json.dumps(command) + '\n')
    process.stdin.flush()

    response = json.loads(process.stdout.readline())

    if response['success']:
        print(f"✓ Segmentation successful!")
        print(f"  - Number of masks: {response['num_masks']}")
        print(f"  - Scores: {response['scores']}")
        print(f"  - Best score: {max(response['scores']):.3f}")
    else:
        print(f"✗ Failed: {response['error']}")

    # Test 3: Refinement with multiple points
    print("\n--- Test 3: Refinement (Multiple Points) ---")
    command = {
        'command': 'predict_click',
        'session_id': 'test-session-1',
        'points': [[900, 600], [700, 500]],  # Two points on truck
        'labels': [1, 1],
        'multimask_output': False,
        'use_previous_logits': True
    }
    process.stdin.write(json.dumps(command) + '\n')
    process.stdin.flush()

    response = json.loads(process.stdout.readline())

    if response['success']:
        print(f"✓ Refinement successful!")
        print(f"  - Number of masks: {response['num_masks']}")
        print(f"  - Score: {response['scores'][0]:.3f}")
    else:
        print(f"✗ Failed: {response['error']}")

    # Test 4: Ping
    print("\n--- Test 4: Ping ---")
    command = {'command': 'ping'}
    process.stdin.write(json.dumps(command) + '\n')
    process.stdin.flush()

    response = json.loads(process.stdout.readline())
    print(f"Response: {response}")

    # Cleanup
    print("\n--- Cleanup ---")
    command = {
        'command': 'clear_session',
        'session_id': 'test-session-1'
    }
    process.stdin.write(json.dumps(command) + '\n')
    process.stdin.flush()

    response = json.loads(process.stdout.readline())
    print(f"✓ Session cleared")

    # Terminate
    process.terminate()
    process.wait()

    print("\n✅ All tests completed!")

if __name__ == '__main__':
    test_service()
