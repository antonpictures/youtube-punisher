#!/bin/zsh
# Generate Chrome Web Store promo tiles + corrected screenshot from store_screenshot.html
# Requires headless Chrome (already used for the screenshot).
DIR=/Users/ioanganton/Music/ANTON_SIFTA/scratch/yt-ad-reloader
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# The screenshot itself was already generated correctly (1280x800 RGB PNG).
# Chrome's "image size is incorrect" error happens when a PNG has an alpha channel
# or wrong dimensions. Force a clean RGB resize with sips to be safe.
sips -s format png -Z 1280 "$DIR/store_screenshot.png" --out "$DIR/screenshot_1280x800.png" >/dev/null 2>&1
sips -g pixelWidth -g pixelHeight "$DIR/screenshot_1280x800.png" 2>/dev/null | grep pixel
