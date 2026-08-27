#!/usr/bin/env python3
"""
Notification sinks and dispatch for AI Avatar Room.

Zero new dependencies: uses pystray.Icon.notify() (already a dependency,
already instantiated by overlay.py's tray icon) for real Windows toasts,
instead of win11toast/winotify/plyer -- all of which are either unmaintained
or depend on compiled packages unavailable for this machine's Python 3.14.

Stage 3 plug-in point: a future JiraBitbucketPoller constructs its own
NotificationEvent(kind="pr_review", ...) and calls the same
NotificationDispatcher.dispatch() instance the UDP listener already uses --
zero changes needed here.
"""

import time
from abc import ABC, abstractmethod

from notify_hub import NotificationEvent

# Toast on the edge transition only (enforced in NotificationHub), plus this
# hard per-session floor so a flapping session can't spam toasts.
RATE_LIMIT_S = 20.0


class NotificationSink(ABC):
    @abstractmethod
    def send(self, event: NotificationEvent) -> bool:
        raise NotImplementedError


class ConsoleSink(NotificationSink):
    """Always registered -- debug visibility and a headless fallback."""

    def send(self, event: NotificationEvent) -> bool:
        ts = time.strftime("%H:%M:%S", time.localtime(event.ts))
        print(f"[notify {ts}] {event.title}: {event.message}")
        return True


class TrayToastSink(NotificationSink):
    """Wraps the pystray tray icon's notify() call. Takes a callable
    returning the live Icon (not the icon itself) because the tray icon is
    constructed later, on the deferred-init path, than this sink is."""

    def __init__(self, get_icon):
        self._get_icon = get_icon

    def send(self, event: NotificationEvent) -> bool:
        icon = self._get_icon()
        if icon is None:
            return False
        try:
            icon.notify(event.message, title=event.title)
            return True
        except Exception as e:
            print(f"[notify] toast failed: {e}")
            return False


class NotificationDispatcher:
    def __init__(self, sinks: list):
        self._sinks = sinks
        self._last_sent: dict[str, float] = {}   # session_id -> ts

    def dispatch(self, event: NotificationEvent) -> None:
        now = time.time()
        last = self._last_sent.get(event.session_id, 0.0)
        if now - last < RATE_LIMIT_S:
            return
        self._last_sent[event.session_id] = now
        for sink in self._sinks:
            try:
                sink.send(event)
            except Exception as e:
                print(f"[notify] sink {sink.__class__.__name__} failed: {e}")
