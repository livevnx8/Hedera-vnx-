#!/bin/bash
# QVX Cold Storage - Copy to New USB Script

echo "🔧 QVX Cold Storage USB Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

SOURCE_DIR="/home/vera-live-0-1/hedera-llm-api/qvx-cold-storage"

# Find USB drives
echo "📍 Detected USB drives:"
lsblk -o NAME,SIZE,TYPE,MOUNTPOINT,MODEL | grep -E "usb|sd" | head -10
echo ""

# Try to find the new SanDisk USB
echo "🔍 Looking for new SanDisk USB..."
NEW_USB=$(lsblk -o NAME,MODEL | grep -i "sandisk" | tail -1 | awk '{print $1}')

if [ -z "$NEW_USB" ]; then
    echo "❌ Could not auto-detect new USB"
    echo ""
    echo "📋 Manual copy instructions:"
    echo "   1. Note the mount point of your new USB (e.g., /media/vera-live-0-1/XXXX)"
    echo "   2. Run: cp -r $SOURCE_DIR/* /media/vera-live-0-1/YOUR_USB/"
    echo ""
    echo "📁 Source files ready at:"
    ls -la "$SOURCE_DIR/"
    exit 1
fi

echo "✅ Found new USB: /dev/$NEW_USB"

# Find mount point
MOUNT_POINT=$(findmnt -n -o TARGET "/dev/$NEW_USB" 2>/dev/null || echo "")

if [ -z "$MOUNT_POINT" ]; then
    echo "📂 USB not mounted. Mounting..."
    MOUNT_POINT="/mnt/sandisk-$NEW_USB"
    sudo mkdir -p "$MOUNT_POINT"
    sudo mount "/dev/$NEW_USB" "$MOUNT_POINT" && echo "✅ Mounted to $MOUNT_POINT"
fi

echo "📂 Target: $MOUNT_POINT"
echo ""
echo "📦 Copying QVX cold storage..."
sudo cp -rv "$SOURCE_DIR"/* "$MOUNT_POINT/"
sudo chmod -R +x "$MOUNT_POINT/scripts/"*.sh "$MOUNT_POINT/launch.sh" "$MOUNT_POINT/transfer/verify.sh"

echo ""
echo "✅ QVX cold storage copied to new USB!"
echo "📂 Location: $MOUNT_POINT"
echo ""
echo "📋 Next steps:"
echo "   1. Copy QVX model: qvx-7b-q4_k_m.gguf → $MOUNT_POINT/models/"
echo "   2. Copy runtime: llama-cli → $MOUNT_POINT/runtime/"
echo "   3. Eject USB: sudo umount $MOUNT_POINT"
