#!/bin/bash
# filepath: /home/superspacehero/Projects/Mouseless/update.sh

# Clear the log file before starting log tracking
>/tmp/mouseless.log

# Compile GSettings schemas
echo "Compiling schemas..."
glib-compile-schemas ./extension/schemas/

# Capture any log output related to the Mouseless extension
echo "Starting mouseless log tracking..."
journalctl -f -o cat _COMM=gnome-shell | awk 'BEGIN {
    RS=""; FS="\n"; IGNORECASE=1
}
{
    if ($0 ~ /mouseless/) {
        print $0 "\n"
    }
}' > /tmp/mouseless.log &
LOG_PID=$!

# Give logs a moment to start gathering
sleep 3

# Clear terminal before restarting GNOME Shell for clearer error output
clear

if [ "$XDG_SESSION_TYPE" = "x11" ]; then
    echo "Restarting GNOME Shell on X11..."
    killall -3 gnome-shell
elif [ "$XDG_SESSION_TYPE" = "wayland" ]; then
    echo "Restarting GNOME Shell on Wayland..."
    killall -HUP gnome-shell
else
    echo "Unknown session type. Attempting to restart GNOME Shell..."
    killall -3 gnome-shell
fi

# Give GNOME Shell a moment to restart
sleep 5

# Enable the extension (just in case it's not enabled after the restart)
echo "Enabling the extension..."
gnome-extensions enable mouseless@asherpinson.com

echo "Real-time mouseless log tracking is active."
echo "Press CTRL+C to exit the log display and open the log file."

# Set trap so that on CTRL+C, we kill the background log tracking, clear the terminal,
# and only open the log file (in VS Code if available, otherwise with xdg-open)
# if the log file is non-empty.
trap 'kill $LOG_PID; clear; echo "Processing log output..."; if [ -s /tmp/mouseless.log ]; then if command -v code >/dev/null 2>&1; then code --reuse-window /tmp/mouseless.log; else xdg-open /tmp/mouseless.log; fi; else echo "No log output captured."; fi; exit 0' SIGINT SIGTERM

# Clear the terminal again before displaying logs
clear

# Display the log file in real-time
tail -f /tmp/mouseless.log
