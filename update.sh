#!/bin/bash
# filepath: /home/superspacehero/Projects/Mouseless/update.sh

# Clear the log file before starting log tracking
>/tmp/mouseless.log

# Compile GSettings schemas
echo "Compiling schemas..."
glib-compile-schemas ./extension/schemas/

# Start mouseless-specific log tracking in the background.
# Using awk to treat each error block as a record (with RS set to empty)
# and printing the entire block only if it contains "mouseless".
echo "Starting mouseless log tracking..."
journalctl -f -o cat /usr/bin/gnome-shell | awk '{
    if (tolower($0) ~ /mouseless/) {
        if ($0 ~ /^Mouseless:/)
            print $0;
        else
            print "Mouseless: " $0;
    }
}' >/tmp/mouseless.log &
LOG_PID=$!

# Give logs a moment to start gathering
sleep 3

# Clear terminal before restarting GNOME Shell for clearer error output
clear

# Restart GNOME Shell (X11 only)
echo "Restarting GNOME Shell..."
killall -3 gnome-shell

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
