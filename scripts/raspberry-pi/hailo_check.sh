#!/bin/bash

# Hailo AI Kit Sanity Check Script for Raspberry Pi 5
# Run this script to verify your Hailo device is properly recognized

echo "========================================"
echo "  Hailo AI Kit Sanity Check"
echo "========================================"
echo ""

# 1. Check kernel version
echo "[1/5] Checking kernel version..."
KERNEL=$(uname -r)
echo "  Kernel: $KERNEL"
# Extract major.minor.patch for comparison
if [[ $(echo "$KERNEL" | awk -F. '{print ($1*10000 + $2*100 + $3)}') -ge 60631 ]]; then
    echo "  ✓ Kernel version is sufficient (>= 6.6.31)"
else
    echo "  ✗ WARNING: Kernel version may be too old. Need >= 6.6.31"
fi
echo ""

# 2. Check PCIe detection
echo "[2/5] Checking PCIe detection..."
PCIE_OUTPUT=$(lspci 2>/dev/null | grep -i hailo)
if [ -n "$PCIE_OUTPUT" ]; then
    echo "  ✓ Hailo device found on PCIe:"
    echo "    $PCIE_OUTPUT"
else
    echo "  ✗ No Hailo device found on PCIe bus"
    echo "    - Check physical connection of M.2 HAT"
    echo "    - Ensure adequate power supply (27W recommended)"
fi
echo ""

# 3. Check kernel driver
echo "[3/5] Checking kernel driver..."
DMESG_OUTPUT=$(dmesg 2>/dev/null | grep -i hailo | head -5)
if [ -n "$DMESG_OUTPUT" ]; then
    echo "  ✓ Hailo driver messages found in dmesg:"
    echo "$DMESG_OUTPUT" | sed 's/^/    /'
else
    echo "  ✗ No Hailo driver messages found"
    echo "    - Driver may not be loaded"
    echo "    - Try: sudo apt install hailo-all"
fi
echo ""

# 4. Check hailortcli
echo "[4/5] Checking Hailo runtime CLI..."
if command -v hailortcli &> /dev/null; then
    echo "  ✓ hailortcli is installed"
    echo ""
    echo "  Attempting to identify device..."
    IDENTIFY_OUTPUT=$(hailortcli fw-control identify 2>&1)
    if [ $? -eq 0 ]; then
        echo "  ✓ Device identification successful:"
        echo "$IDENTIFY_OUTPUT" | sed 's/^/    /'
    else
        echo "  ✗ Failed to identify device:"
        echo "$IDENTIFY_OUTPUT" | sed 's/^/    /'
    fi
else
    echo "  ✗ hailortcli not found"
    echo "    - Install with: sudo apt install hailo-all"
fi
echo ""

# 5. Check GStreamer plugins (optional)
echo "[5/5] Checking GStreamer plugins (optional)..."
if command -v gst-inspect-1.0 &> /dev/null; then
    HAILO_GST=$(gst-inspect-1.0 hailo 2>&1)
    if echo "$HAILO_GST" | grep -q "Plugin Details"; then
        echo "  ✓ Hailo GStreamer plugin is available"
    else
        echo "  - Hailo GStreamer plugin not found (optional for inference)"
    fi
else
    echo "  - GStreamer not installed (optional)"
fi
echo ""

echo "========================================"
echo "  Check Complete"
echo "========================================"
echo ""
echo "If issues found, try:"
echo "  sudo apt update && sudo apt full-upgrade"
echo "  sudo apt install hailo-all"
echo "  sudo reboot"
echo ""
echo "For PCIe Gen 3 (better performance):"
echo "  sudo raspi-config -> Advanced Options -> PCIe Speed -> Yes"
