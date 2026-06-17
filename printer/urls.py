from django.urls import path

from . import views

urlpatterns = [
    path("", views.kiosk, name="kiosk"),
    path("submit", views.submit, name="submit"),
    path("stats", views.stats, name="stats"),
    path("printimg", views.print_picture, name="printimg"),
    path("netinfo", views.netinfo, name="netinfo"),
    path("led", views.led, name="led"),
    path("ledstate", views.ledstate, name="ledstate"),
    path("shutdown", views.shutdown, name="shutdown"),
    path("reboot", views.reboot, name="reboot"),
    path("admin-auth", views.admin_auth, name="admin_auth"),
    path("admin-wifi-scan", views.admin_wifi_scan, name="admin_wifi_scan"),
    path("admin-wifi-connect", views.admin_wifi_connect, name="admin_wifi_connect"),
    path("admin-shell", views.admin_shell, name="admin_shell"),
]
