#!/bin/sh
set -eu

app_root="${BOOMBOXCAR_APP_ROOT:-/home/boomwowp/dist/app}"
public_root="${BOOMBOXCAR_PUBLIC_ROOT:-/home/boomwowp/public_html}"
repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

case "$app_root" in
  /home/boomwowp/*) ;;
  *) echo "Refusing unexpected application root: $app_root" >&2; exit 1 ;;
esac
case "$public_root" in
  /home/boomwowp/public_html) ;;
  *) echo "Refusing unexpected public root: $public_root" >&2; exit 1 ;;
esac

test -f "$repo_root/dist/app/server.js"
test -f "$repo_root/dist/public/index.html"
mkdir -p "$app_root" "$public_root"

rm -rf "$app_root/server"
rm -f "$app_root/server.js" "$app_root/package.json" "$app_root/package-lock.json"
cp -R "$repo_root/dist/app/server" "$app_root/server"
cp "$repo_root/dist/app/server.js" "$repo_root/dist/app/package.json" "$repo_root/dist/app/package-lock.json" "$app_root/"

rm -rf "$public_root/es" "$public_root/partner" "$public_root/confirmation" "$public_root/images"
rm -f "$public_root/index.html" "$public_root/index.css" "$public_root/index.js" "$public_root/booking.js" "$public_root/robots.txt" "$public_root/sitemap.xml"
cp -R "$repo_root/dist/public/es" "$public_root/es"
cp -R "$repo_root/dist/public/partner" "$public_root/partner"
cp -R "$repo_root/dist/public/confirmation" "$public_root/confirmation"
cp -R "$repo_root/dist/public/images" "$public_root/images"
cp "$repo_root/dist/public/index.html" "$repo_root/dist/public/index.css" "$repo_root/dist/public/index.js" "$repo_root/dist/public/booking.js" "$repo_root/dist/public/robots.txt" "$repo_root/dist/public/sitemap.xml" "$public_root/"

mkdir -p "$app_root/tmp"
touch "$app_root/tmp/restart.txt"

echo "Deployed BoomBoxCar public files to $public_root"
echo "Preserved manually managed videos in $public_root/videos"
echo "Deployed BoomBoxCar API to $app_root"
echo "Requested cPanel Passenger restart"
