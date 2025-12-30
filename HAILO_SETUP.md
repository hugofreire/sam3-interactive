# Hailo AI Kit Setup & Troubleshooting Guide

This document describes the setup verification and troubleshooting process for the Hailo-8L AI Accelerator on Raspberry Pi 5.

## Hardware Configuration

| Component | Details |
|-----------|---------|
| Device | Raspberry Pi 5 |
| AI Accelerator | Hailo-8L AI ACC M.2 B+M KEY MODULE |
| Part Number | HM21LB1C2LAE |
| Serial Number | HLDDLBB244601052 |
| OS | Raspberry Pi OS (Debian Trixie) |
| Kernel | 6.12.47+rpt-rpi-2712 |

---

## The Problem

After installing the Hailo software packages via `apt`, the device was detected on the PCIe bus but failed to communicate with the userspace tools:

```
[HailoRT] [error] CHECK failed - Driver version (4.20.0) is different from library version (4.23.0)
[HailoRT] [error] Driver version mismatch, status HAILO_INVALID_DRIVER_VERSION(76)
```

### Root Cause

The Raspberry Pi kernel ships with a **built-in Hailo driver** (version 4.20.0) located at:
```
/lib/modules/6.12.47+rpt-rpi-2712/kernel/drivers/media/pci/hailo/hailo_pci.ko.xz
```

However, the userspace packages (`hailort`, `hailortcli`, etc.) installed from the Raspberry Pi repository were at version **4.23.0**. This version mismatch caused all communication with the device to fail.

The issue arises because:
1. The kernel's built-in driver is tied to the kernel release cycle
2. The userspace packages are updated independently
3. A full system upgrade (`apt full-upgrade`) updates the userspace but not necessarily the kernel

---

## The Solution

### Step 1: Install DKMS

DKMS (Dynamic Kernel Module Support) allows building kernel modules from source that override the built-in versions.

```bash
sudo apt install -y dkms
```

### Step 2: Build and Install the Hailo Driver via DKMS

The `hailort-pcie-driver` package includes source code at `/usr/src/hailort-pcie-driver/`. This source matches the userspace library version (4.23.0).

```bash
cd /usr/src/hailort-pcie-driver/linux/pcie
sudo make install_dkms
```

This command:
1. Creates a DKMS module entry for `hailo_pci` version 4.23.0
2. Compiles the driver against the current kernel headers
3. Installs it to `/lib/modules/$(uname -r)/updates/dkms/`
4. Archives the original driver for potential rollback
5. Runs `depmod` to update module dependencies

### Step 3: Reload the Driver

```bash
sudo rmmod hailo_pci
sudo modprobe hailo_pci
```

Or simply reboot:
```bash
sudo reboot
```

### Step 4: Verify

```bash
hailortcli fw-control identify
```

Expected output:
```
Executing on device: 0001:01:00.0
Identifying board
Control Protocol Version: 2
Firmware Version: 4.23.0 (release,app,extended context switch buffer)
Board Name: Hailo-8
Device Architecture: HAILO8L
Serial Number: HLDDLBB244601052
Part Number: HM21LB1C2LAE
Product Name: HAILO-8L AI ACC M.2 B+M KEY MODULE EXT TMP
```

---

## Sanity Check Script

A diagnostic script was created at `hailo_check.sh` that verifies:

1. Kernel version (must be >= 6.6.31)
2. PCIe device detection
3. Kernel driver loading
4. HailoRT CLI functionality
5. GStreamer plugin availability

Run it with:
```bash
./hailo_check.sh
```

---

## Additional Optimizations

### Enable PCIe Gen 3

For improved performance, enable PCIe Gen 3 mode:

```bash
sudo raspi-config
```

Navigate to: **6 Advanced Options → A8 PCIe Speed → Yes**

Then reboot.

### Keep Bootloader Updated

```bash
sudo rpi-eeprom-update -a
sudo reboot
```

---

## Future Maintenance

When system packages are updated, the driver version mismatch may recur. If `hailortcli` starts failing after an update, repeat the DKMS build:

```bash
cd /usr/src/hailort-pcie-driver/linux/pcie
sudo make install_dkms
sudo reboot
```

DKMS should automatically rebuild the module when a new kernel is installed, but manual intervention may occasionally be required.

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `lspci \| grep Hailo` | Check PCIe detection |
| `hailortcli fw-control identify` | Verify device communication |
| `modinfo hailo_pci \| grep version` | Check loaded driver version |
| `dkms status` | List DKMS-managed modules |
| `dmesg \| grep hailo` | View driver kernel logs |

---

## Resources

- [Hailo RPi5 Examples - Installation Guide](https://github.com/hailo-ai/hailo-rpi5-examples/blob/main/doc/install-raspberry-pi5.md)
- [Official Raspberry Pi AI Kit Setup](https://www.raspberrypi.com/news/how-to-set-up-the-raspberry-pi-ai-kit-with-raspberry-pi-5/)
- [Hailo Community Forum](https://community.hailo.ai/)
