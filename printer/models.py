from django.db import models


class Idea(models.Model):
    """A single idea typed at the kiosk and printed on a receipt.

    Every submission is stored, regardless of which easter-egg mode was
    active when it was printed.
    """

    text = models.TextField()
    # The easter-egg mode that was active when this idea was printed
    # (e.g. "comicsans", "big"). Empty string means the normal style.
    mode = models.CharField(max_length=32, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    # Bookkeeping so we can see what happened on the show floor.
    printed = models.BooleanField(default=False)
    error = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        label = self.text[:40].replace("\n", " ")
        suffix = f" [{self.mode}]" if self.mode else ""
        return f"{label}{suffix}"
