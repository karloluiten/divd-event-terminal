"""Print a one-off hello-world receipt — used by divd-boot-hello.service at boot."""
from __future__ import annotations

import time

from django.core.management.base import BaseCommand

from printer import printing


def build_hello_receipt() -> "Image.Image":
    big = printing.render_text_block(
        "hello, world!", printing.font(printing.DEJAVU, 64),
        wrap=14, align="center",
    )

    return printing.stack(
        printing._header(None), big, gap=10,
    )


class Command(BaseCommand):
    help = "Print a hello-world boot receipt."

    def add_arguments(self, parser):
        parser.add_argument("--retries", type=int, default=10)
        parser.add_argument("--retry-delay", type=float, default=2.0)

    def handle(self, *args, **opts):
        img = build_hello_receipt()
        last_err = None
        for attempt in range(1, opts["retries"] + 1):
            ok, err = printing.print_image(img)
            if ok:
                self.stdout.write(self.style.SUCCESS("boot receipt printed"))
                return
            last_err = err
            self.stdout.write(f"attempt {attempt}: {err}")
            time.sleep(opts["retry_delay"])
        self.stderr.write(f"giving up; printer never became ready ({last_err})")
