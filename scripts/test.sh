#!/bin/zsh
set -euo pipefail
project_dir="${0:A:h:h}"
sdk_path="$(xcrun --sdk macosx --show-sdk-path)"
host_sdk="${sdk_path:h}/MacOSX$(sw_vers -productVersion | cut -d. -f1).sdk"
if [[ -d "$host_sdk" ]]; then sdk_path="$(cd "$host_sdk" && pwd -P)"; fi
export SDKROOT="$sdk_path"
swift_bin="$(xcrun --find swift)"
testing_plugin="${swift_bin:h:h}/lib/swift/host/plugins/testing/libTestingMacros.dylib"
export CLANG_MODULE_CACHE_PATH="/private/tmp/kliprun-desktop-clang-cache"
export SWIFT_MODULE_CACHE_PATH="/private/tmp/kliprun-desktop-swift-cache"
export SWIFTPM_CUSTOM_LIBS_DIR="/private/tmp/kliprun-swiftpm-libs"
cd "$project_dir/app"
swift test --disable-sandbox --disable-xctest -Xswiftc -load-plugin-library \
  -Xswiftc "$testing_plugin"
