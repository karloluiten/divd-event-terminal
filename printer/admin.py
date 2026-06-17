from django.contrib import admin

from .models import Idea


@admin.register(Idea)
class IdeaAdmin(admin.ModelAdmin):
    list_display = ("id", "short_text", "mode", "printed", "created_at")
    list_filter = ("mode", "printed", "created_at")
    search_fields = ("text",)
    readonly_fields = ("created_at",)
    ordering = ("-created_at",)

    @admin.display(description="text")
    def short_text(self, obj):
        return obj.text[:60]
