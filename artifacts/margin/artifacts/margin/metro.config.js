const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // expo-camera uses native-only APIs that crash on web. Redirect it to a stub.
  if (platform === "web" && moduleName === "expo-camera") {
    return {
      filePath: path.resolve(__dirname, "lib/expo-camera.web.ts"),
      type: "sourceFile",
    };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
