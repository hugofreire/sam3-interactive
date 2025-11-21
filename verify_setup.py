#!/usr/bin/env python3
"""
SAM3 Setup Verification Script
Checks if all dependencies are installed and accessible.
"""

import sys


def check_import(module_name, package_name=None):
    """Try to import a module and report status."""
    package_name = package_name or module_name
    try:
        __import__(module_name)
        print(f"✓ {package_name} installed")
        return True
    except ImportError as e:
        print(f"✗ {package_name} not found: {e}")
        return False


def main():
    print("=" * 60)
    print("SAM3 Setup Verification")
    print("=" * 60)

    all_ok = True

    # Check Python version
    print(f"\nPython version: {sys.version.split()[0]}")
    version_info = sys.version_info
    if version_info >= (3, 8):
        print("✓ Python version is compatible (>= 3.8)")
    else:
        print("✗ Python version too old (need >= 3.8)")
        all_ok = False

    # Check core dependencies
    print("\nCore Dependencies:")
    all_ok &= check_import("torch", "PyTorch")
    all_ok &= check_import("torchvision")
    all_ok &= check_import("PIL", "Pillow")
    all_ok &= check_import("numpy")
    all_ok &= check_import("matplotlib")

    # Check SAM3
    print("\nSAM3 Package:")
    if check_import("sam3"):
        try:
            import sam3
            print(f"  SAM3 version: {sam3.__version__}")

            # Check SAM3 modules
            from sam3.model_builder import build_sam3_image_model
            from sam3.model.sam3_image_processor import Sam3Processor
            print("  ✓ SAM3 image modules available")
        except Exception as e:
            print(f"  ✗ Error importing SAM3 modules: {e}")
            all_ok = False
    else:
        all_ok = False

    # Check CUDA
    print("\nGPU Support:")
    try:
        import torch
        if torch.cuda.is_available():
            print(f"✓ CUDA available: {torch.cuda.get_device_name(0)}")
            print(f"  CUDA version: {torch.version.cuda}")
            print(f"  PyTorch version: {torch.__version__}")
        else:
            print("⚠️  CUDA not available - will run on CPU (slow)")
    except Exception as e:
        print(f"✗ Error checking CUDA: {e}")

    # Check Hugging Face authentication
    print("\nHugging Face Authentication:")
    try:
        from huggingface_hub import whoami
        user_info = whoami()
        print(f"✓ Logged in as: {user_info['name']}")
    except Exception as e:
        print(f"✗ Not authenticated: {e}")
        print("  Run: huggingface-cli login")
        all_ok = False

    # Check model access
    print("\nSAM3 Model Access:")
    try:
        from huggingface_hub import hf_hub_download
        print("  Checking access to facebook/sam3...")
        # Try to access the config file
        config_path = hf_hub_download(
            repo_id="facebook/sam3",
            filename="config.json",
            cache_dir=".cache"
        )
        print("✓ Model access granted!")
        print(f"  Config cached at: {config_path}")
    except Exception as e:
        error_msg = str(e)
        if "403" in error_msg or "not in the authorized list" in error_msg:
            print("✗ Access not granted yet")
            print("  → Visit: https://huggingface.co/facebook/sam3")
            print("  → Click 'Request Access' and wait for approval")
            all_ok = False
        elif "401" in error_msg:
            print("✗ Authentication failed")
            print("  → Run: huggingface-cli login")
            all_ok = False
        else:
            print(f"✗ Error accessing model: {error_msg}")
            all_ok = False

    # Summary
    print("\n" + "=" * 60)
    if all_ok:
        print("✓ Setup Complete! Ready to use SAM3")
        print("\nNext steps:")
        print("  python basic_example.py test_image.jpg 'truck'")
    else:
        print("⚠️  Setup Incomplete - see issues above")
    print("=" * 60)

    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
