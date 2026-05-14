#!/usr/bin/env python3

import os
import subprocess
import threading
import time
import urllib.error
import urllib.request

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("WebKit2", "4.1")

from gi.repository import Gio, GLib, Gtk, WebKit2  # type: ignore


VERA_DIR = "/home/vera-live-0-1/hedera-llm-api"
HEALTH_URL = "http://127.0.0.1:8088/health"
HQ_URL = "http://127.0.0.1:8088/hq"
SELF_HEAL_SCRIPT = os.path.join(VERA_DIR, "vera-self-heal.sh")
ICON_PATH = os.path.join(VERA_DIR, "assets", "vera-hq.svg")


def endpoint_available(url: str, timeout: float = 1.2) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=timeout):
            return True
    except (urllib.error.URLError, TimeoutError, ValueError):
        return False


def ensure_vera_running() -> bool:
    if endpoint_available(HEALTH_URL):
        return True

    if os.path.exists(SELF_HEAL_SCRIPT):
        subprocess.Popen(
            [SELF_HEAL_SCRIPT],
            cwd=VERA_DIR,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    else:
        subprocess.Popen(
            ["npm", "run", "dev"],
            cwd=VERA_DIR,
            env={**os.environ, "PORT": "8088"},
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    for _ in range(30):
        if endpoint_available(HEALTH_URL):
            return True
        time.sleep(1)

    return False


class VeraHQWindow(Gtk.ApplicationWindow):
    def __init__(self, app: Gtk.Application):
        super().__init__(application=app)
        self.set_default_size(1440, 960)
        self.set_position(Gtk.WindowPosition.CENTER)
        self.set_title("Vera")
        self.set_border_width(0)
        if os.path.exists(ICON_PATH):
            self.set_icon_from_file(ICON_PATH)

        self.header = Gtk.HeaderBar()
        self.header.set_show_close_button(True)
        self.header.props.title = "Vera"
        self.header.props.subtitle = "Headquarters"
        self.set_titlebar(self.header)

        self.refresh_button = Gtk.Button.new_from_icon_name("view-refresh-symbolic", Gtk.IconSize.BUTTON)
        self.refresh_button.set_tooltip_text("Refresh Vera")
        self.refresh_button.connect("clicked", self.on_refresh)
        self.header.pack_end(self.refresh_button)

        self.status_label = Gtk.Label(label="Waking Vera...")
        self.status_label.set_margin_start(12)
        self.status_label.set_margin_end(12)
        self.status_label.set_margin_top(8)
        self.status_label.set_margin_bottom(8)
        self.status_label.set_halign(Gtk.Align.START)
        self.status_label.get_style_context().add_class("dim-label")

        self.spinner = Gtk.Spinner()
        self.spinner.start()
        self.spinner.set_halign(Gtk.Align.CENTER)
        self.spinner.set_valign(Gtk.Align.CENTER)

        self.loading_label = Gtk.Label()
        self.loading_label.set_markup("<span size='16000' weight='bold'>Launching Vera Headquarters</span>")
        self.loading_label.set_halign(Gtk.Align.CENTER)

        self.loading_subtitle = Gtk.Label(
            label="Checking the rig, waking the service if needed, and opening Vera in her own window."
        )
        self.loading_subtitle.set_halign(Gtk.Align.CENTER)
        self.loading_subtitle.set_justify(Gtk.Justification.CENTER)
        self.loading_subtitle.set_line_wrap(True)
        self.loading_subtitle.set_max_width_chars(48)

        self.loading_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=16)
        self.loading_box.set_halign(Gtk.Align.CENTER)
        self.loading_box.set_valign(Gtk.Align.CENTER)
        self.loading_box.pack_start(self.spinner, False, False, 0)
        self.loading_box.pack_start(self.loading_label, False, False, 0)
        self.loading_box.pack_start(self.loading_subtitle, False, False, 0)

        self.webview = WebKit2.WebView()
        settings = self.webview.get_settings()
        settings.set_enable_developer_extras(True)
        settings.set_enable_write_console_messages_to_stdout(True)
        self.webview.connect("load-changed", self.on_load_changed)
        self.webview.connect("load-failed", self.on_load_failed)

        self.stack = Gtk.Stack()
        self.stack.set_transition_type(Gtk.StackTransitionType.CROSSFADE)
        self.stack.set_transition_duration(220)
        self.stack.add_named(self.loading_box, "loading")
        self.stack.add_named(self.webview, "web")
        self.stack.set_visible_child_name("loading")

        self.root = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        self.root.pack_start(self.status_label, False, False, 0)
        self.root.pack_start(self.stack, True, True, 0)
        self.add(self.root)

        self.connect("destroy", self.on_destroy)
        GLib.timeout_add_seconds(20, self.poll_health)
        threading.Thread(target=self.launch_vera, daemon=True).start()

    def on_destroy(self, *_args):
        application = self.get_application()
        if application:
            application.quit()

    def poll_health(self):
        healthy = endpoint_available(HEALTH_URL, timeout=0.8)
        self.status_label.set_text("Rig link healthy on 8088" if healthy else "Waiting for Vera health endpoint")
        return True

    def launch_vera(self):
        ready = ensure_vera_running()
        GLib.idle_add(self.finish_launch, ready)

    def finish_launch(self, ready: bool):
        if ready:
            self.status_label.set_text("Rig link healthy on 8088")
            self.header.props.subtitle = "Direct link to headquarters"
            self.webview.load_uri(HQ_URL)
        else:
            self.spinner.stop()
            self.status_label.set_text("Vera did not become healthy in time")
            self.loading_label.set_markup("<span size='16000' weight='bold'>Vera is not responding yet</span>")
            self.loading_subtitle.set_text(
                "The launcher tried to wake Vera, but the service did not come online in time. "
                "You can hit refresh to try again."
            )
        return False

    def on_refresh(self, _button):
        self.stack.set_visible_child_name("loading")
        self.spinner.start()
        self.loading_label.set_markup("<span size='16000' weight='bold'>Refreshing Vera</span>")
        self.loading_subtitle.set_text("Rechecking the health endpoint and reloading headquarters.")
        threading.Thread(target=self.launch_vera, daemon=True).start()

    def on_load_changed(self, _webview, event):
        if event == WebKit2.LoadEvent.FINISHED:
            self.spinner.stop()
            self.stack.set_visible_child_name("web")
            self.status_label.set_text("Vera connected")

    def on_load_failed(self, _webview, _event, failing_uri, error):
        self.spinner.stop()
        self.stack.set_visible_child_name("loading")
        self.status_label.set_text("Failed to load Vera")
        self.loading_label.set_markup("<span size='16000' weight='bold'>Could not open Vera Headquarters</span>")
        self.loading_subtitle.set_text(f"{failing_uri}\n{error.message}")
        return False


class VeraHQApplication(Gtk.Application):
    def __init__(self):
        super().__init__(application_id="ai.vera.headquarters", flags=Gio.ApplicationFlags.FLAGS_NONE)

    def do_activate(self):
        window = self.props.active_window
        if not window:
            window = VeraHQWindow(self)
        window.show_all()
        window.present()


def main():
    app = VeraHQApplication()
    app.run(None)


if __name__ == "__main__":
    main()
