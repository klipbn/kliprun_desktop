#!/bin/zsh
set -euo pipefail

project_dir="${0:A:h:h}"
app_dir="${KLIPRUN_APP_OUTPUT:-$project_dir/dist/KlipRun.app}"
sdk_path="$(xcrun --sdk macosx --show-sdk-path)"
host_sdk="${sdk_path:h}/MacOSX$(sw_vers -productVersion | cut -d. -f1).sdk"
if [[ -d "$host_sdk" ]]; then sdk_path="$(cd "$host_sdk" && pwd -P)"; fi
swift_bin="$(xcrun --find swift)"
testing_plugin="${swift_bin:h:h}/lib/swift/host/plugins/testing/libTestingMacros.dylib"
export SDKROOT="$sdk_path"
export CLANG_MODULE_CACHE_PATH="/private/tmp/kliprun-desktop-clang-cache"
export SWIFT_MODULE_CACHE_PATH="/private/tmp/kliprun-desktop-swift-cache"
export SWIFTPM_CUSTOM_LIBS_DIR="/private/tmp/kliprun-swiftpm-libs"

cd "$project_dir/app"
swift build -c release --disable-sandbox -debug-info-format none -Xswiftc -load-plugin-library \
  -Xswiftc "$testing_plugin"

if [[ ! -d "$project_dir/engine/node_modules/hono" ]]; then
  cd "$project_dir/engine"
  bun install --frozen-lockfile
fi
cd "$project_dir/engine/src/client"
if [[ ! -d node_modules/react ]]; then bun install --frozen-lockfile; fi
bun run build

mkdir -p "$app_dir/Contents/MacOS" "$app_dir/Contents/Resources/engine/src" "$app_dir/Contents/Resources/engine/node_modules"
cp "$project_dir/app/.build/out/Products/Release/KlipRunDesktop" "$app_dir/Contents/MacOS/KlipRunDesktop"
cp "$project_dir/app/Info.plist" "$app_dir/Contents/Info.plist"
icon_source="$project_dir/engine/src/client/public/kliprun-icon.png"
iconset="$project_dir/app/.build/KlipRun.iconset"
mkdir -p "$iconset"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$icon_source" --out "$iconset/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" "$icon_source" --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$iconset" -o "$app_dir/Contents/Resources/KlipRun.icns"
cp "${KLIPRUN_BUN_BINARY:-$(command -v bun)}" "$app_dir/Contents/MacOS/bun"
rm -rf "$app_dir/Contents/Resources/bin"
cp -R "$project_dir/engine/src/server" "$project_dir/engine/src/shared" "$app_dir/Contents/Resources/engine/src/"
rm -rf "$app_dir/Contents/Resources/engine/src/client"
mkdir -p "$app_dir/Contents/Resources/engine/src/client"
cp -R "$project_dir/engine/src/client/dist" "$app_dir/Contents/Resources/engine/src/client/"
cp -R "$project_dir/engine/node_modules/hono" "$app_dir/Contents/Resources/engine/node_modules/"
cp "$project_dir/engine/tsconfig.json" "$project_dir/engine/package.json" "$app_dir/Contents/Resources/engine/"
cp "$project_dir/engine/LICENSE" "$app_dir/Contents/Resources/KlipRun-LICENSE"
cp "$project_dir/vendor/SwiftTerm/LICENSE" "$app_dir/Contents/Resources/SwiftTerm-LICENSE"
mkdir -p "$app_dir/Contents/Resources/KlopikSkins"
cp "$project_dir/engine/src/client/public/klopik-skins/"*.png "$app_dir/Contents/Resources/KlopikSkins/"
codesign --force --deep --sign - "$app_dir"
touch "$app_dir"
if [[ "$app_dir" == "$project_dir/dist/KlipRun.app" ]]; then
  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$app_dir"
fi
echo "$app_dir"
