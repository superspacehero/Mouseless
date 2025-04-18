# Mouseless

Mouseless is a [GNOME extension](https://extensions.gnome.org/) that displays a [10-foot](https://en.wikipedia.org/wiki/10-foot_user_interface) interface. It makes it easy to browse and launch apps with your keyboard or multi-media remote.

---

## User Guide

### Getting Started

Coming soon to https://extensions.gnome.org, for now you'll have to install via the [Development Notes](docs/development.md) guide.

### Panel Menu

<img src="https://user-images.githubusercontent.com/3523761/149646804-d8f4c99f-6d19-418b-b88e-99e4a3165ec7.png" height="200" />

After the extension is installed, you'll notice a new panel menu at the top of the screen.

- `Help` - Clicking this will open the project's help page.

- `Open Interface` - This will launch into the 10-foot interface.

---

## 10-foot Interface

### Controls

- `↑` / `↓` / `→` / `←`: Arrow keys navigate the home screen.
- `Enter` / `Space`: Selects focused item
- `Esc`: Exit the 10-foot interface

### Managing Applications

The main grid view will show the applications in your favorites list in a grid.

To manage your favorites:

1. Exit the 10-foot interface (press `Esc`), and go to your main applications list.
1. Right-click on the application you want to add and select Add to Favorites, or Remove from Favorites.
1. Reopen the 10-foot interface and you should see your customized apps in the grid. See [this guide](https://help.ubuntu.com/stable/ubuntu-help/shell-apps-favorites.html.en) for more information.

---

## Optional Tweaks for HTPCs

If you use your computer primarily as an HTPC, there are also a few manual tweaks that you can do to make your gnome more HTPC friendly.

#### Automatic Login

To configure auto-login, edit `/etc/gdm3/custom.conf` and configure like so:

```
[daemon]
AutomaticLoginEnable=True
AutomaticLogin=YOUR_USERNAME
```

#### Unclutter

Unclutter is a 3rd party utility that will automatically hide the cursor after inactivity.

```bash
sudo apt install unclutter
```

> Note: You may need to reboot after installing to enable it.

The default setting of (1s idle) is usually fine, but you can edit in the config file with:

```bash
# optionally edit startup config
sudo nano /etc/default/unclutter
sudo reboot
```

#### Disable Screen Locking and Blanking

Some optional optimizations for making HTPC's screen "always on".

```bash
# Disable lock screen
gsettings set org.gnome.desktop.lockdown disable-lock-screen true
gsettings set org.gnome.desktop.screensaver lock-enabled false
gsettings set org.gnome.desktop.screensaver ubuntu-lock-on-suspend false
# disable screen blanking
gsettings set org.gnome.desktop.session idle-delay 0
```

#### Disable Dock (Ubuntu)

```bash
gnome-extensions disable ubuntu-dock@ubuntu.com
# to re-enable:
gnome-extensions enable ubuntu-dock@ubuntu.com
```

---

## Extension Development

If you're interesting in hacking around on this project. Checkout the [Development Notes](docs/development.md)
